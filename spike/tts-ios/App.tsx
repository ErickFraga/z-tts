/**
 * Frente B — medição de RTF do Piper no iPhone.
 *
 * Uma tela, alguns botões, nenhuma arquitetura. Código descartável: o produto
 * desta tela são os números que ela imprime, não ela mesma.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system";
import { Asset } from "expo-asset";

import { samples } from "./src/samples.ts";
import { load, isReady } from "./src/tts.ts";
import { measureSample, measureSustained, verdict, type Measurement } from "./src/measure.ts";
import { listBrazilianVoices, speakAndMeasure } from "./src/fallback.ts";

const SUSTAINED_BLOCKS = 10;

export default function App() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  const append = useCallback((line: string) => {
    setLog((previous) => [...previous, line]);
  }, []);

  /** RTF agregado das amostras já medidas — é ele que decide a arquitetura. */
  const overall = useMemo(() => {
    if (measurements.length === 0) return null;
    const worst = Math.max(...measurements.map((m) => m.rtf));
    return { worst, ...verdict(worst) };
  }, [measurements]);

  const guard = useCallback(
    async (task: () => Promise<void>) => {
      setBusy(true);
      try {
        await task();
      } catch (error) {
        append(`✗ ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [append],
  );

  const handleLoad = useCallback(
    () =>
      guard(async () => {
        append("Carregando modelo Piper pt-BR…");
        const paths = await resolveModelPaths();
        const elapsedMs = await load(paths);
        append(`✓ Modelo carregado em ${Math.round(elapsedMs)} ms`);
        append("  (custo de partida, não entra no RTF)");
      }),
    [append, guard],
  );

  const handleMeasure = useCallback(
    () =>
      guard(async () => {
        if (!isReady()) throw new Error("Carregue o modelo primeiro.");

        const collected: Measurement[] = [];
        for (const sample of samples) {
          append(`\nMedindo "${sample.label}" (${sample.text.length} caracteres)…`);
          const result = await measureSample(sample);
          collected.push(result);
          append(
            `  áudio ${result.audioSec.toFixed(1)}s · síntese ${result.synthesisMs}ms · ` +
              `RTF ${result.rtf} (pior ${result.rtfWorst})`,
          );
        }
        setMeasurements(collected);
      }),
    [append, guard],
  );

  const handleSustained = useCallback(
    () =>
      guard(async () => {
        if (!isReady()) throw new Error("Carregue o modelo primeiro.");

        const sample = samples.find((s) => s.id === "medio") ?? samples[0]!;
        append(`\nSíntese contínua — ${SUSTAINED_BLOCKS} blocos seguidos…`);
        append("  Acompanhe a memória no medidor de debug do Xcode.");

        const result = await measureSustained(sample, SUSTAINED_BLOCKS, (done, total) => {
          if (done % 5 === 0) append(`  ${done}/${total}`);
        });

        append(
          `✓ ${result.totalAudioSec}s de áudio em ${result.totalSynthesisMs}ms — ` +
            `RTF sustentado ${result.rtf}`,
        );
      }),
    [append, guard],
  );

  const handleFallback = useCallback(
    () =>
      guard(async () => {
        const voices = await listBrazilianVoices();
        append(`\nLinha de base — AVSpeechSynthesizer`);
        append(`  ${voices.length} voz(es) pt-BR no aparelho`);

        if (voices.length === 0) {
          append("  ✗ Nenhuma voz pt-BR — plano alternativo indisponível neste aparelho");
          return;
        }

        const sample = samples.find((s) => s.id === "medio") ?? samples[0]!;
        const result = await speakAndMeasure(sample, voices[0]?.identifier);
        append(`  início em ${result.timeToStartMs}ms · fala total ${result.totalMs}ms`);
        append("  Ouça e compare a qualidade com o Piper antes de decidir.");
      }),
    [append, guard],
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.title}>Frente B — RTF do Piper</Text>
      <Text style={styles.subtitle}>
        {Platform.OS === "ios" ? "iOS" : Platform.OS} · medir sempre em aparelho físico
      </Text>

      {overall && (
        <View style={[styles.verdict, verdictStyle(overall.worst)]}>
          <Text style={styles.verdictLabel}>
            {overall.label} · pior RTF {overall.worst}
          </Text>
          <Text style={styles.verdictDetail}>{overall.detail}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button label="1. Carregar modelo" onPress={handleLoad} disabled={busy} />
        <Button label="2. Medir RTF" onPress={handleMeasure} disabled={busy} />
        <Button label="3. Síntese contínua" onPress={handleSustained} disabled={busy} />
        <Button label="4. Linha de base nativa" onPress={handleFallback} disabled={busy} />
      </View>

      {busy && <ActivityIndicator color="#8ab4f8" style={styles.spinner} />}

      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {log.length === 0 ? (
          <Text style={styles.placeholder}>Comece carregando o modelo.</Text>
        ) : (
          log.map((line, index) => (
            <Text key={index} style={styles.logLine}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Copia o modelo dos assets para o sistema de arquivos.
 *
 * O sherpa-onnx precisa de caminhos reais em disco — não consegue ler de
 * dentro do bundle do app.
 */
async function resolveModelPaths() {
  const [model, tokens] = await Asset.loadAsync([
    require("./assets/model/pt_BR-faber-medium.onnx"),
    require("./assets/model/tokens.txt"),
  ]);

  if (!model?.localUri || !tokens?.localUri) {
    throw new Error(
      "Modelo não encontrado em assets/model/. Veja as instruções no README.",
    );
  }

  return {
    model: model.localUri.replace("file://", ""),
    tokens: tokens.localUri.replace("file://", ""),
    dataDir: `${FileSystem.documentDirectory}espeak-ng-data`.replace("file://", ""),
  };
}

function verdictStyle(rtf: number) {
  if (rtf <= 0.5) return styles.verdictPass;
  if (rtf <= 0.8) return styles.verdictWarn;
  return styles.verdictFail;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#12141a", paddingTop: 64, paddingHorizontal: 20 },
  title: { color: "#f2f4f8", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#8b93a7", fontSize: 13, marginTop: 4, marginBottom: 16 },
  verdict: { borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 4 },
  verdictPass: { backgroundColor: "#16281c", borderLeftColor: "#4ec27f" },
  verdictWarn: { backgroundColor: "#2b2617", borderLeftColor: "#d9a441" },
  verdictFail: { backgroundColor: "#2b1a1a", borderLeftColor: "#e05c5c" },
  verdictLabel: { color: "#f2f4f8", fontSize: 15, fontWeight: "700" },
  verdictDetail: { color: "#c3c9d6", fontSize: 13, marginTop: 4 },
  actions: { gap: 8 },
  button: { backgroundColor: "#232733", borderRadius: 8, paddingVertical: 13, alignItems: "center" },
  buttonPressed: { backgroundColor: "#2d3242" },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { color: "#e8ebf2", fontSize: 15, fontWeight: "600" },
  spinner: { marginTop: 14 },
  log: { flex: 1, marginTop: 18 },
  logContent: { paddingBottom: 40 },
  placeholder: { color: "#5c6478", fontSize: 13, fontStyle: "italic" },
  logLine: {
    color: "#c3c9d6",
    fontSize: 12.5,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 19,
  },
});
