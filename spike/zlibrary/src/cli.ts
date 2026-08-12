/**
 * Implementações das dependências da descoberta para o ambiente de terminal.
 *
 * No KOReader essas peças são o gerenciador de rede e as caixas de diálogo do
 * aparelho; no app serão o estado de conectividade do sistema e a tela. Aqui
 * são DNS e `console.log`. Isolar isso em um arquivo é o que permite testar a
 * descoberta pelo probe sem que ela saiba onde está rodando.
 */

import type { DiscoveryUi, NetworkGate } from "./discovery.ts";
import { preflight } from "./preflight.ts";

/**
 * Host neutro para separar "sua rede caiu" de "os domínios da Z-Library estão
 * bloqueados". Sem essa referência, uma varredura que falha em todos os
 * candidatos é ambígua, e as duas leituras levam a ações opostas.
 *
 * `one.one.one.one` serve porque é operado pelo resolvedor público da
 * Cloudflare, responde em 443 e não é alvo plausível dos bloqueios que atingem
 * a origem — se ele cai, é a rede local.
 */
const NEUTRAL_HOST = "https://one.one.one.one";

export const cliNetworkGate: NetworkGate = {
  async shouldWaitForNetwork(): Promise<boolean> {
    const check = await preflight(NEUTRAL_HOST, 5000);
    // Um processo de linha de comando não tem para onde reagendar: o `retry`
    // é ignorado de propósito e quem tenta de novo é o operador.
    return check.addresses.length === 0 || !check.tcpReachable;
  },
};

/**
 * As mensagens saem todas em stdout, junto do relatório. Separar erro em
 * stderr embaralharia a ordem das linhas quando a saída é redirecionada, e a
 * ordem é o que torna o relatório legível.
 */
export const consoleUi: DiscoveryUi = {
  showLoadingMessage(text: string): unknown {
    console.log(`  ${text}`);
    // No terminal a mensagem não é uma janela que precise ser fechada depois;
    // o handle existe só para honrar o contrato de quem tem tela.
    return null;
  },

  closeMessage(): void {},

  showInfoMessage(text: string): void {
    console.log(`  ${text}`);
  },

  showErrorMessage(text: string): void {
    console.log(`  ${text}`);
  },
};
