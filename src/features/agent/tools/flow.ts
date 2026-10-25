// src/features/agent/tools/flow.ts
// Ferramentas do FLUXO (aba Relacionamentos): o agente monta cruzamentos, agregações e filtros como nós
// do grafo, mede a qualidade e executa. Tudo passa pelas mesmas funções puras da interface.

import { Sheet } from '../../../types/spreadsheet';
import {
  addOutputNode,
  addTableNode,
  addTransformNode,
  connect,
  removeNode,
} from '../../relations/model/editor';
import { FlowGraph, FlowNode, TransformParams } from '../../relations/model/graph';
import { parseFlowGraph } from '../../relations/model/schema';
import { evaluateGraph, NodeResult } from '../../relations/runtime/evaluate';
import { materializeGraph } from '../../relations/runtime/materialize';
import { exportFlowAsSql } from '../../relations/sql';
import { ToolDef, Workspace } from '../types';
import {
  asJson,
  clip,
  columnIndex,
  fail,
  findSheet,
  headerOf,
  list,
  ok,
  optStr,
  record,
  recalcAll,
  safeName,
  sheetTable,
  str,
  strList,
  ToolError,
} from './common';

const SHEET_PARAM = { type: 'string', description: 'Nome (ou id) da planilha.' } as const;
const RUN_PARAM = { type: 'boolean', description: 'Executar o fluxo e gerar/atualizar a aba de saída (padrão: sim).' } as const;

function label(node: FlowNode, ws: Workspace): string {
  if (node.kind === 'table') return `Tabela "${ws.sheets.find(s => s.id === node.sheetId)?.name ?? node.sheetId}"`;
  if (node.kind === 'output') return `Saída "${node.sheetName}"`;
  return `${node.params.op === 'lookup' ? 'Busca' : node.params.op === 'aggregate' ? 'Agregação' : 'Filtro'} ${node.id}`;
}

function describeResult(node: FlowNode, result: NodeResult | undefined): string {
  if (!result) return 'sem resultado';
  if (result.error) return `ERRO: ${result.rootCause ?? result.error}`;
  const rows = result.table?.rows.length ?? 0;
  if (result.lookup) {
    const s = result.lookup;
    return `${rows} linha(s); ${s.matchRate.toFixed(1)}% de correspondência, ${s.orphans} órfão(s), ${s.cardinality}`;
  }
  return node.kind === 'table' ? `${rows} linha(s)` : `${rows} linha(s) no resultado`;
}

/** Posiciona nós novos em colunas: tabelas à esquerda, transformações no meio, saídas à direita. */
function column(graph: FlowGraph, kind: FlowNode['kind']): { x: number; y: number } {
  const x = kind === 'table' ? 80 : kind === 'transform' ? 460 : 840;
  const inColumn = graph.nodes.filter(n => n.kind === kind).length;
  return { x, y: 60 + inColumn * 190 };
}

interface Built {
  graph: FlowGraph;
  workspace: Workspace;
  transformId: string;
  outputId: string;
  message: string;
}

/** Valida o grafo novo, avalia e (opcionalmente) materializa a aba de saída. */
function finalize(ws: Workspace, graph: FlowGraph, transformId: string, outputId: string, run: boolean): Built | string {
  const checked = parseFlowGraph(graph);
  if (!checked.ok) return `O fluxo ficou inválido: ${checked.errors.join('; ')}`;
  const results = evaluateGraph(checked.graph, ws.sheets);
  const trf = results.get(transformId);
  if (!trf || trf.error) return trf?.rootCause ?? trf?.error ?? 'Não foi possível avaliar a transformação.';

  let sheets = ws.sheets;
  let note = '';
  if (run) {
    const done = materializeGraph(checked.graph, ws.sheets, results);
    sheets = done.sheets;
    const out = checked.graph.nodes.find(n => n.id === outputId);
    const written = out && done.sheets.find(s => s.id === `flow-out-${outputId}`);
    note = written ? ` Aba "${written.name}" gerada com ${trf.table?.rows.length ?? 0} linha(s).` : '';
    const err = done.errors[outputId];
    if (err) note = ` Não foi possível gerar a aba: ${err}.`;
  }
  const node = checked.graph.nodes.find(n => n.id === transformId)!;
  return {
    graph: checked.graph,
    workspace: recalcAll({ ...ws, graph: checked.graph, sheets }),
    transformId,
    outputId,
    message: `${describeResult(node, trf)}.${note}`,
  };
}

