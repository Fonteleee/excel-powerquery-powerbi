// src/features/relations/ui/nodeText.ts
// Textos curtos que descrevem uma transformação no próprio nó (título, resumo e estado). Puro e testável.

import { AggregateParams, FilterParams, LookupParams, TransformParams } from '../model/graph';
import type { NodeResult } from '../runtime/evaluate';
import { formatCount, formatPercent, truncate } from './format';

export interface NodeSummary {
  title: string;
  /** Equivalente na planilha. */
  excelName: string;
  lines: string[];
  /** Falta configurar algo no painel. */
  needsSetup: boolean;
}

function summarizeLookup(p: LookupParams): NodeSummary {
  if (!p.sourceKey || !p.lookupKey) {
    return { title: 'Buscar valores', excelName: 'PROCX', lines: ['Escolha as colunas-chave'], needsSetup: true };
  }
  const returns = p.returns.length === 0 ? 'nenhuma coluna de retorno' : `+ ${truncate(p.returns.join(', '), 28)}`;
  return {
    title: 'Buscar valores',
    excelName: 'PROCX',
    lines: [truncate(`${p.sourceKey} ⇄ ${p.lookupKey}`, 30), returns],
    needsSetup: p.returns.length === 0,
  };
}

function summarizeAggregate(p: AggregateParams): NodeSummary {
  if (p.aggregations.length === 0) {
    return { title: 'Agregar', excelName: 'SOMASE', lines: ['Escolha o que agregar'], needsSetup: true };
  }
  const first = p.aggregations[0];
  const more = p.aggregations.length > 1 ? ` +${p.aggregations.length - 1}` : '';
  return {
    title: 'Agregar',
    excelName: 'SOMASE',
    lines: [
      p.groupBy.length > 0 ? truncate(`por ${p.groupBy.join(', ')}`, 30) : 'total geral',
      truncate(`${first.agg} ${first.column}${more}`, 30),
    ],
    needsSetup: false,
  };
}

function summarizeFilter(p: FilterParams): NodeSummary {
  if (p.conditions.length === 0) {
    return { title: 'Filtrar', excelName: 'FILTRO', lines: ['Sem condições'], needsSetup: true };
  }
  const first = p.conditions[0];
  const more = p.conditions.length > 1 ? ` +${p.conditions.length - 1}` : '';
  return {
    title: 'Filtrar',
    excelName: 'FILTRO',
    lines: [truncate(`${first.column} ${first.operator} ${first.value}${more}`, 30)],
    needsSetup: false,
  };
}

export function summarizeTransform(params: TransformParams): NodeSummary {
  if (params.op === 'lookup') return summarizeLookup(params);
  if (params.op === 'aggregate') return summarizeAggregate(params);
  return summarizeFilter(params);
}

/** Linha de estado do nó depois de avaliado. */
export function describeResult(result: NodeResult | undefined): { text: string; tone: 'ok' | 'warn' | 'error' | 'idle' } {
  if (!result) return { text: 'Calculando…', tone: 'idle' };
  if (result.error) return { text: truncate(result.rootCause ?? result.error, 44), tone: 'error' };
  const rows = result.table?.rows.length ?? 0;
  if (result.lookup) {
    const { matchRate, orphans } = result.lookup;
    const text = `${formatPercent(matchRate)} · ${orphans === 0 ? 'sem órfãos' : `${formatCount(orphans)} órfãos`}`;
    return { text, tone: orphans > 0 ? 'warn' : 'ok' };
  }
  return { text: `${formatCount(rows)} linhas`, tone: 'ok' };
}
