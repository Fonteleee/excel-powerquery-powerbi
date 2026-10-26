// src/engine/recalc/engine.ts
// Motor de recálculo por grafo de dependências: recalcula só o ramo afetado, em ordem topológica,
// com cache de intervalos/índices por rodada, matrizes dinâmicas e detecção de referência circular.

import { CellData, CellRange, Sheet } from '../../types/spreadsheet';
import { cellPosToAddress, cellPosToKey } from '../formulas/addressing';
import { evaluateFormula } from '../formulas/evaluator';
import { createSession, withSession } from '../formulas/session';
import {
  CycleReport,
  DependencyGraph,
  Position,
  nodeKey,
  nodeKeyFromDataKey,
} from './dependencyGraph';
import { SheetNameIndex, extractReferences } from './references';
import { clearAllSpillCells, clearSpillCells, isFormula, writeFormulaResult } from './spill';

export const CIRCULAR_ERROR = '#CIRCULAR!';
const MAX_SPILL_ROUNDS = 5;

export interface CellChange {
  sheetId: string;
  row: number;
  col: number;
}

export interface CycleMessage {
  /** Células do ciclo, com a aba: "Planilha1!A1". */
  cells: string[];
  /** Texto pronto para o usuário: "Referência circular: Planilha1!A1 → B1 → A1". */
  message: string;
}

export interface RecalcStats {
  /** Fórmulas conhecidas pelo grafo. */
  formulas: number;
  /** Fórmulas efetivamente recalculadas nesta chamada. */
  recalculated: number;
  planMs: number;
  evalMs: number;
  rangeCacheHits: number;
  rangeCacheMisses: number;
  indexedLookups: number;
  linearLookups: number;
  spillRounds: number;
}

export interface RecalcResult {
  /** Planilhas após o recálculo. Abas não afetadas mantêm a mesma referência (copy-on-write). */
  sheets: Sheet[];
  /** Células escritas pelo recálculo (fórmulas, células derramadas criadas/limpas e erros de ciclo). */
  touched: { sheetId: string; dataKey: string }[];
  recalculated: number;
  cycles: CycleMessage[];
  stats: RecalcStats;
}

export interface ApplyOptions {
  /**
   * Altera o mapa data das planilhas recebidas em vez de copiá-lo (copy-on-write). Use quando o chamador é
   * o dono do estado (ex.: o worker), pois a cópia de uma aba de 100 mil linhas custa mais que o recálculo.
   */
  inPlace?: boolean;
}

interface RunOptions {
  /** Aba cujo cache pode ser confiado além das células recalculadas (null = todas). */
  trustedSheetId: string | null;
  /** Abas cujas células derramadas são limpas antes de calcular (recálculo completo). */
  clearSpillsOf: readonly string[];
  inPlace?: boolean;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function sameRange(a: CellRange | undefined, b: CellRange | undefined): boolean {
  if (!a || !b) return a === b;
  return a.startRow === b.startRow && a.startCol === b.startCol && a.endRow === b.endRow && a.endCol === b.endCol;
}

const KEY_PATTERN = /^R(\d+)C(\d+)$/;

export class RecalcEngine {
  private graph = new DependencyGraph();
  /** Abas que tinham células derramadas quando o grafo foi montado (evita varrer abas sem matrizes). */
  private sheetsWithSpills = new Set<string>();

  /**
   * @param sheets planilhas do workbook
   * @param onlySheetId quando informado, só as fórmulas dessa aba entram no grafo (recálculo de uma aba)
   */
  constructor(sheets: readonly Sheet[], onlySheetId?: string) {
    this.load(sheets, onlySheetId);
  }

  /** Número de fórmulas no grafo. */
  get formulaCount(): number {
    return this.graph.size;
  }

  /** Reconstrói o grafo a partir das planilhas (use após mudanças estruturais: linhas/colunas/abas). */
  load(sheets: readonly Sheet[], onlySheetId?: string): void {
    this.graph = new DependencyGraph();
    this.sheetsWithSpills = new Set();
    const names = new SheetNameIndex(sheets);
    for (const sheet of sheets) {
      if (onlySheetId !== undefined && sheet.id !== onlySheetId) continue;
      for (const key in sheet.data) {
        const cell = sheet.data[key];
        if (cell.isSpill) this.sheetsWithSpills.add(sheet.id);
        if (!isFormula(cell.raw)) continue;
        const m = KEY_PATTERN.exec(key);
        if (!m) continue;
        const row = Number(m[1]);
        const col = Number(m[2]);
        this.graph.setFormula(sheet.id, row, col, extractReferences(cell.raw, sheet.id, names));
        if (cell.spillRange) this.graph.setSpill(nodeKey(sheet.id, row, col), sheet.id, cell.spillRange);
      }
    }
  }

  /** Recalcula todas as fórmulas do grafo (usado por `recalculateSheet`). */
  recalculateAll(sheets: readonly Sheet[], targetSheetId: string): RecalcResult {
    return this.execute(sheets, [], [...this.graph.keys()], {
      trustedSheetId: targetSheetId,
      clearSpillsOf: this.sheetsWithSpills.has(targetSheetId) ? [targetSheetId] : [],
    });
  }

