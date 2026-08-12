/**
 * Cliente mínimo da Z-Library — apenas o suficiente para o probe.
 *
 * Nada aqui é código de produção: sem retry, sem cache, sem abstração. O
 * objetivo é descobrir se o protocolo funciona, não construir uma biblioteca.
 */

import { DEFAULT_HEADERS, endpoints, type Config } from "./endpoints.ts";
import { resilientFetch } from "./transport.ts";

export interface SearchResult {
  id: string;
  /** Exigido junto do id para detalhe e download — não é opcional na prática. */
  hash: string;
  title: string;
  author: string;
  language: string;
  /** A origem chama de "format", não "extension". */
  format: string;
  filesizeBytes: number | null;
  year: string | null;
}

export interface DownloadLink {
  url: string;
  allowed: boolean;
  description: string | null;
}

export interface SearchFilters {
  languages?: string[];
  extensions?: string[];
  limit?: number;
  order?: string;
}

/**
 * Erro que carrega o status HTTP, para o probe distinguir 401 de 404 de 429.
 *
 * Campos declarados explicitamente: o type-stripping do Node não aceita
 * parameter properties, e este spike roda sem etapa de build.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly bodyPreview: string;

  constructor(status: number, bodyPreview: string, url: string) {
    // Corpo achatado em uma linha: HTML de erro vem com quebras que picotam
    // o relatório e escondem o resto do passo.
    const flat = bodyPreview.replace(/\s+/g, " ").trim().slice(0, 140);
    super(`HTTP ${status} em ${url} — ${flat}`);
    this.name = "HttpError";
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

export class ZLibraryClient {
  /** Cookies de sessão, no formato nome=valor. */
  private cookies = new Map<string, string>();
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  get isAuthenticated(): boolean {
    return this.cookies.size > 0;
  }

  /** Descarta a sessão, para simular expiração sem esperar o servidor. */
  clearSession(): void {
    this.cookies.clear();
  }

  private get cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    // Os cabeçalhos padrão identificam o cliente como o do KOReader. A origem
    // trata requisição anônima de forma diferente, e um 403 vindo daí seria
    // confundido com bloqueio de rede.
    const headers = new Headers({ ...DEFAULT_HEADERS, ...headersOf(init.headers) });
    if (this.cookies.size > 0) headers.set("Cookie", this.cookieHeader);

    // A retentativa só é segura porque todo corpo daqui é URLSearchParams, que
    // se serializa de novo a cada tentativa. Um corpo em stream não sobreviveria
    // à segunda — se algum dia entrar um, precisa ser recriado por tentativa.
    const response = await resilientFetch(
      url,
      { ...init, headers, redirect: "follow" },
      { label: path },
    );
    this.captureCookies(response);

    if (!response.ok) {
      throw new HttpError(response.status, await safeText(response), url);
    }
    return response;
  }

  private captureCookies(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";", 1)[0];
      const separator = pair?.indexOf("=") ?? -1;
      if (!pair || separator <= 0) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  /**
   * Autentica e guarda os cookies de sessão.
   *
   * O formato da resposta é uma incógnita do spike: pode vir JSON com os
   * identificadores no corpo, ou apenas Set-Cookie. Tratamos os dois.
   */
  async login(): Promise<{ tokenSource: string }> {
    const body = new URLSearchParams({
      email: this.config.email,
      password: this.config.password,
    });

    const response = await this.request(endpoints.login, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        // Só no login, como o cliente do KOReader faz.
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    const cookiesBefore = this.cookies.size;
    const payload = await parseJson(response);

    // A origem sinaliza sucesso com um flag numérico, e HTTP 200 sozinho não
    // garante que o login deu certo — credencial errada também devolve 200.
    if (isRecord(payload) && payload.success !== undefined && Number(payload.success) !== 1) {
      throw new Error(`Login recusado pela origem (success=${payload.success})`);
    }

    // Os identificadores aparecem no corpo com dois conjuntos possíveis de
    // nomes, dependendo da versão da origem.
    const user = isRecord(payload) && isRecord(payload.user) ? payload.user : null;
    const userId = user ? asString(user.id ?? user.user_id ?? user.remix_userid) : null;
    const userKey = user ? asString(user.remix_userkey ?? user.user_key) : null;

    if (userId && userKey) {
      this.cookies.set("remix_userid", userId);
      this.cookies.set("remix_userkey", userKey);
      return { tokenSource: "corpo da resposta" };
    }

    if (cookiesBefore === 0 && this.cookies.size === 0) {
      throw new Error(
        "Login não devolveu cookies nem identificadores no corpo. " +
          "Confira o formato esperado em endpoints.ts.",
      );
    }

    return { tokenSource: "cabeçalho Set-Cookie" };
  }

  /**
   * Busca. É POST com corpo form-encoded, não GET com query string — o
   * cliente do KOReader confirma isso, e a hipótese anterior estava errada.
   */
  async search(
    term: string,
    filters: SearchFilters = {},
    page = 1,
  ): Promise<{ results: SearchResult[]; totalItems: number | null }> {
    const body = new URLSearchParams({
      message: term,
      page: String(page),
      limit: String(filters.limit ?? 30),
      order: filters.order ?? "popular",
    });
    for (const language of filters.languages ?? []) body.append("languages[]", language);
    for (const extension of filters.extensions ?? []) body.append("extensions[]", extension);

    const response = await this.request(endpoints.search, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    });

    const payload = await parseJson(response);
    if (!isRecord(payload)) return { results: [], totalItems: null };

    // A origem devolve os resultados em `books`, mas cai para
    // `exactMatch.books` quando a busca casa exatamente com um título.
    const exact = isRecord(payload.exactMatch) ? payload.exactMatch : null;
    const raw = Array.isArray(payload.books)
      ? payload.books
      : exact && Array.isArray(exact.books)
        ? exact.books
        : [];

    const pagination = isRecord(payload.pagination) ? payload.pagination : null;

    return {
      results: raw.filter(isRecord).map(toSearchResult),
      totalItems: pagination ? asNumber(pagination.total_items) : null,
    };
  }

  /**
   * Obtém o link real de download. A busca não o traz pronto: é preciso pedir
   * separadamente, informando id e hash do livro.
   */
  async getDownloadLink(id: string, hash: string): Promise<DownloadLink> {
    const payload = await parseJson(await this.request(endpoints.downloadLink(id, hash)));
    const file = isRecord(payload) && isRecord(payload.file) ? payload.file : null;

    if (!file) {
      throw new Error(
        `Resposta sem o objeto "file". Recebido: ${JSON.stringify(payload).slice(0, 160)}`,
      );
    }

    const url = asString(file.downloadLink);
    if (!url) throw new Error("Objeto \"file\" sem downloadLink");

    return {
      url,
      allowed: file.allowDownload !== false,
      description: asString(file.description),
    };
  }

  /** Consulta o perfil — serve para checar sessão válida e cota diária. */
  async profile(): Promise<Record<string, unknown>> {
    const payload = await parseJson(await this.request(endpoints.profile));
    return isRecord(payload) ? payload : {};
  }

  /** Baixa um arquivo e devolve os bytes crus, sem gravar em disco. */
  async download(url: string): Promise<Uint8Array> {
    const absolute = url.startsWith("http") ? url : `${this.config.baseUrl}${url}`;
    const response = await resilientFetch(
      absolute,
      {
        headers: this.cookies.size > 0
          ? { ...DEFAULT_HEADERS, Cookie: this.cookieHeader }
          : DEFAULT_HEADERS,
        redirect: "follow",
      },
      // Um download interrompido no meio conta como tentativa perdida: sem
      // requisição de intervalo, recomeçar é a única saída.
      { label: "download" },
    );

    if (!response.ok) {
      throw new HttpError(response.status, await safeText(response), absolute);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}

/** Normaliza os três formatos que HeadersInit aceita para um objeto simples. */
function headersOf(init: RequestInit["headers"]): Record<string, string> {
  return init ? Object.fromEntries(new Headers(init)) : {};
}

function toSearchResult(book: Record<string, unknown>): SearchResult {
  return {
    id: asString(book.id) ?? "",
    hash: asString(book.hash) ?? "",
    title: asString(book.title) ?? "(sem título)",
    author: asString(book.author) ?? "(sem autor)",
    language: asString(book.language) ?? "",
    // "format" é o nome usado pela origem; "extension" fica como reserva.
    format: (asString(book.format ?? book.extension) ?? "").toLowerCase(),
    filesizeBytes: asNumber(book.filesize ?? book.filesizeString),
    year: asString(book.year),
  };
}

/**
 * A resposta pode vir como HTML de erro ou de CAPTCHA em vez de JSON. Nesse
 * caso o preview do corpo é a informação mais útil que o probe pode registrar.
 */
async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const looksLikeHtml = /^\s*<(!doctype|html)/i.test(text);
    throw new Error(
      looksLikeHtml
        ? `Resposta em HTML onde se esperava JSON — possível CAPTCHA, bloqueio ou endpoint errado. Início: ${text.slice(0, 160)}`
        : `Resposta não é JSON válido. Início: ${text.slice(0, 160)}`,
    );
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "(corpo ilegível)";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
