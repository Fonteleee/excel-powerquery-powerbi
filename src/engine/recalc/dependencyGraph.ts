// src/engine/recalc/dependencyGraph.ts
// Grafo de dependências célula -> dependentes. Intervalos NÃO são expandidos célula a célula: cada
// intervalo distinto é um "nó virtual" indexado por coluna, com o conjunto de fórmulas que o usam.
// Assim, 10 mil fórmulas que consultam `Cadastro!A:A` custam um único nó de intervalo.

import { CellRange } from '../../types/spreadsheet';
import { FormulaRefs, RangeRef } from './references';

const SEP = '\u0001';

/** Chave única da célula no workbook: `${abaId}\u0001R{linha}C{coluna}`. */
export function nodeKey(sheetId: string, row: number, col: number): string {
  return `${sheetId}${SEP}R${row}C${col}`;
}

/** Chave de nó a partir da chave de dados da célula (R{linha}C{coluna}). */
export function nodeKeyFromDataKey(sheetId: string, dataKey: string): string {
  return sheetId + SEP + dataKey;
}

export function splitNodeKey(key: string): { sheetId: string; dataKey: string } {
  const i = key.indexOf(SEP);
  return { sheetId: key.slice(0, i), dataKey: key.slice(i + 1) };
}

export interface FormulaNode {
  key: string;
  sheetId: string;
  row: number;
  col: number;
  refs: FormulaRefs;
}

interface RangeNode {
  id: string;
  sheetId: string;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  dependents: Set<string>;
}

export interface Position {
  sheetId: string;
  row: number;
  col: number;
}

export interface CycleReport {
  /** Fórmulas que participam do ciclo (chaves de nó). */
  members: string[];
  /** Um caminho fechado dentro do ciclo, ex.: [A1, B1, A1]. */
  path: string[];
}

export interface RecalcPlan {
  /** Fórmulas a calcular, em ordem topológica (dependências primeiro). */
  order: string[];
  cycles: CycleReport[];
}

const rangeId = (r: RangeRef): string => `${r.sheetId}${SEP}${r.startRow}:${r.startCol}:${r.endRow}:${r.endCol}`;
const columnKey = (sheetId: string, col: number): string => `${sheetId}${SEP}${col}`;
const RANGE_PREFIX = '\u0002';

export class DependencyGraph {
  private readonly formulas = new Map<string, FormulaNode>();
  private readonly cellDependents = new Map<string, Set<string>>();
  private readonly ranges = new Map<string, RangeNode>();
  private readonly rangesByColumn = new Map<string, RangeNode[]>();
  private readonly spills = new Map<string, CellRange>();
  private readonly spillsBySheet = new Map<string, Set<string>>();
  private readonly volatileKeys = new Set<string>();

  get size(): number {
    return this.formulas.size;
  }

  get rangeNodeCount(): number {
    return this.ranges.size;
  }

  has(key: string): boolean {
    return this.formulas.has(key);
  }

  get(key: string): FormulaNode | undefined {
    return this.formulas.get(key);
  }

  keys(): IterableIterator<string> {
    return this.formulas.keys();
  }

  volatiles(): ReadonlySet<string> {
    return this.volatileKeys;
  }

  // ---------- manutenção ----------

  /** Registra (ou substitui) a fórmula de uma célula. */
  setFormula(sheetId: string, row: number, col: number, refs: FormulaRefs): void {
    const key = nodeKey(sheetId, row, col);
    if (this.formulas.has(key)) this.removeFormula(key);
    this.formulas.set(key, { key, sheetId, row, col, refs });
    if (refs.volatile) this.volatileKeys.add(key);

    for (const ref of refs.cells) {
      const precedent = nodeKey(ref.sheetId, ref.row, ref.col);
      let set = this.cellDependents.get(precedent);
      if (!set) this.cellDependents.set(precedent, (set = new Set()));
      set.add(key);
    }
    for (const ref of refs.ranges) {
      const id = rangeId(ref);
      let node = this.ranges.get(id);
      if (!node) {
        node = { id, ...ref, dependents: new Set() };
        this.ranges.set(id, node);
        for (let c = ref.startCol; c <= ref.endCol; c++) {
          const ck = columnKey(ref.sheetId, c);
          const list = this.rangesByColumn.get(ck);
          if (list) list.push(node);
          else this.rangesByColumn.set(ck, [node]);
        }
      }
      node.dependents.add(key);
    }
  }

