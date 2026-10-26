// src/features/agent/tools/write.ts
// Ferramentas de ESCRITA. Cada uma devolve um novo espaço de trabalho; nada é mutado.
// As que apagam dados estão em `destructive.ts` e sempre pedem confirmação.

import { CellData, CellFormat, Sheet } from '../../../types/spreadsheet';
import { cellPosToKey, colIndexToLabel, shiftFormula } from '../../../engine/formulaParser';
import { executeGroupBy } from '../../../engine/pipelineEngine';
import { createEmptySheet } from '../../../data/sampleDatasets';
import { applyHealthFix, previewHealthFix } from '../../relations/analysis/health';
import { DATE_FORMATS, DateFormat } from '../../relations/analysis/dates';
import { HealthFix } from '../../relations/analysis/healthTypes';
import { CopilotChartConfig } from '../../../components/Copilot/CopilotChartCard';
import { ToolDef } from '../types';
import {
  asJson,
  columnIndex,
  commitSheet,
  fail,
  findSheet,
  headerOf,
  jsonCell,
  lastUsedCol,
  lastUsedRow,
  list,
  MAX_COLS,
  MAX_ROWS,
  MAX_WRITE_CELLS,
  num,
  ok,
  optStr,
  parseA1,
  parseRange,
  record,
  recalcAll,
  safeName,
  sheetTable,
  str,
  strList,
  toA1,
  toCell,
  ToolError,
  uniqueSheetId,
  uniqueSheetName,
  withCell,
} from './common';
import { scanFormulaErrors } from './read';
import { createChart, detectRegion } from '../../charts/chartData';
import { rangeToAddress } from '../../../engine/formulaParser';

const SHEET_PARAM = { type: 'string', description: 'Nome (ou id) da planilha.' } as const;
const HEADER_FORMAT: CellFormat = { bold: true, bgColor: '#1e293b', textColor: '#ffffff', align: 'center' };

/** Mensagem de verificação das células escritas: avisa se alguma fórmula deu erro. */
function errorNote(sheetsAfter: readonly Sheet[], sheetId: string): string {
  const { count, sample } = scanFormulaErrors(sheetsAfter, [sheetId]);
  return count === 0 ? '' : ` ATENÇÃO: ${count} célula(s) com erro de fórmula, por exemplo ${sample.slice(0, 3).join('; ')}. Corrija antes de concluir.`;
}

export const criarPlanilha: ToolDef = {
  name: 'criar_planilha',
  description:
    'Cria uma planilha nova com cabeçalho (linha 1) e linhas de dados. Valores que começam com "=" são fórmulas em português (SOMA, MÉDIA, SE, PROCX...). Referências usam A1 e a linha 1 é o cabeçalho. Torna a nova planilha a ativa.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      nome: { type: 'string', description: 'Nome da planilha (até 64 caracteres).' },
      colunas: { type: 'array', items: { type: 'string' }, description: 'Cabeçalhos.' },
      linhas: {
        type: 'array',
        description: 'Cada linha é uma lista de valores (texto, número ou fórmula).',
        items: { type: 'array', items: { type: 'string' } },
      },
    },
    required: ['nome', 'colunas', 'linhas'],
  },
  summarize: a => `Criar planilha "${String(a.nome)}"`,
  run: (ws, args) => {
    const headers = strList(args, 'colunas').map(h => safeName(h, 'Coluna'));
    const rows = list(args, 'linhas');
    if (headers.length === 0 || headers.length > MAX_COLS) throw new ToolError(`Informe de 1 a ${MAX_COLS} colunas.`);
    if (rows.length * headers.length > 20_000) throw new ToolError('Planilha grande demais (máximo de 20.000 células por criação).');

    const name = uniqueSheetName(ws, str(args, 'nome'));
    const id = uniqueSheetId(ws, 'sheet-ia');
    const sheet = createEmptySheet(id, name, Math.max(100, rows.length + 20), Math.max(26, headers.length + 2));
    const data: Record<string, CellData> = {};
    headers.forEach((h, c) => {
      data[cellPosToKey(0, c)] = { raw: h, value: h, format: HEADER_FORMAT };
    });
    rows.forEach((row, r) => {
      if (!Array.isArray(row)) throw new ToolError(`A linha ${r + 1} de "linhas" deve ser uma lista.`);
      row.slice(0, headers.length).forEach((value, c) => {
        const cell = toCell(value);
        if (cell.raw !== '') data[cellPosToKey(r + 1, c)] = cell;
      });
    });
    const created: Sheet = { ...sheet, data };
    const next = recalcAll({ ...ws, sheets: [...ws.sheets, created], activeSheetId: id });
    return ok(`Planilha "${name}" criada com ${rows.length} linha(s) e ${headers.length} coluna(s).${errorNote(next.sheets, id)}`, {
      workspace: next,
      touchedSheetIds: [id],
    });
  },
};

