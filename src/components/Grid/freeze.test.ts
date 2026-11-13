// src/components/Grid/freeze.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { columnOffsets, computeColWindow } from './colWindow';
import { frozenLayout, groupMembers, groupToggles, toggleGroup, windowWithoutFrozen } from './freeze';

describe('congelamento', () => {
  const off = columnOffsets(200, {});
  const win = computeColWindow(off, 6000, 1000); // longe do início: as colunas 0 e 1 saem da janela

  it('linhas congeladas ficam abaixo do cabeçalho, uma sob a outra', () => {
    const f = frozenLayout({ frozenRows: 2 }, off, win, [30, 40]);
    assert.equal(f.rowTop(0), 32);
    assert.equal(f.rowTop(1), 62);
    assert.equal(f.rowTop(2), undefined);
  });

  it('colunas congeladas fora da janela são desenhadas à parte e o espaçador encolhe', () => {
    const f = frozenLayout({ frozenCols: 2 }, off, win);
    assert.deepEqual(f.extraCols, [0, 1]);
    assert.equal(f.colLeft(0), 40);
    assert.equal(f.colLeft(1), 160);
    assert.equal(f.colLeft(2), undefined);
    assert.equal(windowWithoutFrozen(win, off, f.extraCols).leftPx, win.leftPx - 240);
  });

  it('sem congelar nada não muda nada', () => {
    const f = frozenLayout({}, off, win);
    assert.deepEqual(f.extraCols, []);
    assert.equal(f.rowTop(0), undefined);
  });
});

describe('agrupamento', () => {
  // linhas 1..3 (base 0) no nível 1; o botão fica na linha 4 (abaixo) ou na 0 (acima)
  const levels = { 1: 1, 2: 1, 3: 1 };

  it('o botão fica depois do grupo (padrão) e controla as linhas de cima', () => {
    assert.deepEqual(groupMembers(levels, 4, false, 10), [3, 2, 1]);
    assert.deepEqual(groupMembers(levels, 0, false, 10), []);
  });

  it('com o resumo acima o botão fica antes do grupo', () => {
    assert.deepEqual(groupMembers(levels, 0, true, 10), [1, 2, 3]);
    assert.deepEqual(groupMembers(levels, 4, true, 10), []);
  });

  it('recolher oculta o grupo e expandir mostra de novo; o botão sabe o estado', () => {
    const hidden = toggleGroup(levels, [], 4, false, 10);
    assert.deepEqual(hidden, [1, 2, 3]);
    assert.equal(groupToggles(levels, hidden, false, 10, [0, 4]).get(4), true);
    assert.equal(groupToggles(levels, hidden, false, 10, [0, 4]).has(0), false);
    assert.deepEqual(toggleGroup(levels, hidden, 4, false, 10), []);
  });

  it('não mexe em linhas ocultas que não pertencem ao grupo', () => {
    assert.deepEqual(toggleGroup(levels, [8], 4, false, 10), [1, 2, 3, 8]);
    assert.deepEqual(toggleGroup(levels, [1, 2, 3, 8], 4, false, 10), [8]);
  });
});
