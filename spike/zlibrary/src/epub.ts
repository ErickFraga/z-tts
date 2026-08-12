/**
 * Verificação de integridade de EPUB, sem dependências externas.
 *
 * Não valida o EPUB inteiro — valida o suficiente para distinguir um arquivo
 * legítimo de uma página de erro em HTML que veio com nome de .epub, que é a
 * falha mais provável ao baixar de um endpoint não documentado.
 */

export interface EpubCheck {
  valid: boolean;
  reason: string;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const EPUB_MIMETYPE = "application/epub+zip";

export function checkEpub(bytes: Uint8Array): EpubCheck {
  if (bytes.length === 0) {
    return { valid: false, reason: "arquivo vazio" };
  }

  if (bytes.length < 100) {
    return { valid: false, reason: `apenas ${bytes.length} bytes — pequeno demais` };
  }

  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 200));
  if (/^\s*<(!doctype|html)/i.test(head)) {
    return { valid: false, reason: "é HTML, não EPUB — provável página de erro ou login" };
  }

  if (!ZIP_MAGIC.every((byte, index) => bytes[index] === byte)) {
    return { valid: false, reason: "não começa com assinatura de arquivo ZIP" };
  }

  // A especificação EPUB exige que o primeiro item do zip seja "mimetype",
  // armazenado sem compressão — logo o texto aparece literal perto do início.
  if (!head.includes(EPUB_MIMETYPE)) {
    return {
      valid: false,
      reason: `ZIP válido, mas sem "${EPUB_MIMETYPE}" no início — pode não ser EPUB`,
    };
  }

  return { valid: true, reason: `EPUB íntegro, ${formatBytes(bytes.length)}` };
}

function formatBytes(total: number): string {
  const mb = total / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(total / 1024)} KB`;
}