export const escreverCelulas: ToolDef = {
  name: 'escrever_celulas',
  description:
    'Grava valores ou fórmulas em células específicas (notação A1; linha 1 = cabeçalho). Use "" para esvaziar. Máximo de 2000 células por chamada.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      celulas: {
        type: 'array',
        items: {
          type: 'object',
          properties: { celula: { type: 'string', description: 'Ex.: B2' }, valor: { type: 'string', description: 'Texto, número ou fórmula (=...).' } },
          required: ['celula', 'valor'],
        },
      },
    },
    required: ['planilha', 'celulas'],
  },
  summarize: a => `Escrever ${Array.isArray(a.celulas) ? a.celulas.length : '?'} célula(s) em "${String(a.planilha)}"`,
  run: (ws, args) => {
    let sheet = findSheet(ws, str(args, 'planilha'));
    const cells = list(args, 'celulas');
    if (cells.length === 0 || cells.length > 2000) throw new ToolError('Informe de 1 a 2000 células.');
    for (const item of cells) {
      const o = record(item, 'Cada célula');
      const at = parseA1(str(o, 'celula'));
      sheet = withCell(sheet, at.row, at.col, toCell(o.valor));
    }
    const next = commitSheet(ws, sheet);
    return ok(`${cells.length} célula(s) gravada(s) em "${sheet.name}".${errorNote(next.sheets, sheet.id)}`, {
      workspace: next,
      touchedSheetIds: [sheet.id],
    });
  },
};

export const escreverBloco: ToolDef = {
  name: 'escrever_bloco',
  description:
    'Grava uma matriz de valores a partir de uma célula inicial (ex.: A1). Ideal para colar tabelas inteiras. Máximo de 5000 células.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      inicio: { type: 'string', description: 'Célula do canto superior esquerdo, ex.: A1.' },
      valores: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Lista de linhas.' },
    },
    required: ['planilha', 'inicio', 'valores'],
  },
  summarize: a => `Escrever bloco em "${String(a.planilha)}" a partir de ${String(a.inicio)}`,
  run: (ws, args) => {
    let sheet = findSheet(ws, str(args, 'planilha'));
    const start = parseA1(str(args, 'inicio'));
    const rows = list(args, 'valores');
    let count = 0;
    for (const [r, row] of rows.entries()) {
      if (!Array.isArray(row)) throw new ToolError(`A linha ${r + 1} de "valores" deve ser uma lista.`);
      for (const [c, value] of row.entries()) {
        if (++count > MAX_WRITE_CELLS) throw new ToolError(`Bloco grande demais (máximo de ${MAX_WRITE_CELLS} células).`);
        const at = { row: start.row + r, col: start.col + c };
        if (at.row >= MAX_ROWS || at.col >= MAX_COLS) throw new ToolError('O bloco ultrapassa os limites da planilha.');
        sheet = withCell(sheet, at.row, at.col, toCell(value));
      }
    }
    const next = commitSheet(ws, sheet);
    return ok(`${count} célula(s) gravada(s) em "${sheet.name}" a partir de ${toA1(start.row, start.col)}.${errorNote(next.sheets, sheet.id)}`, {
      workspace: next,
      touchedSheetIds: [sheet.id],
    });
  },
};

