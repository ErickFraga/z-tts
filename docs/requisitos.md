# Especificação de Requisitos — z-tts

> Status: **aguardando aprovação**. Nenhuma implementação deve começar antes da validação deste documento.
> Todas as questões abertas foram respondidas; o próximo passo é o spike técnico descrito na §19.
> Última atualização: 2026-08-02

---

## Feature

Aplicativo móvel de biblioteca pessoal que baixa livros da Z-Library, permite lê-los em EPUB e ouvi-los por meio de um modelo de síntese de voz executado inteiramente no dispositivo.

---

## 1. Objetivo

Unificar em um único app três atividades hoje fragmentadas: obter o livro, ler o livro e ouvir o livro. O diferencial é a narração por TTS **local**, sem custo por uso, sem dependência de rede e sem que o conteúdo do livro trafegue para serviços de terceiros.

Problemas resolvidos:

- Fluxo manual de baixar no navegador e transferir para um app leitor.
- Ausência de narração de qualidade para EPUBs pessoais sem recorrer a TTS de nuvem pago.
- Perda de contexto ao alternar entre ler e ouvir o mesmo livro.

---

## 2. Comportamento Atual

O repositório `ErickFraga/z-tts` foi criado em 2026-08-02 e está **vazio**: zero commits, nenhuma branch remota, sem README, sem issues, sem código. Não existe arquitetura, convenção, modelo de dados ou dependência prévia a respeitar.

Consequência: este é um projeto **greenfield**. Todas as decisões abaixo são fundacionais, e não há sistema existente a ser impactado.

O comportamento atual do usuário, fora do app, é: buscar o livro em um navegador, autenticar-se manualmente, baixar o arquivo, transferi-lo para um leitor de EPUB e, para ouvir, não ter alternativa local satisfatória.

---

## 3. Comportamento Desejado

Ao abrir o app, o usuário vê imediatamente sua biblioteca de livros baixados — não há tela de login barrando a entrada. O aprendizado é **contextual**: cada fluxo traz sua própria orientação na primeira vez que é usado — a biblioteca ensina a baixar, o leitor ensina a navegar no livro, e assim por diante — e cada uma pode ser pulada isoladamente. A partir da biblioteca, "Baixar livros" conduz à busca, solicitando as credenciais Z-Library por meio de um bottom sheet apenas na primeira vez em que forem necessárias.

Com o livro baixado, o usuário escolhe entre ler ou ouvir. A narração é gerada sob demanda no aparelho, continua com a tela desligada, e compartilha a mesma posição de progresso com a leitura.

O princípio por trás do fluxo: **autenticação sob demanda**. O usuário só é confrontado com credenciais no momento em que elas são de fato necessárias, e nunca para consumir conteúdo que já possui.

---

## 4. Requisitos Funcionais

> Os identificadores `FR-xxx` são estáveis e não indicam ordem de leitura. Requisitos acrescentados depois recebem o próximo número livre, preservando as referências já existentes no documento.

### 4.1 Abertura, onboarding contextual e acesso ao download

- **FR-053** — Ao abrir o app, a tela inicial deve ser a biblioteca de livros baixados. Não existe tela de login bloqueando o acesso ao app.
- **FR-054** — O onboarding é **contextual e independente por fluxo**: cada fluxo relevante possui sua própria orientação, exibida na primeira vez que o usuário entra naquele fluxo. Não existe sequência única de boas-vindas na abertura do app.
- **FR-055** — Cada orientação deve ser exibida no máximo uma vez, com estado de "visto" próprio, persistido localmente e independente das demais.
- **FR-073** — Cada orientação é composta por **vários passos** sequenciais, com navegação para avançar, indicação de progresso entre os passos e "pular" disponível em qualquer passo.
- **FR-074** — As orientações usam o formato **coach mark**: sobreposição escurecida sobre a tela real, com recorte destacando o elemento que está sendo explicado e um balão descritivo ancorado a ele.
- **FR-075** — Um passo cujo elemento-alvo não esteja visível ou renderizado deve ser omitido, sem interromper a sequência nem exibir recorte vazio.
- **FR-056** — Toda orientação deve poder ser pulada. Pular marca **apenas aquela** orientação como vista, sem afetar as demais.
- **FR-064** — Os pontos de onboarding cobertos nesta versão são: **biblioteca** (como baixar livros), **leitor** (como navegar no livro), **player** (controles de narração) e **vozes** (o que são e como escolher).
- **FR-065** — A orientação da biblioteca deve ser exibida sobre a própria biblioteca, sem impedir o acesso a ela nem atrasar sua renderização.
- **FR-066** — Uma orientação cujo fluxo foi abandonado sem que ela fosse concluída ou pulada deve reaparecer na próxima entrada naquele fluxo.
- **FR-067** — Nunca deve haver duas orientações visíveis simultaneamente. Se um fluxo aninhado for aberto com orientação pendente, a orientação do fluxo anterior é encerrada antes.
- **FR-068** — A orientação de vozes deve advertir que a voz precisa corresponder ao idioma do livro, já que o app não valida essa correspondência (BR-006).
- **FR-069** — Os Ajustes devem oferecer a ação de reexibir as orientações, que zera de uma só vez o estado de "visto" de todas elas.
- **FR-057** — A biblioteca deve oferecer a ação "Baixar livros" em dois pontos: em **destaque visual quando a biblioteca está vazia**, e como **ícone permanente no cabeçalho**, disponível também com a biblioteca preenchida. Ambos levam ao mesmo comportamento.
- **FR-058** — Ao acionar "Baixar livros", se não houver credenciais Z-Library armazenadas, o app deve exibir um bottom sheet solicitando e-mail e senha.
- **FR-059** — Autenticação bem-sucedida no bottom sheet deve persistir as credenciais, fechar o bottom sheet e conduzir o usuário diretamente à tela de busca, dando continuidade à intenção original de baixar um livro.
- **FR-060** — Ao acionar "Baixar livros", se já houver credenciais armazenadas, o app deve navegar diretamente para a tela de busca, sem solicitar autenticação.
- **FR-061** — Falha de autenticação no bottom sheet deve mantê-lo aberto, exibindo a causa do erro e preservando o e-mail já digitado.
- **FR-062** — O bottom sheet deve poder ser fechado sem autenticar, retornando o usuário à biblioteca sem qualquer alteração de estado.
- **FR-063** — Enquanto a autenticação estiver em curso no bottom sheet, os campos e a ação de confirmar devem ficar desabilitados, com indicador de carregamento visível, impedindo submissões duplicadas.

