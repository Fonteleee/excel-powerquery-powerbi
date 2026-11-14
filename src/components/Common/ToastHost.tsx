// src/components/Common/ToastHost.tsx
import React, { useEffect, useState } from 'react';
import { dismissNotice, Notice, subscribeNotices } from '../../utils/notify';

const STYLE: Record<Notice['kind'], string> = {
  info: 'border-slate-200 bg-white text-slate-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
};

export function ToastHost(): React.ReactElement {
  const [notices, setNotices] = useState<readonly Notice[]>([]);
  useEffect(() => subscribeNotices(setNotices), []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-12 right-4 z-[100] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {notices.map(n => (
        <div key={n.id} role={n.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-xs shadow-lg ${STYLE[n.kind]}`}>
          <p className="flex-1 whitespace-pre-line">{n.message}</p>
          <button onClick={() => dismissNotice(n.id)} aria-label="Fechar aviso" className="cursor-pointer text-base leading-none opacity-60 hover:opacity-100">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
