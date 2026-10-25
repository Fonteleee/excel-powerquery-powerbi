// src/features/agent/tools/read.ts
// Ferramentas de LEITURA: o agente investiga antes de agir. Nenhuma altera o espaço de trabalho.

import { Sheet } from '../../../types/spreadsheet';
import { cellPosToKey, colIndexToLabel } from '../../../engine/formulaParser';
import { executeFilter, executeGroupBy } from '../../../engine/pipelineEngine';
import { analyzeSheetHealth } from '../../relations/analysis/health';
import { inferColumnType, TYPE_LABELS } from '../../relations/analysis/typeInference';
import { FlowGraph } from '../../relations/model/graph';
import { Cell, evaluateGraph, Row } from '../../relations/runtime/evaluate';
import { ToolDef } from '../types';
import {
  asJson,
  clip,
  columnIndex,
  dataRowCount,
  fail,
  findSheet,
  headerOf,
  jsonCell,
  lastUsedCol,
  list,
  MAX_OUTPUT_CHARS,
  num,
  ok,
  optStr,
  parseRange,
  record,
  safeName,
  sheetTable,
  str,
  strList,
  toA1,
  ToolError,
} from './common';

const MAX_READ_CELLS = 600;
const MAX_QUERY_ROWS = 50;

const SHEET_PARAM = { type: 'string', description: 'Nome (ou id) da planilha.' } as const;

/** Valor mostrado ao modelo: fórmulas aparecem como "=... → resultado". */
function display(sheet: Sheet, row: number, col: number): string {
  const cell = sheet.data[cellPosToKey(row, col)];
  if (!cell) return '';
  if (cell.raw.startsWith('=')) return `${cell.raw} → ${cell.error ?? cell.value ?? ''}`;
  return cell.value === null || cell.value === undefined ? '' : String(cell.value);
}

export const listarPlanilhas: ToolDef = {
  name: 'listar_planilhas',
  description:
    'Lista todas as planilhas com tamanho e cabeçalhos. Use no início para conhecer o espaço de trabalho.',
  risk: 'read',
  parameters: { type: 'object', properties: {} },
  summarize: () => 'Listar planilhas',
  run: (ws, _args, env) => {
    const items = ws.sheets.map(s => {
      const cols = lastUsedCol(s) + 1;
      return {
        nome: s.name,
        id: s.id,
        ativa: s.id === ws.activeSheetId,
        linhas_de_dados: dataRowCount(s),
        colunas: cols,
        cabecalhos: Array.from({ length: cols }, (_, c) => headerOf(s, c)),
      };
    });
    const selection = env.selection ? ` Seleção do usuário: ${env.selection.address}.` : '';
    return ok(`${items.length} planilha(s).${selection}`, { data: asJson(items) });
  },
};

