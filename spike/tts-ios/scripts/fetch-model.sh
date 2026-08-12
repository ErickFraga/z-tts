#!/usr/bin/env bash
#
# Baixa o modelo Piper pt-BR e o espeak-ng-data exigido pelas vozes Piper.
#
# Rode a partir de spike/tts-ios/. Os arquivos ficam em assets/model/ e estão
# no .gitignore — cerca de 63 MB não pertencem ao repositório.

set -euo pipefail

VOICE="pt_BR-faber-medium"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium"
DEST="assets/model"

mkdir -p "$DEST"

echo "Baixando ${VOICE}…"
curl -fL --progress-bar -o "${DEST}/${VOICE}.onnx"      "${BASE}/${VOICE}.onnx"
curl -fL --progress-bar -o "${DEST}/${VOICE}.onnx.json" "${BASE}/${VOICE}.onnx.json"

# O tokens.txt nem sempre acompanha o modelo no repositório de vozes; quando
# faltar, ele pode ser extraído do onnx.json ou obtido no pacote equivalente
# distribuído pelo sherpa-onnx.
if ! curl -fL --progress-bar -o "${DEST}/tokens.txt" "${BASE}/tokens.txt" 2>/dev/null; then
  echo
  echo "AVISO: tokens.txt não encontrado no caminho esperado."
  echo "Obtenha o pacote equivalente em:"
  echo "  https://github.com/k2-fsa/sherpa-onnx/releases (vits-piper-pt_BR-faber-medium)"
  echo "Ele traz onnx, tokens.txt e espeak-ng-data já no formato que o sherpa-onnx espera."
fi

echo
echo "Arquivos em ${DEST}:"
ls -lh "$DEST"

echo
echo "Falta ainda o espeak-ng-data, exigido pelas vozes Piper."
echo "Ele vem dentro do pacote vits-piper-* nas releases do sherpa-onnx."
echo "Extraia-o para ${DEST}/espeak-ng-data e ajuste dataDir em src/tts.ts."