### 4.2 Autenticação e sessão

- **FR-001** — A autenticação é solicitada **sob demanda**, no momento em que o usuário aciona "Baixar livros" sem credenciais armazenadas, por meio do bottom sheet descrito em FR-058. O app não possui tela de login dedicada.
- **FR-002** — Após login bem-sucedido, o app deve persistir e-mail, senha e token de sessão no armazenamento seguro do sistema operacional (Android Keystore / iOS Keychain).
- **FR-003** — Quando uma requisição à Z-Library falhar por sessão inválida ou expirada, o app deve renovar a sessão automaticamente usando as credenciais persistidas, **uma única vez**, e repetir a requisição original de forma transparente ao usuário.
- **FR-004** — Se a renovação automática falhar, o app deve descartar o token e reabrir o bottom sheet de credenciais sobre a tela atual, com o e-mail preenchido e mensagem indicando que a sessão expirou. A biblioteca local e a leitura/narração de conteúdo já baixado permanecem acessíveis.
- **FR-005** — Os Ajustes devem oferecer a ação **"Limpar minhas credenciais Z-Library"**, apresentada como ação destrutiva em vermelho. A ação exige confirmação e remove e-mail, senha e token do armazenamento seguro. Livros baixados, progressos, vozes e preferências permanecem intactos. Depois disso, acionar "Baixar livros" volta a exibir o bottom sheet de credenciais.
- **FR-006** — Credenciais e token nunca podem ser gravados em logs, telemetria, relatórios de erro ou mensagens exibidas na interface.

### 4.3 Busca

- **FR-007** — O app deve oferecer busca por texto livre, aplicada a título e autor.
- **FR-008** — A busca deve oferecer filtros de idioma, formato e ano de publicação. O filtro de formato inicia fixado em EPUB e o de idioma inicia pré-ajustado em português, coerente com o catálogo de vozes (FR-077), evitando que o usuário baixe livros que não conseguirá ouvir. Ambos permanecem alteráveis pelo usuário.
- **FR-009** — Cada resultado deve exibir capa (quando disponível), título, autor, idioma, formato, tamanho do arquivo e ano.
- **FR-010** — Os resultados devem ser paginados, carregando a página seguinte quando o usuário atinge o fim da lista.
- **FR-011** — Resultados em formato diferente de EPUB não devem ser oferecidos para download.
- **FR-012** — Uma busca sem resultados deve exibir estado vazio explicativo, distinto do estado de erro de rede.

### 4.4 Download

- **FR-013** — O usuário deve poder iniciar o download a partir de um resultado de busca, com progresso percentual visível.
- **FR-014** — O download deve continuar enquanto o usuário navega para outras telas do app.
- **FR-015** — Ao concluir, o arquivo deve ser salvo no armazenamento privado do app e registrado na biblioteca local.
- **FR-016** — Em caso de falha de rede, o item deve permanecer em estado "falhou" com ação de tentar novamente. Arquivos parciais devem ser descartados e nunca registrados na biblioteca.
- **FR-017** — Solicitar o download de um livro já presente na biblioteca não deve criar duplicata; o app deve abrir o livro existente.
- **FR-018** — Quando a origem indicar que a cota diária de downloads da conta foi esgotada, o app deve comunicar isso explicitamente em vez de exibir erro genérico.

### 4.5 Biblioteca local

- **FR-019** — A tela inicial deve listar os livros baixados com capa, título, autor e indicador de progresso.
- **FR-020** — Com a biblioteca vazia, deve ser exibido estado vazio orientando o usuário a realizar a primeira busca.
- **FR-021** — O usuário deve poder remover um livro, mediante confirmação. A remoção apaga o arquivo EPUB, a capa em cache e os arquivos temporários de áudio. **O progresso de leitura e a voz preferida são preservados localmente.**
- **FR-070** — Ao baixar novamente um livro previamente removido, o app deve restaurar o progresso e a voz preferida registrados anteriormente para aquele livro.
- **FR-071** — A identidade de um livro, para efeito de FR-070, é dada pelo identificador da obra na Z-Library. Dois arquivos distintos da mesma obra são tratados como o mesmo livro; a mesma obra obtida por registros diferentes na origem não é reconciliada nesta versão.
- **FR-072** — Os Ajustes devem informar quantos progressos órfãos estão armazenados e permitir descartá-los, mediante confirmação.
- **FR-022** — Cada livro da biblioteca deve oferecer as ações "Ler" e "Ouvir".

### 4.6 Leitor

- **FR-023** — O app deve renderizar o EPUB em modo paginado.
- **FR-024** — O sumário declarado no EPUB deve ser navegável, permitindo saltar para qualquer capítulo.
- **FR-025** — O usuário deve poder ajustar o tamanho da fonte; a preferência é persistida globalmente.
- **FR-026** — O app deve oferecer tema claro e escuro para a leitura; a preferência é persistida globalmente.
- **FR-027** — A posição de leitura deve ser persistida continuamente durante a leitura.
- **FR-028** — Abrir um livro deve retomar a leitura na última posição registrada, independentemente de ela ter sido produzida por leitura ou por escuta.

### 4.7 Gerenciamento de vozes

- **FR-029** — O app deve oferecer uma tela de gerenciamento de vozes, listando as vozes Piper disponíveis com nome, idioma, tamanho aproximado e estado (não baixada, baixando, pronta).
- **FR-077** — O catálogo inicial contém **apenas vozes em português do Brasil**. Na prática, livros em outros idiomas não têm narração utilizável nesta versão. O catálogo é dado de configuração, não código, de modo que acrescentar idiomas depois não exija nova build.
- **FR-030** — O usuário deve poder baixar uma voz sob demanda, com progresso visível. A integridade do arquivo baixado deve ser verificada antes de marcá-lo como pronto.
- **FR-031** — O usuário deve poder remover uma voz baixada para liberar espaço. Uma voz em uso por uma narração ativa não pode ser removida.
- **FR-032** — Um download de voz interrompido deve poder ser retomado ou reiniciado. Um arquivo incompleto nunca deve ser considerado pronto para uso.
- **FR-033** — Se o usuário acionar "Ouvir" sem nenhuma voz baixada, o app deve conduzi-lo à tela de gerenciamento de vozes, explicando o motivo.

