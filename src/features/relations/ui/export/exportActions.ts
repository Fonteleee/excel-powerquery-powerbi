// src/features/relations/ui/export/exportActions.ts
// Lógica das ações de exportação/importação usada pelos componentes (separada para ser testável sem DOM).

import { Sheet } from '../../../../types/spreadsheet';
import { remapSheetIdsByName } from '../../excel/remap';
import { readFlowFromArrayBuffer } from '../../excel/workbook';
import { FlowGraph } from '../../model/graph';
import { exportFlowAsSql, getDialect, OutputMode, SqlDialectId } from '../../sql';

export const MAX_IMPORT_FILE_BYTES = 30 * 1024 * 1024;
/** Quantos caracteres do SQL aparecem na pré-visualização (o download leva o texto inteiro). */
export const PREVIEW_CHARS = 20_000;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Nome de arquivo seguro: só letras, números, ponto, hífen e sublinhado; sem caminhos nem nomes reservados. */
export function safeFileName(base: string, extension: string): string {
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'txt';
  let name = String(base ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 60);
  if (name === '' || WINDOWS_RESERVED.test(name)) name = `fluxo${name ? `_${name}` : ''}`;
  return `${name}.${ext}`;
}

export interface SqlScriptOptions {
  dialect: SqlDialectId;
  outputMode: OutputMode;
  includeInputs: boolean;
  fileBase?: string;
  /** Injetável para teste. */
  generatedAt?: Date;
}

export type SqlScriptResult =
  | {
      ok: true;
      sql: string;
      fileName: string;
      warnings: string[];
      dialectLabel: string;
      /** Texto limitado para a tela. */
      preview: string;
      truncated: boolean;
    }
  | { ok: false; errors: string[] };

/** Gera o script e já devolve nome de arquivo seguro e prévia limitada. */
export function buildSqlScript(graph: FlowGraph, sheets: readonly Sheet[], options: SqlScriptOptions): SqlScriptResult {
  const result = exportFlowAsSql(graph, sheets, {
    dialect: options.dialect,
    outputMode: options.outputMode,
    includeInputs: options.includeInputs,
    generatedAt: options.generatedAt,
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  return {
    ok: true,
    sql: result.sql,
    fileName: safeFileName(options.fileBase || 'fluxo', 'sql'),
    warnings: result.warnings,
    dialectLabel: getDialect(options.dialect).label,
    preview: result.sql.slice(0, PREVIEW_CHARS),
    truncated: result.sql.length > PREVIEW_CHARS,
  };
}

/** Baixa texto puro (`text/plain`): o navegador não interpreta o conteúdo. */
export function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type ImportOutcome =
  | { ok: true; graph: FlowGraph; modified: boolean; warnings: string[] }
  | { ok: false; errors: string[]; missing: boolean };

/** Une os avisos de uma importação: edição manual, planilhas religadas por nome e planilhas ausentes. */
export function importWarnings(
  graph: FlowGraph,
  sheets: readonly Sheet[],
  sheetNames: ReadonlyMap<string, string>,
  baseWarnings: readonly string[]
): { graph: FlowGraph; warnings: string[] } {
  const remap = remapSheetIdsByName(graph, sheetNames, sheets);
  const warnings = [...baseWarnings];
  if (remap.remapped > 0) warnings.push(`${remap.remapped} tabela(s) do fluxo foram religadas às planilhas abertas pelo nome.`);
  if (remap.unresolved.length > 0) {
    warnings.push(`O fluxo usa planilha(s) que não estão abertas agora: ${remap.unresolved.join(', ')}.`);
  }
  return { graph: remap.graph, warnings };
}

/** Lê o fluxo de um arquivo .xlsx escolhido pelo usuário (tamanho e conteúdo são verificados). */
export async function importFlowFromFile(file: File, sheets: readonly Sheet[]): Promise<ImportOutcome> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, errors: ['Arquivo grande demais para importar o fluxo'], missing: false };
  }
  if (!/\.xls[xm]?$/i.test(file.name)) {
    return { ok: false, errors: ['Escolha um arquivo do Excel (.xlsx)'], missing: false };
  }
  const result = readFlowFromArrayBuffer(await file.arrayBuffer());
  if (!result.ok) return { ok: false, errors: result.errors, missing: result.missing === true };
  const merged = importWarnings(result.graph, sheets, result.sheetNames, result.warnings);
  return { ok: true, graph: merged.graph, modified: result.modified, warnings: merged.warnings };
}