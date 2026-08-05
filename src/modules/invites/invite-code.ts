import { randomBytes } from 'node:crypto';

/// Base32 de Crockford: sem I, L, O e U. Evita confusao entre 1/I/L, 0/O e
/// palavroes acidentais. O código e lido em voz alta e digitado por gente que
/// recebeu o convite no WhatsApp -- ambiguidade aqui vira suporte.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 20; // 20 x 5 bits = 100 bits de entropia

export function generateInviteCode(): string {
  // 256 e multiplo de 32, entao `byte % 32` e uniforme -- sem vies.
  const bytes = randomBytes(LENGTH);
  let code = '';

  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }

  return code;
}

/// Aceita o código como o usuario digitou: com hifens, espacos, minusculas e
/// os enganos classicos de digitacao (I/L no lugar de 1, O no lugar de 0).
export function normalizeInviteCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
}

/// Formato de exibicao: 4 grupos de 5.
export function formatInviteCode(code: string): string {
  return code.match(/.{1,5}/g)?.join('-') ?? code;
}
