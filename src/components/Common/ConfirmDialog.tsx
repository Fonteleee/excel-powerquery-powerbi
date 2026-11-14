// src/components/Common/ConfirmDialog.tsx
// Confirmação na tela (no lugar de window.confirm). Uso:
//   const { confirm, dialog } = useConfirm();
//   if (await confirm({ message: 'Excluir?', danger: true })) { ... }
//   ... e renderize {dialog} no JSX.
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmDialogProps extends ConfirmOptions {
  onResult: (ok: boolean) => void;
}

export function ConfirmDialog({ message, title, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger, onResult }: ConfirmDialogProps): React.ReactElement {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Ação destrutiva: foco começa em "Cancelar" para Enter não apagar por engano.
    (danger ? cancelRef.current : confirmRef.current)?.focus();
    return () => previous?.focus?.();
  }, [danger]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onResult(false);
    } else if (e.key === 'Tab') {
      const first = cancelRef.current;
      const last = confirmRef.current;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={e => e.target === e.currentTarget && onResult(false)}>
      <div role="alertdialog" aria-modal="true" aria-label={title ?? 'Confirmação'} onKeyDown={onKeyDown} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        {title && <h2 className="mb-1 text-sm font-bold text-slate-900">{title}</h2>}
        <p className="whitespace-pre-line text-xs text-slate-700">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button ref={cancelRef} onClick={() => onResult(false)} className="cursor-pointer rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onResult(true)}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold text-white ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean>; dialog: React.ReactElement | null } {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>(resolve => {
        setState({ options, resolve });
      }),
    [],
  );

  const dialog = state ? (
    <ConfirmDialog
      {...state.options}
      onResult={ok => {
        state.resolve(ok);
        setState(null);
      }}
    />
  ) : null;

  return { confirm, dialog };
}
