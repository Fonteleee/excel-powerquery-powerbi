// src/engine/recalc/incremental.ts
// Recálculo incremental da pasta de trabalho para a interface: dado o estado anterior e o novo (já com as
// edições), descobre quais células mudaram e recalcula só o que depende delas, em todas as abas.
// Mantém o RecalcEngine (grafo de dependências) entre edições; se o estado não for o que o motor conhece
// (importação, desfazer, abas novas), o grafo é reconstruído. Casos estruturais caem no recálculo completo.

import { Sheet } from '../../types/spreadsheet';
import { CellChange, RecalcEngine } from './engine';
import { getRecalcEngine, recalculateSheet } from './recalculate';

export type UpdateMode = 'none' | 'incremental' | 'full';

export interface UpdateReport {
  mode: UpdateMode;
  /** Células alteradas detectadas (só no modo incremental). */
  changed: number;
  /** Fórmulas recalculadas. */
  recalculated: number;
}

export interface UpdateOptions {
  /** Acima deste número de células alteradas, o recálculo completo sai mais barato (padrão 5000). */
  maxIncremental?: number;
}

const DEFAULT_MAX_INCREMENTAL = 5000;
const KEY_PATTERN = /^R(\d+)C(\d+)$/;

type CellMap = Sheet['data'];
type Cell = CellMap[string];

/** A célula mudou de conteúdo? (só formato/estilo não conta). `a` e `b` podem ser undefined (ausente). */
function contentChanged(a: Cell | undefined, b: Cell | undefined): boolean {
  if (a === b) return false;
  const blank = (c: Cell | undefined): boolean =>
    c === undefined || ((c.raw === '' || c.raw === undefined) && (c.value === '' || c.value === null || c.value === undefined));
  if (blank(a) && blank(b)) return false;
  if (a === undefined || b === undefined) return true;
  return a.raw !== b.raw || a.value !== b.value;
}

const edits = new WeakMap<object, { base: CellMap; keys: readonly string[] }>();

/**
 * A grade sabe quais células editou: registra isso para o recálculo não precisar comparar as 400 mil células.
 * `keys` deve ser um superconjunto das células alteradas em `next` em relação a `base`.
 */
export function declareEdit(base: CellMap, next: CellMap, keys: Iterable<string>): void {
  edits.set(next, { base, keys: [...keys] });
}

/**
 * Células que mudaram entre `prev` e `next` (conteúdo: `raw` ou `value`; só formato não conta).
 * Retorna null quando passa de `limit`, ou quando uma chave não é de célula.
 */
export function diffCells(prev: CellMap, next: CellMap, limit: number, hintKeys?: readonly string[]): { row: number; col: number }[] | null {
  const out: { row: number; col: number }[] = [];
  const push = (key: string): boolean => {
    const m = KEY_PATTERN.exec(key);
    if (!m) return false;
    out.push({ row: Number(m[1]), col: Number(m[2]) });
    return out.length <= limit;
  };
  if (hintKeys) {
    for (const key of hintKeys) if (contentChanged(next[key], prev[key]) && !push(key)) return null;
    return out;
  }
  for (const key in next) {
    if (contentChanged(next[key], prev[key]) && !push(key)) return null;
  }
  for (const key in prev) {
    if (!(key in next) && contentChanged(undefined, prev[key]) && !push(key)) return null;
  }
  return out;
}

/** Mesma lista de abas (ids, ordem, nomes) e mesmas dimensões: o grafo existente continua válido. */
function sameLayout(prev: readonly Sheet[], next: readonly Sheet[]): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (a.id !== b.id || a.name !== b.name || a.rowCount !== b.rowCount || a.colCount !== b.colCount) return false;
  }
  return true;
}

export class WorkbookRecalculator {
  private engine: RecalcEngine | null = null;
  /** Mapas `data` que o grafo do motor representa (por aba). */
  private known = new Map<string, CellMap>();

  /** Esquece o grafo (próxima edição o reconstrói). */
  reset(): void {
    this.engine = null;
    this.known.clear();
  }

  /** O grafo atual corresponde exatamente a `sheets`? */
  isSynced(sheets: readonly Sheet[]): boolean {
    if (!this.engine || this.known.size !== sheets.length) return false;
    return sheets.every(s => this.known.get(s.id) === s.data);
  }

  /** Prepara o grafo para `sheets` (chamar com a tela ociosa para a primeira edição não pagar a montagem). */
  warm(sheets: readonly Sheet[]): void {
    if (this.isSynced(sheets) || getRecalcEngine() === 'legacy') return;
    this.engine = new RecalcEngine(sheets);
    this.remember(sheets);
  }

  /**
   * Recalcula `next` (o estado com as edições) a partir de `prev` (o estado anterior, já calculado).
   * O mapa `data` das abas editadas é alterado no lugar (o chamador entrega uma cópia própria); as abas que
   * dependem delas são copiadas só se mudarem. `prev` nunca é alterado.
   */
  update(prev: readonly Sheet[], next: readonly Sheet[], options: UpdateOptions = {}): { sheets: Sheet[]; report: UpdateReport } {
    if (getRecalcEngine() === 'legacy') return this.full(next, true);

    const edited = next.filter(s => prev.find(p => p.id === s.id)?.data !== s.data);
    if (sameLayout(prev, next) && edited.length === 0) {
      return { sheets: next.slice(), report: { mode: 'none', changed: 0, recalculated: 0 } };
    }
    if (!sameLayout(prev, next)) return this.full(next);

    const limit = options.maxIncremental ?? DEFAULT_MAX_INCREMENTAL;
    const changes: CellChange[] = [];
    for (const sheet of edited) {
      const before = prev.find(p => p.id === sheet.id)!;
      const hint = edits.get(sheet.data);
      const diff = diffCells(before.data, sheet.data, limit - changes.length, hint && hint.base === before.data ? hint.keys : undefined);
      if (!diff) return this.full(next);
      for (const c of diff) changes.push({ sheetId: sheet.id, row: c.row, col: c.col });
    }
    if (changes.length === 0) {
      // Só formato/estilo mudou: nada a recalcular, mas o grafo passa a representar o novo estado.
      if (this.isSynced(prev)) this.remember(next);
      return { sheets: next.slice(), report: { mode: 'none', changed: 0, recalculated: 0 } };
    }

    if (!this.isSynced(prev)) {
      this.engine = new RecalcEngine(prev);
      this.known.clear();
    }
    const result = this.engine!.apply(next, changes, { inPlace: new Set(edited.map(s => s.id)) });
    this.remember(result.sheets);
    return { sheets: result.sheets, report: { mode: 'incremental', changed: changes.length, recalculated: result.recalculated } };
  }

  /** Recálculo completo de todas as abas, uma única vez. */
  private full(next: readonly Sheet[], legacy = false): { sheets: Sheet[]; report: UpdateReport } {
    if (legacy) {
      this.reset();
      return { sheets: next.map(s => recalculateSheet(s, next as Sheet[])), report: { mode: 'full', changed: 0, recalculated: 0 } };
    }
    const engine = new RecalcEngine(next);
    const result = engine.recalculateWorkbook(next);
    this.engine = engine;
    this.remember(result.sheets);
    return { sheets: result.sheets, report: { mode: 'full', changed: 0, recalculated: result.recalculated } };
  }

  private remember(sheets: readonly Sheet[]): void {
    this.known = new Map(sheets.map(s => [s.id, s.data]));
  }
}