export const descreverPlanilha: ToolDef = {
  name: 'descrever_planilha',
  description:
    'Perfil completo de uma planilha: para cada coluna o tipo inferido pelos valores, preenchidos, vazios, valores distintos, mínimo/máximo/soma/média (colunas numéricas) e exemplos. Inclui a saúde dos dados (duplicadas, espaços, tipos mistos).',
  risk: 'read',
  parameters: { type: 'object', properties: { planilha: SHEET_PARAM }, required: ['planilha'] },
  summarize: a => `Analisar "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const table = sheetTable(sheet);
    const columns = table.headers.map(header => {
      const values: Cell[] = table.rows.map(r => r[header]);
      const info = inferColumnType(values, header);
      const numbers = values.filter((v): v is number => typeof v === 'number');
      const sum = numbers.reduce((a, b) => a + b, 0);
      const samples = [...new Set(values.filter(v => v !== null && v !== undefined && v !== '').map(String))].slice(0, 3);
      return {
        coluna: header,
        letra: colIndexToLabel(columnIndex(sheet, header)),
        tipo: TYPE_LABELS[info.type],
        preenchidos: info.filled,
        vazios: table.rows.length - info.filled,
        distintos: info.distinct,
        ...(numbers.length > 0
          ? {
              minimo: Math.min(...numbers),
              maximo: Math.max(...numbers),
              soma: Math.round(sum * 100) / 100,
              media: Math.round((sum / numbers.length) * 100) / 100,
            }
          : {}),
        exemplos: samples,
      };
    });
    const health = analyzeSheetHealth(sheet);
    return ok(`"${sheet.name}": ${table.rows.length} linha(s) de dados, ${table.headers.length} coluna(s).`, {
      data: asJson({
        planilha: sheet.name,
        linhas_de_dados: table.rows.length,
        colunas: columns,
        saude: {
          consistencia_pct: health.consistencyPercent,
          completude_pct: health.completenessPercent,
          linhas_duplicadas: health.duplicateRows,
          correcoes_sugeridas: health.fixes.map(f => f.title),
        },
      }),
    });
  },
};

export const lerIntervalo: ToolDef = {
  name: 'ler_intervalo',
  description:
    'Lê células de um intervalo em notação A1 (linha 1 = cabeçalho). Fórmulas aparecem como "=fórmula → resultado". Máximo de 600 células por chamada.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: { planilha: SHEET_PARAM, intervalo: { type: 'string', description: 'Ex.: A1:F20 ou B2.' } },
    required: ['planilha', 'intervalo'],
  },
  summarize: a => `Ler ${String(a.intervalo)} de "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const range = parseRange(str(args, 'intervalo'));
    const cells = (range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1);
    if (cells > MAX_READ_CELLS) {
      return fail(`Intervalo grande demais (${cells} células). Leia no máximo ${MAX_READ_CELLS} por vez ou use "consultar".`);
    }
    const rows: string[][] = [];
    for (let r = range.r0; r <= range.r1; r++) {
      const row: string[] = [];
      for (let c = range.c0; c <= range.c1; c++) row.push(display(sheet, r, c));
      rows.push(row);
    }
    const header = ['linha', ...Array.from({ length: range.c1 - range.c0 + 1 }, (_, i) => colIndexToLabel(range.c0 + i))];
    const lines = [header.join(' | '), ...rows.map((row, i) => [range.r0 + i + 1, ...row].join(' | '))];
    return ok(`${toA1(range.r0, range.c0)}:${toA1(range.r1, range.c1)} de "${sheet.name}":\n${clip(lines.join('\n'))}`);
  },
};

