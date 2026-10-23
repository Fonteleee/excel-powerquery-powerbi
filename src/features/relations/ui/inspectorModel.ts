// src/features/relations/ui/inspectorModel.ts
// Modelo de texto do inspetor de falhas do cabo (lookup): transforma LookupInspection em seções curtas
// (órfãos, nulos, tipos incompatíveis, duplicatas). Puro; a renderização fica em CableInspector.tsx.

import type { LookupInspection } from '../analysis/orphans';
import type { Cell } from '../runtime/evaluate';
import { cellText, formatCount, truncate } from './format';

export type InspectorTone = 'danger' | 'warn' | 'info';

export interface InspectorSection {
  id: 'orphans' | 'nulls' | 'types' | 'duplicates';
  title: string;
  total: number;
  tone: InspectorTone;
  /** Linhas curtas de amostra (já truncadas). */
  lines: string[];
  /** Quantas ocorrências além das listadas. */
  more: number;
}

export const INSPECTOR_SAMPLE = 5;
const MAX_CELL_CHARS = 24;

function show(cell: Cell): string {
  const text = cellText(cell);
  return text === '' ? '(vazio)' : `“${truncate(text, MAX_CELL_CHARS)}”`;
}

const rowLabel = (rowIndex: number): string => `linha ${rowIndex + 2}`;

/** Seções com algum problema; lista vazia = cruzamento limpo. */
export function buildInspectorSections(i: LookupInspection, sample = INSPECTOR_SAMPLE): InspectorSection[] {
  const sections: InspectorSection[] = [];

  if (i.orphanCount > 0) {
    const lines = i.orphanSample.slice(0, sample).map(o => `${show(o.key)} (${rowLabel(o.rowIndex)})`);
    sections.push({ id: 'orphans', title: 'Órfãos (sem correspondência)', total: i.orphanCount, tone: 'danger', lines, more: i.orphanCount - lines.length });
  }
  if (i.nullKeyCount > 0) {
    const lines = i.nullKeySample.slice(0, sample).map(o => rowLabel(o.rowIndex));
    sections.push({ id: 'nulls', title: 'Chave vazia na origem', total: i.nullKeyCount, tone: 'warn', lines, more: i.nullKeyCount - lines.length });
  }
  const t = i.typeMismatch;
  if (t.count > 0 || t.kindsDiffer) {
    const lines = t.sample.slice(0, sample).map(m => `${show(m.key)} ≈ ${show(m.wouldMatch)}`);
    if (t.kindsDiffer) lines.unshift(`origem: ${t.sourceDominant}; busca: ${t.lookupDominant}`);
    sections.push({ id: 'types', title: 'Tipos incompatíveis', total: t.count, tone: 'warn', lines, more: Math.max(0, t.count - t.sample.slice(0, sample).length) });
  }
  const d = i.duplicateLookup;
  if (d.duplicatedKeys > 0) {
    const lines = d.sample.slice(0, sample).map(k => `${show(k.key)} ×${formatCount(k.count)}`);
    sections.push({ id: 'duplicates', title: 'Duplicatas na busca', total: d.duplicatedKeys, tone: 'info', lines, more: d.duplicatedKeys - lines.length });
  }
  return sections;
}