  removeFormula(key: string): void {
    const node = this.formulas.get(key);
    if (!node) return;
    this.formulas.delete(key);
    this.volatileKeys.delete(key);

    for (const ref of node.refs.cells) {
      const precedent = nodeKey(ref.sheetId, ref.row, ref.col);
      const set = this.cellDependents.get(precedent);
      if (!set) continue;
      set.delete(key);
      if (set.size === 0) this.cellDependents.delete(precedent);
    }
    for (const ref of node.refs.ranges) {
      const id = rangeId(ref);
      const range = this.ranges.get(id);
      if (!range) continue;
      range.dependents.delete(key);
      if (range.dependents.size > 0) continue;
      this.ranges.delete(id);
      for (let c = ref.startCol; c <= ref.endCol; c++) {
        const ck = columnKey(ref.sheetId, c);
        const list = this.rangesByColumn.get(ck);
        if (!list) continue;
        const index = list.indexOf(range);
        if (index >= 0) list.splice(index, 1);
        if (list.length === 0) this.rangesByColumn.delete(ck);
      }
    }
  }

  // ---------- matrizes dinâmicas (extensão derramada) ----------

  setSpill(parentKey: string, sheetId: string, range: CellRange): void {
    this.spills.set(parentKey, range);
    let set = this.spillsBySheet.get(sheetId);
    if (!set) this.spillsBySheet.set(sheetId, (set = new Set()));
    set.add(parentKey);
  }

  clearSpill(parentKey: string): void {
    this.spills.delete(parentKey);
    const { sheetId } = splitNodeKey(parentKey);
    this.spillsBySheet.get(sheetId)?.delete(parentKey);
  }

  spillOf(parentKey: string): CellRange | undefined {
    return this.spills.get(parentKey);
  }

  /** Fórmula cuja extensão derramada (ou tentada) cobre a posição, se houver. */
  spillOwnerAt(pos: Position): string | null {
    const owners = this.spillsBySheet.get(pos.sheetId);
    if (!owners) return null;
    for (const parent of owners) {
      const r = this.spills.get(parent);
      if (r && pos.row >= r.startRow && pos.row <= r.endRow && pos.col >= r.startCol && pos.col <= r.endCol) {
        // A própria origem não conta como "dentro" do derramamento.
        const node = this.formulas.get(parent);
        if (node && node.row === pos.row && node.col === pos.col) continue;
        return parent;
      }
    }
    return null;
  }

  // ---------- consultas ----------

  /** Intervalos distintos que contêm a posição. */
  private rangesContaining(sheetId: string, row: number, col: number): RangeNode[] {
    const list = this.rangesByColumn.get(columnKey(sheetId, col));
    if (!list) return [];
    const hit: RangeNode[] = [];
    for (const node of list) if (row >= node.startRow && row <= node.endRow) hit.push(node);
    return hit;
  }

  /** Fórmulas que dependem DIRETAMENTE da posição (por referência de célula ou intervalo). */
  directDependents(pos: Position): string[] {
    const out = new Set<string>();
    const cell = this.cellDependents.get(nodeKey(pos.sheetId, pos.row, pos.col));
    if (cell) for (const f of cell) out.add(f);
    for (const range of this.rangesContaining(pos.sheetId, pos.row, pos.col)) {
      for (const f of range.dependents) out.add(f);
    }
    return [...out];
  }

  // ---------- planejamento ----------

