# Achados do Spike

Registro dos resultados. Ver [`../docs/requisitos.md`](../docs/requisitos.md) §19
para os critérios de decisão definidos antes da execução.

---

## Frente A — Integração Z-Library

**Status: BLOQUEADA** · medido em 2026-08-12, macOS, rede residencial no Brasil

### Resultado

| Estágio | Desfecho |
|---|---|
| Resolução DNS de `z-library.sk` | resolveu |
| Conexão TCP na porta 443 | aceita |
| Handshake TLS / HTTP | **ECONNRESET** |
| Autenticação | não alcançada |
| Busca, download, cota, sessão | não alcançados |

### Interpretação

A conexão TCP é estabelecida e derrubada em seguida, durante o handshake TLS.
O padrão descarta as hipóteses simples:

- servidor fora do ar produziria `ECONNREFUSED` ou falha de DNS
- domínio extinto não resolveria
- endpoint errado produziria HTTP 404, não reset

Reset após TCP aceito, no ponto exato em que o SNI é transmitido em texto
claro, é assinatura de **bloqueio ativo por inspeção de SNI** — tipicamente no
provedor de acesso. Não é possível confirmar a origem exata a partir do
cliente; um firewall local ou rejeição por região produziriam o mesmo sintoma.

### Consequência

Nenhum dos oito passos da Frente A pôde ser validado. Os endpoints em
`endpoints.ts` permanecem **hipóteses não verificadas** — o probe nunca chegou
a exercitá-los.

Contornar o bloqueio está fora do escopo do spike por decisão registrada antes
da execução (§19, "Fora do escopo do spike").

### Medição pendente

Esta medição testou **um único domínio**, e um domínio só não distingue
"bloqueio dirigido a `z-library.sk`" de "bloqueio à origem inteira". A diferença
importa: no primeiro caso outro endereço resolve, no segundo nenhum resolve.

O probe passou a percorrer uma lista de candidatos no passo 0 (ver
`zlibrary/src/domains.ts`). **Ainda não foi executado** com essa mudança — a
tabela acima continua valendo apenas para `z-library.sk`. A recomendação abaixo
não muda enquanto essa segunda execução não trouxer um domínio que responda.

### Recomendação

Acionar o plano alternativo já previsto: **o app deixa de baixar livros e passa
a recebê-los por importação manual**, permanecendo leitor e narrador. As seções
4.2 a 4.4 da especificação saem do escopo; o restante sobrevive intacto.

Essa versão do produto não depende de nenhuma fonte externa, o que elimina de
uma vez o maior risco técnico do projeto, a restrição de distribuição em loja e
toda a superfície de credenciais.

---

## Frente B — Piper no iOS

**Status: não executada**

Depende de macOS com Xcode e iPhone físico. O código está escrito e nunca foi
compilado.

Continua sendo **a frente decisiva**: o RTF determina se a arquitetura de
streaming de FR-039 sobrevive. O bloqueio da Frente A não a afeta — a narração
local é independente da origem dos livros e, com o novo escopo proposto, passa
a ser o núcleo do produto em vez de um complemento.

---

## Estado da decisão

| Pergunta | Respondida? |
|---|---|
| Dá para baixar da Z-Library? | Não por `z-library.sk`, a partir desta rede |
| Algum outro domínio da origem responde? | **Em aberto — descoberta implementada, não executada** |
| O Piper roda rápido o bastante no iPhone? | **Em aberto — próxima medição** |
