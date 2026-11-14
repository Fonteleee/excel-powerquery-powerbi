// src/workers/import.worker.ts
// Worker da importação de .xlsx: lê, converte e recalcula fora da thread principal, avisando o progresso.
// Cancelar = a página encerra o worker (`terminate`). Sem DOM aqui: xlsxStyles/xlsxExtras leem o XML sem DOMParser.

import { runImportPipeline } from '../utils/importPipeline';
import type { ImportWorkerRequest, ImportWorkerResponse } from '../utils/importProtocol';

const ctx = self as unknown as { postMessage: (message: ImportWorkerResponse) => void; onmessage: ((e: MessageEvent<ImportWorkerRequest>) => void) | null };

ctx.onmessage = (event: MessageEvent<ImportWorkerRequest>) => {
  const request = event.data;
  if (request?.type !== 'import') return;
  try {
    // Mensagens de progresso saem a no máximo ~10 por segundo.
    let lastPost = 0;
    const outcome = runImportPipeline(new Uint8Array(request.bytes), request.fileName, {
      onProgress: progress => {
        const t = Date.now();
        if (progress.stage !== 'done' && t - lastPost < 100) return;
        lastPost = t;
        ctx.postMessage({ type: 'progress', progress });
      },
    });
    ctx.postMessage({ type: 'done', outcome });
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao processar a planilha.' });
  }
};
