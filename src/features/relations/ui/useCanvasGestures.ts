// src/features/relations/ui/useCanvasGestures.ts
// Gestos do canvas com Pointer Events (mouse, caneta e toque): arrastar o fundo (pan), arrastar nós,
// criar ligações a partir de um pino e zoom com a roda. Toda a conversão de coordenadas passa por geometry.ts
// (considera pan e zoom), então nada depende de constantes ou do tamanho da janela.

import { PointerEvent as ReactPointerEvent, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Point, screenToWorld, Viewport, wheelZoomFactor, zoomAround } from './geometry';

export interface PinRef {
  nodeId: string;
  side: 'out' | 'in';
  /** Coluna, "*" (tabela inteira / saída do nó) ou nome da porta ("in", "lookup"). */
  key: string;
}

export interface ConnectDraft {
  source: PinRef;
  start: Point;
  current: Point;
}

/** Onde a ligação foi solta: um pino exato, ou só o corpo de um nó (key = null). */
export interface DropTarget {
  nodeId: string;
  side: 'out' | 'in' | null;
  key: string | null;
}

const DRAG_THRESHOLD_PX = 4;

type Gesture =
  | { type: 'pan'; startClient: Point; startPan: Point; moved: boolean }
  | { type: 'node'; id: string; grab: Point; startClient: Point; moved: boolean }
  | { type: 'connect'; source: PinRef; startClient: Point; moved: boolean };

/** Lê "out:Coluna" / "in:lookup". Só o primeiro ":" separa o lado (nomes de coluna podem ter ":"). */
export function parsePinAttribute(nodeId: string, attribute: string): PinRef | null {
  const at = attribute.indexOf(':');
  if (at < 0) return null;
  const side = attribute.slice(0, at);
  if (side !== 'out' && side !== 'in') return null;
  return { nodeId, side, key: attribute.slice(at + 1) };
}

interface Options {
  surfaceRef: RefObject<HTMLDivElement | null>;
  viewport: Viewport;
  setViewport: (update: (vp: Viewport) => Viewport) => void;
  /** Posição atual de um nó (para calcular o ponto de agarre ao arrastar). */
  getNodePosition: (nodeId: string) => Point | null;
  /** Ponto do mundo onde um pino de saída ancora o cabo em construção. */
  anchorOf: (pin: PinRef) => Point;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onSelectNode: (nodeId: string | null) => void;
  /** Clique (sem arrastar) em um nó: abre o painel lateral. */
  onActivateNode: (nodeId: string) => void;
  onBackgroundClick: () => void;
  onDrop: (source: PinRef, target: DropTarget | null, client: Point) => void;
}

export interface CanvasGestures {
  draft: ConnectDraft | null;
  isConnecting: boolean;
  bindings: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
  };
  cancel: () => void;
}

export function useCanvasGestures(options: Options): CanvasGestures {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<ConnectDraft | null>(null);

  const originOf = (): Point => {
    const rect = optionsRef.current.surfaceRef.current?.getBoundingClientRect();
    return { x: rect?.left ?? 0, y: rect?.top ?? 0 };
  };
  const worldOf = (e: { clientX: number; clientY: number }): Point =>
    screenToWorld({ x: e.clientX, y: e.clientY }, originOf(), optionsRef.current.viewport);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag], input, select, textarea, button, a')) return;
    const opts = optionsRef.current;
    const nodeEl = target.closest<HTMLElement>('[data-node-id]');
    const startClient = { x: e.clientX, y: e.clientY };
    const surface = e.currentTarget;

    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId ?? '';
      opts.onSelectNode(nodeId);
      const pinEl = target.closest<HTMLElement>('[data-pin]');
      const pin = pinEl?.dataset.pin ? parsePinAttribute(nodeId, pinEl.dataset.pin) : null;

      if (pin && pin.side === 'out') {
        const start = opts.anchorOf(pin);
        gesture.current = { type: 'connect', source: pin, startClient, moved: false };
        setDraft({ source: pin, start, current: start });
        surface.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (pin || !target.closest('[data-drag-handle]')) return;

      const position = opts.getNodePosition(nodeId);
      if (!position) return;
      const world = worldOf(e);
      gesture.current = { type: 'node', id: nodeId, grab: { x: world.x - position.x, y: world.y - position.y }, startClient, moved: false };
      surface.setPointerCapture(e.pointerId);
      return;
    }

    gesture.current = { type: 'pan', startClient, startPan: { x: opts.viewport.panX, y: opts.viewport.panY }, moved: false };
    surface.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startClient.x;
    const dy = e.clientY - g.startClient.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    g.moved = true;
    const opts = optionsRef.current;

    if (g.type === 'pan') {
      opts.setViewport(vp => ({ ...vp, panX: g.startPan.x + dx, panY: g.startPan.y + dy }));
    } else if (g.type === 'node') {
      const world = worldOf(e);
      opts.onMoveNode(g.id, world.x - g.grab.x, world.y - g.grab.y);
    } else {
      const world = worldOf(e);
      setDraft(prev => (prev ? { ...prev, current: world } : prev));
    }
  }, []);

  const finish = useCallback((e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const opts = optionsRef.current;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    if (g.type === 'connect') {
      setDraft(null);
      if (cancelled || !g.moved) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const nodeEl = hit?.closest<HTMLElement>('[data-node-id]');
      let target: DropTarget | null = null;
      if (nodeEl?.dataset.nodeId) {
        const pinEl = hit?.closest<HTMLElement>('[data-pin]');
        const pin = pinEl?.dataset.pin ? parsePinAttribute(nodeEl.dataset.nodeId, pinEl.dataset.pin) : null;
        target = pin
          ? { nodeId: pin.nodeId, side: pin.side, key: pin.key }
          : { nodeId: nodeEl.dataset.nodeId, side: null, key: null };
      }
      opts.onDrop(g.source, target, { x: e.clientX, y: e.clientY });
      return;
    }
    if (cancelled) return;
    if (g.type === 'node' && !g.moved) opts.onActivateNode(g.id);
    if (g.type === 'pan' && !g.moved) opts.onBackgroundClick();
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => finish(e, false), [finish]);
  const onPointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => finish(e, true), [finish]);

  const cancel = useCallback(() => {
    gesture.current = null;
    setDraft(null);
  }, []);

  // Zoom com a roda: precisa de listener não passivo para impedir a rolagem da página.
  useEffect(() => {
    const surface = options.surfaceRef.current;
    if (!surface) return undefined;
    const onWheel = (e: WheelEvent): void => {
      const target = e.target as HTMLElement | null;
      const scroller = target?.closest<HTMLElement>('[data-scroll]');
      // Sobre uma lista que rola, a roda rola a lista (Ctrl+roda ainda dá zoom).
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1 && !e.ctrlKey) return;
      e.preventDefault();
      const rect = surface.getBoundingClientRect();
      const pivot = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      optionsRef.current.setViewport(vp => zoomAround(vp, vp.zoom * wheelZoomFactor(e.deltaY), pivot));
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [options.surfaceRef]);

  return {
    draft,
    isConnecting: draft !== null,
    bindings: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    cancel,
  };
}
