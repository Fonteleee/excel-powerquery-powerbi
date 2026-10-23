// src/features/relations/ui/tokens.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellText, formatCount, formatPercent, pluralize, truncate } from './format';
import { CABLES, COLORS, contrastRatio, TYPE_SCALE, tokenCssVars } from './tokens';

describe('contraste dos tokens', () => {
  it('contrastRatio bate com valores conhecidos', () => {
    assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
    assert.ok(Math.abs(contrastRatio('#ffffff', '#ffffff') - 1) < 1e-9);
  });

  it('cores dos cabos têm contraste >= 3:1 com o fundo (elementos gráficos)', () => {
    for (const [tone, def] of Object.entries(CABLES)) {
      assert.ok(contrastRatio(def.color, COLORS.canvas) >= 3, `${tone}: ${contrastRatio(def.color, COLORS.canvas).toFixed(2)}`);
    }
  });

  it('texto principal e secundário têm contraste >= 4.5:1 no cartão (AA)', () => {
    assert.ok(contrastRatio(COLORS.ink, COLORS.card) >= 4.5);
    assert.ok(contrastRatio(COLORS.inkMuted, COLORS.card) >= 4.5);
    assert.ok(contrastRatio(COLORS.inkMuted, COLORS.cardHeader) >= 4.5);
    assert.ok(contrastRatio(COLORS.danger, COLORS.card) >= 4.5);
    assert.ok(contrastRatio(COLORS.ok, COLORS.card) >= 4.5);
    assert.ok(contrastRatio(COLORS.warn, COLORS.card) >= 4.5);
  });

  it('as quatro cores de cabo são distintas', () => {
    assert.equal(new Set(Object.values(CABLES).map(c => c.color)).size, 4);
  });

  it('a escala tipográfica usa px inteiros e crescente', () => {
    const sizes = Object.values(TYPE_SCALE);
    assert.ok(sizes.every(Number.isInteger));
    assert.deepEqual([...sizes].sort((a, b) => a - b), sizes);
    assert.ok(TYPE_SCALE.micro >= 10, 'nenhum texto abaixo de 10px');
  });
});

describe('tokenCssVars', () => {
  it('publica variáveis --rel-* para cores, cabos, tipografia, espaço, raios e sombras', () => {
    const vars = tokenCssVars();
    for (const key of ['--rel-canvas', '--rel-cable-raw', '--rel-cable-error-glow', '--rel-text-body', '--rel-space-3', '--rel-radius-card', '--rel-shadow-card-active']) {
      assert.ok(key in vars, key);
    }
    assert.ok(Object.keys(vars).every(k => k.startsWith('--rel-')));
    assert.equal(vars['--rel-card-header'], COLORS.cardHeader);
  });
});

describe('formatação', () => {
  it('formatCount', () => {
    assert.equal(formatCount(0), '0');
    assert.equal(formatCount(950), '950');
    assert.equal(formatCount(1234), '1,2 mil');
    assert.equal(formatCount(2_500_000), '2,5 mi');
    assert.equal(formatCount(Number.NaN), '—');
  });

  it('formatPercent', () => {
    assert.equal(formatPercent(100), '100%');
    assert.equal(formatPercent(66.666), '66,7%');
    assert.equal(formatPercent(50), '50%');
  });

  it('pluralize, cellText e truncate', () => {
    assert.equal(pluralize(1, 'linha', 'linhas'), '1 linha');
    assert.equal(pluralize(3000, 'linha', 'linhas'), '3 mil linhas');
    assert.equal(cellText(null), '');
    assert.equal(cellText(2.5), '2,5');
    assert.equal(cellText(true), 'true');
    assert.equal(truncate('abcdef', 4), 'abc…');
    assert.equal(truncate('abc', 4), 'abc');
  });
});