export const buscarValores: ToolDef = {
  name: 'buscar_valores',
  description: 'Procura um texto (sem diferenciar maiúsculas) nas células e devolve os endereços. Máximo de 50 resultados.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      texto: { type: 'string', description: 'Texto a procurar.' },
      coluna: { type: 'string', description: 'Opcional: restringe a uma coluna (nome ou letra).' },
    },
    required: ['planilha', 'texto'],
  },
  summarize: a => `Buscar "${String(a.texto)}" em "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const needle = str(args, 'texto').toLowerCase();
    const onlyCol = optStr(args, 'coluna') !== undefined ? columnIndex(sheet, str(args, 'coluna')) : null;
    const found: string[] = [];
    let total = 0;
    for (const key of Object.keys(sheet.data)) {
      const match = /^R(\d+)C(\d+)$/.exec(key);
      if (!match) continue;
      const row = Number(match[1]);
      const col = Number(match[2]);
      if (onlyCol !== null && col !== onlyCol) continue;
      const text = display(sheet, row, col);
      if (text.toLowerCase().includes(needle)) {
        total++;
        if (found.length < 50) found.push(`${toA1(row, col)}: ${text.slice(0, 80)}`);
      }
    }
    return ok(`${total} ocorrência(s)${total > found.length ? ` (mostrando ${found.length})` : ''}.\n${found.join('\n')}`);
  },
};

const OPERATORS = ['=', '<>', '>', '<', '>=', '<=', 'contains'] as const;
const AGGREGATIONS = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'] as const;

export const consultar: ToolDef = {
  name: 'consultar',
  description:
    'Consulta analítica sem alterar nada: filtra, agrupa, agrega e ordena os dados de uma planilha. Use para responder perguntas com números exatos (totais, médias, rankings). Máximo de 50 linhas no resultado.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      filtros: {
        type: 'array',
        description: 'Condições combinadas com E.',
        items: {
          type: 'object',
          properties: {
            coluna: { type: 'string' },
            operador: { type: 'string', enum: OPERATORS },
            valor: { type: 'string' },
          },
          required: ['coluna', 'operador', 'valor'],
        },
      },
      agrupar_por: { type: 'array', items: { type: 'string' }, description: 'Colunas de agrupamento.' },
      agregacoes: {
        type: 'array',
        items: {
          type: 'object',
          properties: { coluna: { type: 'string' }, agregacao: { type: 'string', enum: AGGREGATIONS } },
          required: ['coluna', 'agregacao'],
        },
      },
      ordenar_por: { type: 'string', description: 'Coluna do resultado para ordenar.' },
      ordem: { type: 'string', enum: ['asc', 'desc'] },
      limite: { type: 'integer', description: 'Máximo de linhas (padrão 20, teto 50).' },
    },
    required: ['planilha'],
  },
  summarize: a => `Consultar "${String(a.planilha)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const table = sheetTable(sheet);
    const known = new Set(table.headers);
    const need = (name: string): string => {
      safeName(name, 'Coluna');
      if (!known.has(name)) {
        const found = table.headers.find(h => h.toLowerCase() === name.toLowerCase());
        if (!found) throw new ToolError(`Coluna "${name}" não existe. Colunas: ${table.headers.join(', ')}.`);
        return found;
      }
      return name;
    };

    let rows: Row[] = table.rows;
    let headers = table.headers;

    const filtros = list(args, 'filtros', false).map(f => {
      const o = record(f, 'Cada filtro');
      const operador = str(o, 'operador');
      if (!(OPERATORS as readonly string[]).includes(operador)) throw new ToolError(`Operador "${operador}" inválido.`);
      return { colName: need(str(o, 'coluna')), operator: operador, value: String(o.valor ?? '') };
    });
    if (filtros.length > 0) rows = executeFilter(rows, filtros);

    const groupBy = strList(args, 'agrupar_por', false).map(need);
    const aggs = list(args, 'agregacoes', false).map(a => {
      const o = record(a, 'Cada agregação');
      const agg = str(o, 'agregacao');
      if (!(AGGREGATIONS as readonly string[]).includes(agg)) throw new ToolError(`Agregação "${agg}" inválida.`);
      return { colName: need(str(o, 'coluna')), aggType: agg as (typeof AGGREGATIONS)[number] };
    });
    if (groupBy.length > 0 || aggs.length > 0) {
      if (aggs.length === 0) throw new ToolError('Para agrupar informe ao menos uma agregação.');
      const grouped = rows.length === 0 ? { headers: [...groupBy, ...aggs.map(a => `${a.aggType}_${a.colName}`)], rows: [] as Row[] } : executeGroupBy(rows, groupBy, aggs);
      headers = grouped.headers;
      rows = grouped.rows;
    }

    const order = optStr(args, 'ordenar_por');
    if (order) {
      const key = headers.find(h => h === order) ?? headers.find(h => h.toLowerCase() === order.toLowerCase());
      if (!key) throw new ToolError(`Não há a coluna "${order}" no resultado. Colunas: ${headers.join(', ')}.`);
      const dir = optStr(args, 'ordem') === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const x = a[key];
        const y = b[key];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        return String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR') * dir;
      });
    }

    const limit = Math.min(MAX_QUERY_ROWS, Math.max(1, num(args, 'limite', 20)));
    const shown = rows.slice(0, limit);
    const out = shown.map(r => headers.map(h => jsonCell(r[h])));
    return ok(`${rows.length} linha(s) no resultado${rows.length > shown.length ? `, mostrando ${shown.length}` : ''}.`, {
      data: asJson({ colunas: headers, linhas: out }),
      artifacts: [{ kind: 'table', title: `Consulta em ${sheet.name}`, headers, rows: out }],
    });
  },
};

