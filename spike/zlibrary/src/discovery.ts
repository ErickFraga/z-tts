/**
 * Descoberta automática do domínio da Z-Library.
 *
 * Réplica do que o cliente do KOReader faz (`Discovery.run` + `Api.healthCheck`
 * + `Api.fetchDynamicDomains`), adaptada ao probe. Quatro decisões vêm de lá e
 * cada uma resolve um problema concreto:
 *
 * 1. A lista de candidatos é buscada de um CDN, não fixada no código. Domínio
 *    da Z-Library é alvo móvel; e o CDN responde mesmo quando a origem inteira
 *    está inalcançável, então dá para saber os endereços novos sem depender de
 *    falar com nenhum deles.
 *
 * 2. Os candidatos são sondados em paralelo, três de cada vez. Com bloqueio
 *    intermitente, sondar em série multiplica o tempo de espera pelo número de
 *    domínios mortos antes de chegar ao vivo.
 *
 * 3. Quem decide é `/eapi/info/ok`, a sonda da própria origem, exigindo JSON com
 *    success=1. Status HTTP sozinho não basta: domínio estacionado devolve 200
 *    com HTML, e portal de operadora devolve 200 com página de aviso.
 *
 * 4. Redirecionamento para outro host é adotado como novo domínio. É a origem
 *    dizendo para onde mudou, e ignorar isso descartaria um endereço bom.
 *
 * A rede e a interface entram por parâmetro: no app serão o estado do sistema e
 * a tela, aqui são DNS e console, e a lógica no meio é a mesma.
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  DEFAULT_HEADERS,
  dedupeUrls,
  endpoints,
  setAndValidateBaseUrl,
  type Config,
} from "./endpoints.ts";
import {
  DOMAIN_CACHE_FILE,
  DOMAIN_CACHE_TTL_MS,
  DOMAIN_LIST_SOURCES,
  parseDomainList,
} from "./domains.ts";
import { describeError, explainNetworkCode } from "./report.ts";
import { resilientFetch } from "./transport.ts";

export interface DiscoveryAttempt {
  url: string;
  /** Respondeu à sonda de saúde falando o protocolo esperado. */
  usable: boolean;
  /** Uma linha legível com o que aconteceu. */
  summary: string;
  /** Causa provável em português, quando dá para deduzir. */
  cause: string | null;
  /** Tempo até a resposta — usado para escolher o mais rápido, quando pedido. */
  elapsedMs: number;
  /** Destino, quando a origem redirecionou para outro host. */
  redirectedTo: string | null;
}

export interface DiscoveryResult {
  success: boolean;
  url?: string;
  error?: string;
  /** Todos os candidatos sondados — o valor diagnóstico está aqui. */
  attempts: DiscoveryAttempt[];
  /** Quantos domínios a lista dinâmica acrescentou, e de onde veio. */
  domainList?: { source: string; added: number; cached: boolean };
}

/**
 * Porteiro de rede. Equivale ao `NetworkMgr:willRerunWhenOnline` do KOReader:
 * responde se a tentativa deve ser adiada por falta de rede.
 *
 * Assíncrono porque em Node não existe estado de conectividade pronto para
 * consultar. O `retry` só é usado por implementações capazes de agendar (o
 * app); num processo de linha de comando não há o que agendar.
 */
export interface NetworkGate {
  shouldWaitForNetwork(retry: () => void): Promise<boolean>;
}

/** Superfície mínima de interface usada pela descoberta. */
export interface DiscoveryUi {
  showLoadingMessage(text: string): unknown;
  closeMessage(message: unknown): void;
  showInfoMessage(text: string): void;
  showErrorMessage(text: string): void;
}

export interface DiscoveryDeps {
  network: NetworkGate;
  ui: DiscoveryUi;
}

export interface DiscoveryOptions {
  /** Mostra mensagens na interface. Fora do modo interativo, a descoberta é muda. */
  interactive?: boolean;
  /** Repassado ao porteiro de rede, para quem souber reagendar. */
  retryCallback?: () => void;
  /** Chamado a cada candidato sondado, para acompanhar a varredura. */
  onAttempt?: (attempt: DiscoveryAttempt) => void;
  /**
   * "first" para no primeiro que responder — mantém a prioridade da lista.
   * "fastest" sonda todos e fica com o de menor latência.
   */
  mode?: "first" | "fastest";
  concurrency?: number;
  timeoutMs?: number;
}

