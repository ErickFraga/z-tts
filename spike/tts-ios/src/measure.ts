/**
 * Harness de medição do RTF.
 *
 * RTF = tempo_de_sintese / duracao_do_audio
 *
 * A primeira execução de cada bloco é descartada. Ela carrega caches, aloca
 * buffers e paga custos de partida que não se repetem — incluí-la inflaria o
 * número e levaria à decisão errada.
 *
 * O agregado é a MEDIANA, não a média: uma pausa de coleta de lixo no meio de
 * uma iteração distorce a média e não deve contaminar a decisão.
 */

import { synthesize } from "./tts.ts";
import type { Sample } from "./samples.ts";

export interface Measurement {
  sampleId: string;
  label: string;
  chars: number;
  /** Duração do áudio gerado, em segundos. */
  audioSec: number;
  /** Mediana do tempo de síntese, em milissegundos. */
  synthesisMs: number;
  /** Mediana do RTF. Abaixo de 1 significa mais rápido que tempo real. */
  rtf: number;
  /** Pior RTF observado — é ele que esvazia o buffer, não a mediana. */
  rtfWorst: number;
  iterations: number;
}

const WARMUP = 1;
const ITERATIONS = 3;

export async function measureSample(sample: Sample): Promise<Measurement> {
  for (let i = 0; i < WARMUP; i++) {
    await synthesize(sample.text);
  }

  const runs: Array<{ synthesisMs: number; rtf: number }> = [];
  let audioSec = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const startedAt = performance.now();
    const { durationSec } = await synthesize(sample.text);
    const synthesisMs = performance.now() - startedAt;

    audioSec = durationSec;
    runs.push({ synthesisMs, rtf: synthesisMs / 1000 / durationSec });
  }

  return {
    sampleId: sample.id,
    label: sample.label,
    chars: sample.text.length,
    audioSec,
    synthesisMs: Math.round(median(runs.map((r) => r.synthesisMs))),
    rtf: round2(median(runs.map((r) => r.rtf))),
    rtfWorst: round2(Math.max(...runs.map((r) => r.rtf))),
    iterations: ITERATIONS,
  };
}

/**
 * Tempo até o primeiro áudio, a partir do acionamento — a métrica que o
 * usuário percebe como "demorou para começar", distinta do RTF.
 */
export async function measureTimeToFirstAudio(sample: Sample): Promise<number> {
  const startedAt = performance.now();
  await synthesize(sample.text);
  return Math.round(performance.now() - startedAt);
}

/**
 * Síntese contínua, para observar crescimento de memória ao longo de vários
 * blocos seguidos — o padrão real de uso durante um capítulo.
 *
 * Memória de pico deve ser lida no medidor de debug do Xcode: o JS não tem
 * acesso confiável ao consumo do processo no iOS.
 */
export async function measureSustained(
  sample: Sample,
  blocks: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ totalAudioSec: number; totalSynthesisMs: number; rtf: number }> {
  let totalAudioSec = 0;
  const startedAt = performance.now();

  for (let i = 0; i < blocks; i++) {
    const { durationSec } = await synthesize(sample.text);
    totalAudioSec += durationSec;
    onProgress?.(i + 1, blocks);
  }

  const totalSynthesisMs = performance.now() - startedAt;
  return {
    totalAudioSec: round2(totalAudioSec),
    totalSynthesisMs: Math.round(totalSynthesisMs),
    rtf: round2(totalSynthesisMs / 1000 / totalAudioSec),
  };
}

/** Traduz o RTF medido na decisão de arquitetura da §19. */
export function verdict(rtf: number): { label: string; detail: string } {
  if (rtf <= 0.5) {
    return {
      label: "APROVADO",
      detail: "Streaming sob demanda confirmado. Seguir com o plano principal.",
    };
  }
  if (rtf <= 0.8) {
    return {
      label: "LIMÍTROFE",
      detail: "Viável com buffer maior que 2 blocos. Revisar FR-039.",
    };
  }
  return {
    label: "REPROVADO",
    detail: "Streaming inviável. Migrar para pré-renderização ou trocar o motor.",
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
