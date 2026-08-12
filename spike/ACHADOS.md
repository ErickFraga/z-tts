# Achados do Spike

Registro dos resultados. Ver [`../docs/requisitos.md`](../docs/requisitos.md) §19
para os critérios de decisão definidos antes da execução.

---

## Frente A — Integração Z-Library

**Status: APROVADA** · 8 de 8 passos executáveis · medido em 2026-08-12, macOS

O critério da §19 exigia completar os itens 1 a 5. Todos passaram, e os itens 6
e 7 também. Apenas o item 8 fica pendente por exigir observação prolongada.

### Resultado

| Passo | Desfecho | Tempo |
|---|---|---|
| 0. Conectividade | HTTP 403 no HEAD, host alcançável | — |
| 1. Autenticação | sessão obtida pelo corpo da resposta | 373 ms |
| 2. Reuso do token | aceito em nova requisição | 348 ms |
| 3. Busca com filtros | 30 resultados, filtro respeitado, 500 no total | 669 ms |
| 4. Paginação | página 2 sem repetição | 597 ms |
| 5. Download de EPUB | arquivo íntegro, 620 KB | 2 526 ms |
| 6. Sessão expirada | detectável | 291 ms |
| 7. Cota diária | legível no perfil | 654 ms |
| 8. Estabilidade do domínio | não avaliado | — |

### Correções que o protocolo confirmou

As mudanças feitas a partir da leitura do cliente do KOReader estavam certas: a
busca em POST form-encoded, o download em duas etapas via `file.downloadLink`,
a exigência de `hash` junto do `id`, e o campo `format` no lugar de
`extension`. O passo 5 não teria funcionado com a modelagem anterior.

### Achado 1 — sessão expirada devolve HTTP 400, não 401

**Impacta FR-003 e FR-004.**

A ausência de sessão é detectável, porém pelo código 400. Isso é pior que 401
para o produto: 400 também significa "requisição malformada", então o app não
pode tratar todo 400 como expiração — sob risco de derrubar a sessão do usuário
por causa de um parâmetro errado em uma busca.

A detecção precisa combinar o status com o conteúdo da resposta. Vale um
experimento adicional para caracterizar como a origem distingue os dois casos.

### Achado 2 — cota de 10 downloads por dia

**Impacta FR-018 e o desenho do produto, não só o tratamento de erro.**

O perfil expõe a cota, o que viabiliza FR-018 como especificado. Mas o número
medido foi **1/10**: dez downloads por dia.

Isso é restrição de produto, não detalhe técnico. A biblioteca cresce no máximo
dez livros por dia, e o app precisa mostrar a cota antes de o usuário escolher,
e não depois da falha. Sugere exibir o saldo restante na própria tela de busca.

### Achado 3 — há Cloudflare na frente

O HEAD do pré-voo devolveu **403** enquanto as chamadas de API autenticadas
funcionaram normalmente. O host resolve para faixa da Cloudflare.

O 403 em requisição simples indica proteção contra bots ativa. Não atrapalhou
esta execução, mas é a origem mais provável de falhas intermitentes futuras, e
reforça o risco já registrado em EC-16. Um CAPTCHA aparecendo em produção é
cenário plausível, não hipotético.

### Pendente

O item 8 — estabilidade do domínio ao longo do tempo — continua sem resposta e
só pode ser respondido observando ao longo de dias. Dado o histórico de troca de
domínios da origem, é o risco residual mais relevante da Frente A.

---

## Frente B — Piper no iOS

**Status: não executada**

Depende de macOS com Xcode e iPhone físico. O código está escrito e nunca foi
compilado.

Com a Frente A aprovada, volta a ser **a única pergunta em aberto do projeto**.
O RTF determina se a arquitetura de streaming de FR-039 sobrevive.

---

## Estado da decisão

| Pergunta | Resposta |
|---|---|
| Dá para baixar da Z-Library? | **Sim** — 8 de 8 passos |
| O Piper roda rápido o bastante no iPhone? | **Em aberto** |

O plano alternativo de importação manual deixa de ser necessário. O escopo
original da especificação permanece de pé, com as correções acima.
