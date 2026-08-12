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
import { ZLibraryClient, HttpError, type SearchResult } from "./zlibrary.ts";
import { checkEpub } from "./epub.ts";
import { Report } from "./report.ts";

const config = loadConfig();
const client = new ZLibraryClient(config);
const report = new Report();

console.log(`Frente A — Integração Z-Library`);
console.log(`Domínio: ${config.baseUrl}`);
console.log(`Conta:   ${maskEmail(config.email)}\n`);

// ---------------------------------------------------------------- 1. Login
const loginOutcome = await report.run(1, "Autenticação", async () => {
  const { tokenSource } = await client.login();
  return { outcome: "PASS", detail: `sessão obtida via ${tokenSource}` };
});

const authenticated = loginOutcome === "PASS";

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
let results: SearchResult[] = [];

if (!authenticated) {
  report.skip(3, "Busca com filtros", "depende do login");
} else {
  await report.run(3, "Busca com filtros", async () => {
    results = await client.search(config.searchTerm, {
      languages: ["portuguese"],
      extensions: ["epub"],
    });

    if (results.length === 0) {
      return {
        outcome: "FAIL",
        detail: `busca por "${config.searchTerm}" não devolveu resultados — filtros podem usar outra nomenclatura`,
      };
    }

    const offFilter = results.filter((r) => r.extension && r.extension !== "epub");
    const filterNote = offFilter.length
      ? ` — ATENÇÃO: ${offFilter.length} resultado(s) fora do filtro epub, filtro não confiável`
      : " — filtro de formato respeitado";

    return { outcome: "PASS", detail: `${results.length} resultado(s)${filterNote}` };
  });
}

// ----------------------------------------------------------- 4. Paginação
if (results.length === 0) {
  report.skip(4, "Paginação", "depende da busca");
} else {
  await report.run(4, "Paginação", async () => {
    const second = await client.search(
      config.searchTerm,
      { languages: ["portuguese"], extensions: ["epub"] },
      2,
    );

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
const candidate = results.find((r) => r.downloadUrl && r.extension === "epub");

if (!candidate?.downloadUrl) {
  report.skip(
    5,
    "Download de EPUB",
    results.length === 0 ? "depende da busca" : "nenhum resultado trouxe URL de download",
  );
} else {
  await report.run(5, "Download de EPUB", async () => {
    const bytes = await client.download(candidate.downloadUrl!);
    const check = checkEpub(bytes);

    if (check.valid) {
      await mkdir("downloads", { recursive: true });
      await writeFile(`downloads/${candidate.id || "amostra"}.epub`, bytes);
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
await report.run(7, "Sinalização de cota diária", async () => {
  await client.login(); // sessão foi descartada no passo 6
  const profile = await client.profile();
  const quota = describeQuota(profile);

  return quota
    ? { outcome: "PASS", detail: `cota legível no perfil${quota} (viabiliza FR-018)` }
    : {
        outcome: "FAIL",
        detail: "perfil não expõe cota diária — FR-018 precisará inferi-la pela falha do download",
      };
});

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
