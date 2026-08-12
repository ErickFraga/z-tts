# Frente B — sherpa-onnx com Piper no iOS

Mede o **RTF** do Piper em iPhone físico. É o número que decide se a
arquitetura de streaming especificada em FR-039 sobrevive.

> **Código não verificado.** Foi escrito em ambiente Linux sem Xcode, então
> nunca compilou. Espere ajustes de build. Os pontos de maior risco estão
> listados em [Onde isto provavelmente quebra](#onde-isto-provavelmente-quebra).

---

## A métrica

```
RTF = tempo_de_sintese / duracao_do_audio
```

RTF de 0,3 gera 10 segundos de fala em 3 segundos — sobra folga para manter o
buffer à frente da reprodução. RTF de 1,2 e o áudio trava esperando a síntese.

**Medir em aparelho físico.** O simulador roda na CPU do Mac, várias vezes mais
rápida que a do telefone. Um RTF de simulador não serve para decidir nada.

---

## Como rodar

Requer macOS com Xcode, um iPhone e a conta de desenvolvedor Apple.

```bash
cd spike/tts-ios
npm install
./scripts/fetch-model.sh     # baixa o modelo Piper pt-BR (~63 MB)
npx expo prebuild --platform ios --clean
npx expo run:ios --device    # escolha o iPhone conectado, não o simulador
```

---

## O que a tela faz

Quatro botões, na ordem:

1. **Carregar modelo** — mede o custo de partida separadamente. Carga de modelo não é síntese, e misturar as duas produziria um RTF enganoso.
2. **Medir RTF** — roda as três amostras (frase curta, parágrafo médio, parágrafo longo). Descarta a primeira execução de cada uma como aquecimento, roda três iterações e reporta a **mediana**. Também mostra o **pior** RTF, porque é o pior caso que esvazia o buffer, não a mediana.
3. **Síntese contínua** — dez blocos seguidos, o padrão real de uso durante um capítulo. Acompanhe a memória no medidor de debug do Xcode; o JS não lê consumo de processo no iOS de forma confiável.
4. **Linha de base nativa** — fala o mesmo texto com o `AVSpeechSynthesizer`. **Ouça.** É o plano alternativo, e sem escutá-lo não há como julgar se o ganho de qualidade do Piper compensa o risco técnico dele.

O veredicto aparece no topo assim que houver medições, já traduzido na decisão da §19.

---

## Ainda falta medir à mão

O item 7 da Frente B — síntese prosseguindo com o app em background. O
`UIBackgroundModes: ["audio"]` já está no `app.json`, mas confirmar isso exige
tocar áudio de verdade, sair do app e observar. A tela atual não reproduz o
áudio; ela apenas sintetiza e cronometra.

---

## Onde isto provavelmente quebra

**`src/tts.ts` é o arquivo a consertar primeiro.** A API do TurboModule ali é
hipótese, não fato: o binding é comunitário, não oficial, e nunca foi executado
neste código. Os nomes dos métodos, o formato do retorno e a forma de apontar
para o modelo podem todos estar diferentes. O resto do spike só depende de
`load()` e `synthesize()`, então é o único arquivo que precisa mudar.

**O `espeak-ng-data` é o tropeço clássico.** As vozes Piper exigem esse
diretório, e ele não vem junto do `.onnx` no repositório de vozes. O caminho
mais direto é pegar o pacote `vits-piper-pt_BR-faber-medium` nas releases do
sherpa-onnx, que já traz modelo, `tokens.txt` e `espeak-ng-data` no formato
esperado, em vez de montar as peças separadamente.

**Caminhos de arquivo.** O sherpa-onnx lê do sistema de arquivos, não de dentro
do bundle. O `resolveModelPaths()` em `App.tsx` copia os assets e remove o
prefixo `file://` — se o binding reclamar do caminho, é o primeiro lugar a
conferir.

**Versões.** As do `package.json` são um ponto de partida coerente entre si,
não uma combinação testada. Se o `prebuild` reclamar, alinhe pelo que o
`react-native-sherpa-onnx` pedir.

---

## Decisão

| RTF (pior caso) | Consequência |
|---|---|
| ≤ 0,5 | Streaming sob demanda confirmado; seguir com o plano principal |
| 0,5 a 0,8 | Viável com buffer maior; revisar FR-039 |
| > 0,8 | Streaming inviável; migrar para pré-renderização ou trocar o motor |

Se o TurboModule não compilar em iOS, o recuo é o `AVSpeechSynthesizer`: roda
offline, tem vozes em português, qualidade menor — e risco técnico quase nulo.

---

## O entregável

Não é este app. É um relatório com os números medidos, o aparelho usado, o que
funcionou, o que não funcionou, e a recomendação. Depois disso, este diretório
pode ser apagado.