const CONCURRENCY = 3;
const HEALTH_TIMEOUT_MS = 10_000;

/**
 * Sonda os candidatos até um responder — em lotes paralelos, na ordem da lista.
 *
 * O lote preserva a prioridade: dentro de um lote de três, se dois responderem,
 * vence o que vier antes na lista, não o que chegar antes na rede. Isso é o que
 * mantém o domínio configurado com precedência sobre as sementes.
 */
export async function findWorkingBaseUrl(
  domains: readonly string[],
  options: Pick<DiscoveryOptions, "onAttempt" | "mode" | "concurrency" | "timeoutMs"> = {},
): Promise<DiscoveryResult> {
  const concurrency = Math.max(1, options.concurrency ?? CONCURRENCY);
  const mode = options.mode ?? "first";
  const attempts: DiscoveryAttempt[] = [];

  for (let start = 0; start < domains.length; start += concurrency) {
    const batch = domains.slice(start, start + concurrency);
    const results = await Promise.all(batch.map((url) => probeDomain(url, options.timeoutMs)));

    for (const attempt of results) {
      attempts.push(attempt);
      options.onAttempt?.(attempt);
    }

    const winner = results.find((attempt) => attempt.usable);
    if (winner && mode === "first") {
      return { success: true, url: winner.redirectedTo ?? winner.url, attempts };
    }
  }

  // Modo "fastest": sondou tudo, agora escolhe pela latência medida.
  const usable = attempts.filter((attempt) => attempt.usable);
  if (usable.length > 0) {
    const quickest = usable.reduce((best, current) =>
      current.elapsedMs < best.elapsedMs ? current : best,
    );
    return { success: true, url: quickest.redirectedTo ?? quickest.url, attempts };
  }

  return {
    success: false,
    error:
      attempts.length === 0
        ? "Nenhum domínio candidato configurado."
        : attempts.length === 1
          ? "O único domínio candidato não respondeu."
          : `Nenhum dos ${attempts.length} domínios respondeu.`,
    attempts,
  };
}

/**
 * Equivalente a `Zlibrary:autoDiscoverAndSetBaseUrl(is_interactive, retry_callback)`.
 *
 * Escreve o domínio encontrado na configuração recebida — daí em diante o
 * cliente construído com ela já aponta para o lugar certo.
 */
export async function autoDiscoverAndSetBaseUrl(
  config: Config,
  deps: DiscoveryDeps,
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const { interactive = false, retryCallback } = options;

  // Sem rede, varrer a lista inteira só produz o mesmo erro repetido e esconde
  // a causa real. Quem souber reagendar refaz a varredura quando a conexão
  // voltar, e só então avisa o chamador.
  const waiting = await deps.network.shouldWaitForNetwork(async () => {
    const retried = await autoDiscoverAndSetBaseUrl(config, deps, options);
    if (retried.success) retryCallback?.();
  });

  if (waiting) {
    const error = "Rede indisponível. Conecte-se e tente novamente.";
    if (interactive) deps.ui.showErrorMessage(error);
    return { success: false, error, attempts: [] };
  }

  const loading = interactive
    ? deps.ui.showLoadingMessage("Procurando um domínio da Z-Library que responda…")
    : undefined;

  try {
    // A lista dinâmica entra depois do domínio configurado e antes das sementes:
    // é mais nova que elas e menos autoritativa que a escolha de quem rodou.
    const dynamic = config.autoDiscover ? await loadDomainList() : null;
    const candidates = dedupeUrls([
      config.domains[0] ?? config.baseUrl,
      ...(dynamic?.domains ?? []),
      ...config.domains.slice(1),
    ]);

    if (interactive && dynamic && dynamic.domains.length > 0) {
      deps.ui.showInfoMessage(
        `Lista dinâmica: ${dynamic.domains.length} domínio(s) de ${dynamic.source}` +
          `${dynamic.cached ? " (em cache)" : ""}`,
      );
    }

    const result = await findWorkingBaseUrl(candidates, options);
    const withList: DiscoveryResult = {
      ...result,
      domainList: dynamic
        ? {
            source: dynamic.source,
            added: candidates.length - config.domains.length,
            cached: dynamic.cached,
          }
        : undefined,
    };

    if (withList.success && withList.url) {
      const { success, error } = setAndValidateBaseUrl(config, withList.url);

      if (success) {
        if (loading !== undefined) deps.ui.closeMessage(loading);
        if (interactive) deps.ui.showInfoMessage(`Domínio em uso: ${config.baseUrl}`);
        return { ...withList, url: config.baseUrl };
      }

      if (loading !== undefined) deps.ui.closeMessage(loading);
      const message = error ?? "URL base inválida.";
      if (interactive) deps.ui.showErrorMessage(message);
      return { ...withList, success: false, url: undefined, error: message };
    }

    if (loading !== undefined) deps.ui.closeMessage(loading);
    if (interactive) deps.ui.showErrorMessage(withList.error ?? "Nenhum domínio respondeu.");
    return withList;
  } catch (error) {
    // Falha de rede não chega aqui: a sonda captura a dela e devolve resultado.
    // O que sobra é defeito de programação, e engolir isso como "domínio
    // inalcançável" mandaria o spike investigar a rede à toa.
    if (loading !== undefined) deps.ui.closeMessage(loading);
    const message = describeError(error);
    if (interactive) deps.ui.showErrorMessage(`Erro durante a descoberta: ${message}`);
    return { success: false, error: message, attempts: [] };
  }
}

