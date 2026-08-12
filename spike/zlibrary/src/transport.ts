/**
 * Camada de transporte resiliente.
 *
 * A execução de 2026-08-12 mudou o diagnóstico da Frente A: sete passos
 * passaram, incluindo login, busca e download de EPUB íntegro. A barreira não
 * é uma parede — é intermitente. As duas falhas observadas dizem onde:
 *
 *   · o pré-voo falhou no handshake TLS enquanto a API respondia normalmente
 *   · uma requisição morreu em UND_ERR_CONNECT_TIMEOUT ao abrir nova conexão
 *
 * As duas acontecem no mesmo lugar — ao estabelecer conexão — e nenhuma se
 * repetiu nas requisições vizinhas. Contra interferência probabilística no
 * handshake, o que funciona não é driblar a inspeção, é reduzir a exposição a
 * ela e absorver o que ainda passar:
 *
 *   1. reaproveitar conexão já aberta, para haver menos handshakes por execução
 *   2. repetir o que falhou na conexão, com espera crescente
 *   3. contar quantas vezes isso foi preciso, porque essa é a medida do
 *      bloqueio e um dos entregáveis do spike
 *
 * Nada aqui esconde, forja ou disfarça tráfego. Se o bloqueio endurecer para
 * determinístico, a retentativa falha rápido e o relatório mostra isso — que é
 * a informação certa para decidir, não um sintoma mascarado.
 */

import { Agent, ProxyAgent, setGlobalDispatcher } from "undici";
import { describeError } from "./report.ts";

export interface RetryOptions {
  /** Tentativas no total, não retentativas. 1 desliga a retentativa. */
  attempts?: number;
  /** Teto por tentativa. O relógio reinicia a cada uma. */
  timeoutMs?: number;
  /** Aparece no aviso de retentativa — sem isto o log não diz o que repetiu. */
  label?: string;
}

export interface TransportStats {
  requests: number;
  retries: number;
  /** Requisições que terminaram em erro — por esgotar tentativas ou por falha
   * determinística, que não chega a ser repetida. */
  failed: number;
  /** Quantas retentativas cada causa provocou. É o retrato da interferência. */
  byCause: Map<string, number>;
}

export const transportStats: TransportStats = {
  requests: 0,
  retries: 0,
  failed: 0,
  byCause: new Map(),
};

/**
 * Erros que valem repetir: todos ocorrem antes de a origem responder qualquer
 * coisa, então repetir não duplica efeito nenhum do lado do servidor.
 *
 * ENOTFOUND e ECONNREFUSED ficam de fora de propósito. São respostas
 * determinísticas — domínio inexistente e porta fechada não mudam de ideia em
 * dois segundos, e insistir só atrasaria a queda para o próximo domínio.
 *
 * A lista casa contra códigos, nunca contra "fetch failed": toda falha de rede
 * do fetch começa por essa frase, inclusive as determinísticas. Casar com ela
 * faria a retentativa valer para tudo — foi o que a verificação pegou. O código
 * real vem de `describeError`, que desempacota a cadeia de causas.
 */
const RETRYABLE = [
  "econnreset",
  "etimedout",
  "und_err_connect_timeout",
  "und_err_headers_timeout",
  "und_err_socket",
  "socket hang up",
  "eai_again",
  "epipe",
];

/** Status que indicam origem sobrecarregada ou atrás de proteção momentânea. */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

const DEFAULT_ATTEMPTS = 4;
const BASE_DELAY_MS = 700;
const MAX_DELAY_MS = 8000;

/**
 * Instala o dispatcher com conexão persistente.
 *
 * Este é o item que mais pesa contra bloqueio no handshake: o probe faz mais de
 * uma dezena de requisições, e sem keep-alive longo cada pausa entre passos
 * derruba a conexão e obriga a um handshake novo — exatamente o momento em que
 * o SNI viaja em claro e a conexão morre. Uma conexão viva atravessa a execução
 * inteira com um handshake só.
 *
 * ZLIB_PROXY, quando definido, roteia tudo por um proxy do próprio operador. O
 * spike não escolhe nem embute rota alternativa: essa decisão é de quem roda.
 */
