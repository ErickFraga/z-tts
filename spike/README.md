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

### Descoberta de domínio

O passo 0 não testa mais um domínio só. Monta a lista de candidatos nesta ordem
e adota o primeiro que responder:

1. `ZLIB_BASE_URL` — a escolha de quem rodou vem sempre primeiro
2. a **lista dinâmica**, buscada de um CDN e guardada por 10 minutos
3. as sementes de `zlibrary/src/domains.ts`

A lista dinâmica é a peça que faz isso durar. Domínio da Z-Library é alvo móvel,
e qualquer lista fixa envelhece — inclusive a que está no código. Buscá-la de um
CDN funciona justamente quando a origem inteira está inalcançável: o CDN não é
alvo do bloqueio, então dá para aprender os endereços novos sem conseguir falar
com nenhum deles ainda. São três espelhos, tentados em rodízio.

A sonda é `/eapi/info/ok`, da própria origem, e só conta como viva a resposta
2xx com JSON contendo `success=1`. Status HTTP sozinho não serve: domínio
estacionado e portal de autenticação de rede devolvem 200 com HTML, e ambos
passariam. Quem responde 404 nessa sonda ganha segunda chance no endpoint de
perfil — espelho antigo sem a sonda não deve ser descartado.

Redirecionamento para outro host é adotado como domínio novo: é a origem
dizendo para onde mudou.

Os candidatos são sondados **três de cada vez**, e a prioridade da lista vence
dentro do lote — dois respondendo, fica o que vier antes. Com
`ZLIB_RANK_DOMAINS=1` a varredura é completa e o escolhido é o de menor
latência, útil para mapear quais espelhos esta rede alcança.

Tudo isso vai para o `report.json` com o motivo de cada descarte.
`ZLIB_AUTO_DISCOVER=0` volta ao comportamento de domínio único.

Referência: o cliente do KOReader
([`zlibrary.koplugin`](https://github.com/ZlibraryKO/zlibrary.koplugin)), de
onde vêm as sementes, o endpoint de saúde, o formato da lista dinâmica e a
concorrência de três.

### Transporte

Toda requisição passa por uma camada com conexão persistente e retentativa. Ela
existe por causa da segunda execução, que mostrou interferência intermitente ao
**abrir conexão** — e não bloqueio (ver ACHADOS.md).

- **Conexão persistente por 60s.** É o que mais pesa: menos handshakes por
  execução significa menos exposição ao ponto onde as conexões morriam.
- **Retentativa com espera crescente e ruído**, só para erros de conexão e para
  429/502/503/504 — casos em que a requisição comprovadamente não foi
  processada. `ENOTFOUND` e `ECONNREFUSED` não são repetidos: são respostas
  determinísticas, e insistir só atrasa a queda para o próximo domínio.
- **Contagem por causa**, no resumo e no `report.json`. Comparar execuções diz
  se a interferência está afrouxando ou endurecendo — que é a informação de
  decisão, não o sintoma isolado.

`ZLIB_RETRIES` ajusta as tentativas; `ZLIB_PROXY` roteia tudo por um proxy de
quem roda. O spike não escolhe nem embute rota alternativa.

### O que o probe faz

Executa os oito passos da Frente A em sequência, registrando `PASS`, `FAIL` ou
`BLOCKED` para cada um, com o tempo gasto. Ao final imprime um resumo e grava
`report.json`.

`BLOCKED` é um resultado legítimo e distinto de `FAIL`: significa que o acesso
esbarrou em CAPTCHA, limite de requisições ou domínio fora do ar. O spike
**reporta** essas barreiras, não tenta contorná-las.

### Limites de escopo

Não faz parte deste spike contornar CAPTCHA ou driblar limites de requisição.

Descoberta de domínio e retentativa ficam **dentro** do escopo: são a resposta
correta ao que foi medido — endereço móvel e conexão instável — e nenhuma das
duas esconde, forja ou disfarça tráfego. Se o bloqueio endurecer para
determinístico, a retentativa falha rápido e o relatório mostra isso, que é a
informação certa para decidir.

Rota alternativa — VPN, DNS criptografado, proxy remoto — continua fora. A
variável `ZLIB_PROXY` existe para quem já tem a sua e quer usá-la; o spike não
provê nem recomenda nenhuma.

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
