// src/features/relations/sql/compile.ts
// Compilador de FlowGraph para um script SQL com CTEs (DuckDB e PostgreSQL).
// Puro: não toca em planilhas além de ler as tabelas já preparadas por `prepareInputs`.

import { inputsOf, topologicalOrder } from '../model/dag';
import { FlowGraph, FlowNode } from '../model/graph';
import { commentLine } from './dialects/common';
import { getDialect } from './dialects';
import { generateInputTablesSql, INTERNAL_PREFIX, InputTable, PreparedInputs, uniqueSqlName } from './inputs';
import { compileAggregate } from './ops/aggregate';
import { CompiledNode, CompileNodeError, CteDef } from './ops/expr';
import { compileFilter } from './ops/filter';
import { compileLookup } from './ops/lookup';
import {
  MAX_SCRIPT_CHARS,
  ROW_COLUMN,
  SQL_FORMAT_VERSION,
  SqlDialect,
  SqlDialectId,
  SqlSafetyError,
} from './types';

export type OutputMode = 'select' | 'create_table';

export interface CompileOptions {
  dialect?: SqlDialect | SqlDialectId;
  /** `select` devolve o resultado; `create_table` grava em uma tabela com o nome da aba de saída. */
  outputMode?: OutputMode;
  /** Só para o carimbo do cabeçalho (injetável para testes determinísticos). */
  generatedAt?: Date;
  /** Inclui `CREATE TABLE`/`INSERT` das planilhas de entrada no script (padrão: sim). */
  includeInputs?: boolean;
}

export interface CompiledQuery {
  nodeId: string;
  label: string;
  /** Nome da tabela criada (só em `create_table`). */
  tableName: string | null;
  /** Colunas visíveis do resultado, na ordem. */
  headers: string[];
  sql: string;
}

export type SqlExportResult =
  | {
      ok: true;
      dialect: SqlDialectId;
      /** Script completo: cabeçalho + entradas + consultas. */
      sql: string;
      /** Instruções que criam e carregam as tabelas de entrada (uma por item). */
      setup: string[];
      queries: CompiledQuery[];
      warnings: string[];
    }
  | { ok: false; errors: string[] };

const nodeLabel = (node: FlowNode): string => node.label?.trim() || node.id;

function cteNameOf(nodeId: string): string {
  return `${INTERNAL_PREFIX}${nodeId}`;
}

function opDescription(node: FlowNode): string {
  if (node.kind === 'table') return 'Tabela';
  if (node.kind === 'output') return 'Saída';
  return { lookup: 'Busca (PROCX/PROCV)', aggregate: 'Agrupamento', filter: 'Filtro' }[node.params.op];
}

function tableCte(node: FlowNode, input: InputTable, dialect: SqlDialect): CompiledNode {
  const columns = [...input.columns.map(c => dialect.quoteIdent(c.name)), dialect.quoteIdent(ROW_COLUMN)];
  const name = cteNameOf(node.id);
  return {
    ctes: [
      {
        name,
        comment: `Tabela de entrada: ${input.sheetName}`,
        body: `SELECT ${columns.join(', ')}\nFROM ${dialect.quoteIdent(input.sqlName)}`,
      },
    ],
    resultCte: name,
    columns: input.columns,
  };
}

function numericOnTextWarnings(node: FlowNode, input: CompiledNode): string[] {
  if (node.kind !== 'transform') return [];
  const textColumns = new Set(input.columns.filter(c => c.type === 'varchar').map(c => c.name));
  const used: string[] = [];
  if (node.params.op === 'aggregate') {
    for (const a of node.params.aggregations) if (a.agg !== 'COUNT' && textColumns.has(a.column)) used.push(a.column);
  } else if (node.params.op === 'filter') {
    for (const c of node.params.conditions) if (textColumns.has(c.column) && c.operator !== 'contains') used.push(c.column);
  }
  return used.length === 0
    ? []
    : [
        `Nó "${nodeLabel(node)}": as colunas de texto ${used.map(u => `"${u}"`).join(', ')} são lidas como número só nos formatos 1234.5, 1234,5 e 1.234,5 (sem R$, % nem hh:mm).`,
      ];
}

