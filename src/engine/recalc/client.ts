// src/engine/recalc/client.ts
// Cliente do recálculo fora da thread principal. Usa Web Worker (Comlink) quando existe e
// cai para execução síncrona na mesma thread (Node, testes, navegadores sem worker).

import * as Comlink from 'comlink';
import { AsyncRecalcApi, RecalcApi } from './protocol';
import { RecalcService } from './service';

export type RecalcMode = 'pending' | 'worker' | 'sync';

export interface RecalcClient extends AsyncRecalcApi {
  readonly mode: RecalcMode;
  /** Encerra o worker (se houver). */
  dispose(): void;
}

export interface CreateRecalcClientOptions {
  /** Força o modo síncrono (testes, depuração). */
  forceSync?: boolean;
  /** Fábrica de worker alternativa (testes); deve devolver um endpoint do Comlink. */
  createEndpoint?: () => Comlink.Endpoint & { terminate?: () => void };
  /** Tempo máximo esperando o worker responder ao ping (ms). Padrão 3000. */
  pingTimeoutMs?: number;
}

function defaultEndpoint(): (Comlink.Endpoint & { terminate?: () => void }) | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('../../workers/recalc.worker.ts', import.meta.url), { type: 'module' });
}

function syncBackend(): AsyncRecalcApi {
  const service = new RecalcService();
  const wrap = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A) => Promise.resolve().then(() => fn(...a));
  return {
    ping: wrap(() => service.ping()),
    init: wrap(sheets => service.init(sheets)),
    applyEdits: wrap(edits => service.applyEdits(edits)),
    replaceSheet: wrap(sheet => service.replaceSheet(sheet)),
    evaluateFlow: wrap((graph, options) => service.evaluateFlow(graph, options)),
  };
}

/**
 * Cria o cliente. A escolha worker/síncrono acontece na primeira chamada:
 * se o worker não existir ou não responder ao ping, usa o modo síncrono.
 */
export function createRecalcClient(options: CreateRecalcClientOptions = {}): RecalcClient {
  let mode: RecalcMode = 'pending';
  let backend: Promise<AsyncRecalcApi> | null = null;
  let terminate: (() => void) | undefined;

  const select = async (): Promise<AsyncRecalcApi> => {
    if (!options.forceSync) {
      try {
        const endpoint = (options.createEndpoint ?? defaultEndpoint)();
        if (endpoint) {
          const remote = Comlink.wrap<RecalcApi>(endpoint) as unknown as AsyncRecalcApi;
          terminate = () => endpoint.terminate?.();
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('worker sem resposta')), options.pingTimeoutMs ?? 3000)
          );
          await Promise.race([remote.ping(), timeout]);
          mode = 'worker';
          return remote;
        }
      } catch {
        terminate?.();
        terminate = undefined;
      }
    }
    mode = 'sync';
    return syncBackend();
  };

  const api = (): Promise<AsyncRecalcApi> => (backend ??= select());

  return {
    get mode() {
      return mode;
    },
    ping: async () => (await api()).ping(),
    init: async sheets => (await api()).init(sheets),
    applyEdits: async edits => (await api()).applyEdits(edits),
    replaceSheet: async sheet => (await api()).replaceSheet(sheet),
    evaluateFlow: async (graph, opts) => (await api()).evaluateFlow(graph, opts),
    dispose: () => terminate?.(),
  };
}