### 4.8 Seleção de voz

- **FR-034** — A voz utilizada na narração é escolhida **manualmente pelo usuário**, por livro. O app não realiza detecção automática de idioma.
- **FR-035** — A escolha de voz deve ser persistida por livro e reutilizada nas sessões seguintes daquele livro.
- **FR-036** — Ao acionar a narração pela primeira vez em um livro, o app deve exibir o seletor de voz apresentando também o idioma declarado nos metadados do EPUB (`dc:language`), como auxílio à escolha do usuário.
- **FR-037** — O usuário deve poder trocar a voz de um livro a qualquer momento. A troca interrompe a narração em curso, descarta o buffer e ressintetiza a partir da posição atual.

### 4.9 Narração

- **FR-038** — O app deve extrair o texto do EPUB por capítulo, segmentado em blocos (parágrafo ou grupo de frases), descartando marcação, notas de rodapé, legendas de imagem e elementos não textuais.
- **FR-039** — A síntese deve ocorrer bloco a bloco por meio do Piper via sherpa-onnx, mantendo um buffer de no mínimo 2 blocos sintetizados à frente da reprodução.
- **FR-040** — Os blocos devem ser reproduzidos em sequência contínua, sem silêncio perceptível na emenda entre eles.
- **FR-041** — O áudio sintetizado deve ser gravado como arquivo temporário. Blocos já reproduzidos e fora da janela de buffer devem ser apagados automaticamente.
- **FR-042** — O player deve oferecer: play/pause, avançar bloco, voltar bloco, capítulo anterior, próximo capítulo e ajuste de velocidade de reprodução.
- **FR-043** — A velocidade de reprodução deve ser persistida globalmente e aplicada aos livros seguintes.
- **FR-044** — A reprodução deve continuar com o app em segundo plano ou com a tela desligada. No iOS, por meio do modo de background de áudio e de sessão de áudio ativa; no Android, por meio de foreground service.
- **FR-076** — A síntese dos próximos blocos deve ocorrer enquanto a sessão de áudio estiver ativa. No iOS, o app é suspenso pouco depois de o áudio cessar, portanto pausar a narração encerra a síntese antecipada; retomar reinicia a partir do último bloco registrado.
- **FR-045** — Deve haver notificação de mídia exibindo título do livro, capítulo atual e controles de play/pause e avançar/voltar.
- **FR-046** — Ao saltar de capítulo, o buffer pendente deve ser descartado e a síntese reiniciada a partir do novo ponto.
- **FR-047** — Perda de foco de áudio (chamada telefônica, outro app tocando) deve pausar a narração. A retomada automática ocorre apenas quando a perda de foco foi transitória.
- **FR-048** — A narração de um livro já baixado, com voz já baixada, deve funcionar sem qualquer acesso à rede.

### 4.10 Progresso

- **FR-049** — Cada livro possui uma **posição única** de progresso, compartilhada entre leitura e escuta, com granularidade de bloco.
- **FR-050** — Ao iniciar a narração, a reprodução começa no início do bloco correspondente à posição atual registrada.
- **FR-051** — Ao abrir o leitor após uma sessão de escuta, o texto deve ser posicionado no bloco que estava sendo narrado.
- **FR-052** — O progresso deve ser persistido localmente e sobreviver ao fechamento e reinício do app.

---

## 5. Regras de Negócio

- **BR-001** — Busca e download exigem conta Z-Library autenticada; leitura, narração e gestão da biblioteca local **não** exigem. A autenticação é solicitada apenas no momento em que é necessária.
- **BR-009** — Cada orientação de onboarding é exibida no máximo uma vez por instalação, com estado independente das demais, e todas podem ser reexibidas coletivamente pela ação correspondente nos Ajustes.
- **BR-002** — Somente livros em formato EPUB são suportados, em toda a cadeia (busca, download, leitura, narração).
- **BR-003** — Toda a síntese de voz ocorre no dispositivo. Nenhum trecho de texto de livro é enviado para serviços externos.
- **BR-004** — Um livro possui exatamente uma posição de progresso, independentemente do modo de consumo.
- **BR-005** — Uma voz só pode ser usada para narração se estiver baixada integralmente e verificada.
- **BR-006** — O app **não valida** a compatibilidade entre o idioma do livro e a voz selecionada. A escolha correta é responsabilidade do usuário — consequência direta da decisão de seleção manual de voz (ver Questões Abertas, Q-002).
- **BR-007** — As credenciais persistem até que o usuário execute logout explícito.
- **BR-008** — Livros baixados permanecem plenamente utilizáveis offline, inclusive para narração.

---

## 6. Fluxos de Usuário

### Fluxo A — Primeiro acesso

1. Usuário abre o app pela primeira vez.
2. App exibe a biblioteca vazia, com estado vazio orientativo e "Baixar livros" em destaque.
3. Sobre a biblioteca, aparece a orientação contextual ensinando a baixar livros.
4. Usuário percorre a orientação até o fim, ou a pula.
5. App marca **apenas** a orientação da biblioteca como vista. As demais permanecem pendentes.

### Fluxo B — Abertura nas vezes seguintes

1. Usuário abre o app.
2. App exibe diretamente a biblioteca com os livros já baixados, sem login e sem a orientação já vista. O ícone de "Baixar livros" segue no cabeçalho.

### Fluxo B2 — Primeira leitura de um livro

1. Usuário abre um livro pela primeira vez, tendo já visto a orientação da biblioteca.
2. O leitor exibe sua própria orientação, ensinando a navegar no livro.
3. Usuário conclui ou pula; apenas a orientação do leitor é marcada como vista.
4. Nas próximas aberturas de qualquer livro, o leitor não exibe mais orientação.