export const adicionarColunaFormula: ToolDef = {
  name: 'adicionar_coluna_formula',
  description:
    'Cria uma coluna calculada: escreva a fórmula para a PRIMEIRA linha de dados (linha 2) e ela é replicada para todas as linhas com dados, ajustando as referências relativas como no Excel (use $ para fixar). Ex.: "=C2*D2" ou "=SEERRO(PROCX(A2; Preços!A:A; Preços!C:C); 0)". Informa as primeiras linhas calculadas e avisa sobre erros.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      titulo: { type: 'string', description: 'Cabeçalho da nova coluna.' },
      formula: { type: 'string', description: 'Fórmula da linha 2, começando com "=".' },
      coluna: { type: 'string', description: 'Opcional: letra da coluna de destino. Padrão: primeira coluna livre à direita.' },
      linha_final: { type: 'integer', description: 'Opcional: última linha (1-based). Padrão: última linha com dados.' },
    },
    required: ['planilha', 'titulo', 'formula'],
  },
  summarize: a => `Adicionar coluna "${String(a.titulo)}" em "${String(a.planilha)}"`,
  run: (ws, args) => {
    let sheet = findSheet(ws, str(args, 'planilha'));
    const template = str(args, 'formula').trim();
    if (!template.startsWith('=')) throw new ToolError('A fórmula deve começar com "=".');
    const title = safeName(str(args, 'titulo'), 'Título');
    const lastRow = Math.min(MAX_ROWS - 1, args.linha_final === undefined ? lastUsedRow(sheet) : num(args, 'linha_final') - 1);
    if (lastRow < 1) throw new ToolError('A planilha não tem linhas de dados para calcular.');
    const colRef = optStr(args, 'coluna');
    const col = colRef ? columnIndex(sheet, colRef) : lastUsedCol(sheet) + 1;
    if (col >= MAX_COLS) throw new ToolError('Sem colunas livres.');

    sheet = withCell(sheet, 0, col, { raw: title, value: title, format: HEADER_FORMAT });
    for (let r = 1; r <= lastRow; r++) sheet = withCell(sheet, r, col, { raw: shiftFormula(template, r - 1, 0), value: '' });
    const next = commitSheet(ws, sheet);
    const after = next.sheets.find(s => s.id === sheet.id)!;
    const preview = [1, 2, 3]
      .filter(r => r <= lastRow)
      .map(r => `${toA1(r, col)} = ${String(after.data[cellPosToKey(r, col)]?.value ?? '')}`)
      .join('; ');
    return ok(
      `Coluna ${colIndexToLabel(col)} ("${title}") criada em "${sheet.name}" com ${lastRow} fórmula(s). Primeiros resultados: ${preview}.${errorNote(next.sheets, sheet.id)}`,
      { workspace: next, touchedSheetIds: [sheet.id] }
    );
  },
};

export const ordenar: ToolDef = {
  name: 'ordenar',
  description:
    'Ordena as linhas de dados (a linha 1 de cabeçalho fica no lugar) por uma coluna. Fórmulas de cada linha acompanham a linha.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      coluna: { type: 'string', description: 'Cabeçalho ou letra.' },
      ordem: { type: 'string', enum: ['asc', 'desc'] },
    },
    required: ['planilha', 'coluna'],
  },
  summarize: a => `Ordenar "${String(a.planilha)}" por ${String(a.coluna)}`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const col = columnIndex(sheet, str(args, 'coluna'));
    const dir = optStr(args, 'ordem') === 'desc' ? -1 : 1;
    const last = lastUsedRow(sheet);
    const width = lastUsedCol(sheet) + 1;
    const rows = Array.from({ length: last }, (_, i) => i + 1).map(r => ({
      from: r,
      sortValue: sheet.data[cellPosToKey(r, col)]?.value ?? null,
    }));
    const empty = (v: unknown): boolean => v === null || v === undefined || v === '';
    rows.sort((a, b) => {
      if (empty(a.sortValue) !== empty(b.sortValue)) return empty(a.sortValue) ? 1 : -1; // vazios sempre no fim
      if (typeof a.sortValue === 'number' && typeof b.sortValue === 'number') return (a.sortValue - b.sortValue) * dir;
      return String(a.sortValue ?? '').localeCompare(String(b.sortValue ?? ''), 'pt-BR', { numeric: true }) * dir;
    });
    const data = { ...sheet.data };
    for (let r = 1; r <= last; r++) for (let c = 0; c < width; c++) delete data[cellPosToKey(r, c)];
    rows.forEach((row, index) => {
      const target = index + 1;
      for (let c = 0; c < width; c++) {
        const cell = sheet.data[cellPosToKey(row.from, c)];
        if (!cell) continue;
        data[cellPosToKey(target, c)] = cell.raw.startsWith('=') ? { ...cell, raw: shiftFormula(cell.raw, target - row.from, 0) } : cell;
      }
    });
    const next = commitSheet(ws, { ...sheet, data });
    return ok(`${last} linha(s) de "${sheet.name}" ordenadas por "${headerOf(sheet, col)}" (${dir === 1 ? 'crescente' : 'decrescente'}).`, {
      workspace: next,
      touchedSheetIds: [sheet.id],
    });
  },
};