/** Resume a descoberta em uma linha, para o registro do passo 0. */
export function summarizeDiscovery(result: DiscoveryResult): string {
  const chosen = result.attempts.find((attempt) => attempt.usable);

  if (result.success && chosen) {
    const discarded = result.attempts.length - 1;
    const scale = discarded === 0
      ? "primeiro candidato"
      : `escolhido após ${discarded} descartado(s)`;
    return `${chosen.summary} — ${scale}`;
  }

  // Falhas agrupadas por causa: vinte domínios mortos pelo mesmo motivo é um
  // fato só, e repeti-lo vinte vezes esconde o que falhou por outro.
  const byCause = new Map<string, string[]>();
  for (const attempt of result.attempts) {
    const cause = attempt.cause ?? attempt.summary;
    byCause.set(cause, [...(byCause.get(cause) ?? []), hostOf(attempt.url)]);
  }

  const failures = [...byCause]
    .map(([cause, hosts]) => `${hosts.length}× ${cause} (${hosts.slice(0, 3).join(", ")}…)`)
    .join(" · ");

  return failures ? `${result.error} ${failures}` : (result.error ?? "descoberta não executada");
}

/**
 * Pergunta à origem se está de pé, com o mesmo critério do plugin: 2xx, corpo
 * não vazio, JSON legível e `success = 1`.
 *
 * O critério estrito é o que separa "servidor vivo" de "alguma coisa
 * respondeu". Página de domínio estacionado, portal de autenticação de rede e
 * erro de CDN devolvem 200 com HTML, e qualquer um deles passaria por uma
 * checagem baseada só em status.
 */
async function probeDomain(url: string, timeoutMs?: number): Promise<DiscoveryAttempt> {
  const startedAt = performance.now();

  const attempt = (extra: Partial<DiscoveryAttempt>): DiscoveryAttempt => ({
    url,
    usable: false,
    summary: `${hostOf(url)}: ${extra.cause ?? "sem resposta"}`,
    cause: null,
    elapsedMs: Math.round(performance.now() - startedAt),
    redirectedTo: null,
    ...extra,
  });

  try {
    const response = await resilientFetch(
      `${url}${endpoints.health}`,
      { headers: DEFAULT_HEADERS, redirect: "follow" },
      // Duas tentativas, não as quatro do resto do probe: aqui a lista inteira
      // está em jogo e insistir em um candidato morto atrasa a chegada ao vivo.
      { attempts: 2, timeoutMs: timeoutMs ?? HEALTH_TIMEOUT_MS, label: hostOf(url) },
    );

    // A origem redireciona para o espelho atual quando o domínio pedido saiu de
    // circulação. É informação de primeira mão sobre onde ela está agora.
    const landed = originOf(response.url);
    const redirectedTo = landed && landed !== url ? landed : null;

    const body = await response.text();
    const elapsedMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      // 404 aqui é ambíguo: pode ser espelho sem essa sonda, não espelho morto.
      // Descartar por isso derrubaria um domínio que atende a API inteira — o
      // risco é real, porque a execução de 2026-08-12 provou que z-library.sk
      // serve login, busca e download.
      if (response.status === 404) {
        const legacy = await probeLegacy(url, timeoutMs);
        if (legacy) {
          return attempt({
            usable: true,
            summary: `${hostOf(url)} respondeu pela API (sem ${endpoints.health})`,
            elapsedMs: Math.round(performance.now() - startedAt),
            redirectedTo,
          });
        }
      }

      return attempt({ cause: `HTTP ${response.status}`, elapsedMs, redirectedTo });
    }

    const payload = safeJson(body);
    if (payload === null) {
      return attempt({
        cause: body.trimStart().startsWith("<")
          ? "responde HTML onde a API devolveria JSON — domínio estacionado ou portal de rede"
          : "resposta não é JSON",
        elapsedMs,
        redirectedTo,
      });
    }

    if (Number((payload as Record<string, unknown>).success) !== 1) {
      return attempt({ cause: "API respondeu sem success=1", elapsedMs, redirectedTo });
    }

    const destination = redirectedTo ?? url;
    return attempt({
      usable: true,
      summary: `${hostOf(destination)} respondeu em ${elapsedMs}ms` +
        `${redirectedTo ? ` (redirecionado de ${hostOf(url)})` : ""}`,
      cause: null,
      elapsedMs,
      redirectedTo,
    });
  } catch (error) {
    const message = describeError(error);
    return attempt({ cause: explainNetworkCode(message) ?? shorten(message) });
  }
}