### Fluxo C — Primeiro download (sem credenciais)

1. Usuário aciona "Baixar livros" na biblioteca.
2. App verifica que não há credenciais Z-Library armazenadas.
3. App exibe o bottom sheet solicitando e-mail e senha.
4. Usuário preenche e confirma; campos ficam desabilitados durante a autenticação.
5. Autenticação bem-sucedida: app persiste credenciais e token no armazenamento seguro.
6. Bottom sheet fecha e o app navega para a tela de busca, dando continuidade à intenção original.

### Fluxo D — Download nas vezes seguintes (com credenciais)

1. Usuário aciona "Baixar livros".
2. App identifica credenciais armazenadas e navega direto para a busca, sem pedir autenticação.

### Fluxo E — Buscar e baixar

1. Usuário digita título ou autor na busca.
2. Opcionalmente aplica filtros de idioma e ano.
3. App consulta a Z-Library e apresenta resultados paginados.
4. Usuário seleciona um resultado e aciona o download.
5. App baixa com progresso visível e registra o livro na biblioteca ao concluir.

### Fluxo F — Sessão expirada durante a busca

1. Usuário está na busca e dispara uma consulta.
2. A requisição falha por sessão inválida.
3. App tenta renovar a sessão automaticamente com as credenciais armazenadas (FR-003).
4. Renovação bem-sucedida: a consulta é repetida e o usuário não percebe nada.
5. Renovação malsucedida: o bottom sheet de credenciais reabre sobre a busca, com o e-mail preenchido e aviso de sessão expirada.

### Fluxo C — Ouvir um livro

1. Usuário aciona "Ouvir" sobre um livro da biblioteca.
2. Se não houver voz baixada, o app conduz à tela de vozes (FR-033).
3. Se for a primeira narração deste livro, o app exibe o seletor de voz com o idioma do EPUB indicado.
4. App extrai e segmenta o texto a partir da posição de progresso atual.
5. App sintetiza os primeiros blocos e inicia a reprodução, mantendo o buffer à frente.
6. Usuário bloqueia a tela; a narração continua, com controles na notificação.

### Fluxo D — Alternar entre ler e ouvir

1. Usuário lê até determinado ponto do capítulo 4; a posição é persistida.
2. Usuário sai do leitor e aciona "Ouvir".
3. A narração inicia no começo do bloco onde a leitura parou.
4. Usuário ouve até o meio do capítulo 7 e pausa.
5. Usuário abre o leitor; o texto é exibido no bloco que estava sendo narrado.

---

## 7. Edge Cases

| # | Situação | Comportamento esperado |
|---|---|---|
| EC-01 | EPUB corrompido ou não abrível | Erro claro na biblioteca, com opção de remover ou rebaixar o arquivo |
| EC-02 | EPUB protegido por DRM | Detectar na abertura, informar que o arquivo não pode ser aberto e oferecer remoção |
| EC-03 | EPUB sem metadados de idioma | Seletor de voz exibe "idioma não informado"; escolha segue manual |
| EC-04 | EPUB com capítulos vazios ou só imagens | Narração pula o capítulo sem travar, sinalizando ausência de texto |
| EC-05 | Livro muito extenso | Segmentação e síntese são preguiçosas (lazy) por capítulo; o app não pré-processa o livro inteiro |
| EC-06 | Espaço em disco insuficiente ao baixar livro ou voz | Abortar antes de iniciar, informando o espaço necessário |
| EC-07 | Rede cai durante o download do livro | Estado "falhou" com ação de tentar novamente; parcial descartado |
| EC-08 | Rede cai durante o download da voz | Voz permanece "não baixada"; arquivo incompleto removido |
| EC-09 | App encerrado pelo sistema durante a narração | Progresso preservado até o último bloco concluído; temporários limpos na próxima abertura |
| EC-10 | Usuário salta de capítulo repetidamente | Buffers anteriores descartados; apenas a síntese mais recente permanece ativa |
| EC-11 | Chamada telefônica durante a narração | Pausa automática; retomada ao fim da chamada |
| EC-12 | Bateria em modo de economia extrema | Narração pode ser suspensa pelo sistema; ao retomar, continuar do último bloco registrado |
| EC-13 | Voz removida enquanto era a voz preferida do livro | Ao narrar, o app pede nova seleção de voz |
| EC-14 | Sessão Z-Library expirada durante uma busca | Renovação transparente (FR-003); se falhar, bottom sheet de credenciais sobre a tela atual |
| EC-19 | App fechado no meio de uma orientação | Aquela orientação não é marcada como vista e reaparece na próxima entrada no fluxo; as demais não são afetadas |
| EC-20 | App reinstalado | Estado local é perdido: todas as orientações reaparecem e as credenciais precisam ser informadas de novo |
| EC-24 | Livro aberto direto no player, sem passar pelo leitor | A orientação do player é exibida; a do leitor permanece pendente para quando o leitor for aberto |
| EC-25 | Usuário reexibe as orientações nos Ajustes | Todos os estados voltam a `false`; a orientação da biblioteca reaparece já na volta aos Ajustes |
| EC-26 | Orientação pendente em fluxo aberto sobre outro fluxo com orientação ativa | A orientação anterior é encerrada antes de exibir a nova (FR-067); nenhuma se perde permanentemente |
| EC-27 | Biblioteca vazia após remover todos os livros | Estado vazio e destaque de "Baixar livros" voltam a ser exibidos; nenhuma orientação é reexibida |
| EC-28 | Livro removido e baixado novamente | Progresso e voz preferida são restaurados (FR-070) |
| EC-29 | Muitos progressos órfãos acumulados | Ajustes informam a quantidade e permitem descartá-los (FR-072) |
| EC-30 | Livro em idioma sem voz disponível no catálogo | Narração indisponível; o app explica que não há voz para aquele idioma, em vez de narrar com voz incompatível |
| EC-31 | Passo de coach mark cujo elemento não está em tela | Passo omitido, sequência continua sem recorte vazio (FR-075) |
| EC-32 | Rotação de tela ou mudança de tamanho durante um coach mark | Recorte e balão se reposicionam sobre o elemento correto |
| EC-33 | Certificado de assinatura expirado no iOS | O app deixa de abrir até ser reassinado — limitação de plataforma, não tratável em código. Com conta paga, ocorre cerca de uma vez por ano |
| EC-34 | Narração pausada por longo período no iOS | App é suspenso pelo sistema; retomar reinicia a síntese a partir do último bloco registrado (FR-076) |
| EC-21 | "Baixar livros" acionado sem conexão de rede | Bottom sheet informa a falha sem descartar o que foi digitado; se já houver credenciais, a busca abre e sinaliza o erro de rede |
| EC-22 | Toques repetidos em "Baixar livros" | Apenas um bottom sheet é aberto; nenhuma navegação duplicada para a busca |
| EC-23 | Credenciais armazenadas porém já inválidas | "Baixar livros" abre a busca normalmente; a falha só aparece na primeira consulta, tratada por FR-003 e FR-004 |
| EC-15 | Cota diária de downloads esgotada | Mensagem específica, sem consumir tentativa de retry |
| EC-16 | Domínio ou endpoint da Z-Library indisponível | Erro de conectividade distinto de erro de credencial; biblioteca local permanece utilizável |
| EC-17 | Mesmo livro baixado duas vezes | Deduplicação; abre o existente (FR-017) |
| EC-18 | Bloco de texto excepcionalmente longo | Subdividir antes de sintetizar, para não estourar latência nem memória |