export const verificarChave: ToolDef = {
  name: 'verificar_chave',
  description:
    'Antes de cruzar duas planilhas, mede a qualidade da chave: % de correspondência, órfãos, duplicatas e cardinalidade (1:1, N:1, 1:N, N:N). Não altera nada.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      planilha_origem: SHEET_PARAM,
      coluna_origem: { type: 'string' },
      planilha_busca: SHEET_PARAM,
      coluna_busca: { type: 'string' },
    },
    required: ['planilha_origem', 'coluna_origem', 'planilha_busca', 'coluna_busca'],
  },
  summarize: a => `Verificar chave ${String(a.planilha_origem)}.${String(a.coluna_origem)} × ${String(a.planilha_busca)}.${String(a.coluna_busca)}`,
  run: (ws, args) => {
    const source = findSheet(ws, str(args, 'planilha_origem'));
    const lookup = findSheet(ws, str(args, 'planilha_busca'));
    const sourceKey = headerOf(source, columnIndex(source, str(args, 'coluna_origem')));
    const lookupKey = headerOf(lookup, columnIndex(lookup, str(args, 'coluna_busca')));
    const graph: FlowGraph = {
      version: 1,
      nodes: [
        { id: 'a', kind: 'table', sheetId: source.id, x: 0, y: 0 },
        { id: 'b', kind: 'table', sheetId: lookup.id, x: 0, y: 0 },
        { id: 'l', kind: 'transform', x: 0, y: 0, params: { op: 'lookup', sourceKey, lookupKey, returns: [], ifNotFound: '' } },
      ],
      edges: [
        { id: 'e1', from: 'a', to: 'l', toPort: 'in' },
        { id: 'e2', from: 'b', to: 'l', toPort: 'lookup' },
      ],
    };
    const result = evaluateGraph(graph, ws.sheets).get('l');
    if (!result || result.error || !result.lookup) return fail(result?.rootCause ?? result?.error ?? 'Não foi possível medir a chave.');
    const s = result.lookup;
    return ok(
      `Chave "${sourceKey}" × "${lookupKey}": ${s.matchRate.toFixed(1)}% de correspondência (${s.matched} de ${s.sourceRows}), ${s.orphans} órfão(s), ${s.duplicateLookupKeys} chave(s) repetida(s) na busca, cardinalidade ${s.cardinality}.`,
      { data: asJson({ ...s }) }
    );
  },
};

/** Procura erros de fórmula (#REF!, #VALOR!, #DIV/0!, #CIRCULAR!...) e devolve até 20 endereços. */
export function scanFormulaErrors(sheets: readonly Sheet[], onlyIds?: readonly string[]): { count: number; sample: string[] } {
  const sample: string[] = [];
  let count = 0;
  for (const sheet of sheets) {
    if (onlyIds && !onlyIds.includes(sheet.id)) continue;
    for (const key of Object.keys(sheet.data)) {
      const cell = sheet.data[key];
      const text = typeof cell.value === 'string' ? cell.value : '';
      if (cell.error || (cell.raw.startsWith('=') && /^#[A-ZÀ-Ú/0!?]+/.test(text))) {
        count++;
        if (sample.length < 20) {
          const m = /^R(\d+)C(\d+)$/.exec(key);
          if (m) sample.push(`${sheet.name}!${toA1(Number(m[1]), Number(m[2]))}: ${cell.error ?? text}`);
        }
      }
    }
  }
  return { count, sample };
}

export const verificarErros: ToolDef = {
  name: 'verificar_erros',
  description: 'Procura células com erro de fórmula (#REF!, #VALOR!, #DIV/0!, #CIRCULAR!...) em uma ou todas as planilhas.',
  risk: 'read',
  parameters: { type: 'object', properties: { planilha: { type: 'string', description: 'Opcional; padrão: todas.' } } },
  summarize: a => (a.planilha ? `Verificar erros em "${String(a.planilha)}"` : 'Verificar erros em todas as planilhas'),
  run: (ws, args) => {
    const name = optStr(args, 'planilha');
    const ids = name ? [findSheet(ws, name).id] : undefined;
    const { count, sample } = scanFormulaErrors(ws.sheets, ids);
    return count === 0 ? ok('Nenhum erro de fórmula encontrado.') : ok(`${count} célula(s) com erro:\n${sample.join('\n')}`);
  },
};

export const readTools: ToolDef[] = [listarPlanilhas, descreverPlanilha, lerIntervalo, buscarValores, consultar, verificarChave, verificarErros];

export { MAX_OUTPUT_CHARS };
