# Frente B — sherpa-onnx com Piper no iOS

**Não implementada.** Exige macOS com Xcode e um iPhone físico, indisponíveis
no ambiente onde o restante do spike foi escrito.

Esta é a frente **decisiva** das duas: o número que ela produz determina se a
arquitetura de streaming especificada em FR-039 sobrevive.

---

## A métrica

**RTF** (*real-time factor*) é a razão entre o tempo gasto sintetizando e a
duração do áudio produzido:

```
RTF = tempo_de_sintese / duracao_do_audio
```

RTF de 0,3 significa gerar 10 segundos de fala em 3 segundos — sobra folga para
manter o buffer à frente da reprodução. RTF de 1,2 significa que o áudio trava
esperando a síntese, e a experiência simplesmente não existe.

**Medir em aparelho físico.** O simulador usa a CPU do Mac, que é várias vezes
mais rápida que a do telefone. Um RTF medido no simulador não tem valor algum
para esta decisão.

---

## O que precisa provar

1. O TurboModule do sherpa-onnx compila dentro de um development build do Expo em iOS
2. O modelo Piper pt-BR carrega no aparelho sem estourar memória
3. A síntese produz áudio audível e correto em português
4. **RTF medido**, em pelo menos três tamanhos de bloco
5. Consumo de memória durante síntese contínua
6. Tempo até o primeiro áudio, contado a partir do acionamento
7. A síntese prossegue com o app em background e áudio ativo (FR-044, FR-076)

---

## Forma sugerida

Um app Expo com **uma tela e um botão**. Sem navegação, sem estado global, sem
biblioteca — nada além do necessário para medir. Ao tocar:

- sintetiza um parágrafo fixo em português
- cronometra a síntese
- lê a duração do WAV gerado
- imprime RTF, memória de pico e tempo até o primeiro áudio na tela

Repetir com blocos de tamanhos diferentes — uma frase curta, um parágrafo médio,
um parágrafo longo — porque o RTF costuma variar com o comprimento da entrada, e
é justamente o comportamento nos blocos longos que decide o tamanho do buffer.

Vale rodar também em mais de um modelo de iPhone, se houver. O aparelho mais
antigo disponível é o que define o piso aceitável.

---

## Materiais

- TurboModule: `react-native-sherpa-onnx`
- Modelo: `pt_BR-faber-medium` em `rhasspy/piper-voices` no HuggingFace, cerca de 63 MB, 22 kHz

Vale confirmar no início se o binding realmente compila em iOS. Ele é
comunitário e não oficial — diferente do pacote Flutter, mantido pelo próprio
k2-fsa — e essa é a razão de ele estar no spike.

---

## Decisão

| RTF medido | Consequência |
|---|---|
| ≤ 0,5 | Streaming sob demanda confirmado; seguir com o plano principal |
| 0,5 a 0,8 | Viável com buffer maior; revisar FR-039 |
| > 0,8 | Streaming inviável; migrar para pré-renderização ou trocar o motor |

Se o TurboModule não compilar em iOS, o recuo é o `AVSpeechSynthesizer` nativo:
roda offline, tem vozes em português, qualidade menor e controle menor sobre o
resultado — mas risco técnico praticamente nulo.