export function installTransport(): { keepAliveMs: number; proxy: string | null } {
  const proxy = process.env.ZLIB_PROXY?.trim() || null;
  const keepAliveMs = 60_000;

  const options = {
    // Tempo para TCP + TLS. O padrão da undici é 10s e foi ele que estourou na
    // execução observada; num caminho com interferência, apertar não ajuda.
    connect: { timeout: 20_000 },
    keepAliveTimeout: keepAliveMs,
    keepAliveMaxTimeout: 600_000,
    // Poucas conexões, muito reaproveitadas. Abrir várias em paralelo
    // multiplicaria handshakes, que é o que se quer evitar.
    connections: 4,
    headersTimeout: 30_000,
    // Download de EPUB em rede degradada é lento e legítimo.
    bodyTimeout: 180_000,
  };

  setGlobalDispatcher(proxy ? new ProxyAgent({ uri: proxy, ...options }) : new Agent(options));

  return { keepAliveMs, proxy };
}

/**
 * `fetch` com retentativa e espera crescente.
 *
 * Repetir um POST só é seguro porque a repetição acontece quando a conexão nem
 * chegou a entregar a requisição, ou quando a origem devolveu 5xx/429 — casos
 * em que o pedido comprovadamente não foi processado.
 */
export async function resilientFetch(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? configuredAttempts();
  const label = options.label ?? url;

  transportStats.requests++;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, withTimeout(init, options.timeoutMs));

      if (RETRYABLE_STATUS.has(response.status) && attempt < attempts) {
        // O corpo precisa ser drenado, senão a conexão fica presa e o
        // keep-alive — a defesa principal — deixa de valer.
        await response.arrayBuffer().catch(() => undefined);
        await waitBeforeRetry(attempt, `HTTP ${response.status}`, label, attempts, response);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      const cause = describeError(error);

      if (attempt >= attempts || !isRetryable(cause)) {
        transportStats.failed++;
        throw error;
      }

      await waitBeforeRetry(attempt, shortCause(cause), label, attempts);
    }
  }

  transportStats.failed++;
  throw lastError;
}

/** Resume o custo da interferência ao longo da execução. */
export function summarizeTransport(): string {
  if (transportStats.retries === 0) {
    return `${transportStats.requests} requisição(ões), nenhuma retentativa`;
  }

  const causes = [...transportStats.byCause]
    .sort((a, b) => b[1] - a[1])
    .map(([cause, count]) => `${count}× ${cause}`)
    .join(", ");

  return (
    `${transportStats.requests} requisição(ões), ${transportStats.retries} retentativa(s) ` +
    `(${causes})${transportStats.failed > 0 ? ` · ${transportStats.failed} falharam` : ""}`
  );
}

function configuredAttempts(): number {
  const raw = Number.parseInt(process.env.ZLIB_RETRIES?.trim() ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ATTEMPTS;
}

function isRetryable(cause: string): boolean {
  const text = cause.toLowerCase();
  return RETRYABLE.some((needle) => text.includes(needle));
}

async function waitBeforeRetry(
  attempt: number,
  cause: string,
  label: string,
  attempts: number,
  response?: Response,
): Promise<void> {
  transportStats.retries++;
  transportStats.byCause.set(cause, (transportStats.byCause.get(cause) ?? 0) + 1);

  const delay = retryAfter(response) ?? backoff(attempt);
  console.log(
    `    ↻ ${label}: ${cause} — tentativa ${attempt + 1}/${attempts} em ${Math.round(delay)}ms`,
  );
  await sleep(delay);
}

/**
 * Espera exponencial com ruído. O ruído importa: se a interferência for
 * periódica, repetir sempre no mesmo intervalo cai de novo na mesma janela.
 */
function backoff(attempt: number): number {
  const exponential = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
  return exponential * (0.7 + Math.random() * 0.6);
}

function retryAfter(response?: Response): number | null {
  const header = response?.headers.get("retry-after");
  if (!header) return null;

  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 30_000) : null;
}

/** Teto por tentativa, preservando qualquer cancelamento que o chamador já traga. */
function withTimeout(init: RequestInit, timeoutMs?: number): RequestInit {
  if (!timeoutMs) return init;
  const timeout = AbortSignal.timeout(timeoutMs);
  return { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout };
}

/** O relatório precisa do código, não do parágrafo que a undici escreve junto. */
function shortCause(cause: string): string {
  const code = RETRYABLE.find((needle) => cause.toLowerCase().includes(needle));
  return code ? code.toUpperCase() : cause.slice(0, 40);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
