# Spike Técnico — z-tts

Código **descartável** de validação. Nada aqui vai para o app. O produto deste
diretório é um relatório com números medidos e uma recomendação.

Contexto e critérios de decisão: [`../docs/requisitos.md`](../docs/requisitos.md), seção 19.

---

## O que este spike responde

| Frente | Pergunta | Onde |
|---|---|---|
| **A** | Dá para autenticar, buscar e baixar da Z-Library a partir de código próprio em TypeScript? | `zlibrary/` |
| **B** | O Piper roda em iPhone rápido o bastante para narrar em tempo real? | `tts-ios/` |

A Frente B é a mais decisiva das duas: se o **RTF** — razão entre tempo de
síntese e duração do áudio gerado — não ficar bem abaixo de 1, o streaming sob
demanda especificado em FR-039 não se sustenta e a arquitetura muda.

---

## Frente A — Integração Z-Library

### Aviso sobre os endpoints

A Z-Library não tem API pública documentada. Os endpoints em
`zlibrary/src/endpoints.ts` são **hipóteses não verificadas**, derivadas do
comportamento conhecido de clientes não oficiais. Confirmá-los ou corrigi-los é
a primeira tarefa do spike, não uma premissa dele.

Se um passo falhar com 404 ou HTML inesperado, o endpoint provavelmente está
errado — ajuste `endpoints.ts` e rode de novo. É exatamente esse ciclo que o
spike existe para percorrer.

### Como rodar

```bash
cd spike/zlibrary
npm install
cp .env.example .env    # preencha com credenciais reais
npm run probe
```

As credenciais são lidas de variáveis de ambiente e **nunca** são versionadas
nem impressas no relatório. O `.gitignore` cobre `.env` e os arquivos baixados.

### O que o probe faz

Executa os oito passos da Frente A em sequência, registrando `PASS`, `FAIL` ou
`BLOCKED` para cada um, com o tempo gasto. Ao final imprime um resumo e grava
`report.json`.

`BLOCKED` é um resultado legítimo e distinto de `FAIL`: significa que o acesso
esbarrou em CAPTCHA, limite de requisições ou domínio fora do ar. O spike
**reporta** essas barreiras, não tenta contorná-las.

### Limites de escopo

Não faz parte deste spike contornar CAPTCHA, rotacionar domínios
automaticamente ou driblar limites de requisição.

---

## Frente B — sherpa-onnx com Piper no iOS

**Requer macOS com Xcode e um iPhone físico.** RTF medido em simulador não vale
nada, porque o simulador roda na CPU do Mac e não na do telefone — o número
sairia otimista por uma margem enorme.

Ainda não implementada. Ver `tts-ios/README.md` para o que precisa medir.

---

## Critérios de decisão

| Resultado | Decisão |
|---|---|
| RTF ≤ 0,5 | Streaming sob demanda confirmado; seguir com o plano principal |
| RTF entre 0,5 e 0,8 | Viável com buffer maior; revisar FR-039 |
| RTF > 0,8 | Streaming inviável; migrar para pré-renderização ou trocar o motor |
| Frente A falha | App vira leitor com narração e importação manual de EPUB |
| Frente B falha | Recuar para o sintetizador nativo do iOS, com qualidade menor |
