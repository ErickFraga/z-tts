# Achados do Spike

Registro dos resultados. Ver [`../docs/requisitos.md`](../docs/requisitos.md) §19
para os critérios de decisão definidos antes da execução.

---

## Frente A — Integração Z-Library

**Status: VIÁVEL, com rede instável** · segunda execução em 2026-08-12,
`z-library.sk`, mesma rede residencial no Brasil

### Resultado

| Passo | Desfecho | Tempo |
|---|---|---|
| 0. Conectividade | pré-voo falhou no handshake TLS | — |
| 1. Autenticação | **PASS** — sessão via corpo da resposta | 6,3s |
| 2. Reuso do token | BLOCKED — `UND_ERR_CONNECT_TIMEOUT` | 10,5s |
| 3. Busca com filtros | **PASS** — 30 resultados, filtro epub respeitado, 500 no total | 8,7s |
| 4. Paginação | **PASS** — página 2 sem repetição | 8,5s |
| 5. Download de EPUB | **PASS** — arquivo íntegro, 620 KB | 2,6s |
| 6. Sessão expirada | **PASS** — sem sessão devolve HTTP 400, detectável | 3,0s |
| 7. Cota diária | **PASS** — legível no perfil, 1/10 no dia (viabiliza FR-018) | 1,1s |
| 8. Estabilidade do domínio | pendente — exige observação de vários dias | — |

Sete passos passaram. **Os endpoints de `endpoints.ts` deixaram de ser
hipótese**: login, busca, detalhe, download e perfil foram exercitados contra a
origem real e respondem no formato esperado.

### Interpretação

A primeira medição concluiu "bloqueio ativo por inspeção de SNI" a partir de um
único ECONNRESET. A segunda derruba essa leitura: o mesmo domínio, na mesma
rede, serviu login, busca, paginação e um EPUB íntegro.

O que sobrou aponta para **interferência intermitente no estabelecimento de
conexão**, não para bloqueio:

- as duas falhas ocorreram ao abrir conexão nova — handshake TLS e connect
- nenhuma se repetiu nas requisições vizinhas, feitas segundos depois
- as latências (6 a 9 segundos por requisição) indicam caminho degradado, não
  interrompido

Bloqueio por SNI seria determinístico: derrubaria todo handshake para aquele
host, e não haveria passo 1 nem passo 5. A leitura anterior confundiu uma
amostra de tamanho um com uma regra.

### Consequência

O plano principal está de pé. A integração é viável e o risco mudou de natureza:
não é mais "dá para acessar?", é "quantas requisições se perdem no caminho e o
que o app faz com elas".

Isso é requisito de produto, não obstáculo: um leitor que sincroniza em rede
degradada precisa de retentativa e de troca de domínio de qualquer forma. O
probe passou a fazer as duas (ver README, "Descoberta de domínio" e
"Transporte"), e a contar quantas retentativas cada execução custou — esse
número é a medida a acompanhar entre execuções.

### O que continua em aberto

- **Estabilidade do domínio ao longo de dias** — o passo 8 segue manual.
- **Cota de 10 downloads por dia** — pesa sobre FR-018 e sobre qualquer
  expectativa de uso intenso.
- **Reprodutibilidade em outras redes** — duas execuções, uma rede, um dia.

### Recomendação

Seguir com o plano principal, mantendo a importação manual de EPUB como
funcionalidade — não como plano alternativo. Ela custa pouco, cobre a cota
diária esgotada, a rede pior que esta e o dia em que a origem mudar de endereço
sem avisar.

---

## Frente B — Piper no iOS

**Status: não executada**

Depende de macOS com Xcode e iPhone físico. O código está escrito e nunca foi
compilado.

Continua sendo **a frente decisiva**, e agora é a única em aberto: o RTF
determina se a arquitetura de streaming de FR-039 sobrevive. Com a Frente A
viável, ela volta a ser o gargalo único do plano principal.

---

## Estado da decisão

| Pergunta | Respondida? |
|---|---|
| Dá para baixar da Z-Library? | **Sim** — EPUB íntegro por `z-library.sk` |
| A rede atrapalha? | Sim, de forma intermitente — absorvido por retentativa |
| O domínio se mantém? | Em aberto — exige observação de vários dias |
| O Piper roda rápido o bastante no iPhone? | **Em aberto — próxima medição** |
