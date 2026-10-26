// src/engine/xl/lib/text.ts
// Texto: ESQUERDA, DIREITA, EXT.TEXTO, TEXTO, VALOR, SUBSTITUIR, LOCALIZAR, ARRUMAR...

import { Call } from '../call';
import { parseNumberSafely } from '../../formulas/numbers';
import { mapMatrix, NUM, parseDateText, partsFromSerial, Scalar, toNumber, toText, Value, VALOR, XlError } from '../values';
import { roundHalfAway } from './math';
import { def } from './registry';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const unaryText = (names: string[], fn: (s: string) => Scalar): void =>
  def(
    names,
    (c: Call): Value => {
      c.expect(1);
      return mapMatrix(c.value(0), v => fn(toText(v)));
    },
    true
  );

unaryText(['MAIÚSCULA', 'MAIUSCULA', 'UPPER'], s => s.toLocaleUpperCase('pt-BR'));
unaryText(['MINÚSCULA', 'MINUSCULA', 'LOWER'], s => s.toLocaleLowerCase('pt-BR'));
unaryText(['NÚM.CARACT', 'NUM.CARACT', 'LEN'], s => [...s].length);
unaryText(['ARRUMAR', 'TRIM'], s => s.replace(/^\s+|\s+$/g, '').replace(/\s{2,}/g, ' '));
unaryText(['LIMPAR', 'CLEAN'], s => s.replace(/[\u0000-\u001f]/g, ''));

def(['ESQUERDA', 'LEFT'], (c: Call): Value => {
  c.expect(1, 2);
  const n = c.int(1, 1);
  if (n < 0) throw new XlError(VALOR);
  return [...c.text(0)].slice(0, n).join('');
});
def(['DIREITA', 'RIGHT'], (c: Call): Value => {
  c.expect(1, 2);
  const n = c.int(1, 1);
  if (n < 0) throw new XlError(VALOR);
  const chars = [...c.text(0)];
  return n === 0 ? '' : chars.slice(-n).join('');
});
def(['EXT.TEXTO', 'MID'], (c: Call): Value => {
  c.expect(3);
  const start = c.int(1);
  const n = c.int(2);
  if (start < 1 || n < 0) throw new XlError(VALOR);
  return [...c.text(0)].slice(start - 1, start - 1 + n).join('');
});

def(['REPT', 'REPETIR'], (c: Call): Value => {
  c.expect(2);
  const n = c.int(1);
  if (n < 0 || n * c.text(0).length > 32_000) throw new XlError(VALOR);
  return c.text(0).repeat(n);
});

def(['SUBSTITUIR', 'SUBSTITUTE'], (c: Call): Value => {
  c.expect(3, 4);
  const text = c.text(0);
  const oldText = c.text(1);
  const newText = c.text(2);
  if (oldText === '') return text;
  if (!c.has(3)) return text.split(oldText).join(newText);
  const wanted = c.int(3);
  let seen = 0;
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith(oldText, i)) {
      seen++;
      out += seen === wanted ? newText : oldText;
      i += oldText.length;
    } else out += text[i++];
  }
  return out;
});

def(['TROCAR', 'REPLACE'], (c: Call): Value => {
  c.expect(4);
  const chars = [...c.text(0)];
  const start = c.int(1);
  const n = c.int(2);
  if (start < 1 || n < 0) throw new XlError(VALOR);
  return chars.slice(0, start - 1).join('') + c.text(3) + chars.slice(start - 1 + n).join('');
});

/** LOCALIZAR (sem diferenciar maiúsculas, aceita ? e *) e PROCURAR (diferencia, sem curingas). */
function findText(c: Call, caseSensitive: boolean): Value {
  c.expect(2, 3);
  const needle = c.text(0);
  const hay = c.text(1);
  const start = c.int(2, 1);
  if (start < 1 || start > hay.length + 1) throw new XlError(VALOR);
  const from = start - 1;
  if (caseSensitive) {
    const at = hay.indexOf(needle, from);
    if (at < 0) throw new XlError(VALOR);
    return at + 1;
  }
  const pattern = needle.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  const m = new RegExp(pattern, 'iu').exec(hay.slice(from));
  if (!m) throw new XlError(VALOR);
  return from + m.index + 1;
}
def(['LOCALIZAR', 'SEARCH'], c => findText(c, false));
def(['PROCURAR', 'FIND'], c => findText(c, true));