  /**
   * Recalcula TODAS as fórmulas de TODAS as abas carregadas (carga inicial do worker).
   * Com inPlace, altera os mapas data recebidos em vez de copiá-los.
   */
  recalculateWorkbook(sheets: readonly Sheet[], applyOptions: ApplyOptions = {}): RecalcResult {
    return this.execute(sheets, [], [...this.graph.keys()], {
      trustedSheetId: null,
      clearSpillsOf: [...this.sheetsWithSpills],
      inPlace: applyOptions.inPlace,
    });
  }

  /**
   * Recalcula só o que depende das células alteradas. `sheets` já deve conter as edições
   * (o novo `raw` das células). Fórmulas voláteis (HOJE) são sempre recalculadas.
   */
  apply(sheets: readonly Sheet[], changes: readonly CellChange[], applyOptions: ApplyOptions = {}): RecalcResult {
    const names = new SheetNameIndex(sheets);
    const byId = new Map(sheets.map(s => [s.id, s]));
    const seeds: Position[] = [];
    const forced: string[] = [...this.graph.volatiles()];
    const spillsToClear: { sheetId: string; parent: string }[] = [];

    for (const change of changes) {
      const sheet = byId.get(change.sheetId);
      if (!sheet) continue;
      const key = nodeKey(change.sheetId, change.row, change.col);
      const cell = sheet.data[cellPosToKey(change.row, change.col)];

      if (this.graph.spillOf(key)) spillsToClear.push({ sheetId: change.sheetId, parent: key });
      const owner = this.graph.spillOwnerAt(change);
      if (owner && owner !== key) forced.push(owner);

      if (cell && isFormula(cell.raw)) {
        this.graph.setFormula(change.sheetId, change.row, change.col, extractReferences(cell.raw, change.sheetId, names));
      } else {
        this.graph.removeFormula(key);
      }
      seeds.push({ sheetId: change.sheetId, row: change.row, col: change.col });
    }

    return this.execute(
      sheets,
      seeds,
      forced,
      { trustedSheetId: null, clearSpillsOf: [], inPlace: applyOptions.inPlace },
      spillsToClear
    );
  }

  // ------------------------------------------------------------------

  private execute(
    sheets: readonly Sheet[],
    initialSeeds: Position[],
    initialForced: string[],
    options: RunOptions,
    spillsToClear: { sheetId: string; parent: string }[] = []
  ): RecalcResult {
    const work: Sheet[] = sheets.slice();
    const indexById = new Map(work.map((s, i) => [s.id, i]));
    const owned = new Set<string>();
    const ensure = (sheetId: string): Sheet => {
      const i = indexById.get(sheetId)!;
      if (!owned.has(sheetId)) {
        work[i] = options.inPlace ? work[i] : { ...work[i], data: { ...work[i].data } };
        owned.add(sheetId);
      }
      return work[i];
    };

    const touched = new Map<string, { sheetId: string; dataKey: string }>();
    const touch = (sheetId: string, dataKey: string): void => {
      const k = nodeKeyFromDataKey(sheetId, dataKey);
      if (!touched.has(k)) touched.set(k, { sheetId, dataKey });
    };

    const seeds = initialSeeds.slice();
    for (const sheetId of options.clearSpillsOf) {
      if (indexById.has(sheetId)) clearAllSpillCells(ensure(sheetId).data);
    }
    for (const { sheetId, parent } of spillsToClear) {
      if (!indexById.has(sheetId)) continue;
      const range = this.graph.spillOf(parent);
      const dataKey = parent.slice(parent.indexOf('\u0001') + 1);
      const cleared = clearSpillCells(ensure(sheetId).data, dataKey, range);
      touch(sheetId, dataKey);
      for (const k of cleared) {
        touch(sheetId, k);
        const m = KEY_PATTERN.exec(k);
        if (m) seeds.push({ sheetId, row: Number(m[1]), col: Number(m[2]) });
      }
      this.graph.clearSpill(parent);
    }

    let pending = new Set<string>();
    const trusted = options.trustedSheetId;
    const session = createSession({
      isFresh: (sheetId, cellKey) =>
        (trusted === null || sheetId === trusted) && !pending.has(nodeKeyFromDataKey(sheetId, cellKey)),
      isPending: (sheetId, cellKey) => pending.has(nodeKeyFromDataKey(sheetId, cellKey)),
    });

    const cycles: CycleMessage[] = [];
    let recalculated = 0;
    let planMs = 0;
    let evalMs = 0;
    let rounds = 0;

    withSession(session, () => {
      let roundSeeds = seeds;
      let roundForced: Iterable<string> = initialForced;
      for (;;) {
        const t0 = now();
        const plan = this.graph.plan(roundSeeds, roundForced);
        planMs += now() - t0;

        pending = new Set(plan.order);
        for (const cycle of plan.cycles) for (const member of cycle.members) pending.add(member);

        const t1 = now();
        for (const cycle of plan.cycles) {
          const described = this.describeCycle(cycle, work);
          cycles.push(described);
          this.markCircular(cycle, described.message, ensure, pending);
          for (const member of cycle.members) {
            const n = this.graph.get(member);
            if (n) touch(n.sheetId, cellPosToKey(n.row, n.col));
          }
        }

        const late: Position[] = [];
        for (const key of plan.order) {
          const node = this.graph.get(key);
          pending.delete(key);
          if (!node) continue;
          const ws = ensure(node.sheetId);
          const dataKey = cellPosToKey(node.row, node.col);
          const cell = ws.data[dataKey];
          if (!cell || !isFormula(cell.raw)) continue;

          let outcomeSpill: CellRange | undefined;
          try {
            // A própria célula entra na pilha: ela é ignorada ao ler intervalos que a contêm.
            const value = evaluateFormula(cell.raw, ws, work, new Set([`${ws.id}:${dataKey}`]));
            const outcome = writeFormulaResult(ws.data, dataKey, node.row, node.col, cell, value);
            outcomeSpill = outcome.spill;
            for (const k of outcome.touched) touch(node.sheetId, k);
          } catch (err) {
            clearSpillCells(ws.data, dataKey, cell.spillRange);
            const message = err instanceof Error && err.message ? err.message : '#ERRO!';
            ws.data[dataKey] = { ...cell, value: '#ERRO!', error: message, spillRange: undefined };
          }
          recalculated++;
          touch(node.sheetId, dataKey);

          const previous = this.graph.spillOf(key);
          if (outcomeSpill) this.graph.setSpill(key, node.sheetId, outcomeSpill);
          else if (previous) this.graph.clearSpill(key);
          if (!sameRange(previous, outcomeSpill)) this.collectSpillDelta(late, node, previous, outcomeSpill);
        }
        evalMs += now() - t1;

        if (late.length === 0 || ++rounds >= MAX_SPILL_ROUNDS) break;
        roundSeeds = late;
        roundForced = [];
      }
    });

    return {
      sheets: work,
      touched: [...touched.values()],
      recalculated,
      cycles,
      stats: {
        formulas: this.graph.size,
        recalculated,
        planMs,
        evalMs,
        rangeCacheHits: session.stats.rangeHits,
        rangeCacheMisses: session.stats.rangeMisses,
        indexedLookups: session.stats.indexedLookups,
        linearLookups: session.stats.linearLookups,
        spillRounds: rounds,
      },
    };
  }