  /**
   * Descobre todas as fórmulas afetadas pelas posições alteradas (`seeds`) e as ordena
   * topologicamente. Fórmulas em `seeds` (e `forced`) entram no plano mesmo sem dependências.
   * Ciclos são detectados e devolvidos em `cycles`; as demais fórmulas seguem em `order`.
   */
  plan(seeds: readonly Position[], forced: Iterable<string> = []): RecalcPlan {
    const dirty = new Set<string>();
    const successors = new Map<string, string[]>();
    const indegree = new Map<string, number>();
    const visitedRanges = new Set<string>();
    const queue: Position[] = [];

    const addEdge = (from: string, to: string): void => {
      const list = successors.get(from);
      if (list) list.push(to);
      else successors.set(from, [to]);
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    };
    const markDirty = (key: string): void => {
      if (dirty.has(key)) return;
      const node = this.formulas.get(key);
      if (!node) return;
      dirty.add(key);
      if (!indegree.has(key)) indegree.set(key, 0);
      queue.push({ sheetId: node.sheetId, row: node.row, col: node.col });
    };

    /** Registra as dependências de uma posição que mudou; `source` é a fórmula que a produz (se for uma). */
    const expand = (sheetId: string, row: number, col: number, source: string | null): void => {
      const cell = this.cellDependents.get(nodeKey(sheetId, row, col));
      if (cell) {
        for (const dependent of cell) {
          markDirty(dependent);
          if (source !== null) addEdge(source, dependent);
        }
      }
      for (const range of this.rangesContaining(sheetId, row, col)) {
        const vertex = RANGE_PREFIX + range.id;
        if (source !== null) addEdge(source, vertex);
        if (visitedRanges.has(range.id)) continue;
        visitedRanges.add(range.id);
        if (!indegree.has(vertex)) indegree.set(vertex, 0);
        for (const dependent of range.dependents) {
          markDirty(dependent);
          addEdge(vertex, dependent);
        }
      }
    };

    for (const key of forced) markDirty(key);
    for (const seed of seeds) {
      const key = nodeKey(seed.sheetId, seed.row, seed.col);
      // Fórmula alterada precisa ser recalculada; célula comum só propaga a mudança aos dependentes.
      if (this.formulas.has(key)) markDirty(key);
      else queue.push(seed);
    }

    for (let head = 0; head < queue.length; head++) {
      const pos = queue[head];
      const key = nodeKey(pos.sheetId, pos.row, pos.col);
      const source = dirty.has(key) ? key : null;
      expand(pos.sheetId, pos.row, pos.col, source);
      // Células derramadas por uma fórmula suja também mudam: seus dependentes seguem a fórmula-mãe.
      const spill = source !== null ? this.spills.get(key) : undefined;
      if (spill) {
        for (let r = spill.startRow; r <= spill.endRow; r++) {
          for (let c = spill.startCol; c <= spill.endCol; c++) {
            if (r === pos.row && c === pos.col) continue;
            expand(pos.sheetId, r, c, source);
          }
        }
      }
    }

    return this.sortTopologically(dirty, successors, indegree);
  }

  private sortTopologically(
    dirty: Set<string>,
    successors: Map<string, string[]>,
    indegree: Map<string, number>
  ): RecalcPlan {
    const order: string[] = [];
    const cycles: CycleReport[] = [];
    const remaining = new Set(indegree.keys());

    const roots = [...remaining].filter(v => indegree.get(v) === 0);
    // Desempate estável: aba, linha, coluna (vértices de intervalo não precisam de ordem própria).
    roots.sort((a, b) => this.compareVertices(a, b));

    const release = (queue: string[], vertex: string): void => {
      for (const next of successors.get(vertex) ?? []) {
        const left = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, left);
        if (left === 0) queue.push(next);
      }
    };

