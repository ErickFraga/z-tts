/**
 * Blocos de texto para medição.
 *
 * Texto original, escrito para o spike. Três tamanhos porque o RTF costuma
 * variar com o comprimento da entrada, e é o comportamento nos blocos longos
 * que decide o tamanho do buffer em FR-039.
 *
 * Contém pontuação, números por extenso e palavras acentuadas de propósito:
 * são justamente os casos onde a normalização de texto do Piper pode
 * introduzir latência ou erro de pronúncia.
 */

export interface Sample {
  id: string;
  label: string;
  text: string;
}

export const samples: Sample[] = [
  {
    id: "curto",
    label: "Frase curta",
    text: "A manhã chegou clara, e o vento trouxe cheiro de chuva.",
  },
  {
    id: "medio",
    label: "Parágrafo médio",
    text:
      "A manhã chegou clara, e o vento trouxe cheiro de chuva. Ele fechou o livro " +
      "sobre os joelhos, olhou para a janela e percebeu que havia perdido a hora. " +
      "Não era a primeira vez naquela semana; já eram três, se contasse a terça-feira. " +
      "Levantou-se devagar, com a impressão de que alguma coisa importante ficara " +
      "por dizer.",
  },
  {
    id: "longo",
    label: "Parágrafo longo",
    text:
      "A manhã chegou clara, e o vento trouxe cheiro de chuva. Ele fechou o livro " +
      "sobre os joelhos, olhou para a janela e percebeu que havia perdido a hora. " +
      "Não era a primeira vez naquela semana; já eram três, se contasse a terça-feira. " +
      "Levantou-se devagar, com a impressão de que alguma coisa importante ficara por " +
      "dizer. A rua ainda estava molhada da noite anterior, e as poças refletiam um " +
      "céu que não se decidia entre abrir e fechar. Caminhou até a esquina, parou " +
      "diante da banca fechada e leu, sem querer, as manchetes de ontem. Havia algo " +
      "de reconfortante em notícias velhas: elas já não pediam nada de ninguém. " +
      "Seguiu em frente, contando os passos até o ponto de ônibus, e quando chegou " +
      "aos oitenta e sete percebeu que tinha esquecido por que começara a contar.",
  },
];
