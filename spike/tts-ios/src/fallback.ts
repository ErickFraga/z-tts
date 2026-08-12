/**
 * Linha de base com o sintetizador nativo do iOS (AVSpeechSynthesizer, via
 * expo-speech). É o plano alternativo caso o sherpa-onnx não compile.
 *
 * O RTF NÃO se aplica aqui, e isso é uma constatação, não uma limitação da
 * medição: o AVSpeechSynthesizer é feito para falar em tempo real, não para
 * produzir um arquivo. Não existe etapa de síntese separada para cronometrar.
 *
 * O que faz sentido medir é o tempo até a fala começar, e o que faz sentido
 * avaliar é a qualidade da voz — subjetiva, mas decisiva para o produto.
 * Ouvir esta linha de base é parte da Frente B: sem ela, não há como julgar
 * se o ganho de qualidade do Piper compensa o risco técnico que ele traz.
 */

import * as Speech from "expo-speech";
import type { Sample } from "./samples.ts";

export interface FallbackMeasurement {
  /** Tempo entre o pedido e o início da fala, em milissegundos. */
  timeToStartMs: number;
  /** Duração total da fala, em milissegundos. */
  totalMs: number;
  voice: string;
}

/** Vozes pt-BR instaladas no aparelho. Vazio significa recuo indisponível. */
export async function listBrazilianVoices(): Promise<Speech.Voice[]> {
  const voices = await Speech.getAvailableVoicesAsync();
  return voices.filter((voice) => voice.language.toLowerCase().startsWith("pt-br"));
}

export function speakAndMeasure(sample: Sample, voiceId?: string): Promise<FallbackMeasurement> {
  return new Promise((resolve, reject) => {
    const requestedAt = performance.now();
    let startedAt = 0;

    Speech.speak(sample.text, {
      language: "pt-BR",
      voice: voiceId,
      onStart: () => {
        startedAt = performance.now();
      },
      onDone: () => {
        const finishedAt = performance.now();
        resolve({
          timeToStartMs: Math.round((startedAt || finishedAt) - requestedAt),
          totalMs: Math.round(finishedAt - requestedAt),
          voice: voiceId ?? "(padrão do sistema)",
        });
      },
      onError: (error) => reject(error),
    });
  });
}

export function stop(): void {
  Speech.stop();
}
