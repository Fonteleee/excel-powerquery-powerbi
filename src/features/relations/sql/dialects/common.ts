// src/features/relations/sql/dialects/common.ts
// Rotinas de segurança compartilhadas pelos dialetos: identificadores e literais.

import { SqlSafetyError } from '../types';

/**
 * Caracteres que nunca entram em identificadores nem comentários: controles C0/C1, separadores
 * de linha Unicode e marcas bidirecionais (ataque "Trojan Source"). Comparação por código numérico.
 */
function isUnsafeCode(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

export function hasUnsafeChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isUnsafeCode(text.charCodeAt(i))) return true;
  }
  return false;
}

const encoder = new TextEncoder();

/** Valida e devolve o identificador entre aspas duplas (`"` vira `""`). */
export function quoteIdentifier(name: unknown, maxBytes: number): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new SqlSafetyError('Nome vazio não pode virar identificador SQL');
  }
  if (hasUnsafeChars(name)) {
    throw new SqlSafetyError('Nome com caractere de controle não pode virar identificador SQL');
  }
  if (encoder.encode(name).length > maxBytes) {
    throw new SqlSafetyError(`Identificador excede ${maxBytes} bytes: "${name.slice(0, 20)}..."`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/** Literal de texto padrão SQL: só `'` precisa ser dobrado. NUL é recusado. */
export function standardStringLiteral(value: string): string {
  if (typeof value !== 'string') throw new SqlSafetyError('Literal de texto inválido');
  if (value.includes(String.fromCharCode(0))) {
    throw new SqlSafetyError('Texto com caractere NUL não pode virar literal SQL');
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/** Número finito como literal. Negativos ficam entre parênteses para não colar em operadores. */
export function numberLiteral(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SqlSafetyError('Número não finito não pode virar literal SQL');
  }
  const text = String(value);
  return value < 0 ? `(${text})` : text;
}

/** Caractere de escape usado nos padrões `LIKE`. */
export const LIKE_ESCAPE = '!';

/** Escapa `!`, `%` e `_` para que o texto do usuário seja sempre literal dentro de um `LIKE`. */
export function escapeLikeText(value: string): string {
  return value.replace(/[!%_]/g, match => `${LIKE_ESCAPE}${match}`);
}

/** Tira quebras de linha e controles para que o texto caiba num comentário `--` de uma linha. */
export function commentText(value: string, maxLength = 160): string {
  let flat = '';
  for (let i = 0; i < value.length; i++) {
    flat += isUnsafeCode(value.charCodeAt(i)) ? ' ' : value[i];
  }
  flat = flat.replace(/\s+/g, ' ').trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength)}...` : flat;
}

/** Linha de comentário segura (`-- texto`). */
export function commentLine(value: string): string {
  return `-- ${commentText(value)}`;
}

/** Espaços em branco que `String.prototype.trim` do JS remove e `TRIM` de SQL não removeria sozinho. */
export const TRIM_CHARS_SQL = "' ' || CHR(9) || CHR(10) || CHR(13) || CHR(160)";

/** Expressões regulares (sem barra invertida) dos formatos numéricos aceitos em SQL. */
export const NUMBER_PLAIN = '^[[:space:]]*[-+]?[0-9]+([.][0-9]+)?[[:space:]]*$';
export const NUMBER_COMMA = '^[[:space:]]*[-+]?[0-9]+,[0-9]+[[:space:]]*$';
export const NUMBER_BR_THOUSANDS = '^[[:space:]]*[-+]?[0-9]{1,3}([.][0-9]{3})+,[0-9]+[[:space:]]*$';
