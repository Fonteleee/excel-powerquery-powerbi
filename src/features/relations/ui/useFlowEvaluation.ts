// src/features/relations/ui/useFlowEvaluation.ts
// Avaliação ao vivo do grafo, incremental e com debounce: mover nós não recalcula nada
// e editar parâmetros recalcula só o ramo afetado.

import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../../types/spreadsheet';
import { FlowGraph } from '../model/graph';
import { NodeResult } from '../runtime/evaluate';
import { evaluateIncremental, EvaluationSnapshot } from '../runtime/incremental';

const DEBOUNCE_MS = 140;

export function useFlowEvaluation(graph: FlowGraph, sheets: readonly Sheet[]): ReadonlyMap<string, NodeResult> {
  const snapshot = useRef<EvaluationSnapshot | null>(null);
  // Primeira avaliação síncrona: a aba nunca aparece sem resultados.
  const [results, setResults] = useState<ReadonlyMap<string, NodeResult>>(() => {
    const first = evaluateIncremental(null, graph, sheets);
    snapshot.current = first;
    return first.results;
  });

  useEffect(() => {
    // Primeira avaliação e troca de planilhas são imediatas; edições do grafo esperam o debounce.
    const immediate = snapshot.current === null || snapshot.current.sheets !== sheets;
    const run = (): void => {
      const next = evaluateIncremental(snapshot.current, graph, sheets);
      const changed = snapshot.current?.results !== next.results;
      snapshot.current = next;
      if (changed) setResults(next.results);
    };
    if (immediate) {
      run();
      return undefined;
    }
    const timer = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [graph, sheets]);

  return results;
}
