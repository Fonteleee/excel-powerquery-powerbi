// src/components/Layout/splitMath.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampSideRatio, decideSidebar, parseStoredRatio } from './splitMath';

describe('divisor 75/25', () => {
  it('clampSideRatio respeita mínimo em px e máximo em fração', () => {
    assert.equal(clampSideRatio(0.05, 1000), 0.28);
    assert.equal(clampSideRatio(0.9, 1000), 0.6);
    assert.equal(clampSideRatio(0.3, 1000), 0.3);
    assert.equal(clampSideRatio(Number.NaN, 1000), 0.25);
  });

  it('parseStoredRatio ignora lixo', () => {
    assert.equal(parseStoredRatio(null), 0.25);
    assert.equal(parseStoredRatio('abc'), 0.25);
    assert.equal(parseStoredRatio('0.9'), 0.25);
    assert.equal(parseStoredRatio('0.3'), 0.3);
  });
});

describe('decideSidebar', () => {
  const base = { sidebarWidth: 224, sidePanelOpen: true, sidebarOpen: true, autoCollapsed: false };
  it('recolhe quando falta espaço e lembra que foi automático', () => {
    assert.deepEqual(decideSidebar({ ...base, containerWidth: 800 }), { sidebarOpen: false, autoCollapsed: true });
  });
  it('não mexe quando há espaço', () => {
    assert.deepEqual(decideSidebar({ ...base, containerWidth: 1400 }), { sidebarOpen: true, autoCollapsed: false });
  });
  it('reabre só se foi recolhida automaticamente', () => {
    const closed = { ...base, sidebarOpen: false };
    assert.deepEqual(decideSidebar({ ...closed, autoCollapsed: true, containerWidth: 1300 }), { sidebarOpen: true, autoCollapsed: false });
    assert.deepEqual(decideSidebar({ ...closed, autoCollapsed: false, containerWidth: 1300 }), { sidebarOpen: false, autoCollapsed: false });
  });
  it('reabre ao fechar o painel', () => {
    assert.deepEqual(
      decideSidebar({ ...base, sidebarOpen: false, autoCollapsed: true, sidePanelOpen: false, containerWidth: 700 }),
      { sidebarOpen: true, autoCollapsed: false }
    );
  });
});
