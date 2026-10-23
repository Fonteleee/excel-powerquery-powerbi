// src/features/relations/analysis/orphans.ts
// Inspetor de falhas de um nó `lookup`: órfãos, nulos na chave, tipos incompatíveis e duplicatas.
// Puro: lê o resultado de `evaluateGraph`, não recalcula nem altera nada.

import { inputsOf } from '../model/dag';
import { FlowGraph } from '../model/graph';
import { Cell, FlowTable, NodeResult, Row } from '../runtime/evaluate';
import { clampLimit, countKinds, dominantKind, KindCounts, KeyKind, normalizeKey, numericValue } from './keys';

export const DEFAULT_SAMPLE_LIMIT = 20;

export interface InspectOptions {
  /** Máximo de linhas em cada amostra (padrão 20, teto 1000). */
  sampleLimit?: number;
}

export interface OrphanRow {
  /** Posição (base 0) da linha na tabela de origem. */
  rowIndex: number;
  key: Cell;
  row: Row;
}

export interface TypeMismatchRow {
  rowIndex: number;
  key: Cell;
  /** Chave da tabela de busca que bateria se a comparação fosse numérica. */
  wouldMatch: Cell;
}

export interface DuplicateKey {
  key: string;
  count: number;
  /** Posições (base 0) das linhas na tabela de busca; a primeira é a que vale. */
  rowIndexes: number[];
}

export interface LookupInspection {
  nodeId: string;
  sourceRows: number;
  /** Linhas de origem com chave preenchida (base da taxa de match). */
  keyedRows: number;
  matchedRows: number;
  orphanCount: number;
  orphanSample: OrphanRow[];
  nullKeyCount: number;
  nullKeySample: OrphanRow[];
  typeMismatch: {
    sourceKinds: KindCounts;
    lookupKinds: KindCounts;
    /** Origem e busca usam tipos predominantes diferentes (ex.: número vs. texto). */
    kindsDiffer: boolean;
    sourceDominant: KeyKind;
    lookupDominant: KeyKind;
    /** Órfãos que bateriam numericamente ("001" x 1, "1.0" x 1). */
    count: number;
    sample: TypeMismatchRow[];
  };
  duplicateLookup: {
    /** Linhas da busca ignoradas por repetirem uma chave (a primeira vence). */
    extraRows: number;
    /** Chaves diferentes que aparecem mais de uma vez. */
    duplicatedKeys: number;
    /** Linhas da busca sem chave (ignoradas). */
    nullKeyRows: number;
    sample: DuplicateKey[];
  };
}

export type InspectResult = { ok: true; inspection: LookupInspection } | { ok: false; error: string };

function tableOf(results: ReadonlyMap<string, NodeResult>, nodeId: string): FlowTable | null {
  const result = results.get(nodeId);
  return result && !result.error && result.table ? result.table : null;
}

export function inspectLookup(
  graph: FlowGraph,
  nodeId: string,
  results: ReadonlyMap<string, NodeResult>,
  options: InspectOptions = {}
): InspectResult {
  const limit = clampLimit(options.sampleLimit, DEFAULT_SAMPLE_LIMIT);
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node || node.kind !== 'transform' || node.params.op !== 'lookup') {
    return { ok: false, error: 'O nó não é uma transformação de busca (lookup)' };
  }
  const params = node.params;

  const wires = inputsOf(graph, nodeId);
  const source = wires.in ? tableOf(results, wires.in.from) : null;
  const lookup = wires.lookup ? tableOf(results, wires.lookup.from) : null;
  if (!source) return { ok: false, error: 'A tabela de origem não está disponível (conecte-a ou corrija o erro anterior)' };
  if (!lookup) return { ok: false, error: 'A tabela de busca não está disponível (conecte-a ou corrija o erro anterior)' };
  if (!source.headers.includes(params.sourceKey)) {
    return { ok: false, error: `Coluna "${params.sourceKey}" não encontrada na tabela de origem` };
  }
  if (!lookup.headers.includes(params.lookupKey)) {
    return { ok: false, error: `Coluna "${params.lookupKey}" não encontrada na tabela de busca` };
  }

  // Índice da busca (primeira ocorrência vence) e duplicatas.
  const index = new Map<string, number>();
  const duplicates = new Map<string, number[]>();
  let lookupNullKeys = 0;
  let extraRows = 0;
  lookup.rows.forEach((row, i) => {
    const key = normalizeKey(row[params.lookupKey]);
    if (key === null) {
      lookupNullKeys++;
      return;
    }
    const first = index.get(key);
    if (first === undefined) {
      index.set(key, i);
      return;
    }
    extraRows++;
    const list = duplicates.get(key);
    if (list) list.push(i);
    else duplicates.set(key, [first, i]);
  });

  // Índice numérico da busca, para achar "001" x 1 entre os órfãos.
  const numericIndex = new Map<number, Cell>();
  for (const row of lookup.rows) {
    const value = row[params.lookupKey];
    const n = numericValue(value);
    if (n !== null && !numericIndex.has(n)) numericIndex.set(n, value);
  }

  const sourceKeys = source.rows.map(row => row[params.sourceKey]);
  const lookupKeys = lookup.rows.map(row => row[params.lookupKey]);
  const sourceKinds = countKinds(sourceKeys);
  const lookupKinds = countKinds(lookupKeys);
  const sourceDominant = dominantKind(sourceKinds);
  const lookupDominant = dominantKind(lookupKinds);

  let keyedRows = 0;
  let matchedRows = 0;
  let orphanCount = 0;
  let nullKeyCount = 0;
  let mismatchCount = 0;
  const orphanSample: OrphanRow[] = [];
  const nullKeySample: OrphanRow[] = [];
  const mismatchSample: TypeMismatchRow[] = [];

  source.rows.forEach((row, rowIndex) => {
    const raw = row[params.sourceKey];
    const key = normalizeKey(raw);
    if (key === null) {
      nullKeyCount++;
      if (nullKeySample.length < limit) nullKeySample.push({ rowIndex, key: raw, row });
      return;
    }
    keyedRows++;
    if (index.has(key)) {
      matchedRows++;
      return;
    }
    orphanCount++;
    if (orphanSample.length < limit) orphanSample.push({ rowIndex, key: raw, row });

    const n = numericValue(raw);
    const hit = n === null ? undefined : numericIndex.get(n);
    if (hit !== undefined) {
      mismatchCount++;
      if (mismatchSample.length < limit) mismatchSample.push({ rowIndex, key: raw, wouldMatch: hit });
    }
  });

  const duplicateSample: DuplicateKey[] = [];
  for (const [key, rowIndexes] of duplicates) {
    if (duplicateSample.length >= limit) break;
    duplicateSample.push({ key, count: rowIndexes.length, rowIndexes: rowIndexes.slice(0, limit) });
  }

  return {
    ok: true,
    inspection: {
      nodeId,
      sourceRows: source.rows.length,
      keyedRows,
      matchedRows,
      orphanCount,
      orphanSample,
      nullKeyCount,
      nullKeySample,
      typeMismatch: {
        sourceKinds,
        lookupKinds,
        kindsDiffer: sourceDominant !== 'empty' && lookupDominant !== 'empty' && sourceDominant !== lookupDominant,
        sourceDominant,
        lookupDominant,
        count: mismatchCount,
        sample: mismatchSample,
      },
      duplicateLookup: {
        extraRows,
        duplicatedKeys: duplicates.size,
        nullKeyRows: lookupNullKeys,
        sample: duplicateSample,
      },
    },
  };
}