  /** Posições cobertas pela extensão antiga ou nova (menos a origem): consumidores precisam reavaliar. */
  private collectSpillDelta(
    out: Position[],
    node: { sheetId: string; row: number; col: number },
    previous: CellRange | undefined,
    next: CellRange | undefined
  ): void {
    const seen = new Set<string>();
    for (const range of [previous, next]) {
      if (!range) continue;
      for (let r = range.startRow; r <= range.endRow; r++) {
        for (let c = range.startCol; c <= range.endCol; c++) {
          if (r === node.row && c === node.col) continue;
          const k = `${r}:${c}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ sheetId: node.sheetId, row: r, col: c });
        }
      }
    }
  }

  private markCircular(
    cycle: CycleReport,
    message: string,
    ensure: (sheetId: string) => Sheet,
    pending: Set<string>
  ): void {
    for (const member of cycle.members) {
      pending.delete(member);
      const node = this.graph.get(member);
      if (!node) continue;
      const ws = ensure(node.sheetId);
      const dataKey = cellPosToKey(node.row, node.col);
      const cell = ws.data[dataKey];
      if (!cell) continue;
      clearSpillCells(ws.data, dataKey, cell.spillRange);
      const next: CellData = {
        ...cell,
        value: CIRCULAR_ERROR,
        error: CIRCULAR_ERROR,
        errorDetail: message,
        spillRange: undefined,
      };
      ws.data[dataKey] = next;
      this.graph.clearSpill(member);
    }
  }

  private describeCycle(cycle: CycleReport, sheets: readonly Sheet[]): CycleMessage {
    const names = new Map(sheets.map(s => [s.id, s.name]));
    return {
      cells: cycle.members.map(m => this.qualifiedAddress(m, names)),
      message: this.cycleText(cycle, names),
    };
  }

  private qualifiedAddress(key: string, names: Map<string, string> | null): string {
    const node = this.graph.get(key);
    if (!node) return key;
    const address = cellPosToAddress({ row: node.row, col: node.col });
    const sheetName = names?.get(node.sheetId);
    return sheetName ? `${sheetName}!${address}` : address;
  }

  private cycleText(cycle: CycleReport, names: Map<string, string> | null): string {
    const parts = cycle.path.map((k, i) => {
      const node = this.graph.get(k);
      if (!node) return k;
      const address = cellPosToAddress({ row: node.row, col: node.col });
      const first = names && i === 0 ? names.get(node.sheetId) : undefined;
      return first ? `${first}!${address}` : address;
    });
    return `Referência circular: ${parts.join(' → ')}`;
  }
}
