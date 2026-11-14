// src/utils/importClient.ts
// Cliente da importação em segundo plano. Usa o Web Worker quando existe (a tela continua livre) e cai para a
// execução na própria thread (Node, testes, navegadores sem worker). `cancel()` encerra o worker na hora.

import type { ImportOutcome, ImportProgress } from './importPipeline';
import { ImportCancelledError, type ImportWorkerRequest, type ImportWorkerResponse } from './importProtocol';

export { ImportCancelledError };

/** O mínimo de um Worker que o cliente usa (permite um worker falso nos testes). */
export interface ImportWorkerLike {
  postMessage(message: ImportWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<ImportWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface StartImportOptions {
  onProgress?: (progress: ImportProgress) => void;
  /** Fábrica de worker alternativa (testes). Devolva null para forçar a execução na mesma thread. */
  createWorker?: () => ImportWorkerLike | null;
}

export interface ImportJob {
  promise: Promise<ImportOutcome>;
  /** Cancela: encerra o worker e rejeita a promessa com ImportCancelledError. */
  cancel: () => void;
  readonly mode: 'worker' | 'sync';
}

function defaultWorker(): ImportWorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('../workers/import.worker.ts', import.meta.url), { type: 'module' }) as unknown as ImportWorkerLike;
}

export function startImport(bytes: Uint8Array, fileName: string, options: StartImportOptions = {}): ImportJob {
  let cancelled = false;
  let rejectJob: (reason: Error) => void = () => {};
  let worker: ImportWorkerLike | null = null;
  try {
    worker = (options.createWorker ?? defaultWorker)();
  } catch {
    worker = null;
  }

  const promise = new Promise<ImportOutcome>((resolve, reject) => {
    rejectJob = reject;
    if (worker) {
      const w = worker;
      w.onmessage = event => {
        const msg = event.data;
        if (cancelled) return;
        if (msg.type === 'progress') options.onProgress?.(msg.progress);
        else if (msg.type === 'done') {
          w.terminate();
          resolve(msg.outcome);
        } else {
          w.terminate();
          reject(new Error(msg.message));
        }
      };
      w.onerror = event => {
        w.terminate();
        reject(new Error(event.message || 'Falha no processamento da planilha.'));
      };
      // Copia: o chamador pode querer reutilizar `bytes`; o buffer copiado é transferido sem cópia extra.
      const copy = bytes.slice().buffer as ArrayBuffer;
      w.postMessage({ type: 'import', bytes: copy, fileName }, [copy]);
      return;
    }
    // Sem worker: roda na thread atual, adiando para o próximo ciclo para o chamador poder cancelar.
    setTimeout(() => {
      if (cancelled) return;
      // Import dinâmico: o SheetJS só é baixado quando a importação roda na thread principal.
      import('./importPipeline')
        .then(({ runImportPipeline }) => {
          if (cancelled) return;
          resolve(runImportPipeline(bytes, fileName, { onProgress: options.onProgress, shouldCancel: () => cancelled }));
        })
        .catch(err => reject(err instanceof Error ? err : new Error(String(err))));
    }, 0);
  });

  return {
    promise,
    mode: worker ? 'worker' : 'sync',
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      worker?.terminate();
      rejectJob(new ImportCancelledError());
    },
  };
}