---

## 8. Tratamento de Erros

- **Erros de rede** — mensagem distinta de erros de autenticação; sempre com ação de repetir. A biblioteca local e a narração de conteúdo já baixado permanecem funcionais.
- **Erros de autenticação** — uma tentativa silenciosa de renovação; falhando, retorno à tela de login sem perder dados locais.
- **Erros de download** — item marcado como falho, arquivo parcial removido, retry disponível.
- **Erros de parsing do EPUB** — livro marcado como não abrível, com opção de remoção; não derruba a biblioteca.
- **Erros de síntese** — pausar a narração, informar o bloco problemático e oferecer pular o bloco. Uma falha isolada não deve encerrar a sessão de escuta.
- **Erros de modelo de voz** — arquivo corrompido detectado na verificação de integridade leva a marcar a voz como não baixada e sugerir novo download.
- **Princípio geral** — nenhuma mensagem de erro pode conter credenciais, token ou trechos de conteúdo do livro.

---

## 9. Requisitos de Dados

Persistência local, sem backend próprio.

**Book**
`id` (identificador da obra na Z-Library), `titulo`, `autor`, `idioma`, `ano`, `caminhoArquivo`, `caminhoCapa`, `tamanhoBytes`, `baixadoEm`, `estado` (baixando / pronto / falhou / inválido)

**BookProgress** — entidade **independente do Book**, com ciclo de vida próprio
`bookId`, `posicao` (capítulo + índice do bloco), `vozPreferidaId`, `atualizadoEm`

Separada de `Book` porque sobrevive à remoção do livro (FR-021 e FR-070). Um `BookProgress` sem `Book` correspondente é um progresso órfão, legítimo e conservado até que o usuário o descarte (FR-072).

**Voice**
`id`, `nome`, `idioma`, `urlModelo`, `caminhoLocal`, `tamanhoBytes`, `checksum`, `estado` (não baixada / baixando / pronta)

**Settings**
`tamanhoFonte`, `tema`, `velocidadeReproducao`

**OnboardingState**
Um booleano por ponto de orientação — `biblioteca`, `leitor`, `player`, `vozes` — cada um iniciando em `false` e tornando-se `true` ao concluir **ou** pular aquela orientação. A ação de reexibir dos Ajustes redefine todos para `false`. Modelado como conjunto de chaves, e não como campo único, para que novos pontos de orientação possam ser acrescentados sem migração destrutiva.

**SecureCredentials** (armazenamento seguro do SO, fora do banco local)
`email`, `senha`, `tokenSessao`

Validações: e-mail em formato válido no login; nome de arquivo e caminho sempre internos ao sandbox do app; velocidade de reprodução dentro de faixa definida; posição de progresso sempre referente a um bloco existente no livro.

---

## 10. Integrações Externas

O app **não expõe** API própria. Consome:

- **Z-Library** — autenticação, busca e download. Não há API pública documentada; a integração se apoia em endpoints não oficiais, sujeitos a alteração sem aviso e a troca de domínio. **Risco técnico principal do projeto**; exige spike de validação antes de qualquer estimativa de prazo.
- **Repositório de modelos Piper** (HuggingFace `rhasspy/piper-voices`) — download dos arquivos de voz. Acesso somente leitura, sem autenticação.

---

## 11. Requisitos de UI/UX

Telas: Biblioteca (inicial), Busca (com filtros), Detalhe do livro, Leitor, Player, Gerenciamento de vozes, Ajustes. Não há tela de login nem tela de onboarding — as credenciais são coletadas em um **bottom sheet**, e as orientações são camadas contextuais sobre as próprias telas.

Estados obrigatórios em cada tela de listagem: carregando, vazio, erro e conteúdo — visualmente distintos entre si.

- Cada orientação contextual oferece "pular" visível desde o primeiro passo e, quando tiver múltiplas etapas, indica o progresso entre elas.
- A orientação nunca bloqueia a renderização da tela que a hospeda: a tela aparece primeiro, a orientação por cima.
- "Baixar livros" aparece em destaque no estado vazio da biblioteca e como ícone permanente no cabeçalho.
- Nos Ajustes, "Limpar minhas credenciais Z-Library" é apresentada em vermelho, separada das demais opções, e exige confirmação.
- O bottom sheet de credenciais exibe estado de carregamento durante a autenticação, mensagem de erro no próprio sheet, e é dispensável por gesto ou toque fora.
- Progresso de download visível e sempre cancelável.
- Feedback de conclusão ao adicionar livro à biblioteca.
- O seletor de voz exibe o idioma do EPUB junto às opções (FR-036).
- O player expõe capítulo atual e permite retorno ao leitor na mesma posição.
- Notificação de mídia com controles funcionais fora do app.