export const removerDuplicados: ToolDef = {
  name: 'remover_duplicados',
  description: 'Remove linhas totalmente repetidas (mantém a primeira ocorrência). Informa quantas foram removidas.',
  risk: 'write',
  parameters: { type: 'object', properties: { planilha: SHEET_PARAM }, required: ['planilha'] },
  summarize: a => `Remover duplicadas em "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const preview = previewHealthFix(sheet, { kind: 'remove_duplicates' });
    if (preview.removedRows === 0) return ok(`Nenhuma linha duplicada em "${sheet.name}".${preview.skipped.length ? ` ${preview.skipped.join(' ')}` : ''}`);
    const next = commitSheet(ws, preview.sheet);
    return ok(`${preview.removedRows} linha(s) duplicada(s) removida(s) de "${sheet.name}".`, { workspace: next, touchedSheetIds: [sheet.id] });
  },
};

const FIXES = ['aparar_espacos', 'padronizar_numero', 'padronizar_texto', 'normalizar_datas'] as const;

export const corrigirDados: ToolDef = {
  name: 'corrigir_dados',
  description:
    'Limpeza de dados: aparar_espacos (remove espaços sobrando), padronizar_numero (texto numérico vira número), padronizar_texto (número vira texto, útil para códigos) e normalizar_datas (unifica o formato). Informa quantas células mudaram.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      correcao: { type: 'string', enum: FIXES },
      colunas: { type: 'array', items: { type: 'string' }, description: 'Colunas afetadas (aparar_espacos aceita várias; as demais usam a primeira). Vazio = todas em aparar_espacos.' },
      formato_data: { type: 'string', enum: DATE_FORMATS, description: 'Só para normalizar_datas. Padrão dd/mm/yyyy.' },
    },
    required: ['planilha', 'correcao'],
  },
  summarize: a => `Corrigir dados (${String(a.correcao)}) em "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const kind = str(args, 'correcao');
    if (!(FIXES as readonly string[]).includes(kind)) throw new ToolError(`Correção "${kind}" inválida.`);
    const requested = strList(args, 'colunas', false).map(c => headerOf(sheet, columnIndex(sheet, c)));
    const all = sheetTable(sheet).headers;
    let fix: HealthFix;
    if (kind === 'aparar_espacos') fix = { kind: 'trim_spaces', columns: requested.length ? requested : all };
    else {
      if (requested.length === 0) throw new ToolError('Informe a coluna em "colunas".');
      if (kind === 'normalizar_datas') {
        const format = (optStr(args, 'formato_data') ?? 'dd/mm/yyyy') as DateFormat;
        if (!DATE_FORMATS.includes(format)) throw new ToolError(`Formato de data "${format}" inválido.`);
        fix = { kind: 'normalize_dates', column: requested[0], to: format };
      } else fix = { kind: 'standardize_type', column: requested[0], to: kind === 'padronizar_numero' ? 'number' : 'text' };
    }
    const preview = previewHealthFix(sheet, fix);
    if (preview.changedCells === 0) return ok(`Nada a corrigir.${preview.skipped.length ? ` ${preview.skipped.join(' ')}` : ''}`);
    const next = commitSheet(ws, applyHealthFix(sheet, fix));
    return ok(`${preview.changedCells} célula(s) corrigida(s) em "${sheet.name}".${preview.skipped.length ? ` Ignorado: ${preview.skipped.join(' ')}` : ''}`, {
      workspace: next,
      touchedSheetIds: [sheet.id],
    });
  },
};

const NUMBER_FORMATS = { moeda: 'currency', percentual: 'percentage', data: 'date', numero: 'number', texto: 'text', geral: 'general' } as const;

