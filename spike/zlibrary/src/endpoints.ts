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

import { KNOWN_DOMAINS } from "./domains.ts";

export const endpoints = {
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

export interface Config {
  /** Domínio em uso. A descoberta automática reescreve este campo. */
  baseUrl: string;
  /** Candidatos da descoberta, na ordem de tentativa. O configurado vem primeiro. */
  domains: string[];
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
    email,
    password,
    searchTerm: process.env.ZLIB_SEARCH_TERM?.trim() || "Machado de Assis",
  };

  const configured = process.env.ZLIB_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const check = setAndValidateBaseUrl(config, configured);
  if (!check.success) throw new Error(`ZLIB_BASE_URL: ${check.error}`);

  config.domains = candidateDomains(config.baseUrl);
  return config;
}

const DEFAULT_BASE_URL = "https://z-library.sk";

/**
 * Monta a ordem de tentativa da descoberta.
 *
 * O domínio configurado vem sempre primeiro: descoberta é plano B, não licença
 * para trocar de origem quando o endereço escolhido está de pé. Com
 * ZLIB_AUTO_DISCOVER=0 a lista fica só com ele, que é o comportamento anterior
 * a esta integração — útil para isolar um domínio específico.
 */
function candidateDomains(baseUrl: string): string[] {
  if (process.env.ZLIB_AUTO_DISCOVER?.trim() === "0") return [baseUrl];

  const override = process.env.ZLIB_DOMAINS?.trim();
  const extras = override
    ? override.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [...KNOWN_DOMAINS];

  const seen = new Set<string>();
  return [baseUrl, ...extras]
    .map((url) => url.replace(/\/+$/, ""))
    .filter((url) => {
      const key = url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