    let queue = roots;
    for (;;) {
      for (let head = 0; head < queue.length; head++) {
        const vertex = queue[head];
        if (!remaining.delete(vertex)) continue;
        if (!vertex.startsWith(RANGE_PREFIX) && dirty.has(vertex)) order.push(vertex);
        release(queue, vertex);
      }
      if (remaining.size === 0) break;

      // Sobrou algo com dependências não resolvidas: ciclo(s). Isola os componentes cíclicos,
      // marca-os como resolvidos e segue com o que depende deles.
      const components = this.cyclicComponents(remaining, successors);
      if (components.length === 0) break;
      queue = [];
      for (const component of components) {
        const members = component.filter(v => !v.startsWith(RANGE_PREFIX));
        cycles.push({ members, path: this.cyclePath(component, successors) });
        for (const vertex of component) {
          remaining.delete(vertex);
        }
      }
      for (const component of components) {
        for (const vertex of component) {
          for (const next of successors.get(vertex) ?? []) {
            if (!remaining.has(next)) continue;
            const left = (indegree.get(next) ?? 0) - 1;
            indegree.set(next, left);
            if (left === 0) queue.push(next);
          }
        }
      }
    }
    return { order, cycles };
  }

  private compareVertices(a: string, b: string): number {
    const na = this.formulas.get(a);
    const nb = this.formulas.get(b);
    if (!na || !nb) return na ? -1 : nb ? 1 : 0;
    if (na.sheetId !== nb.sheetId) return na.sheetId < nb.sheetId ? -1 : 1;
    return na.row - nb.row || na.col - nb.col;
  }

  /** Componentes fortemente conexos com ciclo (tamanho > 1 ou laço), via Tarjan iterativo. */
  private cyclicComponents(vertices: Set<string>, successors: Map<string, string[]>): string[][] {
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const result: string[][] = [];
    let counter = 0;

    for (const start of vertices) {
      if (index.has(start)) continue;
      const work: { v: string; i: number }[] = [{ v: start, i: 0 }];
      index.set(start, counter);
      low.set(start, counter);
      counter++;
      stack.push(start);
      onStack.add(start);

      while (work.length > 0) {
        const frame = work[work.length - 1];
        const next = successors.get(frame.v) ?? [];
        if (frame.i < next.length) {
          const w = next[frame.i++];
          if (!vertices.has(w)) continue;
          if (!index.has(w)) {
            index.set(w, counter);
            low.set(w, counter);
            counter++;
            stack.push(w);
            onStack.add(w);
            work.push({ v: w, i: 0 });
          } else if (onStack.has(w)) {
            low.set(frame.v, Math.min(low.get(frame.v)!, index.get(w)!));
          }
        } else {
          if (low.get(frame.v) === index.get(frame.v)) {
            const component: string[] = [];
            let w: string;
            do {
              w = stack.pop()!;
              onStack.delete(w);
              component.push(w);
            } while (w !== frame.v);
            const selfLoop = component.length === 1 && (successors.get(component[0]) ?? []).includes(component[0]);
            if (component.length > 1 || selfLoop) result.push(component);
          }
          work.pop();
          const parent = work[work.length - 1];
          if (parent) low.set(parent.v, Math.min(low.get(parent.v)!, low.get(frame.v)!));
        }
      }
    }
    return result;
  }

  /** Caminho fechado entre fórmulas do componente (ignora os vértices virtuais de intervalo). */
  private cyclePath(component: string[], successors: Map<string, string[]>): string[] {
    const inside = new Set(component);
    const start = component.find(v => !v.startsWith(RANGE_PREFIX)) ?? component[0];
    const path: string[] = [];
    const seen = new Set<string>();

    const walk = (vertex: string): boolean => {
      if (seen.has(vertex)) return vertex === start;
      seen.add(vertex);
      if (!vertex.startsWith(RANGE_PREFIX)) path.push(vertex);
      for (const next of successors.get(vertex) ?? []) {
        if (!inside.has(next)) continue;
        if (next === start) {
          path.push(start);
          return true;
        }
        if (walk(next)) return true;
      }
      if (!vertex.startsWith(RANGE_PREFIX)) path.pop();
      return false;
    };
    walk(start);
    return path.length > 0 ? path : [start, start];
  }
}
