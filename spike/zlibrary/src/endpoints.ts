/**
 * HIPÓTESES NÃO VERIFICADAS.
 *
 * A Z-Library não publica API documentada. Os caminhos abaixo derivam do
 * comportamento conhecido de clientes não oficiais e podem estar errados,
 * desatualizados ou variar por domínio.
 *
 * Confirmá-los ou corrigi-los é a PRIMEIRA TAREFA do spike, não uma premissa.
 * Se um passo devolver 404 ou HTML onde se esperava JSON, comece por aqui.
 *
 * Todo ajuste feito durante o spike deve ser anotado no relatório final —
 * o mapa correto dos endpoints é justamente um dos entregáveis.
 */

import { SEED_URLS } from "./domains.ts";

export const endpoints = {
  /** GET — sonda de saúde da origem. Devolve JSON com success=1. */
  health: "/eapi/info/ok",

  /** GET — a lista de domínios publicada pela própria origem. */
  domainList: "/eapi/info/domains/singlelogin",

  /** POST form-encoded com email e password. */
  login: "/eapi/user/login",

  /** POST form-encoded — não GET. Confirmado no cliente do KOReader. */
  search: "/eapi/book/search",

  /** GET — exige id E hash. */
  bookDetail: (id: string, hash: string) => `/eapi/book/${id}/${hash}`,

  /** GET — devolve o link real de download; a busca não o traz pronta. */
  downloadLink: (id: string, hash: string) => `/eapi/book/${id}/${hash}/file`,

  /** GET — perfil do usuário, útil para checar cota diária e sessão válida. */
  profile: "/eapi/user/profile",
} as const;

/**
 * Cabeçalhos que o cliente do KOReader envia. Copiados de propósito: a origem
 * responde diferente a cliente que não se identifica, e um 403 vindo daí seria
 * lido como bloqueio de rede — erro de diagnóstico caro, com o sintoma quase
 * idêntico ao que a Frente A investigou.
 */
export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/96.0.4664.110 Safari/537.36";

export const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/javascript, */*; q=0.01",
};

export interface Config {
  /** Domínio em uso. A descoberta automática reescreve este campo. */
  baseUrl: string;
  /** Candidatos vindos da configuração e das sementes, na ordem de tentativa. */
  domains: string[];
  /** Quando falso, só o domínio configurado é testado. */
  autoDiscover: boolean;
  email: string;
  password: string;
  searchTerm: string;
}

export interface BaseUrlCheck {
  success: boolean;
  error?: string;
}

/**
 * Normaliza, valida e grava a URL base na configuração.
 *
 * Validar antes de gravar importa porque a URL pode vir do ambiente ou da
 * descoberta automática, e um valor torto silenciosamente aceito reaparece
 * como "fetch failed" três passos adiante, onde nada aponta para a origem.
 *
 * HTTP puro é recusado de propósito: a sessão viaja em cookie, e o spike não
 * tem motivo para exercitar um caminho que jamais será usado no app.
 */
export function setAndValidateBaseUrl(config: Config, url: string): BaseUrlCheck {
  const normalized = url.trim().replace(/\/+$/, "");

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { success: false, error: `URL base inválida: "${url}"` };
  }

  if (parsed.protocol !== "https:") {
    return { success: false, error: `URL base precisa ser https, recebido "${parsed.protocol}"` };
  }
  if (!parsed.hostname.includes(".")) {
    return { success: false, error: `URL base sem domínio válido: "${parsed.hostname}"` };
  }

  config.baseUrl = normalized;
  return { success: true };
}

/** Lê a configuração do ambiente e falha cedo se faltar credencial. */
export function loadConfig(): Config {
  const email = process.env.ZLIB_EMAIL?.trim();
  const password = process.env.ZLIB_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error(
      "ZLIB_EMAIL e ZLIB_PASSWORD são obrigatórios. Copie .env.example para .env e preencha.",
    );
  }

  const config: Config = {
    baseUrl: "",
    domains: [],
    autoDiscover: process.env.ZLIB_AUTO_DISCOVER?.trim() !== "0",
    email,
    password,
    searchTerm: process.env.ZLIB_SEARCH_TERM?.trim() || "Machado de Assis",
  };

  const configured = process.env.ZLIB_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const check = setAndValidateBaseUrl(config, configured);
  if (!check.success) throw new Error(`ZLIB_BASE_URL: ${check.error}`);

  config.domains = candidateDomains(config.baseUrl, config.autoDiscover);
  return config;
}

/** Tira duplicatas preservando a ordem — a prioridade da lista é significativa. */
export function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter((url) => {
      const key = url.toLowerCase();
      if (url.length === 0 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const DEFAULT_BASE_URL = "https://z-library.sk";

/**
 * Monta a ordem de tentativa vinda da configuração.
 *
 * O domínio configurado vem sempre primeiro: descoberta é plano B, não licença
 * para trocar de origem quando o endereço escolhido está de pé. A lista dinâmica
 * entra depois, na descoberta — aqui só ficam as fontes que não dependem de
 * rede. Com ZLIB_AUTO_DISCOVER=0 sobra apenas o configurado, que é o
 * comportamento anterior a esta integração.
 */
function candidateDomains(baseUrl: string, autoDiscover: boolean): string[] {
  if (!autoDiscover) return [baseUrl];

  const override = process.env.ZLIB_DOMAINS?.trim();
  const extras = override ? override.split(",") : [...SEED_URLS];

  return dedupeUrls([baseUrl, ...extras]);
}
