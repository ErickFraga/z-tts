/**
 * Probe da Frente A — percorre os oito passos definidos em docs/requisitos.md §19.
 *
 * Cada passo é independente no registro, mas alguns dependem do anterior: sem
 * login não há busca, sem busca não há download. Dependências não satisfeitas
 * viram SKIP, não FAIL — o relatório precisa distinguir "quebrou" de
 * "não deu para chegar até aqui".
 */

import { writeFile, mkdir } from "node:fs/promises";
import { loadConfig } from "./endpoints.ts";
import { ZLibraryClient, HttpError, type SearchResult, type SearchFilters } from "./zlibrary.ts";
import { checkEpub } from "./epub.ts";
import { Report, explainNetworkCode } from "./report.ts";
import { preflight, summarizePreflight } from "./preflight.ts";

const config = loadConfig();
const client = new ZLibraryClient(config);
const report = new Report();

console.log(`Frente A — Integração Z-Library`);
console.log(`Domínio: ${config.baseUrl}`);
console.log(`Conta:   ${maskEmail(config.email)}\n`);

// -------------------------------------------------------------- 0. Pré-voo
const connectivity = await preflight(config.baseUrl);
const reachable = connectivity.addresses.length > 0 && connectivity.tcpReachable;

await report.run(0, "Conectividade com o domínio", async () => ({
  outcome: reachable ? "PASS" : "BLOCKED",
  detail: summarizePreflight(connectivity),
}));

if (!reachable) {
  const cause =
    explainNetworkCode(connectivity.dnsError ?? connectivity.tcpError ?? "") ??
    "causa não identificada";
  console.log(`\n  Causa provável: ${cause}.`);
  console.log(`  Sem alcançar o domínio, nenhum passo adiante tem valor diagnóstico.\n`);
}

// ---------------------------------------------------------------- 1. Login
let authenticated = false;

if (!reachable) {
  report.skip(1, "Autenticação", "domínio inalcançável");
} else {
  const loginOutcome = await report.run(1, "Autenticação", async () => {
    const { tokenSource } = await client.login();
    return { outcome: "PASS", detail: `sessão obtida via ${tokenSource}` };
  });
  authenticated = loginOutcome === "PASS";
}

// ------------------------------------------------------- 2. Reuso do token
if (!authenticated) {
  report.skip(2, "Reuso do token", "depende do login");
} else {
  await report.run(2, "Reuso do token", async () => {
    const profile = await client.profile();
    const quota = describeQuota(profile);
    return { outcome: "PASS", detail: `sessão aceita em nova requisição${quota}` };
  });
}

// --------------------------------------------------------------- 3. Busca
const SEARCH_FILTERS: SearchFilters = { languages: ["portuguese"], extensions: ["epub"] };

let results: SearchResult[] = [];

if (!authenticated) {
  report.skip(3, "Busca com filtros", "depende do login");
} else {
  await report.run(3, "Busca com filtros", async () => {
    const response = await client.search(config.searchTerm, SEARCH_FILTERS);
    results = response.results;

    if (results.length === 0) {
      return {
        outcome: "FAIL",
        detail: `busca por "${config.searchTerm}" não devolveu resultados — filtros podem usar outra nomenclatura`,
      };
    }

    const offFilter = results.filter((r) => r.format && r.format !== "epub");
    const missingHash = results.filter((r) => !r.hash).length;

    const notes = [
      offFilter.length
        ? `ATENÇÃO: ${offFilter.length} fora do filtro epub, filtro não confiável`
        : "filtro de formato respeitado",
      missingHash ? `ATENÇÃO: ${missingHash} sem hash, download inviável` : null,
      response.totalItems !== null ? `${response.totalItems} no total` : null,
    ].filter(Boolean);

    return { outcome: "PASS", detail: `${results.length} resultado(s) — ${notes.join(" · ")}` };
  });
}

