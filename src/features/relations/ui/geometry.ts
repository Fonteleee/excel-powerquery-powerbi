// src/features/relations/ui/geometry.ts
// Geometria PURA do canvas: conversão tela <-> mundo (com zoom e pan), âncoras dos pinos medidas no DOM,
// caminho dos cabos e nível de detalhe por zoom. Sem React e sem DOM, por isso é testável.
//
// Sistemas de coordenadas:
//  - tela:  pixels do navegador (clientX/clientY, getBoundingClientRect).
//  - canvas: pixels relativos ao canto superior esquerdo do elemento do canvas.
//  - mundo: unidades do grafo (x/y dos nós). Tela = canvas.origem + pan + mundo * zoom.

import { MAX_ZOOM, MIN_ZOOM } from '../model/viewState';

export { MAX_ZOOM, MIN_ZOOM };

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

/** Deslocamento de um pino em relação ao canto superior esquerdo do cartão, em unidades de mundo. */
export type Offset = Point;

export const clampZoom = (zoom: number): number =>
  Number.isFinite(zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) : 1;

/** Ponto da tela -> mundo. `origin` é o canto superior esquerdo do canvas na tela. */
export function screenToWorld(client: Point, origin: Point, vp: Viewport): Point {
  return { x: (client.x - origin.x - vp.panX) / vp.zoom, y: (client.y - origin.y - vp.panY) / vp.zoom };
}

export function worldToScreen(world: Point, origin: Point, vp: Viewport): Point {
  return { x: origin.x + vp.panX + world.x * vp.zoom, y: origin.y + vp.panY + world.y * vp.zoom };
}

/** Muda o zoom mantendo fixo o ponto do mundo que está sob `pivot` (coordenadas do canvas). */
export function zoomAround(vp: Viewport, nextZoom: number, pivot: Point): Viewport {
  const zoom = clampZoom(nextZoom);
  const worldX = (pivot.x - vp.panX) / vp.zoom;
  const worldY = (pivot.y - vp.panY) / vp.zoom;
  return { zoom, panX: pivot.x - worldX * zoom, panY: pivot.y - worldY * zoom };
}

/** Fator de zoom da roda do mouse (deltaY em pixels). Suave e simétrico. */
export function wheelZoomFactor(deltaY: number): number {
  const clamped = Math.max(-200, Math.min(200, deltaY));
  return Math.exp(-clamped * 0.0015);
}

/** Viewport que enquadra a caixa `bounds` dentro de `size`, com margem. Nunca amplia além de 1x. */
export function fitViewport(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  size: { width: number; height: number },
  padding = 48
): Viewport {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = clampZoom(
    Math.min(1, (size.width - padding * 2) / w, (size.height - padding * 2) / h)
  );
  return {
    zoom,
    panX: (size.width - w * zoom) / 2 - bounds.minX * zoom,
    panY: (size.height - h * zoom) / 2 - bounds.minY * zoom,
  };
}

/**
 * Deslocamento do centro de um pino em relação ao cartão, em unidades de mundo.
 * As posições vêm de `getBoundingClientRect`, que já inclui a escala (zoom) aplicada pelo CSS.
 */
export function pinOffset(pinCenter: Point, cardTopLeft: Point, zoom: number): Offset {
  return { x: (pinCenter.x - cardTopLeft.x) / zoom, y: (pinCenter.y - cardTopLeft.y) / zoom };
}

export const rectCenter = (r: Rect): Point => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

/**
 * Prende o pino à área visível de uma lista com rolagem: um campo rolado para fora aponta para a borda
 * da lista (em vez de flutuar fora do cartão).
 */
export function clampToRect(point: Point, clip: Rect): Point {
  return {
    x: Math.min(Math.max(point.x, clip.left), clip.right),
    y: Math.min(Math.max(point.y, clip.top), clip.bottom),
  };
}

export type OffsetMap = Readonly<Record<string, Offset>>;

/**
 * Posição de âncora no mundo: primeira chave que existe no mapa medido; senão o fallback fixo
 * (usado antes da primeira medição ou quando o pino não existe, por exemplo cartão recolhido).
 */
export function anchorPosition(
  node: Point,
  offsets: OffsetMap | undefined,
  keys: readonly string[],
  fallback: Offset
): Point {
  for (const key of keys) {
    const offset = offsets?.[key];
    if (offset) return { x: node.x + offset.x, y: node.y + offset.y };
  }
  return { x: node.x + fallback.x, y: node.y + fallback.y };
}

/** Iguala dois mapas de deslocamento com tolerância (evita re-renderizar por ruído de subpixel). */
export function sameOffsets(a: OffsetMap | undefined, b: OffsetMap, epsilon = 0.5): boolean {
  if (!a) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysB.every(key => {
    const left = a[key];
    const right = b[key];
    return !!left && Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon;
  });
}

export interface CablePath {
  d: string;
  /** Ponto médio da curva (para selo, contador e botão de remover). */
  mid: Point;
}

/** Curva de Bézier cúbica horizontal. Em ligações "para trás" a curva abre mais para não cruzar o cartão. */
export function cablePath(from: Point, to: Point): CablePath {
  const dx = Math.max(56, Math.abs(to.x - from.x) * 0.5);
  const c1 = { x: from.x + dx, y: from.y };
  const c2 = { x: to.x - dx, y: to.y };
  const mid = {
    x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8,
    y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8,
  };
  const r = (n: number): number => Math.round(n * 100) / 100;
  return {
    d: `M ${r(from.x)} ${r(from.y)} C ${r(c1.x)} ${r(c1.y)}, ${r(c2.x)} ${r(c2.y)}, ${r(to.x)} ${r(to.y)}`,
    mid,
  };
}

/** Níveis de detalhe semântico. */
export type DetailLevel = 'macro' | 'medium' | 'micro';

export const LOD_MACRO_BELOW = 0.55;
export const LOD_MICRO_ABOVE = 1.15;

export function detailLevelForZoom(zoom: number): DetailLevel {
  if (zoom < LOD_MACRO_BELOW) return 'macro';
  if (zoom > LOD_MICRO_ABOVE) return 'micro';
  return 'medium';
}

/** Encontra o ponto de dentro de um retângulo da tela (para teste de arrastar/soltar). */
export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}
