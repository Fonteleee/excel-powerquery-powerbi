// src/engine/recalc/service.ts
// Serviço de recálculo: dono do estado das abas e do grafo. Roda dentro do worker ou, no
// fallback síncrono, na própria thread. Lógica pura, sem dependência de Worker/DOM.

import { CellData, Sheet } from '../../types/spreadsheet';
import { cellPosToKey } from '../formulas/addressing';
import { evaluateGraph, NodeResult } from '../../features/relations/runtime/evaluate';
import { downstreamOf } from '../../features/relations/model/dag';
import { FlowGraph } from '../../features/relations/model/graph';
import { RecalcEngine, RecalcResult } from './engine';
import {
  CellEdit,
  CellPatch,
  FlowEvaluateOptions,
  FlowEvaluation,
  RecalcApi,
  RecalcDelta,
} from './protocol';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class RecalcService implements RecalcApi {
  private sheets: Sheet[] = [];
  private engine: RecalcEngine | null = null;
  private flowResults = new Map<string, NodeResult>();
  private flowNodes = new Map<string, string>();
  private dirtySheets = new Set<string>();

  ping(): string {
    return 'ok';
  }

  init(sheets: Sheet[]): RecalcDelta {
    // Cópia rasa do mapa: o motor grava in-place e não pode alterar o estado de quem chamou.
    this.sheets = sheets.map(s => ({ ...s, data: { ...s.data } }));
    this.engine = new RecalcEngine(this.sheets);
    this.flowResults = new Map();
    this.flowNodes = new Map();
    this.dirtySheets = new Set(this.sheets.map(s => s.id));
    const t0 = now();
    const result = this.engine.recalculateWorkbook(this.sheets, { inPlace: true });
    return this.delta(result, [], t0);
  }

  applyEdits(edits: CellEdit[]): RecalcDelta {
    const engine = this.requireEngine();
    const t0 = now();
    const byId = new Map(this.sheets.map(s => [s.id, s]));
    const changes = [];
    for (const edit of edits) {
      const sheet = byId.get(edit.sheetId);
      if (!sheet) continue;
      const key = cellPosToKey(edit.row, edit.col);
      if (edit.raw === '') delete sheet.data[key];
      else {
        const previous = sheet.data[key];
        const cell: CellData = { raw: edit.raw, value: edit.raw.startsWith('=') ? null : edit.raw };
        if (previous?.format) cell.format = previous.format;
        sheet.data[key] = cell;
      }
      this.dirtySheets.add(sheet.id);
      changes.push({ sheetId: edit.sheetId, row: edit.row, col: edit.col });
    }
    const result = engine.apply(this.sheets, changes, { inPlace: true });
    return this.delta(result, changes.map(c => ({ sheetId: c.sheetId, dataKey: cellPosToKey(c.row, c.col) })), t0);
  }

  replaceSheet(sheet: Sheet): RecalcDelta {
    const copy = { ...sheet, data: { ...sheet.data } };
    const at = this.sheets.findIndex(s => s.id === sheet.id);
    const all = at >= 0 ? this.sheets.map((s, i) => (i === at ? copy : s)) : [...this.sheets, copy];
    const delta = this.init(all);
    this.dirtySheets = new Set([sheet.id]);
    return delta;
  }

  evaluateFlow(graph: FlowGraph, options: FlowEvaluateOptions = {}): FlowEvaluation {
    const limit = options.rowLimit ?? 200;
    const signatures = new Map(graph.nodes.map(n => [n.id, JSON.stringify([n, graph.edges.filter(e => e.to === n.id)])]));
    const changedNodes = graph.nodes
      .filter(n => this.flowNodes.get(n.id) !== signatures.get(n.id) || (n.kind === 'table' && this.dirtySheets.has(n.sheetId)))
      .map(n => n.id);
    const dirty = downstreamOf(graph, changedNodes);
    const results = evaluateGraph(graph, this.sheets, { previous: this.flowResults, dirty });

    this.flowResults = new Map(results);
    this.flowNodes = signatures;
    this.dirtySheets.clear();

    const nodes: FlowEvaluation['nodes'] = {};
    for (const [id, r] of results) {
      nodes[id] = {
        error: r.error,
        rootCause: r.rootCause,
        headers: r.table?.headers ?? [],
        totalRows: r.table?.rows.length ?? 0,
        rows: r.table ? r.table.rows.slice(0, limit) : [],
      };
    }
    return { nodes, evaluated: [...dirty].filter(id => results.has(id)) };
  }

  private requireEngine(): RecalcEngine {
    if (!this.engine) throw new Error('RecalcService: chame init(sheets) antes.');
    return this.engine;
  }

  private delta(result: RecalcResult, extra: { sheetId: string; dataKey: string }[], t0: number): RecalcDelta {
    const seen = new Set<string>();
    const patches: CellPatch[] = [];
    const byId = new Map(this.sheets.map(s => [s.id, s]));
    for (const { sheetId, dataKey } of [...extra, ...result.touched]) {
      const id = `${sheetId}\u0001${dataKey}`;
      if (seen.has(id)) continue;
      seen.add(id);
      patches.push({ sheetId, key: dataKey, cell: byId.get(sheetId)?.data[dataKey] ?? null });
    }
    return { patches, recalculated: result.recalculated, cycles: result.cycles, elapsedMs: now() - t0 };
  }
}
