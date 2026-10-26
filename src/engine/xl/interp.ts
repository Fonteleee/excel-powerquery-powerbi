// src/engine/xl/interp.ts
// Interpretador da árvore de fórmulas: operadores com as regras do Excel, referências, matrizes e despacho
// de funções (nativas ou do motor antigo).

import { parseCellAddress } from '../formulas/addressing';
import { Call, Evaluator, Host, RefTarget } from './call';
import { NATIVE_FUNCTIONS } from './lib';
import { Node, nodeText, parseExpression, ParseError } from './parser';
import { broadcast, compareScalars, DIV0, isMatrix, mapMatrix, N_D, NOME, NUM, REF, Scalar, toNumber, toText, Value, VALOR, XlError } from './values';

/** Erros das funções antigas são `Error('#...')`; viram XlError para que SEERRO e as funções É.* os reconheçam. */
function asXlError(error: unknown): unknown {
  if (error instanceof XlError) return error;
  if (error instanceof Error && error.message.startsWith('#')) return new XlError(error.message);
  return error;
}

function arithmetic(op: '+' | '-' | '*' | '/' | '^', x: Scalar, y: Scalar): number {
  const a = toNumber(x);
  const b = toNumber(y);
  let result: number;
  switch (op) {
    case '+':
      result = a + b;
      break;
    case '-':
      result = a - b;
      break;
    case '*':
      result = a * b;
      break;
    case '/':
      if (b === 0) throw new XlError(DIV0);
      result = a / b;
      break;
    case '^':
      if (a === 0 && b === 0) throw new XlError(NUM);
      result = Math.pow(a, b);
      break;
  }
  if (!Number.isFinite(result)) throw new XlError(NUM);
  // Evita 0,1+0,2 = 0,30000000000000004 aparecer na tela.
  return Math.abs(result) < 1e15 ? Math.round(result * 1e12) / 1e12 : result;
}

function compare(op: string, x: Scalar, y: Scalar): boolean {
  const c = compareScalars(x, y);
  switch (op) {
    case '=':
      return c === 0;
    case '<>':
      return c !== 0;
    case '<':
      return c < 0;
    case '>':
      return c > 0;
    case '<=':
      return c <= 0;
    default:
      return c >= 0;
  }
}

function refTarget(node: Node, host: Host): RefTarget | null {
  if (node.t !== 'ref') return null;
  let sheet = host.sheet;
  if (node.sheet !== null) {
    const found = host.resolveSheet(node.sheet);
    if (!found) throw new XlError(REF);
    sheet = found;
  }
  if (node.kind === 'cell') {
    const pos = parseCellAddress(node.address);
    if (!pos) throw new XlError(REF);
    return { sheet, range: { startRow: pos.row, startCol: pos.col, endRow: pos.row, endCol: pos.col } };
  }
  const range = host.parseRange(node.address, sheet);
  if (!range) throw new XlError(REF);
  return { sheet, range };
}

function evalNode(node: Node, ev: Evaluator): Value {
  const host = ev.host;
  switch (node.t) {
    case 'num':
    case 'str':
    case 'bool':
      return node.v;
    case 'empty':
      return null;
    case 'err':
      throw new XlError(node.code === '#N/A' ? N_D : node.code === '#VALUE!' ? VALOR : node.code === '#NUM!' ? NUM : node.code === '#NAME?' ? NOME : node.code);
    case 'ref': {
      const target = refTarget(node, host)!;
      const { sheet, range } = target;
      try {
        if (node.kind === 'cell') return host.readCell(sheet, range.startRow, range.startCol);
        return host.readRange(sheet, range);
      } catch (error) {
        throw asXlError(error);
      }
    }
    case 'neg':
      return mapMatrix(ev.value(node.x), v => -toNumber(v));
    case 'pos':
      return ev.value(node.x);
    case 'pct':
      return mapMatrix(ev.value(node.x), v => toNumber(v) / 100);
    case 'arr':
      return node.rows.map(row =>
        row.map(cell => {
          const v = ev.value(cell);
          return isMatrix(v) ? (v[0]?.[0] ?? null) : v;
        })
      );
    case 'bin': {
      const l = ev.value(node.l);
      const r = ev.value(node.r);
      if (node.op === '&') return broadcast(l, r, (x, y) => toText(x) + toText(y));
      if (node.op === '+' || node.op === '-' || node.op === '*' || node.op === '/' || node.op === '^') {
        const op = node.op;
        return broadcast(l, r, (x, y) => arithmetic(op, x, y));
      }
      const op = node.op;
      return broadcast(l, r, (x, y) => compare(op, x, y));
    }
    case 'call': {
      const name = node.name.toUpperCase();
      const native = NATIVE_FUNCTIONS.get(name);
      const call = new Call(name, node.args, ev);
      if (native && (typeof native.override === 'function' ? native.override(call) : native.override)) return native.fn(call);
      let legacy: { found: boolean; value?: unknown };
      try {
        legacy = host.legacy(
          name,
          node.args.map(a => nodeText(ev.text, a))
        );
      } catch (error) {
        throw asXlError(error);
      }
      if (legacy.found) return legacy.value as Value;
      if (native) return native.fn(call);
      throw new XlError(NOME);
    }
  }
}

/** Avalia o texto de uma expressão (sem o "=") com o `host` dado. Erros viram `XlError`. */
export function evaluateText(text: string, host: Host): Value {
  let node: Node;
  try {
    node = parseExpression(text);
  } catch (error) {
    if (error instanceof ParseError) throw new XlError(NOME);
    throw error;
  }
  const ev: Evaluator = {
    text,
    host,
    value: n => evalNode(n, ev),
    ref: n => refTarget(n, host),
    evalText: t => evaluateText(t, host),
  };
  return evalNode(node, ev);
}

