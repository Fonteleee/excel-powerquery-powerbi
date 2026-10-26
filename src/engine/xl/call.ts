// src/engine/xl/call.ts
// Contrato entre o interpretador e as funções nativas. A `Call` entrega os argumentos já convertidos,
// avaliando-os só quando pedidos (SE, SEERRO etc. não avaliam o ramo que não usam).

import { CellRange, Sheet } from '../../types/spreadsheet';
import { Node } from './parser';
import { flatten, isBlank, isErrorValue, isMatrix, Matrix, Scalar, toBool, toMatrix, toNumber, toScalar, toText, Value, VALOR, XlError } from './values';

export interface RefTarget {
  sheet: Sheet;
  range: CellRange;
}

/** O que o interpretador precisa do restante do sistema (leitura de células, abas e funções antigas). */
export interface Host {
  sheet: Sheet;
  allSheets: Sheet[];
  resolveSheet(name: string): Sheet | undefined;
  readCell(sheet: Sheet, row: number, col: number): Scalar;
  readRange(sheet: Sheet, range: CellRange): Matrix;
  parseRange(address: string, sheet: Sheet): CellRange | null;
  /** Funções do motor antigo (recebem o texto dos argumentos). `found: false` se o nome não existe lá. */
  legacy(name: string, args: string[]): { found: boolean; value?: unknown };
}

export interface Evaluator {
  text: string;
  host: Host;
  value(node: Node): Value;
  ref(node: Node): RefTarget | null;
  /** Avalia um texto de expressão (INDIRETO) no mesmo contexto. */
  evalText(text: string): Value;
}

export class Call {
  constructor(
    readonly name: string,
    readonly nodes: Node[],
    readonly ev: Evaluator
  ) {}

  get length(): number {
    return this.nodes.length;
  }

  /** O argumento foi informado (não foi omitido nem está vazio)? */
  has(i: number): boolean {
    return i < this.nodes.length && this.nodes[i].t !== 'empty';
  }

  /** Exige entre `min` e `max` argumentos. */
  expect(min: number, max = min): void {
    if (this.nodes.length < min || this.nodes.length > max) throw new XlError(VALOR);
  }

  node(i: number): Node {
    return this.nodes[i];
  }

  /** Valor avaliado (pode ser matriz). Argumento omitido vale vazio. */
  value(i: number): Value {
    return this.has(i) ? this.ev.value(this.nodes[i]) : null;
  }

  scalar(i: number): Scalar {
    return toScalar(this.value(i));
  }

  matrix(i: number): Matrix {
    return toMatrix(this.value(i));
  }

  flat(i: number): Scalar[] {
    return flatten(this.value(i));
  }

  num(i: number, fallback?: number): number {
    if (!this.has(i)) {
      if (fallback !== undefined) return fallback;
      throw new XlError(VALOR);
    }
    return toNumber(this.scalar(i));
  }

  int(i: number, fallback?: number): number {
    return Math.trunc(this.num(i, fallback));
  }

  text(i: number, fallback?: string): string {
    if (!this.has(i)) {
      if (fallback !== undefined) return fallback;
      throw new XlError(VALOR);
    }
    return toText(this.scalar(i));
  }

  bool(i: number, fallback?: boolean): boolean {
    if (!this.has(i)) {
      if (fallback !== undefined) return fallback;
      throw new XlError(VALOR);
    }
    return toBool(this.scalar(i));
  }

  /** Referência (aba + intervalo) de um argumento que é uma referência; null se for outra coisa. */
  ref(i: number): RefTarget | null {
    return this.has(i) ? this.ev.ref(this.nodes[i]) : null;
  }

  /**
   * Números de todos os argumentos, no estilo de SOMA/MÉDIA: em intervalos e matrizes só contam números
   * (texto, lógico e vazio são ignorados); argumentos diretos são convertidos (VERDADEIRO = 1, "3" = 3).
   * Erros nos dados propagam.
   */
  numbers(from = 0, to = this.nodes.length): number[] {
    const out: number[] = [];
    for (let i = from; i < to; i++) {
      if (!this.has(i)) continue;
      const v = this.value(i);
      if (isMatrix(v)) {
        for (const cell of v.flat()) {
          if (isErrorValue(cell)) throw new XlError(String(cell));
          if (typeof cell === 'number') out.push(cell);
        }
      } else {
        if (isErrorValue(v)) throw new XlError(String(v));
        if (isBlank(v)) continue;
        out.push(toNumber(v));
      }
    }
    return out;
  }
}
