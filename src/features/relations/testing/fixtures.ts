// src/features/relations/testing/fixtures.ts
// Dados de apoio para os testes do grafo.

import { Sheet } from '../../../types/spreadsheet';
import { createSheetFromDataset } from '../../../engine/pipelineEngine';
import { FlowEdge, FlowGraph, FlowNode, FLOW_GRAPH_VERSION, LookupParams, TransformParams } from '../model/graph';

export function makeSheet(
  id: string,
  name: string,
  headers: string[],
  rows: (string | number | null)[][]
): Sheet {
  const records = rows.map(values => {
    const row: Record<string, string | number | null> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? null;
    });
    return row;
  });
  return createSheetFromDataset(id, name, headers, records);
}

export const table = (id: string, sheetId: string, x = 0, y = 0): FlowNode => ({ id, kind: 'table', sheetId, x, y });

export const edge = (id: string, from: string, to: string, toPort: FlowEdge['toPort'] = 'in'): FlowEdge => ({
  id,
  from,
  to,
  toPort,
});

export const graphOf = (nodes: FlowNode[], edges: FlowEdge[]): FlowGraph => ({
  version: FLOW_GRAPH_VERSION,
  nodes,
  edges,
});

export const transformNode = (id: string, params: TransformParams, label?: string): FlowNode => ({
  id,
  kind: 'transform',
  x: 0,
  y: 0,
  params,
  ...(label === undefined ? {} : { label }),
});

export const outputNode = (id: string, sheetName = 'Resultado'): FlowNode => ({
  id,
  kind: 'output',
  x: 0,
  y: 0,
  sheetName,
});

/** Agentes -> lookup em Pausas -> saída (fluxo padrão dos testes de SQL, Excel e análise). */
export function lookupFlow(params?: Partial<LookupParams>): FlowGraph {
  const lookup: LookupParams = {
    op: 'lookup',
    sourceKey: 'Id',
    lookupKey: 'Agente ID',
    returns: ['Motivo', 'Minutos'],
    ifNotFound: '-',
    ...params,
  };
  return graphOf(
    [table('ta', 'agentes'), table('tp', 'pausas'), transformNode('lk', lookup), outputNode('out')],
    [edge('e1', 'ta', 'lk'), edge('e2', 'tp', 'lk', 'lookup'), edge('e3', 'lk', 'out')]
  );
}

/** Agentes (tabela principal) e Pausas (tabela de busca/metricas) */
export function sampleSheets(): Sheet[] {
  return [
    makeSheet(
      'agentes',
      'Agentes',
      ['Id', 'Nome', 'Equipe'],
      [
        ['A01', 'Ana', 'Norte'],
        ['A02', 'Bruno', 'Sul'],
        ['A03', 'Carla', 'Norte'],
        ['A04', 'Diego', 'Sul'],
      ]
    ),
    makeSheet(
      'pausas',
      'Pausas',
      ['Agente ID', 'Motivo', 'Minutos'],
      [
        ['a01', 'Almoço', 60],
        ['A02', 'Banheiro', 10],
        ['A02', 'Almoço', 45],
        ['A09', 'Treino', 30],
      ]
    ),
  ];
}
