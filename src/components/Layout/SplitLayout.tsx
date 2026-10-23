// src/components/Layout/SplitLayout.tsx
// Divisor redimensionável: grade ~75% / painel lateral ~25%. A preferência é persistida.
// O painel (ex.: CopilotPanel, que é `fixed`) é encaixado na coluna por CSS, sem alterar o componente dele.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { clampSideRatio, parseStoredRatio, SPLIT_STORAGE_KEY } from './splitMath';

interface SplitLayoutProps {
  main: React.ReactNode;
  side: React.ReactNode;
  sideOpen: boolean;
  onContainerWidth?: (width: number) => void;
}

export const SplitLayout: React.FC<SplitLayoutProps> = ({ main, side, sideOpen, onContainerWidth }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(() => {
    try {
      return parseStoredRatio(localStorage.getItem(SPLIT_STORAGE_KEY));
    } catch {
      return parseStoredRatio(null);
    }
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setWidth(w);
      onContainerWidth?.(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onContainerWidth]);

  const save = useCallback((value: number) => {
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, String(value));
    } catch {
      // preferência opcional
    }
  }, []);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent): void => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setRatio(clampSideRatio((rect.right - ev.clientX) / rect.width, rect.width));
    };
    const up = (ev: PointerEvent): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      const rect = ref.current?.getBoundingClientRect();
      if (rect) save(clampSideRatio((rect.right - ev.clientX) / rect.width, rect.width));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  const effective = clampSideRatio(ratio, width);

  return (
    <div ref={ref} className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{main}</div>
      {sideOpen && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar painel lateral"
            aria-valuenow={Math.round(effective * 100)}
            tabIndex={0}
            onPointerDown={startDrag}
            onDoubleClick={() => {
              setRatio(0.25);
              save(0.25);
            }}
            onKeyDown={e => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              const next = clampSideRatio(ratio + (e.key === 'ArrowLeft' ? 0.02 : -0.02), width);
              setRatio(next);
              save(next);
            }}
            className="z-10 w-1.5 shrink-0 cursor-col-resize bg-slate-200 hover:bg-indigo-400 focus-visible:bg-indigo-500"
          />
          {/* `transform` cria o bloco de contenção que prende o painel `fixed` dentro desta coluna */}
          <div
            className="min-h-0 shrink-0 overflow-hidden [&>aside]:static [&>aside]:h-full [&>aside]:w-full [&>aside]:max-w-none [&>aside]:shadow-none"
            style={{ width: `${effective * 100}%`, transform: 'translateZ(0)' }}
          >
            {side}
          </div>
        </>
      )}
    </div>
  );
};
