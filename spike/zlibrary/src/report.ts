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
      detail = error instanceof Error ? error.message : String(error);
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
  if (!(error instanceof Error)) return "FAIL";
  const message = error.message.toLowerCase();
  const networkish = ["fetch failed", "enotfound", "econnrefused", "timeout", "etimedout"];
  return networkish.some((needle) => message.includes(needle)) ? "BLOCKED" : "FAIL";
}
