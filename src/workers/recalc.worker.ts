// src/workers/recalc.worker.ts
// Worker de recálculo: expõe o RecalcService via Comlink. Use createRecalcClient() em vez de importar isto.

import * as Comlink from 'comlink';
import { RecalcService } from '../engine/recalc/service';

const service = new RecalcService();
Comlink.expose(service);

export type RecalcWorkerApi = RecalcService;
