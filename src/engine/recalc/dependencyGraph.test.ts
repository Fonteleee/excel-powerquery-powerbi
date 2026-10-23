// src/engine/recalc/dependencyGraph.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DependencyGraph, nodeKey } from './dependencyGraph';
import { FormulaRefs } from './references';

const cellRefs = (...cells: [number, number][]): FormulaRefs => ({
  cells: cells.map(([row, col]) => ({ sheetId: 's', row, col })),
  ranges: [],
  volatile: false,
});
const rangeRefs = (startRow: number, startCol: number, endRow: number, endCol: number): FormulaRefs => ({
  cells: [],
  ranges: [{ sheetId: 's', startRow, startCol, endRow, endCol }],
  volatile: false,
});
const key = (row: number, col: number) => nodeKey('s', row, col);
const pos = (row: number, col: number) => ({ sheetId: 's', row, col });

describe('DependencyGraph.plan', () => {
  it('ordena uma cadeia mesmo registrada de trás para frente', () => {
    const g = new DependencyGraph();
    g.setFormula('s', 3, 0, cellRefs([2, 0]));
    g.setFormula('s', 2, 0, cellRefs([1, 0]));
    g.setFormula('s', 1, 0, cellRefs([0, 0]));
    const plan = g.plan([pos(0, 0)]);
    assert.deepEqual(plan.order, [key(1, 0), key(2, 0), key(3, 0)]);
    assert.equal(plan.cycles.length, 0);
  });

  it('só inclui o ramo afetado', () => {
    const g = new DependencyGraph();
    g.setFormula('s', 0, 1, cellRefs([0, 0]));
    g.setFormula('s', 1, 1, cellRefs([1, 0]));
    const plan = g.plan([pos(1, 0)]);
    assert.deepEqual(plan.order, [key(1, 1)]);
  });

  it('intervalo e coluna inteira: a fórmula espera todas as fórmulas dentro do intervalo', () => {
    const g = new DependencyGraph();
    g.setFormula('s', 0, 2, rangeRefs(0, 1, 9, 1)); // C1 = SOMA(B1:B10)
    g.setFormula('s', 4, 1, cellRefs([4, 0])); //      B5 = f(A5)
    g.setFormula('s', 5, 1, cellRefs([5, 0])); //      B6 = f(A6)
    const plan = g.plan([pos(4, 0), pos(5, 0)]);
    assert.equal(plan.order.at(-1), key(0, 2));
    assert.equal(new Set(plan.order).size, 3);
  });

  it('intervalos idênticos viram um único nó', () => {
    const g = new DependencyGraph();
    for (let r = 0; r < 100; r++) g.setFormula('s', r, 3, rangeRefs(0, 0, 99, 0));
    assert.equal(g.rangeNodeCount, 1);
    for (let r = 0; r < 100; r++) g.removeFormula(key(r, 3));
    assert.equal(g.rangeNodeCount, 0);
  });

  it('detecta ciclo entre duas células e mantém o resto ordenado', () => {
    const g = new DependencyGraph();
    g.setFormula('s', 0, 0, cellRefs([0, 1])); // A1 = B1
    g.setFormula('s', 0, 1, cellRefs([0, 0])); // B1 = A1
    g.setFormula('s', 0, 2, cellRefs([0, 0])); // C1 = A1 (fora do ciclo, depende dele)
    const plan = g.plan([], g.keys());
    assert.equal(plan.cycles.length, 1);
    assert.deepEqual([...plan.cycles[0].members].sort(), [key(0, 0), key(0, 1)].sort());
    assert.equal(plan.cycles[0].path[0], plan.cycles[0].path.at(-1));
    assert.deepEqual(plan.order, [key(0, 2)]);
  });

  it('auto-referência e SOMA que inclui a própria célula são ciclos', () => {
    const g = new DependencyGraph();
    g.setFormula('s', 0, 0, cellRefs([0, 0]));
    g.setFormula('s', 5, 1, rangeRefs(0, 1, 9, 1)); // B6 = SOMA(B1:B10)
    const plan = g.plan([], g.keys());
    assert.equal(plan.cycles.length, 2);
  });

  it('células derramadas pela fórmula-mãe antecedem quem as lê', () => {
    const g = new DependencyGraph();
    g.setFormula('s', 0, 0, cellRefs()); // A1 = SEQUÊNCIA(3)
    g.setSpill(key(0, 0), 's', { startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
    g.setFormula('s', 0, 1, cellRefs([2, 0])); // B1 = A3 (célula derramada)
    const plan = g.plan([], [key(0, 1), key(0, 0)]);
    assert.deepEqual(plan.order, [key(0, 0), key(0, 1)]);
  });

  it('spillOwnerAt acha a fórmula-mãe, mas não a própria origem', () => {
    const g = new DependencyGraph();
    g.setFormula('s', 0, 0, cellRefs());
    g.setSpill(key(0, 0), 's', { startRow: 0, startCol: 0, endRow: 2, endCol: 1 });
    assert.equal(g.spillOwnerAt(pos(1, 1)), key(0, 0));
    assert.equal(g.spillOwnerAt(pos(0, 0)), null);
    assert.equal(g.spillOwnerAt(pos(5, 5)), null);
  });

  it('substituir a fórmula troca as dependências antigas pelas novas', () => {
    const g = new DependencyGraph();
    g.setFormula('s', 0, 1, cellRefs([0, 0]));
    g.setFormula('s', 0, 1, cellRefs([5, 5]));
    assert.deepEqual(g.plan([pos(0, 0)]).order, []);
    assert.deepEqual(g.plan([pos(5, 5)]).order, [key(0, 1)]);
  });
});
