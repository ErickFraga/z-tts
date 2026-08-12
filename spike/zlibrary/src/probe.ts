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
import { Report } from "./report.ts";
import {
  autoDiscoverAndSetBaseUrl,
  summarizeDiscovery,
  type DiscoveryResult,
} from "./discovery.ts";
import { cliNetworkGate, consoleUi } from "./cli.ts";
import { installTransport, summarizeTransport, transportStats } from "./transport.ts";

const config = loadConfig();
const report = new Report();

// Antes de qualquer requisição: conexão persistente e retentativa. Contra
// interferência intermitente no handshake, é o que faz a execução sobreviver.
const transport = installTransport();

console.log(`Frente A — Integração Z-Library`);
console.log(`Domínio configurado: ${config.baseUrl}`);
console.log(
  `Sementes:            ${config.domains.length}` +
    `${config.autoDiscover ? " (+ lista dinâmica)" : " (descoberta desligada)"}`,
);
console.log(`Conta:               ${maskEmail(config.email)}`);
console.log(
  `Transporte:          conexão persistente ${transport.keepAliveMs / 1000}s` +
    `${transport.proxy ? ` · proxy ${hostOf(transport.proxy)}` : ""}\n`,
);

// ------------------------------------------- 0. Pré-voo e descoberta de domínio
// A descoberta substitui o pré-voo de domínio único: o configurado é o primeiro
// candidato, e os demais só entram se ele não responder. Ela grava o domínio
// escolhido em `config`, então o cliente só pode ser construído depois. Roda
// dentro do passo para que o tempo medido seja o da varredura inteira — uma
// lista longa esgotando o tempo limite custa caro, e isso precisa aparecer.
let discovery: DiscoveryResult = { success: false, attempts: [] };

await report.run(0, "Conectividade e descoberta de domínio", async () => {
  discovery = await autoDiscoverAndSetBaseUrl(
    config,
    { network: cliNetworkGate, ui: consoleUi },
    {
      interactive: true,
      // "fastest" sonda todos os candidatos e fica com o de menor latência —
      // varredura completa, útil para mapear quais espelhos esta rede alcança.
      mode: process.env.ZLIB_RANK_DOMAINS?.trim() === "1" ? "fastest" : "first",
      onAttempt: (attempt) =>
        console.log(`  ${attempt.usable ? "✓" : "✗"} ${attempt.summary}`),
    },
  );

  return {
    outcome: discovery.success ? "PASS" : "BLOCKED",
    detail: summarizeDiscovery(discovery),
  };
});

const reachable = discovery.success;
const client = new ZLibraryClient(config);

if (!reachable && discovery.attempts.length > 1) {
  // A varredura só chega aqui depois de o porteiro confirmar que há rede. Todos
  // os candidatos falharem, com a rede de pé, é um achado mais forte que um
  // domínio morto: aponta para bloqueio dirigido à origem, não para endereço
  // trocado — e isso não tem conserto do lado do código.
  console.log(`\n  Nenhum candidato respondeu, com a rede funcionando.`);
  console.log(`  Sem alcançar a origem, nenhum passo adiante tem valor diagnóstico.\n`);
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
// A pergunta de vários dias continua sem resposta automática, mas a instabilidade
// dentro de uma execução agora é um número, não uma impressão.
report.skip(
  8,
  "Estabilidade do domínio",
  `observação de vários dias continua manual — nesta execução: ${summarizeTransport()}`,
);

// ------------------------------------------------------------------ Resumo
const exitCode = report.summarize();

if (transportStats.retries > 0) {
  console.log(
    `\nA interferência custou ${transportStats.retries} retentativa(s) e foi absorvida. ` +
      `Enquanto esse número não crescer a ponto de esgotar as tentativas, o bloqueio é ruído, não parede.`,
  );
}
await writeFile(
  "report.json",
  JSON.stringify(
    {
      executadoEm: new Date().toISOString(),
      dominio: config.baseUrl,
      // Os candidatos descartados são metade do achado quando o passo 0 bloqueia:
      // dizem quantos domínios foram testados e como cada um falhou.
      descoberta: discovery,
      // Retentativas por causa são a medida do bloqueio ao longo do tempo:
      // comparar execuções diz se ele está afrouxando ou endurecendo.
      transporte: {
        proxy: transport.proxy !== null,
        requisicoes: transportStats.requests,
        retentativas: transportStats.retries,
        falhas: transportStats.failed,
        porCausa: Object.fromEntries(transportStats.byCause),
      },
      passos: report.toJSON(),
    },
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

/** Só o host do proxy no cabeçalho: a URL pode carregar usuário e senha. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "configurado";
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function short(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 80) : String(error);
}