// ----------------------------------------------------------- 4. Paginação
if (results.length === 0) {
  report.skip(4, "Paginação", "depende da busca");
} else {
  await report.run(4, "Paginação", async () => {
    const { results: second } = await client.search(config.searchTerm, SEARCH_FILTERS, 2);

    if (second.length === 0) {
      return { outcome: "PASS", detail: "página 2 vazia — acervo pequeno ou fim dos resultados" };
    }

    const firstIds = new Set(results.map((r) => r.id));
    const overlap = second.filter((r) => firstIds.has(r.id)).length;

    return overlap === second.length
      ? { outcome: "FAIL", detail: "página 2 repete a página 1 — paginação não funciona" }
      : { outcome: "PASS", detail: `página 2 com ${second.length} resultado(s), ${overlap} repetido(s)` };
  });
}

// ------------------------------------------------------------- 5. Download
// Duas etapas: pedir o link e só então baixar. A busca não traz URL pronta.
const candidate = results.find((r) => r.id && r.hash && r.format === "epub");

if (!candidate) {
  report.skip(
    5,
    "Download de EPUB",
    results.length === 0 ? "depende da busca" : "nenhum resultado veio com id e hash",
  );
} else {
  await report.run(5, "Download de EPUB", async () => {
    const link = await client.getDownloadLink(candidate.id, candidate.hash);

    if (!link.allowed) {
      return {
        outcome: "BLOCKED",
        detail: `download negado pela origem${link.description ? `: ${link.description}` : ""} — provável cota esgotada`,
      };
    }

    const bytes = await client.download(link.url);
    const check = checkEpub(bytes);

    if (check.valid) {
      await mkdir("downloads", { recursive: true });
      await writeFile(`downloads/${candidate.id}.epub`, bytes);
    }

    return {
      outcome: check.valid ? "PASS" : "FAIL",
      detail: `"${truncate(candidate.title, 40)}" — ${check.reason}`,
    };
  });
}

// ------------------------------------------------- 6. Expiração de sessão
if (!authenticated) {
  report.skip(6, "Comportamento com sessão expirada", "depende do login");
} else {
  await report.run(6, "Comportamento com sessão expirada", async () => {
    client.clearSession();
    try {
      await client.profile();
      return {
        outcome: "FAIL",
        detail: "requisição sem sessão foi aceita — não dá para detectar expiração (afeta FR-003)",
      };
    } catch (error) {
      if (error instanceof HttpError) {
        return { outcome: "PASS", detail: `sessão ausente devolve HTTP ${error.status}, detectável` };
      }
      return { outcome: "PASS", detail: `sessão ausente rejeitada: ${short(error)}` };
    }
  });
}

// ------------------------------------------------------------- 7. Cota
if (!authenticated) {
  report.skip(7, "Sinalização de cota diária", "depende do login");
} else {
  await report.run(7, "Sinalização de cota diária", async () => {
    await client.login(); // sessão foi descartada de propósito no passo 6
    const profile = await client.profile();
    const quota = describeQuota(profile);

    return quota
      ? { outcome: "PASS", detail: `cota legível no perfil${quota} (viabiliza FR-018)` }
      : {
          outcome: "FAIL",
          detail: "perfil não expõe cota diária — FR-018 precisará inferi-la pela falha do download",
        };
  });
}

// -------------------------------------------------- 8. Estabilidade do domínio
report.skip(
  8,
  "Estabilidade do domínio",
  "exige observação ao longo de vários dias — registrar manualmente no relatório",
);

// ------------------------------------------------------------------ Resumo
const exitCode = report.summarize();
await writeFile(
  "report.json",
  JSON.stringify(
    { executadoEm: new Date().toISOString(), dominio: config.baseUrl, passos: report.toJSON() },
    null,
    2,
  ),
);
console.log("Relatório gravado em report.json");
process.exit(exitCode);

// ----------------------------------------------------------------- Auxiliares

function describeQuota(profile: Record<string, unknown>): string {
  const user = typeof profile.user === "object" && profile.user !== null
    ? (profile.user as Record<string, unknown>)
    : profile;

  const used = user.downloads_today ?? user.downloadsToday;
  const limit = user.downloads_limit ?? user.downloadsLimit;

  return used !== undefined && limit !== undefined ? ` (${used}/${limit} hoje)` : "";
}

function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(user.length - 2, 3))}@${domain}`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function short(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 80) : String(error);
}
