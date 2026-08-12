/**
 * De onde saem os domínios candidatos.
 *
 * Diferente de endpoints.ts, aqui não há hipótese: as sementes e o formato da
 * lista dinâmica vêm do cliente do KOReader (`zlibrary.koplugin`), que é código
 * em uso, e a lista dinâmica foi conferida contra a resposta real do CDN.
 *
 * A lista dinâmica é a peça central. Domínio da Z-Library é alvo móvel, e
 * qualquer lista fixa envelhece — inclusive esta. Buscá-la de um CDN funciona
 * justamente quando a origem está inalcançável: o CDN não é o alvo do bloqueio,
 * então dá para descobrir os endereços novos mesmo sem conseguir falar com
 * nenhum deles ainda.
 */

/** Sementes do config.lua do plugin. Ordem preservada. */
export const SEED_URLS = [
  "https://z-lib.fo",
  "https://library-oceania.sk",
  "https://library-latin.sk",
  "https://z-lib.fm",
  "https://library-asia.sk",
  "https://lib-africa.sk",
  "https://z-library.do",
  "https://z-lib.gd",
  "https://1lib.sk",
  "https://z-lib.gl",
  "https://z-library.rs",
  "https://z-lib.do",
  "https://z-lib.gs",
] as const;

/**
 * Espelhos da lista dinâmica, tentados em rodízio.
 *
 * O rodízio importa mais do que parece: falha de DNS responde em milissegundos,
 * então insistir na mesma fonte queima as tentativas sem esperar nada. Trocar
 * de CDN a cada tentativa cobre o caso de um deles estar bloqueado.
 */
export const DOMAIN_LIST_SOURCES = [
  "https://fastly.jsdelivr.net/gh/ZlibraryKO/zlibrary.koplugin@main/assets/domains.json",
  "https://cdn.jsdelivr.net/gh/ZlibraryKO/zlibrary.koplugin@main/assets/domains.json",
  "https://raw.githubusercontent.com/ZlibraryKO/zlibrary.koplugin/main/assets/domains.json",
] as const;

/** Arquivo onde a lista dinâmica fica guardada entre execuções. */
export const DOMAIN_CACHE_FILE = ".domains-cache.json";

/** Validade da lista guardada, igual à do plugin. */
export const DOMAIN_CACHE_TTL_MS = 600_000;

/**
 * Extrai os domínios do JSON: `{ success: 1, domains: [{ domain, ... }] }`.
 *
 * Endereços .onion são descartados — exigem Tor e, sem ele, gastam uma
 * tentativa para falhar em DNS. Entradas marcadas como redirecionador também
 * saem: elas apontam para outro domínio em vez de servir a API, e a descoberta
 * quer o destino, não o desvio.
 */
export function parseDomainList(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const root = payload as Record<string, unknown>;
  if (!Array.isArray(root.domains)) return [];

  const urls: string[] = [];

  for (const entry of root.domains) {
    const host =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" && entry !== null
          ? (entry as Record<string, unknown>).domain
          : null;

    if (typeof host !== "string" || host.length === 0) continue;
    if (host.endsWith(".onion")) continue;

    const isRedirector =
      typeof entry === "object" &&
      entry !== null &&
      (entry as Record<string, unknown>).isRedirector === true;
    if (isRedirector) continue;

    urls.push(host.startsWith("http") ? host.replace(/\/+$/, "") : `https://${host}`);
  }

  return urls;
}
