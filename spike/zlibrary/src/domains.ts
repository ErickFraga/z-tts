/**
 * HIPÓTESES NÃO VERIFICADAS — mesma ressalva de endpoints.ts.
 *
 * A Z-Library troca de domínio com frequência e nenhum destes endereços é
 * oficial ou estável. A lista vale como ordem de tentativa, não como verdade:
 * qualquer um pode estar morto, redirecionando ou apontando para outra coisa.
 *
 * O que a descoberta faz com ela é justamente descobrir quais ainda respondem —
 * e esse resultado é um dos entregáveis do spike. Domínios pessoais entregues
 * por conta (o padrão que a origem usa para usuários logados) ficam de fora:
 * dependem de uma sessão que ainda não existe quando a descoberta roda.
 *
 * Para testar outra lista sem editar código, use ZLIB_DOMAINS no .env.
 */

export const KNOWN_DOMAINS = [
  "https://z-library.sk",
  "https://z-lib.fm",
  "https://z-lib.gs",
  "https://1lib.sk",
  "https://zlibrary-global.se",
  "https://b-ok.cc",
  "https://singlelogin.re",
] as const;