def(['EXATO', 'EXACT'], (c: Call): Value => {
  c.expect(2);
  return c.text(0) === c.text(1);
});
def(['CARACT', 'CHAR'], (c: Call): Value => {
  c.expect(1);
  const n = c.int(0);
  if (n < 1 || n > 255) throw new XlError(VALOR);
  return String.fromCharCode(n);
});
def(['CÓDIGO', 'CODIGO', 'CODE'], (c: Call): Value => {
  c.expect(1);
  const s = c.text(0);
  if (s === '') throw new XlError(VALOR);
  return s.charCodeAt(0);
});

function delimited(c: Call, before: boolean): Value {
  c.expect(2, 4);
  const text = c.text(0);
  const delimiter = c.text(1);
  const instance = c.int(2, 1);
  if (delimiter === '' || instance === 0) throw new XlError(VALOR);
  const positions: number[] = [];
  for (let at = text.indexOf(delimiter); at >= 0; at = text.indexOf(delimiter, at + delimiter.length)) positions.push(at);
  const idx = instance > 0 ? instance - 1 : positions.length + instance;
  const at = positions[idx];
  if (at === undefined) throw new XlError('#N/D');
  return before ? text.slice(0, at) : text.slice(at + delimiter.length);
}
def(['TEXTOANTES', 'TEXTBEFORE'], c => delimited(c, true));
def(['TEXTODEPOIS', 'TEXTAFTER'], c => delimited(c, false));

def(['VALOR', 'VALUE'], (c: Call): Value => {
  c.expect(1);
  return mapMatrix(c.value(0), v => {
    if (typeof v === 'number') return v;
    const s = toText(v).trim();
    const pct = /^(-?[\d.,]+)\s*%$/.exec(s);
    if (pct) return toNumber(pct[1]) / 100;
    const n = parseNumberSafely(s.replace(/^R\$\s*/, ''));
    if (n !== null) return n;
    const d = parseDateText(s);
    if (d !== null) return d;
    throw new XlError(VALOR);
  });
});

// ---- TEXTO -----------------------------------------------------------------------------------------

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

interface NumberFormat {
  prefix: string;
  suffix: string;
  percent: boolean;
  decimals: number;
  minDecimals: number;
  thousands: boolean;
  minInt: number;
}

