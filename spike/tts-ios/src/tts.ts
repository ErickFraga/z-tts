/**
 * Adaptador sobre o TurboModule sherpa-onnx.
 *
 * A API abaixo é uma HIPÓTESE NÃO VERIFICADA. O binding é comunitário e não
 * oficial, e o ambiente onde este arquivo foi escrito não tinha como compilar
 * para iOS. Confirmar a superfície real da API é a primeira tarefa da Frente B.
 *
 * Toda divergência encontrada deve ser corrigida AQUI e em nenhum outro lugar:
 * o restante do spike depende apenas de `synthesize()` e `load()`. Se o nome
 * dos métodos, o formato do retorno ou a forma de passar o modelo forem
 * diferentes, este é o único arquivo a mexer.
 */

import SherpaOnnx from "react-native-sherpa-onnx";

/** Resultado de uma síntese. A duração vem das amostras, não de um WAV. */
export interface Synthesis {
  /** Duração do áudio gerado, em segundos. */
  durationSec: number;
  /** Caminho do arquivo de áudio, quando o binding gravar em disco. */
  filePath?: string;
}

export interface ModelPaths {
  /** Arquivo .onnx do Piper. */
  model: string;
  /** Arquivo tokens.txt que acompanha o modelo. */
  tokens: string;
  /** Diretório espeak-ng-data, exigido pelas vozes Piper. */
  dataDir: string;
}

let ready = false;

/**
 * Carrega o modelo na memória. Deve ser chamado uma única vez.
 *
 * Medir esta etapa separadamente importa: carga de modelo é custo de partida,
 * não de síntese, e misturá-la ao RTF produziria um número enganoso.
 */
export async function load(paths: ModelPaths): Promise<number> {
  const startedAt = performance.now();

  await SherpaOnnx.initTts({
    modelPath: paths.model,
    tokensPath: paths.tokens,
    dataDirPath: paths.dataDir,
    numThreads: 2,
    provider: "cpu",
  });

  ready = true;
  return performance.now() - startedAt;
}

/**
 * Sintetiza um texto e devolve a duração do áudio produzido.
 *
 * Não reproduz o áudio — reprodução é outra medição. Aqui interessa apenas
 * quanto tempo a síntese levou contra quanto áudio ela gerou.
 */
export async function synthesize(text: string, speakerId = 0): Promise<Synthesis> {
  if (!ready) throw new Error("Modelo não carregado. Chame load() antes.");

  const result = await SherpaOnnx.generateTts({ text, speakerId, speed: 1.0 });

  // O binding pode devolver as amostras cruas ou já um arquivo. Aceitamos os
  // dois formatos: o que importa é chegar à duração em segundos.
  const durationSec =
    typeof result?.durationSec === "number"
      ? result.durationSec
      : typeof result?.numSamples === "number" && typeof result?.sampleRate === "number"
        ? result.numSamples / result.sampleRate
        : Number.NaN;

  if (Number.isNaN(durationSec)) {
    throw new Error(
      "Não foi possível determinar a duração do áudio. Ajuste o mapeamento em tts.ts — " +
        `retorno recebido: ${JSON.stringify(result)?.slice(0, 200)}`,
    );
  }

  return { durationSec, filePath: result?.filePath };
}

export function isReady(): boolean {
  return ready;
}
