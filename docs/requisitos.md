# Especificação de Requisitos — z-tts

> Status: **aguardando aprovação**. Nenhuma implementação deve começar antes da validação deste documento.
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

Após a implementação, o usuário autentica-se uma única vez com sua conta Z-Library, busca livros por título ou autor com filtros, baixa EPUBs para uma biblioteca local, e sobre qualquer livro baixado pode escolher entre ler ou ouvir. A narração é gerada sob demanda no aparelho, continua com a tela desligada, e compartilha a mesma posição de progresso com a leitura.

---

## 4. Requisitos Funcionais

### 4.1 Autenticação e sessão

- **FR-001** — Na primeira execução, o app deve exibir uma tela de login solicitando e-mail e senha da conta Z-Library (SingleLogin). Busca e download permanecem indisponíveis enquanto não houver login concluído.
- **FR-002** — Após login bem-sucedido, o app deve persistir e-mail, senha e token de sessão no armazenamento seguro do sistema operacional (Android Keystore / iOS Keychain).
- **FR-003** — Quando uma requisição à Z-Library falhar por sessão inválida ou expirada, o app deve renovar a sessão automaticamente usando as credenciais persistidas, **uma única vez**, e repetir a requisição original de forma transparente ao usuário.
- **FR-004** — Se a renovação automática falhar, o app deve descartar o token, exibir a tela de login com o e-mail preenchido e uma mensagem indicando que a sessão expirou.
- **FR-005** — O app deve oferecer a ação "sair", que remove e-mail, senha e token do armazenamento seguro. Livros já baixados e seus progressos permanecem no dispositivo.
- **FR-006** — Credenciais e token nunca podem ser gravados em logs, telemetria, relatórios de erro ou mensagens exibidas na interface.

### 4.2 Busca

- **FR-007** — O app deve oferecer busca por texto livre, aplicada a título e autor.
- **FR-008** — A busca deve oferecer filtros de idioma, formato e ano de publicação. O filtro de formato inicia fixado em EPUB.
- **FR-009** — Cada resultado deve exibir capa (quando disponível), título, autor, idioma, formato, tamanho do arquivo e ano.
- **FR-010** — Os resultados devem ser paginados, carregando a página seguinte quando o usuário atinge o fim da lista.
- **FR-011** — Resultados em formato diferente de EPUB não devem ser oferecidos para download.
- **FR-012** — Uma busca sem resultados deve exibir estado vazio explicativo, distinto do estado de erro de rede.

### 4.3 Download

- **FR-013** — O usuário deve poder iniciar o download a partir de um resultado de busca, com progresso percentual visível.
- **FR-014** — O download deve continuar enquanto o usuário navega para outras telas do app.
- **FR-015** — Ao concluir, o arquivo deve ser salvo no armazenamento privado do app e registrado na biblioteca local.
- **FR-016** — Em caso de falha de rede, o item deve permanecer em estado "falhou" com ação de tentar novamente. Arquivos parciais devem ser descartados e nunca registrados na biblioteca.
- **FR-017** — Solicitar o download de um livro já presente na biblioteca não deve criar duplicata; o app deve abrir o livro existente.
- **FR-018** — Quando a origem indicar que a cota diária de downloads da conta foi esgotada, o app deve comunicar isso explicitamente em vez de exibir erro genérico.

### 4.4 Biblioteca local

- **FR-019** — A tela inicial deve listar os livros baixados com capa, título, autor e indicador de progresso.
- **FR-020** — Com a biblioteca vazia, deve ser exibido estado vazio orientando o usuário a realizar a primeira busca.
- **FR-021** — O usuário deve poder remover um livro. A remoção apaga o arquivo EPUB, a capa em cache, os arquivos temporários de áudio e o progresso associado, mediante confirmação.
- **FR-022** — Cada livro da biblioteca deve oferecer as ações "Ler" e "Ouvir".

### 4.5 Leitor

- **FR-023** — O app deve renderizar o EPUB em modo paginado.
- **FR-024** — O sumário declarado no EPUB deve ser navegável, permitindo saltar para qualquer capítulo.
- **FR-025** — O usuário deve poder ajustar o tamanho da fonte; a preferência é persistida globalmente.
- **FR-026** — O app deve oferecer tema claro e escuro para a leitura; a preferência é persistida globalmente.
- **FR-027** — A posição de leitura deve ser persistida continuamente durante a leitura.
- **FR-028** — Abrir um livro deve retomar a leitura na última posição registrada, independentemente de ela ter sido produzida por leitura ou por escuta.

### 4.6 Gerenciamento de vozes

