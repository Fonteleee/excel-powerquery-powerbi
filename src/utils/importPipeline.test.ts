// src/utils/importPipeline.test.ts
// Pipeline de importação (leitura + conversão + cálculo), relatório de fidelidade e cancelamento.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { cellPosToKey } from '../engine/formulaParser';
import { startImport, type ImportWorkerLike } from './importClient';
import { ImportCancelledError, ImportProgress, runImportPipeline, sameResult, sheetFidelity, summarizeReport } from './importPipeline';
import type { ImportWorkerResponse } from './importProtocol';
import { observeRestoredResults } from './importedResults';
import { Sheet } from '../types/spreadsheet';

/** Arquivo com fórmulas e o resultado que o "Excel" guardou: 1 bate, 1 diverge, 1 o motor não sabe calcular. */
function buildFile(): Uint8Array {
  const wb = XLSX.utils.book_new();
  const dados: XLSX.WorkSheet = {
    A1: { t: 'n', v: 10 },
    A2: { t: 'n', v: 5 },
    A3: { t: 'n', v: 15, f: 'A1+A2' }, // bate
    A4: { t: 'n', v: 999, f: 'A1+A2' }, // o arquivo guardou outro resultado: diverge
    A5: { t: 'n', v: 42, f: 'FUNCAOQUENAOEXISTE(A1)' }, // o motor falha: usa o valor do arquivo
    '!ref': 'A1:A5',
  };
  const resumo: XLSX.WorkSheet = {
    A1: { t: 's', v: 'Total' },
    B1: { t: 'n', v: 30, f: 'SUM(Dados!A1:A2)*2' }, // referência entre abas
    '!ref': 'A1:B1',
  };
  XLSX.utils.book_append_sheet(wb, dados, 'Dados');
  XLSX.utils.book_append_sheet(wb, resumo, 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Vazia');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('runImportPipeline', () => {
  it('devolve as abas já calculadas e o relatório de fidelidade por aba', () => {
    const { sheets, report } = runImportPipeline(buildFile(), 'forecast.xlsx');
    assert.deepEqual(sheets.map(s => s.name), ['Dados', 'Resumo']);
    const dados = sheets[0];
    assert.equal(dados.data[cellPosToKey(2, 0)].value, 15);
    assert.equal(dados.data[cellPosToKey(3, 0)].value, 15, 'o motor recalcula; o valor do arquivo (999) não prevalece');
    assert.equal(dados.data[cellPosToKey(4, 0)].value, 42, 'função desconhecida: fica o resultado do arquivo');
    assert.equal(sheets[1].data[cellPosToKey(0, 1)].value, 30);

    const [fDados, fResumo] = report.sheets;
    assert.deepEqual({ ...fDados }, { name: 'Dados', formulas: 3, matched: 1, fallback: 1, divergent: 1, unverified: 0 });
    assert.deepEqual({ ...fResumo }, { name: 'Resumo', formulas: 1, matched: 1, fallback: 0, divergent: 0, unverified: 0 });
    assert.deepEqual(report.totals, { formulas: 4, matched: 2, fallback: 1, divergent: 1, unverified: 0 });
    assert.deepEqual(report.skipped, ['Vazia (vazia)']);
    assert.ok(report.timings.totalMs >= 0);
    assert.match(summarizeReport(report), /4 fórmulas, 2 batem com o Excel, 1 com o valor do arquivo como reserva, 1 divergentes/);
  });

  it('informa o progresso por etapa, sempre crescente, terminando em 100%', () => {
    const events: ImportProgress[] = [];
    runImportPipeline(buildFile(), 'f.xlsx', { onProgress: p => events.push(p) });
    const stages = events.map(e => e.stage);
    assert.equal(stages[0], 'reading');
    assert.equal(stages.at(-1), 'done');
    for (const stage of ['converting', 'calculating'] as const) assert.ok(stages.includes(stage), stage);
    assert.ok(events.some(e => /Convertendo aba 2 de 3/.test(e.message)));
    assert.ok(events.some(e => /Calculando fórmulas da aba 2 de 2/.test(e.message)));
    for (let i = 1; i < events.length; i++) assert.ok(events[i].percent >= events[i - 1].percent, 'percentual não pode voltar');
    assert.equal(events.at(-1)?.percent, 100);
  });

  it('não deixa o observador de reservas ligado depois de terminar', () => {
    runImportPipeline(buildFile(), 'f.xlsx');
    let calls = 0;
    observeRestoredResults(() => calls++);
    observeRestoredResults(null);
    assert.equal(calls, 0);
  });
});