interface Plan {
  compiled: Map<string, CompiledNode>;
  errors: Map<string, string>;
  warnings: string[];
}

function planNodes(graph: FlowGraph, order: string[], inputs: PreparedInputs, dialect: SqlDialect): Plan {
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
  const tableBySheet = new Map(inputs.tables.map(t => [t.sheetId, t]));
  const plan: Plan = { compiled: new Map(), errors: new Map(), warnings: [] };

  for (const id of order) {
    const node = nodeById.get(id)!;
    try {
      if (node.kind === 'table') {
        const input = tableBySheet.get(node.sheetId);
        if (!input) throw new CompileNodeError(`Planilha "${node.sheetId}" não encontrada`);
        plan.compiled.set(id, tableCte(node, input, dialect));
        continue;
      }

      const wires = inputsOf(graph, id);
      if (!wires.in) throw new CompileNodeError('Conecte uma entrada');
      const main = plan.compiled.get(wires.in.from);
      if (!main) throw new CompileNodeError('A entrada tem erro');

      if (node.kind === 'output') {
        plan.compiled.set(id, { ctes: [], resultCte: main.resultCte, columns: main.columns });
        continue;
      }

      const ctx = { dialect, cteBase: cteNameOf(id) };
      plan.warnings.push(...numericOnTextWarnings(node, main));
      if (node.params.op === 'aggregate') {
        plan.compiled.set(id, compileAggregate(node.params, main, ctx));
      } else if (node.params.op === 'filter') {
        plan.compiled.set(id, compileFilter(node.params, main, ctx));
      } else {
        if (!wires.lookup) throw new CompileNodeError('Conecte a tabela de busca');
        const lookup = plan.compiled.get(wires.lookup.from);
        if (!lookup) throw new CompileNodeError('A tabela de busca tem erro');
        plan.compiled.set(id, compileLookup(node.params, main, lookup, ctx));
      }
    } catch (error) {
      if (error instanceof CompileNodeError || error instanceof SqlSafetyError) {
        plan.errors.set(id, error.message);
      } else {
        throw error;
      }
    }
  }
  return plan;
}

/** Nós (em ordem topológica) necessários para produzir `targetId`. */
function ancestorsOf(graph: FlowGraph, order: string[], targetId: string): string[] {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.to);
    if (list) list.push(edge.from);
    else incoming.set(edge.to, [edge.from]);
  }
  const needed = new Set<string>();
  const stack = [targetId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (needed.has(id)) continue;
    needed.add(id);
    for (const from of incoming.get(id) ?? []) stack.push(from);
  }
  return order.filter(id => needed.has(id));
}

function renderWith(ctes: CteDef[], dialect: SqlDialect): string {
  const blocks = ctes.map(cte => {
    const body = cte.body.split('\n').map(line => `    ${line}`).join('\n');
    return `  ${commentLine(cte.comment)}\n  ${dialect.quoteIdent(cte.name)} AS (\n${body}\n  )`;
  });
  return `WITH\n${blocks.join(',\n')}`;
}

function pickTargets(graph: FlowGraph): FlowNode[] {
  const outputs = graph.nodes.filter(n => n.kind === 'output');
  if (outputs.length > 0) return outputs;
  const hasOutgoing = new Set(graph.edges.map(e => e.from));
  return graph.nodes.filter(n => n.kind === 'transform' && !hasOutgoing.has(n.id));
}

function buildHeader(dialect: SqlDialect, generatedAt: Date, warnings: string[]): string {
  const lines = [
    commentLine('Fluxo exportado da aba Relacionamentos (Excel PowerQuery PowerBI)'),
    commentLine(`Formato do script: v${SQL_FORMAT_VERSION}`),
    commentLine(`Dialeto: ${dialect.label}`),
    commentLine(`Gerado em: ${generatedAt.toISOString()}`),
  ];
  if (warnings.length > 0) {
    lines.push(commentLine('AVISOS:'));
    for (const warning of warnings) lines.push(commentLine(`  - ${warning}`));
  }
  return lines.join('\n');
}