---

## 12. Segurança e Permissões

- Não há multiusuário nem autorização por papéis: o app é monousuário e local.
- Credenciais e token residem exclusivamente no armazenamento seguro do sistema operacional.
- **Risco aceito conscientemente pelo usuário:** o app persiste a **senha**, além do token, para evitar re-login. Isso significa que o comprometimento físico ou lógico do dispositivo expõe uma credencial reutilizável, potencialmente compartilhada com outros serviços. A alternativa de menor risco — persistir apenas o token — foi avaliada e descartada em favor da conveniência. Mitigações recomendadas: não permitir backup do app na nuvem, e considerar proteção biométrica em iteração futura.
- Conteúdo dos livros e áudio sintetizado permanecem no armazenamento privado do app.
- Nenhum dado de uso é enviado para serviços externos.
- **Restrição de distribuição:** um app cuja função é baixar da Z-Library não é publicável na Google Play nem na App Store. Com **iOS como alvo primário**, isso passa a ser o obstáculo operacional mais pesado do projeto:
  - No Android, distribuir por APK é trivial e a instalação vale indefinidamente.
  - No iOS não existe equivalente direto. O projeto **dispõe de conta paga de desenvolvedor Apple**, o que permite certificados de aproximadamente um ano em sideload por AltStore/SideStore, em vez dos 7 dias de uma conta gratuita. O acesso a marketplaces alternativos introduzido na União Europeia não se aplica ao Brasil.
  - Ainda assim, o app **para de abrir** quando o certificado expira, até ser reassinado. Com conta paga isso é uma manutenção anual, não semanal — um incômodo administrável, mas permanente.
  - A escolha entre sideload e TestFlight interno é decisão operacional, não requisito: sideload dá cerca de um ano por certificado; TestFlight interno tem builds que expiram em torno de 90 dias. O sideload é o caminho de menor atrito recorrente.

---

## 13. Requisitos Não Funcionais

- **Desempenho** — o Piper deve operar com RTF confortavelmente abaixo de 1, de modo que a síntese sustente a reprodução contínua sem esvaziar o buffer. Início da narração em poucos segundos após o acionamento.
- **Armazenamento** — arquivos temporários de áudio nunca crescem indefinidamente; limpeza automática dos blocos fora da janela de buffer.
- **Bateria** — síntese preguiçosa, apenas para os blocos necessários; nenhuma pré-renderização especulativa do livro inteiro.
- **Offline** — todas as funcionalidades sobre conteúdo já baixado operam sem rede.
- **Confiabilidade** — falha em um bloco de síntese não encerra a sessão de escuta.
- **Compatibilidade** — **iOS como alvo primário**, Android como alvo secundário confirmado no escopo desta versão. React Native com **development build** (EAS ou prebuild); o app não roda no Expo Go por depender de módulo nativo. O TurboModule do sherpa-onnx declara suporte a iOS, o que precisa ser confirmado no spike.
- **Armazenamento no iOS** — arquivos de livro e áudio devem ser marcados para exclusão do backup do iCloud, evitando sincronizar conteúdo volumoso e sensível.
- **Chaveiro no iOS** — as credenciais devem ser gravadas com acessibilidade restrita ao dispositivo e sem sincronização com o iCloud Keychain, para que a senha armazenada não se propague a outros aparelhos.

---

## 14. Critérios de Aceite

**AC-001** — Dado um usuário no primeiro acesso, quando abre o app, então a biblioteca é exibida e sobre ela aparece a orientação de como baixar livros.

**AC-002** — Dado um usuário autenticado com token expirado, quando realiza uma busca, então o app renova a sessão automaticamente e apresenta os resultados sem intervenção do usuário.

**AC-003** — Dado que a renovação automática de sessão falhou, quando o app processa a falha, então o bottom sheet de credenciais é reaberto com o e-mail preenchido e mensagem de sessão expirada, e a biblioteca local permanece acessível.

**AC-004** — Dado um resultado de busca em EPUB, quando o usuário aciona o download e a rede se mantém estável, então o livro aparece na biblioteca e o arquivo fica disponível offline.

**AC-005** — Dado um download interrompido por falha de rede, quando o usuário retorna à tela, então o item aparece como falho, sem arquivo parcial registrado, e com ação de tentar novamente.

**AC-006** — Dado um livro já presente na biblioteca, quando o usuário tenta baixá-lo novamente, então nenhuma duplicata é criada e o livro existente é aberto.

**AC-007** — Dado um usuário sem nenhuma voz baixada, quando aciona "Ouvir", então é conduzido à tela de gerenciamento de vozes com explicação do motivo.

**AC-008** — Dada uma voz baixada e verificada, quando o usuário aciona a narração de um livro pela primeira vez, então o seletor de voz é exibido informando o idioma declarado no EPUB.

**AC-009** — Dado um livro com narração em curso, quando o usuário desliga a tela, então a reprodução continua e os controles permanecem acessíveis pela notificação de mídia.

**AC-010** — Dado um livro lido até determinado ponto, quando o usuário aciona "Ouvir", então a narração inicia no começo do bloco onde a leitura parou.

**AC-011** — Dado um livro ouvido até determinado ponto, quando o usuário abre o leitor, então o texto é exibido no bloco que estava sendo narrado.

**AC-012** — Dado um livro e uma voz já baixados, quando o dispositivo está em modo avião, então a narração funciona integralmente.

**AC-013** — Dada uma narração em curso, quando o usuário salta para outro capítulo, então o buffer anterior é descartado e a reprodução recomeça no novo capítulo sem áudio residual do trecho anterior.

**AC-014** — Dada uma narração em curso, quando uma chamada telefônica é recebida, então a narração pausa e retoma ao término da chamada.

**AC-015** — Dado um EPUB protegido por DRM, quando o usuário tenta abri-lo, então o app informa que o arquivo não pode ser aberto e oferece removê-lo, sem travar a biblioteca.

**AC-016** — Dado qualquer erro tratado pelo app, quando a mensagem é exibida ou registrada, então ela não contém senha, token nem trechos do conteúdo do livro.

