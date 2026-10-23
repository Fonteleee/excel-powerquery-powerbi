// src/features/relations/ui/geometry.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  anchorPosition,
  cablePath,
  clampToRect,
  clampZoom,
  detailLevelForZoom,
  fitViewport,
  pinOffset,
  pointInRect,
  rectCenter,
  sameOffsets,
  screenToWorld,
  wheelZoomFactor,
  worldToScreen,
  zoomAround,
} from './geometry';

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

describe('conversão tela <-> mundo', () => {
  const origin = { x: 100, y: 50 };
  const vp = { zoom: 1.5, panX: 30, panY: -20 };

  it('é a inversa de worldToScreen', () => {
    const world = { x: 123.4, y: -56.7 };
    const back = screenToWorld(worldToScreen(world, origin, vp), origin, vp);
    assert.ok(near(back.x, world.x) && near(back.y, world.y));
  });

  it('considera origem do canvas, pan e zoom', () => {
    // tela = origem + pan + mundo * zoom
    assert.deepEqual(worldToScreen({ x: 10, y: 20 }, origin, vp), { x: 145, y: 60 });
    assert.deepEqual(screenToWorld({ x: 145, y: 60 }, origin, vp), { x: 10, y: 20 });
  });
});

describe('zoomAround', () => {
  it('mantém o ponto sob o cursor parado', () => {
    const vp = { zoom: 1, panX: 40, panY: 30 };
    const pivot = { x: 300, y: 200 };
    const before = screenToWorld(pivot, { x: 0, y: 0 }, vp);
    const next = zoomAround(vp, 2, pivot);
    const after = screenToWorld(pivot, { x: 0, y: 0 }, next);
    assert.ok(near(before.x, after.x) && near(before.y, after.y));
    assert.equal(next.zoom, 2);
  });

  it('respeita os limites de zoom', () => {
    assert.equal(zoomAround({ zoom: 1, panX: 0, panY: 0 }, 99, { x: 0, y: 0 }).zoom, 2.5);
    assert.equal(zoomAround({ zoom: 1, panX: 0, panY: 0 }, 0.01, { x: 0, y: 0 }).zoom, 0.25);
    assert.equal(clampZoom(Number.NaN), 1);
  });

  it('roda do mouse: para cima aproxima, para baixo afasta, e é limitada', () => {
    assert.ok(wheelZoomFactor(-100) > 1);
    assert.ok(wheelZoomFactor(100) < 1);
    assert.ok(near(wheelZoomFactor(-100) * wheelZoomFactor(100), 1));
    assert.equal(wheelZoomFactor(1e9), wheelZoomFactor(200));
  });
});