describe('contagem do relatório de fidelidade', () => {
  const sheet = (data: Sheet['data']): Sheet => ({ id: 's', name: 'S', data, rowCount: 10, colCount: 5, colWidths: {}, rowHeights: {}, mergedRegions: [], conditionalRules: [] });

  it('classifica cada fórmula: bate, reserva, diverge e não comparável', () => {
    const s = sheet({
      R0C0: { raw: '=A1', value: 1, excelValue: 1 },
      R1C0: { raw: '=A1', value: 1.0000000000001, excelValue: 1 }, // dentro da tolerância
      R2C0: { raw: '=A1', value: 7, excelValue: 8 },
      R3C0: { raw: '=A1', value: 'Sim', excelValue: 'Sim' },
      R4C0: { raw: '=A1', value: 3, excelValue: 3 }, // reserva
      R5C0: { raw: '=A1', value: '#N/D', excelValue: '#N/D' }, // erro nos dois lados: concorda
      R6C0: { raw: '=A1', value: 45000, excelValue: 'texto qualquer', format: { type: 'date' } }, // não comparável
      R7C0: { raw: '10', value: 10 }, // não é fórmula
      R8C0: { raw: '=A1', value: 1 }, // sem resultado do arquivo: não conta
    });
    const f = sheetFidelity(s, new Set(['R4C0', 'R5C0']));
    assert.deepEqual({ ...f }, { name: 'S', formulas: 7, matched: 4, fallback: 1, divergent: 1, unverified: 1 });
  });

  it('sameResult compara números com tolerância, texto aparado e vazios', () => {
    assert.ok(sameResult(0.1 + 0.2, 0.3));
    assert.ok(sameResult('  ok ', 'ok'));
    assert.ok(sameResult(null, ''));
    assert.ok(sameResult(5, '5'));
    assert.ok(!sameResult(5, 6));
    assert.ok(!sameResult(true, false));
  });
});

describe('cancelamento', () => {
  it('o pipeline para entre as abas quando shouldCancel devolve true', () => {
    let calls = 0;
    assert.throws(
      () => runImportPipeline(buildFile(), 'f.xlsx', { shouldCancel: () => ++calls > 3 }),
      (err: unknown) => err instanceof ImportCancelledError
    );
  });

  it('cancelar antes de começar não lê nada', () => {
    let read = false;
    assert.throws(
      () => runImportPipeline(buildFile(), 'f.xlsx', { shouldCancel: () => true, onProgress: () => (read = true) }),
      ImportCancelledError
    );
    assert.equal(read, false);
  });

  it('o cliente encerra o worker e rejeita a promessa ao cancelar', async () => {
    let terminated = false;
    const fake: ImportWorkerLike = {
      postMessage: () => {},
      terminate: () => {
        terminated = true;
      },
      onmessage: null,
      onerror: null,
    };
    const job = startImport(buildFile(), 'f.xlsx', { createWorker: () => fake });
    assert.equal(job.mode, 'worker');
    job.cancel();
    await assert.rejects(job.promise, ImportCancelledError);
    assert.equal(terminated, true);
    // Resposta tardia do worker é ignorada.
    fake.onmessage?.({ data: { type: 'error', message: 'tarde' } } as MessageEvent<ImportWorkerResponse>);
  });

  it('o cliente entrega progresso e resultado do worker', async () => {
    const progress: string[] = [];
    const fake: ImportWorkerLike = { postMessage: () => {}, terminate: () => {}, onmessage: null, onerror: null };
    const job = startImport(buildFile(), 'f.xlsx', { createWorker: () => fake, onProgress: p => progress.push(p.message) });
    const outcome = runImportPipeline(buildFile(), 'f.xlsx');
    fake.onmessage?.({ data: { type: 'progress', progress: { stage: 'reading', message: 'Lendo o arquivo…', percent: 1 } } } as MessageEvent<ImportWorkerResponse>);
    fake.onmessage?.({ data: { type: 'done', outcome } } as MessageEvent<ImportWorkerResponse>);
    assert.deepEqual(progress, ['Lendo o arquivo…']);
    assert.equal((await job.promise).sheets.length, 2);
  });

  it('sem worker (Node), roda na mesma thread e também pode ser cancelado', async () => {
    const ok = startImport(buildFile(), 'f.xlsx', { createWorker: () => null });
    assert.equal(ok.mode, 'sync');
    assert.equal((await ok.promise).report.totals.formulas, 4);

    const cancelled = startImport(buildFile(), 'f.xlsx', { createWorker: () => null });
    cancelled.cancel();
    await assert.rejects(cancelled.promise, ImportCancelledError);
  });
});
