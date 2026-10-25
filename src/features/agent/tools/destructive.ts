// src/features/agent/tools/destructive.ts
// Ferramentas que APAGAM dados. Risco `destructive`: o laço do agente sempre pede confirmação ao usuário.

import { CellData, Sheet } from '../../../types/spreadsheet';
import { cellPosToKey, shiftFormula } from '../../../engine/formulaParser';
import { ToolDef } from '../types';
import {
  columnIndex,
  commitSheet,
  findSheet,
  MAX_ROWS,
  ok,
  parseRange,
  recalcAll,
  str,
  strList,
  toA1,
  ToolError,
} from './common';

const SHEET_PARAM = { type: 'string', description: 'Nome (ou id) da planilha.' } as const;

/** Aceita "5", "5:9" ou "3,5:7" (linhas como o usuário vê: a linha 1 é o cabeçalho). */
function parseRowSpec(spec: string): number[] {
  const rows = new Set<number>();
  for (const part of spec.split(',')) {
    const m = /^\s*(\d{1,6})\s*(?::\s*(\d{1,6}))?\s*$/.exec(part);
    if (!m) throw new ToolError(`Linhas "${spec}" inválidas. Use o formato 5, 5:9 ou 3,5:7.`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < a || b > MAX_ROWS) throw new ToolError(`Intervalo de linhas "${part}" inválido.`);
    if (b - a > 20_000) throw new ToolError('Intervalo de linhas grande demais.');
    for (let r = a; r <= b; r++) rows.add(r - 1);
  }
  return [...rows].sort((x, y) => x - y);
}

export const excluirPlanilha: ToolDef = {
  name: 'excluir_planilha',
  description: 'Exclui uma planilha inteira. Peça só quando o usuário pediu. Não é possível excluir a última planilha.',
  risk: 'destructive',
  parameters: { type: 'object', properties: { planilha: SHEET_PARAM }, required: ['planilha'] },
  summarize: a => `EXCLUIR a planilha "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    if (ws.sheets.length <= 1) throw new ToolError('Não dá para excluir a última planilha.');
    const sheets = ws.sheets.filter(s => s.id !== sheet.id);
    const activeSheetId = ws.activeSheetId === sheet.id ? sheets[0].id : ws.activeSheetId;
    const graph = {
      ...ws.graph,
      nodes: ws.graph.nodes.filter(n => !(n.kind === 'table' && n.sheetId === sheet.id)),
    };
    const ids = new Set(graph.nodes.map(n => n.id));
    graph.edges = ws.graph.edges.filter(e => ids.has(e.from) && ids.has(e.to));
    return ok(`Planilha "${sheet.name}" excluída.`, { workspace: recalcAll({ sheets, activeSheetId, graph }), touchedSheetIds: [] });
  },
};

export const excluirLinhas: ToolDef = {
  name: 'excluir_linhas',
  description:
    'Exclui linhas inteiras (numeração da planilha: linha 1 = cabeçalho). Ex.: "5", "5:9" ou "3,5:7". As linhas de baixo sobem.',
  risk: 'destructive',
  parameters: {
    type: 'object',
    properties: { planilha: SHEET_PARAM, linhas: { type: 'string', description: 'Ex.: 5:9' } },
    required: ['planilha', 'linhas'],
  },
  summarize: a => `EXCLUIR linhas ${String(a.linhas)} de "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const rows = parseRowSpec(str(args, 'linhas'));
    const removed = new Set(rows);
    const next: Record<string, CellData> = {};
    for (const key of Object.keys(sheet.data)) {
      const m = /^R(\d+)C(\d+)$/.exec(key);
      if (!m) continue;
      const row = Number(m[1]);
      if (removed.has(row)) continue;
      const shift = rows.filter(r => r < row).length;
      const cell = sheet.data[key];
      next[cellPosToKey(row - shift, Number(m[2]))] = shift > 0 && cell.raw.startsWith('=') ? { ...cell, raw: shiftFormula(cell.raw, -shift, 0) } : cell;
    }
    const updated: Sheet = { ...sheet, data: next };
    return ok(`${rows.length} linha(s) excluída(s) de "${sheet.name}".`, { workspace: commitSheet(ws, updated), touchedSheetIds: [sheet.id] });
  },
};

export const excluirColunas: ToolDef = {
  name: 'excluir_colunas',
  description: 'Exclui colunas inteiras (por cabeçalho ou letra). As colunas à direita se deslocam para a esquerda.',
  risk: 'destructive',
  parameters: {
    type: 'object',
    properties: { planilha: SHEET_PARAM, colunas: { type: 'array', items: { type: 'string' } } },
    required: ['planilha', 'colunas'],
  },
  summarize: a => `EXCLUIR colunas ${Array.isArray(a.colunas) ? a.colunas.join(', ') : ''} de "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const cols = [...new Set(strList(args, 'colunas').map(c => columnIndex(sheet, c)))].sort((a, b) => a - b);
    if (cols.length === 0) throw new ToolError('Informe ao menos uma coluna.');
    const removed = new Set(cols);
    const next: Record<string, CellData> = {};
    for (const key of Object.keys(sheet.data)) {
      const m = /^R(\d+)C(\d+)$/.exec(key);
      if (!m) continue;
      const col = Number(m[2]);
      if (removed.has(col)) continue;
      const shift = cols.filter(c => c < col).length;
      const cell = sheet.data[key];
      next[cellPosToKey(Number(m[1]), col - shift)] = shift > 0 && cell.raw.startsWith('=') ? { ...cell, raw: shiftFormula(cell.raw, 0, -shift) } : cell;
    }
    return ok(`${cols.length} coluna(s) excluída(s) de "${sheet.name}".`, {
      workspace: commitSheet(ws, { ...sheet, data: next }),
      touchedSheetIds: [sheet.id],
    });
  },
};

export const limparIntervalo: ToolDef = {
  name: 'limpar_intervalo',
  description: 'Apaga o conteúdo de um intervalo A1 (a formatação é mantida).',
  risk: 'destructive',
  parameters: {
    type: 'object',
    properties: { planilha: SHEET_PARAM, intervalo: { type: 'string', description: 'Ex.: B2:D20' } },
    required: ['planilha', 'intervalo'],
  },
  summarize: a => `LIMPAR ${String(a.intervalo)} em "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const range = parseRange(str(args, 'intervalo'));
    const data = { ...sheet.data };
    let cleared = 0;
    for (const key of Object.keys(data)) {
      const m = /^R(\d+)C(\d+)$/.exec(key);
      if (!m) continue;
      const row = Number(m[1]);
      const col = Number(m[2]);
      if (row < range.r0 || row > range.r1 || col < range.c0 || col > range.c1) continue;
      cleared++;
      data[key] = data[key].format ? { raw: '', value: '', format: data[key].format } : ({ raw: '', value: '' } as CellData);
      if (!data[key].format) delete data[key];
    }
    return ok(`${cleared} célula(s) limpa(s) em ${toA1(range.r0, range.c0)}:${toA1(range.r1, range.c1)} de "${sheet.name}".`, {
      workspace: commitSheet(ws, { ...sheet, data }),
      touchedSheetIds: [sheet.id],
    });
  },
};

export const destructiveTools: ToolDef[] = [excluirPlanilha, excluirLinhas, excluirColunas, limparIntervalo];