**AC-017** — Dado um usuário que já viu a orientação da biblioteca, quando abre o app, então a biblioteca é exibida diretamente, sem orientação e sem qualquer solicitação de credenciais.

**AC-018** — Dado um usuário sem credenciais armazenadas, quando aciona "Baixar livros", então o bottom sheet de credenciais é exibido.

**AC-019** — Dado o bottom sheet aberto, quando o usuário informa credenciais válidas e confirma, então elas são persistidas no armazenamento seguro, o sheet fecha e o app navega para a tela de busca.

**AC-020** — Dado um usuário com credenciais armazenadas, quando aciona "Baixar livros", então o app navega diretamente para a busca, sem solicitar autenticação.

**AC-021** — Dado o bottom sheet aberto, quando o usuário informa credenciais inválidas, então o sheet permanece aberto, exibe a causa do erro e preserva o e-mail digitado.

**AC-022** — Dado o bottom sheet aberto, quando o usuário o fecha sem autenticar, então retorna à biblioteca sem credenciais armazenadas e sem alteração de estado.

**AC-023** — Dado um usuário que executou logout, quando aciona "Baixar livros", então o bottom sheet de credenciais é exibido novamente.

**AC-024** — Dada uma biblioteca com livros baixados e nenhuma credencial armazenada, quando o usuário abre um livro e aciona a narração, então tudo funciona normalmente, sem qualquer solicitação de autenticação.

**AC-025** — Dado um usuário que pulou a orientação da biblioteca, quando abre um livro pela primeira vez, então a orientação do leitor é exibida, provando que os estados são independentes.

**AC-026** — Dado um usuário que abandonou o leitor sem concluir nem pular sua orientação, quando abre um livro novamente, então a orientação do leitor é exibida outra vez.

**AC-027** — Dado um usuário que já viu todas as orientações, quando aciona "reexibir orientações" nos Ajustes, então todas voltam a ser exibidas nas próximas entradas em seus respectivos fluxos.

**AC-028** — Dada uma biblioteca vazia, quando o usuário a visualiza, então "Baixar livros" aparece em destaque; e dada uma biblioteca preenchida, então a mesma ação permanece acessível pelo ícone no cabeçalho.

**AC-029** — Dado um usuário com credenciais armazenadas, quando aciona "Limpar minhas credenciais Z-Library" nos Ajustes e confirma, então as credenciais são removidas do armazenamento seguro e os livros, progressos e vozes permanecem intactos.

**AC-030** — Dado o diálogo de confirmação da limpeza de credenciais, quando o usuário cancela, então nenhuma credencial é removida.

**AC-031** — Dado um livro lido até determinado ponto, quando o usuário o remove e o baixa novamente, então a leitura retoma na posição anterior e a voz preferida é restaurada.

**AC-032** — Dado um livro removido, quando o usuário consulta os Ajustes, então a quantidade de progressos órfãos é informada e pode ser descartada mediante confirmação.

**AC-033** — Dado um livro em idioma sem voz no catálogo, quando o usuário aciona "Ouvir", então o app informa que não há voz disponível para aquele idioma, sem oferecer narração com voz incompatível.

**AC-034** — Dada uma orientação de múltiplos passos, quando o usuário aciona "pular" em qualquer passo, então a sequência é encerrada e apenas aquela orientação é marcada como vista.

**AC-035** — Dado um passo de coach mark cujo elemento-alvo não está renderizado, quando a sequência chega nele, então o passo é omitido e a sequência prossegue sem recorte vazio.

**AC-036** — Dada uma narração em curso no iOS, quando o usuário bloqueia a tela e guarda o aparelho, então o áudio continua e os controles permanecem funcionais na tela de bloqueio.

---

## 15. Sistemas Existentes Impactados

Nenhum. O repositório está vazio e não há integrações, serviços ou consumidores anteriores.

---

## 16. Áreas Prováveis de Implementação

Estrutura antecipada — a ser confirmada na fase de design, não implementada agora:

- **Camada Z-Library** — cliente de autenticação, busca e download; reimplementação do protocolo em TypeScript, dado que os clientes não oficiais existentes são bibliotecas Python.
- **Armazenamento seguro** — wrapper sobre Keystore/Keychain para credenciais e token.
- **Persistência local** — banco local para livros, vozes, progresso e preferências.
- **Módulo TTS** — integração com o TurboModule sherpa-onnx; carga do modelo, síntese por bloco e gestão de ciclo de vida.
- **Pipeline de texto** — parsing do EPUB, extração e segmentação em blocos narráveis.
- **Motor de reprodução** — buffer de blocos, gravação de WAV temporários, enfileiramento no player e limpeza.
- **Serviço de áudio em background** — sessão de áudio e modo de background no iOS, foreground service no Android, controles na tela de bloqueio e tratamento de interrupções de áudio.
- **Coach marks** — componente de sobreposição com recorte ancorado a elementos reais, medição de posição e reposicionamento em mudanças de layout.
- **Distribuição iOS** — assinatura, perfis de provisionamento e rotina de reassinatura periódica.
- **Leitor EPUB** — renderização paginada com sumário, fonte e tema.
- **Navegação e telas** — Onboarding, Biblioteca (rota inicial), Busca, Detalhe, Leitor, Player, Vozes, Ajustes, e o bottom sheet de credenciais como componente invocável.
- **Orientações contextuais** — componente reutilizável de orientação, com registro de pontos por chave, consulta e escrita do `OnboardingState`, e garantia de exclusividade entre orientações simultâneas (FR-067).
- **Guarda de credenciais** — verificação do armazenamento seguro no acionamento de "Baixar livros", decidindo entre abrir o bottom sheet ou navegar para a busca.
- **Build** — configuração de development build (config plugin do módulo nativo), pois o Expo Go não suporta o TTS.

---

## 17. Fora de Escopo

Explicitamente **não** serão implementados nesta versão:

