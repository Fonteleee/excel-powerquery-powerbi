// src/utils/importProtocol.ts
// Mensagens trocadas entre a página e o worker de importação (só tipos).

import type { ImportOutcome, ImportProgress, ImportReport } from './importPipeline';

export class ImportCancelledError extends Error {
  constructor() {
    super('Importação cancelada.');
    this.name = 'ImportCancelledError';
  }
}

export type ImportWorkerRequest = { type: 'import'; bytes: ArrayBuffer; fileName: string };

export type ImportWorkerResponse =
  | { type: 'progress'; progress: ImportProgress }
  | { type: 'done'; outcome: ImportOutcome }
  | { type: 'error'; message: string };

/** Resumo em uma linha para o aviso (notify). */
export function summarizeReport(report: ImportReport): string {
  const t = report.totals;
  const head = `"${report.fileName}": ${report.sheets.length} aba(s) importada(s)`;
  if (t.formulas === 0) return `${head}, sem fórmulas.`;
  const parts = [`${t.formulas} fórmulas`, `${t.matched} batem com o Excel`];
  if (t.fallback > 0) parts.push(`${t.fallback} com o valor do arquivo como reserva`);
  if (t.divergent > 0) parts.push(`${t.divergent} divergentes`);
  return `${head}: ${parts.join(', ')}.`;
}
