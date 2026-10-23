// src/features/relations/ui/usePinMeasure.ts
// Mede no DOM a posição de cada pino (`[data-pin]`) em relação ao cartão que o contém e reporta ao canvas.
// Substitui as constantes fixas (40 + idx * 28 + 14): a medição acompanha recolher, filtrar campos,
// "Apenas chaves", rolagem da lista e zoom. Mover o cartão não exige nova medição (o deslocamento é relativo).

import { RefObject, useLayoutEffect } from 'react';
import { clampToRect, Offset, OffsetMap, pinOffset, rectCenter } from './geometry';

export type ReportAnchors = (nodeId: string, offsets: OffsetMap) => void;

/** Lê todos os pinos dentro de `root`. Pinos escondidos (largura e altura zero) são ignorados. */
export function measurePins(root: HTMLElement, zoom: number): Record<string, Offset> {
  const card = root.getBoundingClientRect();
  const origin = { x: card.left, y: card.top };
  const result: Record<string, Offset> = Object.create(null);

  root.querySelectorAll<HTMLElement>('[data-pin]').forEach(el => {
    const key = el.dataset.pin;
    if (!key) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    let center = rectCenter(rect);
    // Campo rolado para fora da área visível da lista aponta para a borda dela (só no eixo vertical).
    const clipEl = el.closest<HTMLElement>('[data-clip]');
    if (clipEl && root.contains(clipEl)) {
      const clip = clipEl.getBoundingClientRect();
      center = clampToRect(center, {
        left: Number.NEGATIVE_INFINITY,
        right: Number.POSITIVE_INFINITY,
        top: clip.top,
        bottom: clip.bottom,
      });
    }
    result[key] = pinOffset(center, origin, zoom);
  });
  return result;
}

/**
 * Mede na montagem e sempre que `signature` (estrutura do cartão), `zoom` ou o tamanho mudarem.
 * Também remede ao rolar qualquer `[data-scroll]` dentro do cartão.
 */
export function usePinMeasure(
  rootRef: RefObject<HTMLElement | null>,
  nodeId: string,
  zoom: number,
  report: ReportAnchors,
  signature: string
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let frame = 0;
    const measure = (): void => {
      frame = 0;
      report(nodeId, measurePins(root, zoom));
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    measure();

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(root);
    const scrollers = Array.from(root.querySelectorAll<HTMLElement>('[data-scroll]'));
    for (const el of scrollers) {
      observer?.observe(el);
      el.addEventListener('scroll', schedule, { passive: true });
    }

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      observer?.disconnect();
      for (const el of scrollers) el.removeEventListener('scroll', schedule);
    };
  }, [rootRef, nodeId, zoom, report, signature]);
}