/**
 * Compila o grafo para SQL. As tabelas de entrada vêm de `prepareInputs(graph, sheets)`.
 * Nenhum nome ou valor do usuário entra no texto sem passar pelo dialeto (aspas e escape).
 */
export function compileFlowToSql(
  graph: FlowGraph,
  inputs: PreparedInputs,
  options: CompileOptions = {}
): SqlExportResult {
  const dialect = typeof options.dialect === 'object' ? options.dialect : getDialect(options.dialect ?? 'duckdb');
  const mode: OutputMode = options.outputMode ?? 'select';

  if (inputs.errors.length > 0) return { ok: false, errors: inputs.errors };
  const order = topologicalOrder(graph);
  if (!order.ok) return { ok: false, errors: [`O grafo tem ciclo envolvendo: ${order.cycle.join(', ')}`] };

  const targets = pickTargets(graph);
  if (targets.length === 0) return { ok: false, errors: ['O grafo não tem nó de saída nem transformação final'] };

  const plan = planNodes(graph, order.order, inputs, dialect);
  const warnings = [...new Set(plan.warnings)];

  const errors: string[] = [];
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
  const queries: CompiledQuery[] = [];
  const usedNames = new Set(inputs.tables.map(t => t.sqlName.toLowerCase()));

  try {
    for (const target of targets) {
      const chain = ancestorsOf(graph, order.order, target.id);
      const broken = chain.find(id => plan.errors.has(id) || !plan.compiled.has(id));
      if (broken !== undefined) {
        const node = nodeById.get(broken)!;
        errors.push(`Nó "${nodeLabel(node)}" (${opDescription(node)}): ${plan.errors.get(broken) ?? 'A entrada tem erro'}`);
        continue;
      }

      const ctes = chain.flatMap(id => plan.compiled.get(id)!.ctes);
      const result = plan.compiled.get(target.id)!;
      if (result.columns.length === 0) {
        errors.push(`Nó "${nodeLabel(target)}": o resultado não tem colunas`);
        continue;
      }
      const headers = result.columns.map(c => c.name);
      const select =
        `SELECT ${headers.map(h => dialect.quoteIdent(h)).join(', ')}\n` +
        `FROM ${dialect.quoteIdent(result.resultCte)}\n` +
        `ORDER BY ${dialect.quoteIdent(ROW_COLUMN)}`;
      const query = `${renderWith(ctes, dialect)}\n${select}`;

      let tableName: string | null = null;
      let sql: string;
      if (mode === 'create_table') {
        const wanted = target.kind === 'output' ? target.sheetName : nodeLabel(target);
        tableName = uniqueSqlName(wanted, usedNames);
        sql = dialect.createTableAs(dialect.quoteIdent(tableName), query);
      } else {
        sql = `${query};`;
      }
      queries.push({
        nodeId: target.id,
        label: nodeLabel(target),
        tableName,
        headers,
        sql: `${commentLine(`Saída: ${nodeLabel(target)}`)}\n${sql}`,
      });
    }
  } catch (error) {
    if (error instanceof SqlSafetyError) return { ok: false, errors: [error.message] };
    throw error;
  }
  if (errors.length > 0) return { ok: false, errors };

  let setup: string[] = [];
  if (options.includeInputs !== false) {
    const generated = generateInputTablesSql(inputs, dialect);
    if (!generated.ok) return generated;
    setup = generated.statements;
  }

  const parts = [buildHeader(dialect, options.generatedAt ?? new Date(), warnings)];
  if (setup.length > 0) parts.push(commentLine('Dados de entrada'), ...setup);
  parts.push(commentLine('Fluxo'), ...queries.map(q => q.sql));
  const sql = `${parts.join('\n\n')}\n`;
  if (sql.length > MAX_SCRIPT_CHARS) {
    return { ok: false, errors: [`Script maior que o limite de ${MAX_SCRIPT_CHARS} caracteres`] };
  }

  return { ok: true, dialect: dialect.id, sql, setup, queries, warnings };
}