- **FR-029** — O app deve oferecer uma tela de gerenciamento de vozes, listando as vozes Piper disponíveis com nome, idioma, tamanho aproximado e estado (não baixada, baixando, pronta).
- **FR-030** — O usuário deve poder baixar uma voz sob demanda, com progresso visível. A integridade do arquivo baixado deve ser verificada antes de marcá-lo como pronto.
- **FR-031** — O usuário deve poder remover uma voz baixada para liberar espaço. Uma voz em uso por uma narração ativa não pode ser removida.
- **FR-032** — Um download de voz interrompido deve poder ser retomado ou reiniciado. Um arquivo incompleto nunca deve ser considerado pronto para uso.
- **FR-033** — Se o usuário acionar "Ouvir" sem nenhuma voz baixada, o app deve conduzi-lo à tela de gerenciamento de vozes, explicando o motivo.

### 4.7 Seleção de voz

- **FR-034** — A voz utilizada na narração é escolhida **manualmente pelo usuário**, por livro. O app não realiza detecção automática de idioma.
- **FR-035** — A escolha de voz deve ser persistida por livro e reutilizada nas sessões seguintes daquele livro.
- **FR-036** — Ao acionar a narração pela primeira vez em um livro, o app deve exibir o seletor de voz apresentando também o idioma declarado nos metadados do EPUB (`dc:language`), como auxílio à escolha do usuário.
- **FR-037** — O usuário deve poder trocar a voz de um livro a qualquer momento. A troca interrompe a narração em curso, descarta o buffer e ressintetiza a partir da posição atual.

### 4.8 Narração

- **FR-038** — O app deve extrair o texto do EPUB por capítulo, segmentado em blocos (parágrafo ou grupo de frases), descartando marcação, notas de rodapé, legendas de imagem e elementos não textuais.
- **FR-039** — A síntese deve ocorrer bloco a bloco por meio do Piper via sherpa-onnx, mantendo um buffer de no mínimo 2 blocos sintetizados à frente da reprodução.
- **FR-040** — Os blocos devem ser reproduzidos em sequência contínua, sem silêncio perceptível na emenda entre eles.
- **FR-041** — O áudio sintetizado deve ser gravado como arquivo temporário. Blocos já reproduzidos e fora da janela de buffer devem ser apagados automaticamente.
- **FR-042** — O player deve oferecer: play/pause, avançar bloco, voltar bloco, capítulo anterior, próximo capítulo e ajuste de velocidade de reprodução.
- **FR-043** — A velocidade de reprodução deve ser persistida globalmente e aplicada aos livros seguintes.
- **FR-044** — A reprodução deve continuar com o app em segundo plano ou com a tela desligada, por meio de foreground service no Android.
- **FR-045** — Deve haver notificação de mídia exibindo título do livro, capítulo atual e controles de play/pause e avançar/voltar.
- **FR-046** — Ao saltar de capítulo, o buffer pendente deve ser descartado e a síntese reiniciada a partir do novo ponto.
- **FR-047** — Perda de foco de áudio (chamada telefônica, outro app tocando) deve pausar a narração. A retomada automática ocorre apenas quando a perda de foco foi transitória.
- **FR-048** — A narração de um livro já baixado, com voz já baixada, deve funcionar sem qualquer acesso à rede.

### 4.9 Progresso

- **FR-049** — Cada livro possui uma **posição única** de progresso, compartilhada entre leitura e escuta, com granularidade de bloco.
- **FR-050** — Ao iniciar a narração, a reprodução começa no início do bloco correspondente à posição atual registrada.
- **FR-051** — Ao abrir o leitor após uma sessão de escuta, o texto deve ser posicionado no bloco que estava sendo narrado.
- **FR-052** — O progresso deve ser persistido localmente e sobreviver ao fechamento e reinício do app.

---

## 5. Regras de Negócio

- **BR-001** — O app não oferece nenhuma funcionalidade de busca ou download sem uma conta Z-Library autenticada.
- **BR-002** — Somente livros em formato EPUB são suportados, em toda a cadeia (busca, download, leitura, narração).
- **BR-003** — Toda a síntese de voz ocorre no dispositivo. Nenhum trecho de texto de livro é enviado para serviços externos.
- **BR-004** — Um livro possui exatamente uma posição de progresso, independentemente do modo de consumo.
- **BR-005** — Uma voz só pode ser usada para narração se estiver baixada integralmente e verificada.
- **BR-006** — O app **não valida** a compatibilidade entre o idioma do livro e a voz selecionada. A escolha correta é responsabilidade do usuário — consequência direta da decisão de seleção manual de voz (ver Questões Abertas, Q-002).
- **BR-007** — As credenciais persistem até que o usuário execute logout explícito.
- **BR-008** — Livros baixados permanecem plenamente utilizáveis offline, inclusive para narração.

---

## 6. Fluxos de Usuário

### Fluxo A — Primeiro uso

1. Usuário abre o app pela primeira vez.
2. App exibe a tela de login.
3. Usuário informa e-mail e senha da conta Z-Library.
4. App autentica, persiste credenciais e token no armazenamento seguro.
5. App exibe a biblioteca vazia, orientando a realizar a primeira busca.

