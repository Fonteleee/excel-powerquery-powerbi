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
