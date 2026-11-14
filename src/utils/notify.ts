// src/utils/notify.ts
// Avisos na tela (no lugar de alert/confirm do navegador). `notify` pode ser chamado de qualquer lugar;
// o <ToastHost /> (montado em main.tsx) mostra as mensagens.

export type NotifyKind = 'info' | 'success' | 'warning' | 'error';

export interface Notice {
  id: number;
  message: string;
  kind: NotifyKind;
}

type Listener = (notices: readonly Notice[]) => void;

let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

const emit = (): void => listeners.forEach(l => l(notices));

export function dismissNotice(id: number): void {
  notices = notices.filter(n => n.id !== id);
  emit();
}

/** Mostra um aviso. Some sozinho (mais tempo para erros e textos longos); devolve o id para fechar antes. */
export function notify(message: string, kind: NotifyKind = 'info'): number {
  const id = nextId++;
  notices = [...notices.slice(-4), { id, message, kind }];
  emit();
  const ms = kind === 'error' ? 12000 : Math.min(15000, 4000 + message.length * 40);
  if (typeof setTimeout !== 'undefined') setTimeout(() => dismissNotice(id), ms);
  return id;
}

export function subscribeNotices(listener: Listener): () => void {
  listeners.add(listener);
  listener(notices);
  return () => {
    listeners.delete(listener);
  };
}
