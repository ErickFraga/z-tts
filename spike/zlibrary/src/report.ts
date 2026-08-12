/**
 * Registro de resultados do probe.
 *
 * BLOCKED é deliberadamente distinto de FAIL: significa que o acesso esbarrou
 * em uma barreira externa (CAPTCHA, limite de requisições, domínio fora do ar)
 * e não que a integração seja inviável. Essa distinção é o que separa
 * "não funciona" de "não consegui testar".
 */

export type Outcome = "PASS" | "FAIL" | "BLOCKED" | "SKIP";

export interface StepResult {
  step: number;
  name: string;
  outcome: Outcome;
  durationMs: number;
  detail: string;
}

const ICON: Record<Outcome, string> = {
  PASS: "✓",
  FAIL: "✗",
  BLOCKED: "▲",
  SKIP: "–",
};

export class Report {
  private readonly results: StepResult[] = [];

  /** Executa um passo, cronometra e registra o desfecho. */
  async run(
    step: number,
    name: string,
    fn: () => Promise<{ outcome: Outcome; detail: string }>,
  ): Promise<Outcome> {
    const startedAt = performance.now();
    let outcome: Outcome;
    let detail: string;

    try {
      const result = await fn();
      outcome = result.outcome;
      detail = result.detail;
    } catch (error) {
      outcome = classify(error);
      detail = describeError(error);
    }

    const durationMs = Math.round(performance.now() - startedAt);
    this.results.push({ step, name, outcome, durationMs, detail });
    console.log(`${ICON[outcome]} ${step}. ${name} — ${detail} (${durationMs}ms)`);
    return outcome;
  }

  skip(step: number, name: string, reason: string): void {
    this.results.push({ step, name, outcome: "SKIP", durationMs: 0, detail: reason });
    console.log(`${ICON.SKIP} ${step}. ${name} — ${reason}`);
  }

  /** Resumo final e gravação do relatório. Retorna o código de saída. */
  summarize(): number {
    const tally = (outcome: Outcome) =>
      this.results.filter((r) => r.outcome === outcome).length;

    console.log(
      `\n${tally("PASS")} passaram · ${tally("FAIL")} falharam · ` +
        `${tally("BLOCKED")} bloqueados · ${tally("SKIP")} pulados`,
    );

    if (tally("BLOCKED") > 0) {
      console.log(
        "\nPassos bloqueados não são falhas da integração. Indicam barreira " +
          "externa — registre no relatório e não tente contorná-la.",
      );
    }

    return tally("FAIL") > 0 ? 1 : 0;
  }

  toJSON(): StepResult[] {
    return this.results;
  }
}

/**
 * Erros de rede e de resolução de DNS quase sempre significam domínio trocado,
 * não integração quebrada — por isso viram BLOCKED e não FAIL.
 */
function classify(error: unknown): Outcome {
  const text = describeError(error).toLowerCase();
  const networkish = [
    "fetch failed",
    "enotfound",
    "econnrefused",
    "econnreset",
    "timeout",
    "etimedout",
    "ehostunreach",
    "enetunreach",
    "certificate",
    "self-signed",
  ];
  return networkish.some((needle) => text.includes(needle)) ? "BLOCKED" : "FAIL";
}

/**
 * "fetch failed" sozinho não diz nada. O motivo real fica em `error.cause`,
 * que o fetch do Node embrulha — às vezes em mais de um nível. Sem desempacotar
 * essa cadeia é impossível distinguir DNS morto de conexão recusada, e as duas
 * levam a conclusões opostas sobre o que fazer em seguida.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const parts: string[] = [error.message];
  let current: unknown = error.cause;
  let depth = 0;

  while (current instanceof Error && depth < 4) {
    const code = (current as NodeJS.ErrnoException).code;
    parts.push(code ? `${code}: ${current.message}` : current.message);
    current = current.cause;
    depth++;
  }

  return [...new Set(parts)].join(" ← ");
}

/** Traduz códigos de erro de rede na causa provável, em português. */
export function explainNetworkCode(text: string): string | null {
  const hints: Array<[RegExp, string]> = [
    [/enotfound|eai_again/i, "o domínio não resolve em DNS — provavelmente mudou ou foi retirado do ar"],
    [/econnrefused/i, "o domínio resolve, mas o servidor recusou a conexão"],
    [/etimedout|timeout/i, "conexão expirou — pode ser bloqueio de rede ou provedor"],
    [/ehostunreach|enetunreach/i, "host inalcançável a partir desta rede"],
    [/econnreset/i, "conexão derrubada pelo outro lado — possível bloqueio ativo"],
    [/certificate|self-signed|altname/i, "falha de certificado TLS — domínio pode estar sendo interceptado"],
  ];

  return hints.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