### Fluxo B — Buscar e baixar

1. Usuário abre a busca e digita título ou autor.
2. Opcionalmente aplica filtros de idioma e ano.
3. App consulta a Z-Library e apresenta resultados paginados.
4. Usuário seleciona um resultado e aciona o download.
5. App baixa com progresso visível e registra o livro na biblioteca ao concluir.

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
| EC-14 | Sessão Z-Library expirada durante uma busca | Renovação transparente (FR-003); se falhar, tela de login |
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
`id`, `titulo`, `autor`, `idioma`, `ano`, `caminhoArquivo`, `caminhoCapa`, `tamanhoBytes`, `baixadoEm`, `posicaoProgresso` (capítulo + índice do bloco), `vozPreferidaId`, `estado` (baixando / pronto / falhou / inválido)

**Voice**
`id`, `nome`, `idioma`, `urlModelo`, `caminhoLocal`, `tamanhoBytes`, `checksum`, `estado` (não baixada / baixando / pronta)

**Settings**
`tamanhoFonte`, `tema`, `velocidadeReproducao`

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

Telas: Login, Biblioteca, Busca (com filtros), Detalhe do livro, Leitor, Player, Gerenciamento de vozes, Ajustes.

Estados obrigatórios em cada tela de listagem: carregando, vazio, erro e conteúdo — visualmente distintos entre si.

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
- **Restrição de distribuição:** um app cuja função é baixar da Z-Library não é publicável na Google Play nem na App Store. A distribuição prevista é por APK/sideload no Android. Isso condiciona atualização, assinatura de build e ausência de canal oficial de crash reporting.

---

## 13. Requisitos Não Funcionais

- **Desempenho** — o Piper deve operar com RTF confortavelmente abaixo de 1, de modo que a síntese sustente a reprodução contínua sem esvaziar o buffer. Início da narração em poucos segundos após o acionamento.
- **Armazenamento** — arquivos temporários de áudio nunca crescem indefinidamente; limpeza automática dos blocos fora da janela de buffer.
- **Bateria** — síntese preguiçosa, apenas para os blocos necessários; nenhuma pré-renderização especulativa do livro inteiro.
- **Offline** — todas as funcionalidades sobre conteúdo já baixado operam sem rede.
- **Confiabilidade** — falha em um bloco de síntese não encerra a sessão de escuta.
- **Compatibilidade** — Android como alvo primário. React Native com **development build** (EAS ou prebuild); o app não roda no Expo Go por depender de módulo nativo.

---

## 14. Critérios de Aceite

**AC-001** — Dado um usuário sem login, quando abre o app, então a tela de login é exibida e busca e download permanecem inacessíveis.

**AC-002** — Dado um usuário autenticado com token expirado, quando realiza uma busca, então o app renova a sessão automaticamente e apresenta os resultados sem intervenção do usuário.

**AC-003** — Dado que a renovação automática de sessão falhou, quando o app processa a falha, então a tela de login é exibida com o e-mail preenchido e mensagem de sessão expirada.

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
- **Serviço de áudio em background** — foreground service, sessão de mídia, notificação e tratamento de foco de áudio.
- **Leitor EPUB** — renderização paginada com sumário, fonte e tema.
- **Navegação e telas** — Login, Biblioteca, Busca, Detalhe, Leitor, Player, Vozes, Ajustes.
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
- Suporte a iOS nesta versão.
- Clonagem de voz, ajuste de entonação ou vozes personalizadas.
- Modo de leitura em rolagem contínua (apenas paginado).

---

## 18. Questões Abertas

- **Q-001** — A integração com a Z-Library depende de endpoints não documentados e instáveis. É necessário um spike técnico para validar autenticação, busca e download antes de qualquer estimativa. Aceita-se iniciar por este spike?
- **Q-002** — A seleção manual de voz (FR-034) permite ao usuário narrar um livro em inglês com voz pt-BR, produzindo áudio ininteligível. FR-036 mitiga exibindo o idioma do EPUB, mas não impede o erro. Confirma-se que basta o aviso, sem bloqueio?
- **Q-003** — A remoção de um livro apaga também o progresso (FR-021). Se o mesmo livro for baixado novamente, o progresso reinicia do zero. Isso é aceitável?
- **Q-004** — Qual o conjunto inicial de vozes a ser oferecido na tela de gerenciamento? Apenas pt_BR-faber, ou já uma lista com vozes de outros idiomas?
- **Q-005** — Confirmação da restrição de distribuição: o app será distribuído por APK/sideload, sem publicação em loja. Há intenção de suporte a iOS em algum momento?
- **Q-006** — Existe limite desejado de espaço em disco para a biblioteca, ou o app apenas reage à falta de espaço quando ela ocorre?
