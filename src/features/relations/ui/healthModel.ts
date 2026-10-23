// src/features/relations/ui/healthModel.ts
// Lógica pura do painel Data Health HUD: qual planilha analisar, resumo em texto e aplicação de uma
// correção sobre a lista de planilhas (devolve a lista nova; quem chama grava via onUpdateSheets,
// que já registra o histórico de desfazer do App).

import { Sheet } from '../../../types/spreadsheet';
import { applyHealthFix, previewHealthFix } from '../analysis/health';
import type { FixPreview, HealthFix, TableHealth } from '../analysis/healthTypes';
import { FlowGraph } from '../model/graph';
import { formatPercent, pluralize } from './format';

/** Planilha da tabela selecionada; sem seleção de tabela, a primeira tabela do fluxo. */
export function healthTargetSheet(graph: FlowGraph, selectedNodeId: string | null, sheets: readonly Sheet[]): Sheet | null {
  const selected = graph.nodes.find(n => n.id === selectedNodeId);
  const node = selected?.kind === 'table' ? selected : graph.nodes.find(n => n.kind === 'table');
  if (!node || node.kind !== 'table') return null;
  return sheets.find(s => s.id === node.sheetId) ?? null;
}

export interface HealthSummary {
  sheetName: string;
  consistency: string;
  completeness: string;
  headline: string;
  problemColumns: { header: string; notes: string[] }[];
}

export function summarizeHealth(health: TableHealth): HealthSummary {
  const problemColumns = health.columns.flatMap(col => {
    const notes: string[] = [];
    if (col.whitespaceCells > 0) notes.push(`${pluralize(col.whitespaceCells, 'célula com espaço sobrando', 'células com espaço sobrando')}`);
    if (col.mixedTypes) notes.push('tipos misturados');
    if (col.divergentDates) notes.push('datas em formatos diferentes');
    if (col.emptyPercent >= 50) notes.push(`${formatPercent(col.emptyPercent)} vazia`);
    return notes.length > 0 ? [{ header: col.header, notes }] : [];
  });
  return {
    sheetName: health.sheetName,
    consistency: formatPercent(health.consistencyPercent),
    completeness: formatPercent(health.completenessPercent),
    headline: `${pluralize(health.dataRows, 'linha', 'linhas')} · ${pluralize(health.duplicateRows, 'duplicata', 'duplicatas')} · ${pluralize(health.fixes.length, 'correção sugerida', 'correções sugeridas')}`,
    problemColumns,
  };
}

export interface FixEffect {
  changedCells: number;
  removedRows: number;
  skipped: string[];
  /** Texto curto do efeito para a pré-visualização. */
  text: string;
}

export function describeFixEffect(preview: FixPreview): FixEffect {
  const parts: string[] = [];
  if (preview.changedCells > 0) parts.push(`${pluralize(preview.changedCells, 'célula será alterada', 'células serão alteradas')}`);
  if (preview.removedRows > 0) parts.push(`${pluralize(preview.removedRows, 'linha será removida', 'linhas serão removidas')}`);
  const text = parts.length > 0 ? parts.join(' e ') : 'Nada a alterar';
  return { changedCells: preview.changedCells, removedRows: preview.removedRows, skipped: preview.skipped, text };
}

export function previewFixEffect(sheet: Sheet, fix: HealthFix): FixEffect {
  return describeFixEffect(previewHealthFix(sheet, fix));
}

export type ApplyFixOutcome =
  | { ok: true; sheets: Sheet[]; effect: FixEffect }
  | { ok: false; error: string };

/** Aplica a correção e devolve as planilhas; falha se nada mudaria (não polui o histórico com no-ops). */
export function applyFixToSheets(sheets: readonly Sheet[], sheetId: string, fix: HealthFix): ApplyFixOutcome {
  const target = sheets.find(s => s.id === sheetId);
  if (!target) return { ok: false, error: 'Planilha não encontrada.' };
  const effect = previewFixEffect(target, fix);
  if (effect.changedCells === 0 && effect.removedRows === 0) {
    return { ok: false, error: effect.skipped[0] ?? 'Nada a alterar.' };
  }
  const fixed = applyHealthFix(target, fix);
  return { ok: true, sheets: sheets.map(s => (s.id === sheetId ? fixed : s)), effect };
}