/**
 * Segunda opinião para espelhos sem a sonda de saúde: bate no perfil sem sessão.
 *
 * Sem credencial a origem devolve erro de aplicação — foi HTTP 400 na execução
 * de 2026-08-12 — e é isso que se quer ver. Qualquer JSON aqui prova que há API
 * do outro lado; o status não importa, só o formato da resposta.
 */
async function probeLegacy(url: string, timeoutMs?: number): Promise<boolean> {
  try {
    const response = await resilientFetch(
      `${url}${endpoints.profile}`,
      { headers: DEFAULT_HEADERS },
      { attempts: 1, timeoutMs: timeoutMs ?? HEALTH_TIMEOUT_MS, label: hostOf(url) },
    );
    return safeJson(await response.text()) !== null;
  } catch {
    return false;
  }
}

interface DomainList {
  domains: string[];
  source: string;
  cached: boolean;
}

/**
 * Traz a lista dinâmica: cache em disco enquanto válido, senão os espelhos em
 * rodízio.
 *
 * Falhar aqui não é fatal — as sementes continuam valendo. Por isso a função
 * nunca lança: uma lista velha é pior que uma nova, e as duas são melhores que
 * interromper a descoberta.
 */
async function loadDomainList(): Promise<DomainList | null> {
  const cached = await readDomainCache();
  if (cached) return cached;

  for (const source of DOMAIN_LIST_SOURCES) {
    try {
      const response = await resilientFetch(
        source,
        { headers: DEFAULT_HEADERS },
        // Uma tentativa por espelho: o rodízio já é a retentativa, e com outra
        // rota. Repetir na mesma fonte bloqueada só gasta tempo.
        { attempts: 1, timeoutMs: 8000, label: hostOf(source) },
      );
      if (!response.ok) continue;

      const domains = parseDomainList(safeJson(await response.text()));
      if (domains.length === 0) continue;

      await writeDomainCache(domains, source);
      return { domains, source: hostOf(source), cached: false };
    } catch {
      // Espelho fora do ar ou bloqueado: o próximo do rodízio assume.
    }
  }

  return null;
}

async function readDomainCache(): Promise<DomainList | null> {
  try {
    const raw = JSON.parse(await readFile(DOMAIN_CACHE_FILE, "utf8")) as {
      fetchedAt?: number;
      source?: string;
      domains?: unknown;
    };

    const age = Date.now() - (raw.fetchedAt ?? 0);
    if (age > DOMAIN_CACHE_TTL_MS || !Array.isArray(raw.domains)) return null;

    const domains = raw.domains.filter((entry): entry is string => typeof entry === "string");
    return domains.length > 0
      ? { domains, source: raw.source ?? "cache", cached: true }
      : null;
  } catch {
    return null;
  }
}

async function writeDomainCache(domains: string[], source: string): Promise<void> {
  try {
    await writeFile(
      DOMAIN_CACHE_FILE,
      JSON.stringify({ fetchedAt: Date.now(), source: hostOf(source), domains }, null, 2),
    );
  } catch {
    // Cache é otimização; disco cheio ou somente leitura não derruba a descoberta.
  }
}

function safeJson(text: string): unknown {
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Só esquema e host: o resto da URL de resposta não serve como URL base. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function shorten(text: string): string {
  return text.length <= 60 ? text : `${text.slice(0, 59)}…`;
}
