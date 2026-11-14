// src/engine/xl/lib/criteria.ts
// Critérios de SOMASES, CONT.SES, MÁXIMOSES...: ">10", "<>A", "=", "ab*", 5, "texto".

import { parseNumberSafely } from '../../formulas/numbers';
import { parseDateText, Scalar } from '../values';

export type Matcher = (v: Scalar) => boolean;

function wildcardToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '~' && i + 1 < pattern.length) out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 'iu');
}

function asNumber(v: Scalar): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseNumberSafely(v);
    if (n !== null) return n;
    return parseDateText(v);
  }
  return null;
}

function equalsMatcher(target: Scalar): Matcher {
  if (typeof target === 'boolean') return v => v === target;
  if (typeof target === 'number') return v => asNumber(v) === target;
  const text = String(target ?? '');
  const num = asNumber(text);
  if (num !== null) return v => asNumber(v) === num || (typeof v === 'string' && v.trim().toLowerCase() === text.trim().toLowerCase());
  if (text === '') return v => v === null || v === undefined || v === '';
  if (/[*?~]/.test(text)) {
    const re = wildcardToRegExp(text);
    return v => typeof v === 'string' && re.test(v);
  }
  const lower = text.toLocaleLowerCase('pt-BR');
  return v => typeof v === 'string' && v.toLocaleLowerCase('pt-BR') === lower;
}

/** Transforma o critério (como aparece na fórmula) em uma função que diz se um valor atende. */
export function criteriaMatcher(criteria: Scalar): Matcher {
  if (typeof criteria !== 'string') return equalsMatcher(criteria);
  const m = /^(>=|<=|<>|>|<|=)([\s\S]*)$/.exec(criteria);
  if (!m) return equalsMatcher(criteria);
  const [, op, rest] = m;
  if (op === '=') return equalsMatcher(rest);
  if (op === '<>') {
    const eq = equalsMatcher(rest);
    return v => !eq(v);
  }
  const target = asNumber(rest);
  if (target !== null) {
    return v => {
      const n = asNumber(v);
      if (n === null) return false;
      return op === '>' ? n > target : op === '<' ? n < target : op === '>=' ? n >= target : n <= target;
    };
  }
  // Comparação de texto (">M"): só entre textos.
  const lower = rest.toLocaleLowerCase('pt-BR');
  return v => {
    if (typeof v !== 'string') return false;
    const x = v.toLocaleLowerCase('pt-BR');
    return op === '>' ? x > lower : op === '<' ? x < lower : op === '>=' ? x >= lower : x <= lower;
  };
}

// ---- Índice de igualdade ---------------------------------------------------------------------------
// Para critérios de igualdade simples (sem operador, curinga ou vazio) o resultado é o mesmo de varrer o
// vetor com `criteriaMatcher`, mas cada consulta custa O(acertos) depois de uma única indexação do vetor.

class EqualityIndex {
  private readonly byNumber = new Map<number, number[]>();
  private readonly byText = new Map<string, number[]>();

  constructor(values: readonly Scalar[]) {
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const n = asNumber(v);
      if (n !== null) push(this.byNumber, n, i);
      if (typeof v === 'string') push(this.byText, v.trim().toLocaleLowerCase('pt-BR'), i);
    }
  }

  /** Posições (crescentes) aceitas por `equalsMatcher(target)`, ou null se o critério não é indexável. */
  lookup(target: Scalar, values: readonly Scalar[]): number[] | null {
    if (typeof target === 'boolean' || target === null || target === undefined) return null;
    if (typeof target === 'number') {
      if (Number.isNaN(target)) return null;
      return this.byNumber.get(target) ?? [];
    }
    const text = String(target);
    if (text === '' || /[*?~]/.test(text)) return null;
    const num = asNumber(text);
    if (num === null) {
      // Texto puro: comparação exata (sem aparar) ignorando maiúsculas.
      const lower = text.toLocaleLowerCase('pt-BR');
      return (this.byText.get(lower.trim()) ?? []).filter(i => (values[i] as string).toLocaleLowerCase('pt-BR') === lower);
    }
    if (Number.isNaN(num)) return null;
    const lowerTrim = text.trim().toLowerCase();
    const textual = (this.byText.get(text.trim().toLocaleLowerCase('pt-BR')) ?? []).filter(
      i => (values[i] as string).trim().toLowerCase() === lowerTrim
    );
    const numeric = this.byNumber.get(num) ?? [];
    if (textual.length === 0) return numeric;
    return [...new Set([...numeric, ...textual])].sort((a, b) => a - b);
  }
}

function push<K>(map: Map<K, number[]>, key: K, i: number): void {
  const list = map.get(key);
  if (list) list.push(i);
  else map.set(key, [i]);
}

const INDEX_CACHE = new WeakMap<object, EqualityIndex>();

/**
 * Posições de `values` que atendem ao critério, via índice em cache (só vale a pena quando o vetor é reaproveitado,
 * por isso o chamador informa `cacheable`). Retorna null quando o critério precisa da varredura normal.
 */
export function indexedMatches(values: readonly Scalar[], criteria: Scalar, cacheable: boolean): number[] | null {
  if (!cacheable || values.length < 64) return null;
  let target: Scalar = criteria;
  if (typeof criteria === 'string') {
    const m = /^(>=|<=|<>|>|<|=)([\s\S]*)$/.exec(criteria);
    if (m) {
      if (m[1] !== '=') return null;
      target = m[2];
    }
  }
  let index = INDEX_CACHE.get(values);
  if (!index) {
    index = new EqualityIndex(values);
    INDEX_CACHE.set(values, index);
  }
  return index.lookup(target, values);
}