/** Garante nó de tabela para a planilha e devolve seu id. */
function tableNodeFor(graph: FlowGraph, sheet: Sheet): { graph: FlowGraph; id: string } {
  const added = addTableNode(graph, sheet.id, column(graph, 'table'));
  if (!added.ok) throw new ToolError(added.error);
  return { graph: added.graph, id: added.id };
}

/** Constrói origem → transformação → saída. */
function buildChain(
  ws: Workspace,
  params: TransformParams,
  sourceSheet: Sheet,
  lookupSheet: Sheet | null,
  outputName: string,
  run: boolean
): Built | string {
  let graph = ws.graph;
  const source = tableNodeFor(graph, sourceSheet);
  graph = source.graph;
  let lookupId: string | null = null;
  if (lookupSheet) {
    const lookup = tableNodeFor(graph, lookupSheet);
    graph = lookup.graph;
    lookupId = lookup.id;
  }
  const trf = addTransformNode(graph, params, column(graph, 'transform'));
  if (!trf.ok) return trf.error;
  graph = trf.graph;
  const out = addOutputNode(graph, outputName, column(graph, 'output'));
  if (!out.ok) return out.error;
  graph = out.graph;

  const steps: [string, string, 'in' | 'lookup'][] = [
    [source.id, trf.id, 'in'],
    ...(lookupId ? ([[lookupId, trf.id, 'lookup']] as [string, string, 'in' | 'lookup'][]) : []),
    [trf.id, out.id, 'in'],
  ];
  for (const [from, to, port] of steps) {
    const linked = connect(graph, from, to, port);
    if (!linked.ok) return linked.error;
    graph = linked.graph;
  }
  return finalize(ws, graph, trf.id, out.id, run);
}

const wantsRun = (args: Record<string, unknown>): boolean => args.executar !== false;

export const fluxoAdicionarBusca: ToolDef = {
  name: 'fluxo_adicionar_busca',
  description:
    'Cruza duas planilhas no fluxo (PROCX/PROCV): traz colunas da planilha de busca para a de origem usando uma chave. Cria os nós no grafo da aba Relacionamentos, mede a qualidade da chave (% de correspondência, órfãos, cardinalidade) e gera a aba de saída. Use verificar_chave antes quando houver dúvida sobre a chave.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      planilha_origem: SHEET_PARAM,
      chave_origem: { type: 'string', description: 'Coluna-chave na planilha de origem.' },
      planilha_busca: SHEET_PARAM,
      chave_busca: { type: 'string', description: 'Coluna-chave na planilha de busca.' },
      colunas_retorno: { type: 'array', items: { type: 'string' }, description: 'Colunas da planilha de busca a trazer.' },
      se_nao_encontrado: { type: 'string', description: 'Valor quando não há correspondência (padrão vazio).' },
      prefixo: { type: 'string', description: 'Prefixo opcional dos nomes das colunas trazidas.' },
      nome_saida: { type: 'string', description: 'Nome da aba de saída.' },
      executar: RUN_PARAM,
    },
    required: ['planilha_origem', 'chave_origem', 'planilha_busca', 'chave_busca', 'colunas_retorno', 'nome_saida'],
  },
  summarize: a => `Cruzar "${String(a.planilha_origem)}" com "${String(a.planilha_busca)}" → "${String(a.nome_saida)}"`,
  run: (ws, args) => {
    const source = findSheet(ws, str(args, 'planilha_origem'));
    const lookup = findSheet(ws, str(args, 'planilha_busca'));
    const params: TransformParams = {
      op: 'lookup',
      sourceKey: headerOf(source, columnIndex(source, str(args, 'chave_origem'))),
      lookupKey: headerOf(lookup, columnIndex(lookup, str(args, 'chave_busca'))),
      returns: strList(args, 'colunas_retorno').map(c => headerOf(lookup, columnIndex(lookup, c))),
      ifNotFound: optStr(args, 'se_nao_encontrado') ?? '',
      prefix: optStr(args, 'prefixo'),
    };
    const built = buildChain(ws, params, source, lookup, str(args, 'nome_saida'), wantsRun(args));
    if (typeof built === 'string') return fail(built);
    return ok(`Busca criada no fluxo: ${built.message}`, { workspace: built.workspace, touchedSheetIds: [] });
  },
};

