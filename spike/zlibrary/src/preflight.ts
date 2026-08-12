/**
 * Verificação de conectividade, anterior a qualquer chamada de API.
 *
 * Sem isto, "fetch failed" no passo 1 é ambíguo: pode ser domínio morto,
 * bloqueio de rede, TLS quebrado ou endpoint errado. São causas com
 * consequências opostas — uma exige trocar o domínio, outra exige corrigir
 * endpoints.ts, outra não tem conserto do lado do código.
 *
 * Separar isso do passo de autenticação faz o relatório dizer onde a coisa
 * parou, em vez de apenas que parou.
 */

import { lookup } from "node:dns/promises";
import { connect } from "node:net";

export interface Preflight {
  host: string;
  /** IPs resolvidos. Vazio significa DNS falhou. */
  addresses: string[];
  dnsError: string | null;
  /** Porta 443 aceitou conexão TCP. */
  tcpReachable: boolean;
  tcpError: string | null;
  /** Resposta a uma requisição HTTP simples, quando houver. */
  httpStatus: number | null;
  httpError: string | null;
  /** Método que obteve resposta. GET aqui significa que o HEAD não passou. */
  httpVia: "HEAD" | "GET" | null;
}

export async function preflight(baseUrl: string, timeoutMs = 8000): Promise<Preflight> {
  const host = new URL(baseUrl).hostname;
  const result: Preflight = {
    host,
    addresses: [],
    dnsError: null,
    tcpReachable: false,
    tcpError: null,
    httpStatus: null,
    httpError: null,
    httpVia: null,
  };

  // 1. DNS — se falhar aqui, nada adiante importa.
  try {
    const records = await lookup(host, { all: true });
    result.addresses = records.map((record) => record.address);
  } catch (error) {
    result.dnsError = errnoOf(error);
    return result;
  }

  // 2. TCP na 443 — distingue "domínio existe" de "servidor atende".
  try {
    await tcpProbe(host, 443, timeoutMs);
    result.tcpReachable = true;
  } catch (error) {
    result.tcpError = errnoOf(error);
    return result;
  }

  // 3. HTTP — completa o handshake TLS e confirma que há servidor web ali.
  //
  // Com fallback para GET porque um HEAD malsucedido é ambíguo: pode ser o
  // método recusado, pode ser a interferência pegando aquele handshake. Insistir
  // uma vez pelo caminho normal separa "servidor não fala comigo" de
  // "aquela conexão específica morreu" — distinção que custou um falso negativo
  // no passo 0 da execução de 2026-08-12.
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const response = await fetch(baseUrl, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Corpo do GET descartado sem ler: aqui só interessa o status.
      await response.body?.cancel();

      result.httpStatus = response.status;
      result.httpVia = method;
      result.httpError = null;
      break;
    } catch (error) {
      result.httpError = errnoOf(error);
    }
  }

  return result;
}

/** Resume o pré-voo em uma linha legível. */
export function summarizePreflight(check: Preflight): string {
  if (check.dnsError) {
    return `${check.host} não resolve em DNS (${check.dnsError})`;
  }
  if (!check.tcpReachable) {
    return `${check.host} resolve para ${check.addresses[0]} mas a porta 443 não responde (${check.tcpError})`;
  }
  if (check.httpError) {
    return `${check.host} aceita TCP mas falha no HTTP/TLS (${check.httpError})`;
  }
  const viaGet = check.httpVia === "GET" ? " (HEAD não passou)" : "";
  return `${check.host} → ${check.addresses[0]} · HTTP ${check.httpStatus}${viaGet}`;
}

function tcpProbe(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const finish = (error?: Error) => {
      socket.destroy();
      error ? reject(error) : resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish());
    socket.once("timeout", () => finish(new Error("ETIMEDOUT: sem resposta na porta 443")));
    socket.once("error", (error) => finish(error));
  });
}

function errnoOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as NodeJS.ErrnoException).code;
  const cause = error.cause instanceof Error ? (error.cause as NodeJS.ErrnoException).code : null;
  return code ?? cause ?? error.message;
}
