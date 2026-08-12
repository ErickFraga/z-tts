/**
 * Cliente mínimo da Z-Library — apenas o suficiente para o probe.
 *
 * Nada aqui é código de produção: sem retry, sem cache, sem abstração. O
 * objetivo é descobrir se o protocolo funciona, não construir uma biblioteca.
 */

import { endpoints, type Config } from "./endpoints.ts";

export interface SearchResult {
  id: string;
  title: string;
  author: string;
  language: string;
  extension: string;
  filesizeBytes: number | null;
  year: string | null;
  downloadUrl: string | null;
}

export interface SearchFilters {
  languages?: string[];
  extensions?: string[];
  yearFrom?: number;
  yearTo?: number;
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
    super(`HTTP ${status} em ${url} — ${bodyPreview.slice(0, 160)}`);
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
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (this.cookies.size > 0) headers.set("Cookie", this.cookieHeader);

    const response = await fetch(url, { ...init, headers, redirect: "follow" });
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

    const response = await this.request(endpoints.login, { method: "POST", body });
    const cookiesBefore = this.cookies.size;
    const payload = await parseJson(response);

    // Alguns clientes relatam os identificadores no corpo em vez de Set-Cookie.
    const user = isRecord(payload) && isRecord(payload.user) ? payload.user : null;
    const userId = user ? asString(user.id ?? user.remix_userid) : null;
    const userKey = user ? asString(user.remix_userkey) : null;

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

  async search(
    term: string,
    filters: SearchFilters = {},
    page = 1,
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({ message: term, page: String(page) });
    for (const language of filters.languages ?? []) params.append("languages[]", language);
    for (const extension of filters.extensions ?? []) params.append("extensions[]", extension);
    if (filters.yearFrom) params.set("yearFrom", String(filters.yearFrom));
    if (filters.yearTo) params.set("yearTo", String(filters.yearTo));

    const response = await this.request(`${endpoints.search}?${params}`);
    const payload = await parseJson(response);
    const books = isRecord(payload) && Array.isArray(payload.books) ? payload.books : [];

    return books.filter(isRecord).map(toSearchResult);
  }

  /** Consulta o perfil — serve para checar sessão válida e cota diária. */
  async profile(): Promise<Record<string, unknown>> {
    const payload = await parseJson(await this.request(endpoints.profile));
    return isRecord(payload) ? payload : {};
  }

  /** Baixa um arquivo e devolve os bytes crus, sem gravar em disco. */
  async download(url: string): Promise<Uint8Array> {
    const absolute = url.startsWith("http") ? url : `${this.config.baseUrl}${url}`;
    const response = await fetch(absolute, {
      headers: this.cookies.size > 0 ? { Cookie: this.cookieHeader } : {},
      redirect: "follow",
    });

    if (!response.ok) {
      throw new HttpError(response.status, await safeText(response), absolute);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}

function toSearchResult(book: Record<string, unknown>): SearchResult {
  return {
    id: asString(book.id) ?? "",
    title: asString(book.title) ?? "(sem título)",
    author: asString(book.author) ?? "(sem autor)",
    language: asString(book.language) ?? "",
    extension: (asString(book.extension) ?? "").toLowerCase(),
    filesizeBytes: asNumber(book.filesizeString ?? book.filesize),
    year: asString(book.year),
    downloadUrl: asString(book.dl ?? book.downloadUrl ?? book.href),
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