const AGGS = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'] as const;

export const fluxoAdicionarAgregacao: ToolDef = {
  name: 'fluxo_adicionar_agregacao',
  description:
    'Agrupa e resume uma planilha no fluxo (SOMASE/MÉDIASE/CONT.SE): agrupa por colunas e calcula SUM, AVG, COUNT, MIN ou MAX. Gera a aba de saída.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      agrupar_por: { type: 'array', items: { type: 'string' } },
      agregacoes: {
        type: 'array',
        items: {
          type: 'object',
          properties: { coluna: { type: 'string' }, agregacao: { type: 'string', enum: AGGS }, nome: { type: 'string' } },
          required: ['coluna', 'agregacao'],
        },
      },
      nome_saida: { type: 'string' },
      executar: RUN_PARAM,
    },
    required: ['planilha', 'agrupar_por', 'agregacoes', 'nome_saida'],
  },
  summarize: a => `Agregar "${String(a.planilha)}" → "${String(a.nome_saida)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const aggregations = list(args, 'agregacoes').map(item => {
      const o = record(item, 'Cada agregação');
      const agg = str(o, 'agregacao');
      if (!(AGGS as readonly string[]).includes(agg)) throw new ToolError(`Agregação "${agg}" inválida.`);
      const name = optStr(o, 'nome');
      return {
        column: headerOf(sheet, columnIndex(sheet, str(o, 'coluna'))),
        agg: agg as (typeof AGGS)[number],
        outputName: name ? safeName(name, 'Nome') : undefined,
      };
    });
    if (aggregations.length === 0) throw new ToolError('Informe ao menos uma agregação.');
    const params: TransformParams = {
      op: 'aggregate',
      groupBy: strList(args, 'agrupar_por').map(c => headerOf(sheet, columnIndex(sheet, c))),
      aggregations,
    };
    const built = buildChain(ws, params, sheet, null, str(args, 'nome_saida'), wantsRun(args));
    if (typeof built === 'string') return fail(built);
    return ok(`Agregação criada no fluxo: ${built.message}`, { workspace: built.workspace });
  },
};

const OPERATORS = ['=', '<>', '>', '<', '>=', '<=', 'contains'] as const;

export const fluxoAdicionarFiltro: ToolDef = {
  name: 'fluxo_adicionar_filtro',
  description: 'Filtra uma planilha no fluxo (FILTRO): mantém só as linhas que atendem todas as condições. Gera a aba de saída.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      planilha: SHEET_PARAM,
      condicoes: {
        type: 'array',
        items: {
          type: 'object',
          properties: { coluna: { type: 'string' }, operador: { type: 'string', enum: OPERATORS }, valor: { type: 'string' } },
          required: ['coluna', 'operador', 'valor'],
        },
      },
      nome_saida: { type: 'string' },
      executar: RUN_PARAM,
    },
    required: ['planilha', 'condicoes', 'nome_saida'],
  },
  summarize: a => `Filtrar "${String(a.planilha)}" → "${String(a.nome_saida)}"`,
  run: (ws, args) => {
    const sheet = findSheet(ws, str(args, 'planilha'));
    const conditions = list(args, 'condicoes').map(item => {
      const o = record(item, 'Cada condição');
      const operator = str(o, 'operador');
      if (!(OPERATORS as readonly string[]).includes(operator)) throw new ToolError(`Operador "${operator}" inválido.`);
      return {
        column: headerOf(sheet, columnIndex(sheet, str(o, 'coluna'))),
        operator: operator as (typeof OPERATORS)[number],
        value: String(o.valor ?? ''),
      };
    });
    if (conditions.length === 0) throw new ToolError('Informe ao menos uma condição.');
    sheetTable(sheet); // valida a leitura da planilha
    const built = buildChain(ws, { op: 'filter', conditions }, sheet, null, str(args, 'nome_saida'), wantsRun(args));
    if (typeof built === 'string') return fail(built);
    return ok(`Filtro criado no fluxo: ${built.message}`, { workspace: built.workspace });
  },
};

export const fluxoExecutar: ToolDef = {
  name: 'fluxo_executar',
  description: 'Executa o fluxo inteiro: recalcula todos os nós e gera/atualiza as abas de saída. Informa erros por saída.',
  risk: 'write',
  parameters: { type: 'object', properties: {} },
  summarize: () => 'Executar o fluxo',
  run: ws => {
    if (ws.graph.nodes.length === 0) return fail('O fluxo está vazio. Crie nós com fluxo_adicionar_busca, _agregacao ou _filtro.');
    const done = materializeGraph(ws.graph, ws.sheets);
    const errors = Object.entries(done.errors).map(([id, e]) => `${id}: ${e}`);
    const message = `${done.written.length} aba(s) de saída gerada(s)${done.removed.length ? `, ${done.removed.length} removida(s)` : ''}.${errors.length ? ` Erros: ${errors.join('; ')}` : ''}`;
    return { ok: errors.length === 0, message, workspace: recalcAll({ ...ws, sheets: done.sheets }), touchedSheetIds: [] };
  },
};

export const fluxoVer: ToolDef = {
  name: 'fluxo_ver',
  description: 'Descreve o fluxo atual: nós, ligações e o resultado de cada nó (linhas, erros, qualidade das chaves).',
  risk: 'read',
  parameters: { type: 'object', properties: {} },
  summarize: () => 'Ver o fluxo',
  run: ws => {
    if (ws.graph.nodes.length === 0) return ok('O fluxo está vazio.');
    const results = evaluateGraph(ws.graph, ws.sheets);
    const nodes = ws.graph.nodes.map(n => ({ id: n.id, nome: label(n, ws), situacao: describeResult(n, results.get(n.id)) }));
    const edges = ws.graph.edges.map(e => `${e.from} → ${e.to}${e.toPort === 'lookup' ? ' (busca)' : ''}`);
    return ok(`${nodes.length} nó(s), ${edges.length} ligação(ões).`, { data: asJson({ nos: nodes, ligacoes: edges }) });
  },
};

export const fluxoRemoverNo: ToolDef = {
  name: 'fluxo_remover_no',
  description: 'Remove um nó do fluxo (e suas ligações). A aba de saída correspondente some na próxima execução do fluxo.',
  risk: 'destructive',
  parameters: { type: 'object', properties: { id: { type: 'string', description: 'Id do nó (veja fluxo_ver).' } }, required: ['id'] },
  summarize: a => `REMOVER o nó "${String(a.id)}" do fluxo`,
  run: (ws, args) => {
    const id = str(args, 'id');
    if (!ws.graph.nodes.some(n => n.id === id)) throw new ToolError(`Nó "${id}" não existe. Use fluxo_ver para listar.`);
    return ok(`Nó "${id}" removido do fluxo.`, { workspace: { ...ws, graph: removeNode(ws.graph, id) } });
  },
};

export const fluxoExportarSql: ToolDef = {
  name: 'fluxo_exportar_sql',
  description: 'Gera o script SQL do fluxo atual (DuckDB ou PostgreSQL) para o usuário copiar ou baixar.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      dialeto: { type: 'string', enum: ['duckdb', 'postgres'] },
      saida: { type: 'string', enum: ['select', 'create_table'], description: 'Padrão select.' },
    },
  },
  summarize: a => `Exportar SQL (${String(a.dialeto ?? 'duckdb')})`,
  run: (ws, args) => {
    const dialect = optStr(args, 'dialeto') === 'postgres' ? 'postgres' : 'duckdb';
    const result = exportFlowAsSql(ws.graph, ws.sheets, { dialect, outputMode: optStr(args, 'saida') === 'create_table' ? 'create_table' : 'select' });
    if (!result.ok) return fail(result.errors.join('; '));
    return ok(`Script ${dialect} gerado (${result.queries.length} consulta(s)).${result.warnings.length ? ` Avisos: ${result.warnings.join('; ')}` : ''}`, {
      data: asJson({ trecho: clip(result.sql, 1200) }),
      artifacts: [{ kind: 'sql', dialect, sql: result.sql }],
    });
  },
};

export const flowTools: ToolDef[] = [
  fluxoAdicionarBusca,
  fluxoAdicionarAgregacao,
  fluxoAdicionarFiltro,
  fluxoExecutar,
  fluxoVer,
  fluxoRemoverNo,
  fluxoExportarSql,
];
