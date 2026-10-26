import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { columnOffsets, computeColWindow } from './colWindow';

describe('janela de colunas', () => {
  it('tabela pequena desenha tudo', () => {
    const w = computeColWindow(columnOffsets(30, {}), 0, 1000);
    assert.deepEqual(w, { start: 0, end: 29, leftPx: 0, rightPx: 0 });
  });

  it('16 mil colunas: só as da tela e os espaçadores somam a largura total', () => {
    const off = columnOffsets(16384, { 5: 200 }, [7]);
    const w = computeColWindow(off, 1_000_000, 1200);
    assert.ok(w.end - w.start < 60, `janela de ${w.end - w.start + 1} colunas`);
    assert.ok(w.start > 0 && w.end < 16383);
    const inside = off[w.end + 1] - off[w.start];
    assert.equal(w.leftPx + inside + w.rightPx, off[16384]);
    // a coluna visível no scroll está dentro da janela
    assert.ok(off[w.start] <= 1_000_000 && off[w.end + 1] >= 1_000_000 + 1200);
  });

  it('no começo não tem espaçador à esquerda e coluna oculta não ocupa lugar', () => {
    const off = columnOffsets(100, {}, [0]);
    assert.equal(off[1], 0);
    const w = computeColWindow(off, 0, 800);
    assert.ok(w.start <= 1); // a coluna 0 oculta não ocupa lugar
    assert.equal(w.leftPx, 0);
  });
});