export const formatar: ToolDef = {
  name: 'formatar',
  description: 'Formata um intervalo: negrito, itálico, cores (#RRGGBB), alinhamento e formato numérico (moeda, percentual, data, numero, texto, geral).',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      intervalo: { type: 'string', description: 'Ex.: A1:F1.' },
      negrito: { type: 'boolean' },
      italico: { type: 'boolean' },
      cor_fundo: { type: 'string', description: '#RRGGBB' },
      cor_texto: { type: 'string', description: '#RRGGBB' },
      alinhamento: { type: 'string', enum: ['left', 'center', 'right'] },
      formato: { type: 'string', enum: Object.keys(NUMBER_FORMATS) },
      casas_decimais: { type: 'integer' },
    },
    required: ['planilha', 'intervalo'],
  },
  summarize: a => `Formatar ${String(a.intervalo)} em "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const range = parseRange(str(args, 'intervalo'));
    if ((range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1) > 50_000) throw new ToolError('Intervalo grande demais para formatar de uma vez.');
    const color = (key: string): string | undefined => {
      const v = optStr(args, key);
      if (v !== undefined && !/^#[0-9a-fA-F]{6}$/.test(v)) throw new ToolError(`"${key}" deve ser uma cor #RRGGBB.`);
      return v;
    };
    const patch: Partial<CellFormat> = {};
    if (typeof args.negrito === 'boolean') patch.bold = args.negrito;
    if (typeof args.italico === 'boolean') patch.italic = args.italico;
    const bg = color('cor_fundo');
    if (bg) patch.bgColor = bg;
    const fg = color('cor_texto');
    if (fg) patch.textColor = fg;
    const align = optStr(args, 'alinhamento');
    if (align) patch.align = align as CellFormat['align'];
    const fmt = optStr(args, 'formato');
    if (fmt) {
      if (!(fmt in NUMBER_FORMATS)) throw new ToolError(`Formato "${fmt}" inválido.`);
      patch.type = NUMBER_FORMATS[fmt as keyof typeof NUMBER_FORMATS];
    }
    if (args.casas_decimais !== undefined) patch.decimals = Math.max(0, Math.min(10, Math.round(num(args, 'casas_decimais'))));
    if (Object.keys(patch).length === 0) throw new ToolError('Informe ao menos uma opção de formatação.');

    const data = { ...sheet.data };
    for (let r = range.r0; r <= range.r1; r++) {
      for (let c = range.c0; c <= range.c1; c++) {
        const key = cellPosToKey(r, c);
        const prev = data[key] ?? { raw: '', value: '' };
        data[key] = { ...prev, format: { ...prev.format, ...patch } };
      }
    }
    const next: typeof ws = { ...ws, sheets: ws.sheets.map(s => (s.id === sheet.id ? { ...sheet, data, rowCount: Math.max(sheet.rowCount, range.r1 + 1), colCount: Math.max(sheet.colCount, range.c1 + 1) } : s)) };
    return ok(`Formatação aplicada em ${str(args, 'intervalo')} de "${sheet.name}".`, { workspace: next, touchedSheetIds: [sheet.id] });
  },
};