/** Interpreta máscaras como "0,00", "#.##0,00", "R$ #.##0,00", "0%", "#,##0.00" (decimal = o último separador). */
function parseNumberFormat(fmt: string): NumberFormat {
  const m = /^([^0#]*)([0#.,\s]*[0#])([^0#]*)$/.exec(fmt);
  if (!m) return { prefix: '', suffix: fmt, percent: false, decimals: 0, minDecimals: 0, thousands: false, minInt: 1 };
  const [, prefix, core, suffix] = m;
  let intPart = core;
  let decPart = '';
  const lastSep = Math.max(core.lastIndexOf(','), core.lastIndexOf('.'));
  const sepChar = lastSep >= 0 ? core[lastSep] : '';
  const after = lastSep >= 0 ? core.slice(lastSep + 1) : '';
  const otherSep = sepChar === ',' ? '.' : ',';
  const hasBoth = core.includes(otherSep);
  // Um único tipo de separador seguido de exatamente "##0" é milhar ("#,##0"); senão é decimal ("0,00").
  const thousandsOnly = lastSep >= 0 && !hasBoth && /^(?:#{2}0|000)$/.test(after) && /[#0]$/.test(core.slice(0, lastSep));
  if (lastSep >= 0 && !thousandsOnly) {
    intPart = core.slice(0, lastSep);
    decPart = after;
  }
  const minDecimals = (decPart.match(/0/g) ?? []).length;
  return {
    prefix: prefix.replace(/"/g, ''),
    suffix: suffix.replace(/"/g, ''),
    percent: suffix.includes('%'),
    decimals: decPart.length,
    minDecimals,
    thousands: /[.,]/.test(intPart) || thousandsOnly,
    minInt: (intPart.match(/0/g) ?? []).length || (decPart ? 0 : 1),
  };
}

function formatNumberWith(value: number, fmt: string): string {
  const f = parseNumberFormat(fmt);
  let n = f.percent ? value * 100 : value;
  const negative = n < 0;
  n = roundHalfAway(Math.abs(n), f.decimals);
  const [intRaw, decRaw = ''] = n.toFixed(f.decimals).split('.');
  const int = intRaw.padStart(f.minInt, '0');
  let dec = decRaw;
  while (dec.length > f.minDecimals && dec.endsWith('0')) dec = dec.slice(0, -1);
  const body = (f.thousands ? groupThousands(int) : int) + (dec ? `,${dec}` : '');
  return `${negative ? '-' : ''}${f.prefix}${body}${f.suffix}`;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

function formatDateWith(serial: number, fmt: string): string {
  const { year, month, day, weekday } = partsFromSerial(serial);
  const secsOfDay = Math.round((serial - Math.floor(serial)) * 86400);
  const hour = Math.floor(secsOfDay / 3600) % 24;
  const minute = Math.floor(secsOfDay / 60) % 60;
  const second = secsOfDay % 60;
  const hasTime = /h/i.test(fmt);
  // "mm" depois de "h" ou antes de "ss" é minuto; nos outros casos é mês.
  return fmt.replace(/yyyy|yy|aaaa|aa|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s/gi, (tok, offset: number, whole: string) => {
    const t = tok.toLowerCase();
    switch (t) {
      case 'yyyy':
      case 'aaaa':
        return String(year);
      case 'yy':
      case 'aa':
        return pad2(year % 100);
      case 'mmmm':
        return MONTHS[month - 1];
      case 'mmm':
        return MONTHS[month - 1].slice(0, 3);
      case 'mm':
      case 'm': {
        const before = whole.slice(0, offset).toLowerCase();
        const after = whole.slice(offset + tok.length).toLowerCase();
        const isMinute = hasTime && (/h[^a-z]*$/.test(before) || /^[^a-z]*s/.test(after));
        const n = isMinute ? minute : month;
        return t === 'mm' ? pad2(n) : String(n);
      }
      case 'dddd':
        return WEEKDAYS[weekday];
      case 'ddd':
        return WEEKDAYS[weekday].slice(0, 3);
      case 'dd':
        return pad2(day);
      case 'd':
        return String(day);
      case 'hh':
        return pad2(hour);
      case 'h':
        return String(hour);
      case 'ss':
        return pad2(second);
      default:
        return String(second);
    }
  });
}

def(['TEXTO', 'TEXT'], (c: Call): Value => {
  c.expect(2);
  const fmt = c.text(1);
  return mapMatrix(c.value(0), v => {
    if (typeof v === 'string') {
      const d = parseDateText(v);
      if (d !== null && /[dmyah]/i.test(fmt) && !/^[0#]/.test(fmt)) return formatDateWith(d, fmt);
      const n = parseNumberSafely(v);
      if (n === null) return v;
      v = n;
    }
    const n = toNumber(v);
    if (/[dmyah]/i.test(fmt.replace(/"[^"]*"/g, '')) && !/^[^dmyah]*[0#]/.test(fmt)) return formatDateWith(n, fmt);
    if (fmt === '' || fmt.toLowerCase() === 'geral' || fmt.toLowerCase() === 'general') return toText(n);
    return formatNumberWith(n, fmt);
  });
});

def(['MOEDA', 'DOLLAR', 'FIXO', 'FIXED'], (c: Call): Value => {
  c.expect(1, 2);
  const decimals = c.int(1, 2);
  if (decimals < 0 || decimals > 15) throw new XlError(NUM);
  const mask = `#.##0${decimals > 0 ? ',' + '0'.repeat(decimals) : ''}`;
  const out = formatNumberWith(c.num(0), mask);
  return c.name === 'MOEDA' || c.name === 'DOLLAR' ? `R$ ${out}` : out;
});
