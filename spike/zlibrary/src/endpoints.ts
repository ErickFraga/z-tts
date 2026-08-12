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
  baseUrl: string;
  email: string;
  password: string;
  searchTerm: string;
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

  return {
    baseUrl: (process.env.ZLIB_BASE_URL?.trim() || "https://z-library.sk").replace(/\/$/, ""),
    email,
    password,
    searchTerm: process.env.ZLIB_SEARCH_TERM?.trim() || "Machado de Assis",
  };
}