export const renomearPlanilha: ToolDef = {
  name: 'renomear_planilha',
  description: 'Renomeia uma planilha. Atualize manualmente fórmulas que citem o nome antigo.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: { planilha: SHEET_PARAM, novo_nome: { type: 'string' } },
    required: ['planilha', 'novo_nome'],
  },
  summarize: a => `Renomear "${String(a.planilha)}" para "${String(a.novo_nome)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const name = uniqueSheetName(ws, str(args, 'novo_nome'), sheet.id);
    return ok(`Planilha renomeada para "${name}".`, {
      workspace: { ...ws, sheets: ws.sheets.map(s => (s.id === sheet.id ? { ...s, name } : s)) },
      touchedSheetIds: [sheet.id],
    });
  },
};

const CHART_TYPES = ['bar', 'line', 'area', 'pie'] as const;
const PALETTE = ['#107c41', '#2563eb', '#f59e0b', '#7c3aed', '#ec4899', '#06b6d4'];

export const criarGrafico: ToolDef = {
  name: 'criar_grafico',
  description:
    'Gera um gráfico no painel de conversa (não fica na planilha) agrupando a coluna do eixo X e somando/tirando a média das colunas do eixo Y. Para colocar um gráfico DENTRO da planilha, use inserir_grafico.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      titulo: { type: 'string' },
      tipo: { type: 'string', enum: CHART_TYPES },
      coluna_x: { type: 'string' },
      colunas_y: { type: 'array', items: { type: 'string' } },
      agregacao: { type: 'string', enum: ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'], description: 'Padrão SUM.' },
    },
    required: ['planilha', 'titulo', 'tipo', 'coluna_x', 'colunas_y'],
  },
  summarize: a => `Gráfico "${String(a.titulo)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const table = sheetTable(sheet);
    const type = str(args, 'tipo');
    if (!(CHART_TYPES as readonly string[]).includes(type)) throw new ToolError(`Tipo de gráfico "${type}" inválido.`);
    const x = headerOf(sheet, columnIndex(sheet, str(args, 'coluna_x')));
    const ys = strList(args, 'colunas_y').map(y => headerOf(sheet, columnIndex(sheet, y)));
    const agg = (optStr(args, 'agregacao') ?? 'SUM') as 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
    const grouped = executeGroupBy(table.rows, [x], ys.map(colName => ({ colName, aggType: agg, outputName: colName })));
    const data = grouped.rows.slice(0, 60).map(row => {
      const point: Record<string, string | number | null> = { [x]: jsonCell(row[x]) as string | number | null };
      for (const y of ys) point[y] = typeof row[y] === 'number' ? (row[y] as number) : Number(row[y]) || 0;
      return point;
    });
    if (data.length === 0) return fail('Sem dados para o gráfico.');
    const config: CopilotChartConfig = {
      title: str(args, 'titulo'),
      type: type as CopilotChartConfig['type'],
      xAxisKey: x,
      data,
      series: ys.map((y, i) => ({ key: y, name: y, color: PALETTE[i % PALETTE.length] })),
    };
    return ok(`Gráfico "${config.title}" gerado com ${data.length} ponto(s).`, { data: asJson({ pontos: data.length }), artifacts: [{ kind: 'chart', config }] });
  },
};

export const inserirGrafico: ToolDef = {
  name: 'inserir_grafico',
  description:
    'Insere um gráfico DENTRO da planilha, desenhado sobre as células. Ele lê o intervalo (1ª coluna = categorias, colunas seguintes = séries numéricas, 1ª linha = nomes) e se atualiza sozinho quando os dados mudam. Se o intervalo não for informado, usa a tabela que começa em A1.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      intervalo: { type: 'string', description: 'Ex.: A1:C13. Opcional.' },
      tipo: { type: 'string', enum: ['bar', 'line', 'area', 'pie'], description: 'Padrão: bar (barras).' },
      titulo: { type: 'string', description: 'Título do gráfico. Opcional.' },
    },
    required: ['planilha'],
  },
  summarize: a => `Inserir gráfico em "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const range = optStr(args, 'intervalo') ?? rangeToAddress(detectRegion(sheet, 0, 0));
    const type = (optStr(args, 'tipo') ?? 'bar') as 'bar' | 'line' | 'area' | 'pie';
    if (!['bar', 'line', 'area', 'pie'].includes(type)) throw new ToolError(`Tipo de gráfico "${type}" inválido.`);
    const created = createChart(sheet, { range, type, title: optStr(args, 'titulo') });
    if (!created.ok) return fail(created.error);
    const updated = { ...sheet, charts: [...(sheet.charts ?? []), created.chart] };
    return ok(`Gráfico "${created.chart.title}" inserido em "${sheet.name}" sobre o intervalo ${range}.`, {
      workspace: { ...ws, sheets: ws.sheets.map(s => (s.id === sheet.id ? updated : s)) },
      touchedSheetIds: [sheet.id],
    });
  },
};

export const writeTools: ToolDef[] = [
  inserirGrafico,
  criarPlanilha,
  escreverCelulas,
  escreverBloco,
  adicionarColunaFormula,
  ordenar,
  removerDuplicados,
  corrigirDados,
  formatar,
  renomearPlanilha,
  criarGrafico,
];
