/**
 * Descoberta automática do domínio da Z-Library.
 *
 * A Frente A parou no passo 0 com um único domínio testado, e um único domínio
 * não distingue as duas causas possíveis: o endereço morreu, ou esta rede
 * bloqueia esse endereço. As consequências são opostas — a primeira se resolve
 * trocando de domínio, a segunda não se resolve do lado do código.
 *
 * Percorrer vários candidatos separa as duas. Se algum responde, o anterior
 * estava individualmente morto ou bloqueado; se nenhum responde, a barreira é
 * da rede e vale para toda a origem. Em ambos os casos o relatório passa a
 * dizer o que foi tentado, e não apenas que falhou.
 *
 * O desenho segue o cliente do KOReader (`Zlibrary:autoDiscoverAndSetBaseUrl`,
 * que delega para `Discovery.run`): checar a rede, procurar um domínio que
 * responda, validar e gravar. As dependências entram por parâmetro porque no
 * app "interface" será tela e "rede" será o estado do sistema — aqui são
 * console e DNS, e a lógica no meio é a mesma.
 */

import { preflight, summarizePreflight, type Preflight } from "./preflight.ts";
import { setAndValidateBaseUrl, type Config } from "./endpoints.ts";
import { describeError, explainNetworkCode } from "./report.ts";

export interface DiscoveryAttempt {
  url: string;
  /** Respondeu a ponto de valer a pena tentar a API. */
  usable: boolean;
  /** Uma linha legível com o que aconteceu — vem do pré-voo. */
  summary: string;
  /** Causa provável em português, quando o código de erro permite deduzir. */
  cause: string | null;
}

export interface DiscoveryResult {
  success: boolean;
  url?: string;
  error?: string;
  /** Todos os candidatos percorridos, na ordem — o valor diagnóstico está aqui. */
  attempts: DiscoveryAttempt[];
}

/**
 * Porteiro de rede. Equivale ao `NetworkMgr:willRerunWhenOnline` do KOReader:
 * responde se a tentativa deve ser adiada por falta de rede.
 *
 * Assíncrono porque em Node não existe estado de conectividade pronto para
 * consultar — descobrir isso custa uma ida à rede. O `retry` só é usado por
 * implementações capazes de agendar (o app); num processo de linha de comando
 * não há o que agendar, e o adiamento vira orientação para rodar de novo.
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
  /** Chamado a cada candidato, para acompanhar a varredura em tempo real. */
  onAttempt?: (attempt: DiscoveryAttempt) => void;
  timeoutMs?: number;
}

/**
 * Tenta, em sequência, os domínios conhecidos até achar um que responda.
 *
 * "Responder" aqui é o pré-voo completo: DNS resolve, a porta 443 aceita
 * conexão e o handshake HTTP/TLS termina. É deliberadamente mais fraco que
 * "é mesmo uma Z-Library" — confirmar isso exige credencial e é trabalho dos
 * passos seguintes do probe. Mas é forte o bastante para descartar o que não
 * tem chance, que é o que a descoberta precisa fazer.
 */
export async function findWorkingBaseUrl(
  domains: readonly string[],
  options: { onAttempt?: (attempt: DiscoveryAttempt) => void; timeoutMs?: number } = {},
): Promise<DiscoveryResult> {
  const attempts: DiscoveryAttempt[] = [];

  for (const url of domains) {
    const attempt = await probeDomain(url, options.timeoutMs);
    attempts.push(attempt);
    options.onAttempt?.(attempt);

    if (attempt.usable) return { success: true, url, attempts };
  }

  return {
    success: false,
    error:
      attempts.length === 0
        ? "Nenhum domínio candidato configurado."
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
  const { interactive = false, retryCallback, onAttempt, timeoutMs } = options;

  // Sem rede, varrer a lista inteira só produz sete vezes o mesmo erro e
  // esconde a causa real. Quem souber reagendar refaz a varredura quando a
  // conexão voltar, e só então avisa o chamador — que quase sempre quer
  // retomar o que ia fazer com o domínio já definido.
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
    const result = await findWorkingBaseUrl(config.domains, { onAttempt, timeoutMs });

    if (result.success && result.url) {
      const { success, error } = setAndValidateBaseUrl(config, result.url);

      if (success) {
        if (loading !== undefined) deps.ui.closeMessage(loading);
        if (interactive) deps.ui.showInfoMessage(`Domínio em uso: ${config.baseUrl}`);
        return { ...result, url: config.baseUrl };
      }

      if (loading !== undefined) deps.ui.closeMessage(loading);
      const message = error ?? "URL base inválida.";
      if (interactive) deps.ui.showErrorMessage(message);
      return { ...result, success: false, url: undefined, error: message };
    }

    if (loading !== undefined) deps.ui.closeMessage(loading);
    if (interactive) {
      deps.ui.showErrorMessage(result.error ?? "Nenhum domínio respondeu.");
    }
    return result;
  } catch (error) {
    // Rede não deveria chegar aqui: o pré-voo captura os erros dele e devolve
    // um resultado. O que sobra é defeito de programação, e engolir isso como
    // "domínio inalcançável" mandaria o spike investigar a rede à toa.
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
    return discarded === 0
      ? `${chosen.summary} — domínio configurado respondeu de primeira`
      : `${chosen.summary} — escolhido após ${discarded} domínio(s) descartado(s)`;
  }

  // Falhas agrupadas por causa: sete domínios mortos pelo mesmo motivo é um
  // fato só, e repeti-lo sete vezes esconde o candidato que falhou por outro.
  const byCause = new Map<string, string[]>();
  for (const attempt of result.attempts) {
    const cause = attempt.cause ?? attempt.summary;
    byCause.set(cause, [...(byCause.get(cause) ?? []), hostOf(attempt.url)]);
  }

  const failures = [...byCause]
    .map(([cause, hosts]) => `${hosts.join(", ")} — ${cause}`)
    .join(" · ");

  return failures ? `${result.error} ${failures}` : (result.error ?? "descoberta não executada");
}

/**
 * Um candidato só é aproveitável se o handshake terminar. O caso que motivou
 * esta lista — TCP aceito e conexão derrubada no TLS — passa nas duas primeiras
 * checagens do pré-voo e falha na terceira, então checar só DNS e porta daria
 * o domínio como bom e empurraria a falha para o passo de autenticação, onde
 * ela é bem mais difícil de ler.
 *
 * 5xx também desqualifica: servidor de pé mas quebrado não serve para o probe.
 * Qualquer outro status vale, inclusive 403 e 405 — recusar HEAD ou exigir
 * sessão são respostas de um servidor vivo.
 */
async function probeDomain(url: string, timeoutMs?: number): Promise<DiscoveryAttempt> {
  const check: Preflight = await preflight(url, timeoutMs);
  const summary = summarizePreflight(check);

  const usable =
    check.addresses.length > 0 &&
    check.tcpReachable &&
    check.httpError === null &&
    check.httpStatus !== null &&
    check.httpStatus < 500;

  const failureCode = check.dnsError ?? check.tcpError ?? check.httpError;

  return {
    url,
    usable,
    summary,
    cause: usable
      ? null
      : failureCode
        ? (explainNetworkCode(failureCode) ?? failureCode)
        : `servidor respondeu HTTP ${check.httpStatus}`,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