- Formatos PDF, MOBI, AZW3 ou qualquer formato além de EPUB.
- Pré-renderização do livro completo em audiobook e exportação de arquivos de áudio.
- Detecção automática de idioma do livro e seleção automática de voz.
- Destaque visual do texto sendo narrado (karaokê).
- Marcadores, destaques, anotações, busca full-text no livro e dicionário.
- Timer de sono.
- Controles por botões de fone de ouvido e integração com sistemas automotivos.
- Sincronização entre dispositivos, conta própria, backend ou backup em nuvem.
- Publicação nas lojas oficiais de aplicativos.
- Clonagem de voz, ajuste de entonação ou vozes personalizadas.
- Modo de leitura em rolagem contínua (apenas paginado).

---

## 18. Questões Abertas

- ~~**Q-001**~~ — *Resolvida:* o projeto começa pelo spike técnico da integração Z-Library, antes de qualquer estimativa.
- ~~**Q-002**~~ — *Resolvida:* apenas avisar sobre idioma divergente, sem bloqueio (BR-006, FR-036, FR-068).
- ~~**Q-003**~~ — *Resolvida:* o progresso persiste no aparelho; a remoção apaga somente o livro (FR-021, FR-070 a FR-072).
- ~~**Q-004**~~ — *Resolvida:* catálogo inicial apenas com vozes pt-BR (FR-077).
- ~~**Q-005**~~ — *Resolvida:* sem publicação em loja, e **iOS como plataforma principal**. Consequências operacionais em §12; desdobramento em Q-015.
- ~~**Q-006**~~ — *Resolvida:* sem teto de armazenamento; o limite é a capacidade do aparelho (EC-06 trata a falta de espaço).
- ~~**Q-007**~~ — *Resolvida:* onboarding contextual e independente por fluxo, cada um pulável isoladamente (FR-054 a FR-056, FR-064).
- ~~**Q-008**~~ — *Resolvida:* destaque no estado vazio mais ícone permanente no cabeçalho (FR-057).
- ~~**Q-009**~~ — *Resolvida:* sim, reexibição coletiva pelos Ajustes (FR-069).
- ~~**Q-010**~~ — *Resolvida:* Ajustes acessível sem credenciais, com "Limpar minhas credenciais Z-Library" em vermelho (FR-005).
- ~~**Q-011**~~ — *Resolvida:* sem orientação para os filtros de busca; a lista de FR-064 permanece como está.
- ~~**Q-012**~~ — *Resolvida:* cada orientação tem vários passos (FR-073).
- ~~**Q-013**~~ — *Resolvida:* formato coach mark, com recorte sobre o elemento real (FR-074, FR-075).
- ~~**Q-014**~~ — *Resolvida:* a reexibição zera todas as orientações de uma vez (FR-069).

- ~~**Q-015**~~ — *Resolvida:* há conta paga de desenvolvedor Apple; certificados de cerca de um ano, reassinatura anual (§12, EC-33).
- ~~**Q-016**~~ — *Resolvida:* Android permanece no escopo como alvo secundário.
- ~~**Q-017**~~ — *Resolvida:* o spike valida também o sherpa-onnx no iOS (§19, Frente B).
- ~~**Q-018**~~ — *Resolvida:* o filtro de idioma da busca inicia pré-ajustado em português (FR-008).

### Pendentes

Nenhuma. Todas as questões levantadas durante o levantamento foram respondidas.

---

## 19. Spike Técnico

Aprovado como **primeira etapa do projeto**, anterior a qualquer estimativa de prazo ou início de implementação do produto. O código do spike é descartável e não faz parte do app.

### Objetivo

Provar que as duas dependências de maior risco funcionam de fato, antes de construir requisitos sobre elas.

### Frente A — Integração Z-Library

Precisa demonstrar, em ordem:

1. Autenticação com e-mail e senha, obtendo um token de sessão reutilizável.
2. Persistência e reuso do token em requisições posteriores.
3. Busca por título e autor, com filtros de idioma, formato e ano.
4. Paginação de resultados.
5. Download efetivo de um arquivo EPUB íntegro e abrível.
6. Comportamento observado na expiração de sessão, para validar FR-003 e FR-004.
7. Comportamento observado ao esgotar a cota diária de downloads, para validar FR-018.
8. Estabilidade do domínio ao longo dos dias do spike.

### Frente B — sherpa-onnx no iOS

Precisa demonstrar, em aparelho físico e não em simulador:

1. Build do TurboModule dentro de um development build do Expo, em iOS.
2. Carga do modelo Piper pt-BR sem estouro de memória.
3. Síntese de um bloco de texto com áudio audível e correto.
4. **RTF medido** em aparelho real — o número que decide se o streaming sob demanda é viável.
5. Consumo de memória durante síntese contínua.
6. Síntese prosseguindo com o app em background e áudio ativo, validando FR-044 e FR-076.

### Critérios de sucesso

O spike é bem-sucedido se a Frente A completar os itens 1 a 5 e a Frente B completar os itens 1 a 4 com RTF confortavelmente abaixo de 1.

### Planos alternativos em caso de falha

- **Se a Frente A falhar** — o app perde o download automático e passa a receber EPUBs por importação manual, permanecendo leitor e narrador. Boa parte das seções 4.2 a 4.4 sai do escopo, e o valor do produto diminui, mas ele continua existindo.
- **Se a Frente B falhar** — substituir o Piper pelo sintetizador nativo do iOS, que roda offline e possui vozes em português. A qualidade cai e o controle sobre o resultado diminui, porém o risco técnico é praticamente nulo e as seções 4.7 a 4.9 se simplificam bastante.

### Fora do escopo do spike

Contornar CAPTCHA, rotacionar domínios automaticamente ou driblar limites de requisição. Encontrando qualquer uma dessas barreiras, o spike a **reporta como restrição** em vez de tentar vencê-la — o objetivo é medir viabilidade, não forçar acesso.

### Restrições de execução

- A Frente B exige **macOS com Xcode e um iPhone físico**. RTF medido em simulador não tem valor, porque o simulador usa a CPU do Mac.
- A Frente A exige credenciais reais de uma conta Z-Library, fornecidas por **variável de ambiente** e jamais versionadas.

### Entregável

Um relatório com os números medidos, o que funcionou, o que não funcionou, e a recomendação de seguir com o plano principal ou com um dos alternativos.