describe('âncoras dos pinos', () => {
  it('pinOffset desfaz a escala: o mesmo pino dá o mesmo deslocamento em qualquer zoom', () => {
    // pino a (150, 90) do canto do cartão, em unidades de mundo
    for (const zoom of [0.5, 1, 2]) {
      const card = { x: 400, y: 300 };
      const pinOnScreen = { x: card.x + 150 * zoom, y: card.y + 90 * zoom };
      const off = pinOffset(pinOnScreen, card, zoom);
      assert.ok(near(off.x, 150) && near(off.y, 90), `zoom ${zoom}`);
    }
  });

  it('anchorPosition soma a posição do nó ao deslocamento medido', () => {
    const offsets = { 'out:Id': { x: 300, y: 70 } };
    assert.deepEqual(anchorPosition({ x: 10, y: 20 }, offsets, ['out:Id'], { x: 1, y: 1 }), { x: 310, y: 90 });
  });

  it('anchorPosition usa a primeira chave existente e depois o fallback', () => {
    const offsets = { 'out:*': { x: 300, y: 20 } };
    assert.deepEqual(anchorPosition({ x: 0, y: 0 }, offsets, ['out:Sumiu', 'out:*'], { x: 9, y: 9 }), { x: 300, y: 20 });
    assert.deepEqual(anchorPosition({ x: 5, y: 5 }, undefined, ['out:*'], { x: 9, y: 9 }), { x: 14, y: 14 });
  });

  it('mover o nó move a âncora sem nova medição', () => {
    const offsets = { in: { x: 0, y: 40 } };
    const a = anchorPosition({ x: 100, y: 100 }, offsets, ['in'], { x: 0, y: 0 });
    const b = anchorPosition({ x: 160, y: 130 }, offsets, ['in'], { x: 0, y: 0 });
    assert.deepEqual([b.x - a.x, b.y - a.y], [60, 30]);
  });

  it('campo rolado para fora da lista prende o pino à borda visível', () => {
    const clip = { left: 0, top: 100, right: 300, bottom: 400 };
    assert.deepEqual(clampToRect({ x: 300, y: 50 }, clip), { x: 300, y: 100 });
    assert.deepEqual(clampToRect({ x: 300, y: 900 }, clip), { x: 300, y: 400 });
    assert.deepEqual(clampToRect({ x: 300, y: 250 }, clip), { x: 300, y: 250 });
  });

  it('sameOffsets tolera ruído de subpixel mas detecta mudança real', () => {
    const a = { x: { x: 1, y: 1 } };
    assert.equal(sameOffsets(a, { x: { x: 1.2, y: 0.8 } }), true);
    assert.equal(sameOffsets(a, { x: { x: 3, y: 1 } }), false);
    assert.equal(sameOffsets(a, { x: { x: 1, y: 1 }, y: { x: 0, y: 0 } }), false);
    assert.equal(sameOffsets(undefined, {}), false);
  });

  it('rectCenter e pointInRect', () => {
    const r = { left: 10, top: 20, right: 30, bottom: 60 };
    assert.deepEqual(rectCenter(r), { x: 20, y: 40 });
    assert.equal(pointInRect({ x: 15, y: 30 }, r), true);
    assert.equal(pointInRect({ x: 5, y: 30 }, r), false);
  });
});

describe('cablePath', () => {
  it('liga origem e destino com ponto médio entre eles', () => {
    const { d, mid } = cablePath({ x: 0, y: 0 }, { x: 200, y: 100 });
    assert.match(d, /^M 0 0 C /);
    assert.match(d, /200 100$/);
    assert.ok(near(mid.x, 100) && near(mid.y, 50));
  });

  it('abre a curva mesmo quando origem e destino estão alinhados', () => {
    const { d } = cablePath({ x: 0, y: 0 }, { x: 0, y: 100 });
    assert.match(d, /C 56 0, -56 100, 0 100/);
  });

  it('funciona para ligação "para trás"', () => {
    const { mid } = cablePath({ x: 300, y: 0 }, { x: 0, y: 0 });
    assert.ok(near(mid.y, 0));
    assert.ok(mid.x > 0 && mid.x < 300);
  });
});

describe('detailLevelForZoom', () => {
  it('três níveis com limites', () => {
    assert.equal(detailLevelForZoom(0.3), 'macro');
    assert.equal(detailLevelForZoom(0.54), 'macro');
    assert.equal(detailLevelForZoom(0.55), 'medium');
    assert.equal(detailLevelForZoom(1), 'medium');
    assert.equal(detailLevelForZoom(1.15), 'medium');
    assert.equal(detailLevelForZoom(1.3), 'micro');
  });
});

describe('fitViewport', () => {
  it('enquadra tudo dentro da área e centraliza', () => {
    const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 1000 };
    const vp = fitViewport(bounds, { width: 1000, height: 600 }, 50);
    assert.ok(vp.zoom < 1);
    const left = worldToScreen({ x: 0, y: 0 }, { x: 0, y: 0 }, vp);
    const right = worldToScreen({ x: 2000, y: 1000 }, { x: 0, y: 0 }, vp);
    assert.ok(left.x >= 0 && right.x <= 1000 + 1e-6);
    assert.ok(left.y >= 0 && right.y <= 600 + 1e-6);
  });

  it('não amplia além de 100% para poucos nós', () => {
    const vp = fitViewport({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { width: 2000, height: 2000 });
    assert.equal(vp.zoom, 1);
  });
});
