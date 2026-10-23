// src/features/relations/excel/workbook.ts
// Ponte entre a aba `_Flow_v1` e um workbook do SheetJS (`xlsx`), o mesmo usado por excelExporter.ts.

import * as XLSX from 'xlsx';
import { FlowGraph } from '../model/graph';
import {
  FLOW_SHEET_NAME,
  FlowSheetParseResult,
  parseFlowFromRows,
  SerializeOptions,
  serializeFlowToRows,
} from './flowSheet';

/** `veryHidden`: a aba não aparece nem em "Reexibir" do Excel. */
const VERY_HIDDEN = 2;
/** Limite de linhas lidas da aba antes de converter (defesa contra arquivos hostis). */
const MAX_SHEET_ROWS = 20_000;
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** Acrescenta (ou substitui) a aba oculta `_Flow_v1` com o grafo. Não toca nas demais abas. */
export function appendFlowSheet(workbook: XLSX.WorkBook, graph: FlowGraph, options: SerializeOptions = {}): void {
  const existing = workbook.SheetNames.indexOf(FLOW_SHEET_NAME);
  if (existing >= 0) {
    workbook.SheetNames.splice(existing, 1);
    delete workbook.Sheets[FLOW_SHEET_NAME];
    workbook.Workbook?.Sheets?.splice(existing, 1);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(serializeFlowToRows(graph, options));
  worksheet['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 40 }, { wch: 7 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, FLOW_SHEET_NAME);

  workbook.Workbook = workbook.Workbook ?? {};
  const sheets = (workbook.Workbook.Sheets = workbook.Workbook.Sheets ?? []);
  while (sheets.length < workbook.SheetNames.length) {
    sheets.push({ name: workbook.SheetNames[sheets.length], Hidden: 0 });
  }
  sheets[workbook.SheetNames.indexOf(FLOW_SHEET_NAME)] = { name: FLOW_SHEET_NAME, Hidden: VERY_HIDDEN };
}

/** Lê o fluxo de um workbook. Sem a aba, devolve erro (não é falha do arquivo). */
export function extractFlowFromWorkbook(workbook: XLSX.WorkBook): FlowSheetParseResult & { missing?: boolean } {
  const name = workbook.SheetNames.find(n => n.toLowerCase() === FLOW_SHEET_NAME.toLowerCase());
  if (!name) return { ok: false, errors: ['Este arquivo não tem a aba de fluxo _Flow_v1'], missing: true };

  const worksheet = workbook.Sheets[name];
  const range = worksheet?.['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;
  if (!worksheet || !range) return { ok: false, errors: ['A aba de fluxo está vazia'] };
  if (range.e.r - range.s.r + 1 > MAX_SHEET_ROWS) {
    return { ok: false, errors: [`A aba de fluxo tem linhas demais (limite ${MAX_SHEET_ROWS})`] };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: '', blankrows: false });
  return parseFlowFromRows(rows);
}

/** Lê o fluxo direto de um arquivo .xlsx (bytes). Só lê o necessário e nunca executa fórmulas. */
export function readFlowFromArrayBuffer(buffer: ArrayBuffer): FlowSheetParseResult & { missing?: boolean } {
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    return { ok: false, errors: ['Arquivo grande demais para importar o fluxo'] };
  }
  try {
    const options = { type: 'array', cellFormula: false, cellHTML: false, bookVBA: false } as const;
    // Primeiro só os nomes das abas; depois lê apenas a aba do fluxo (não processa as demais).
    const names = XLSX.read(buffer, { ...options, bookSheets: true }).SheetNames;
    const flowName = names.find(n => n.toLowerCase() === FLOW_SHEET_NAME.toLowerCase());
    if (!flowName) return { ok: false, errors: ['Este arquivo não tem a aba de fluxo _Flow_v1'], missing: true };
    return extractFlowFromWorkbook(XLSX.read(buffer, { ...options, sheets: flowName }));
  } catch {
    return { ok: false, errors: ['Não foi possível ler o arquivo como planilha do Excel'] };
  }
}
