// src/features/relations/analysis/ghostLinks.ts
// Conexões fantasma: dada uma coluna, sugere colunas compatíveis em OUTRAS tabelas por compatibilidade
// de tipo + sobreposição de valores (containment/Jaccard com a mesma chave normalizada do lookup).
// Puro e determinístico (sem aleatoriedade), com limite de custo para não travar a interface.

import { Sheet } from '../../../types/spreadsheet';
import { normalizeKey } from './keys';
import { CellKind } from './healthTypes';
import { cellValue, classifyValue, listColumns, SheetColumn } from './sheetAccess';

export interface GhostLinkOptions {
  /** Valores distintos da coluna de origem usados na comparação (padrão e teto: 1000). */
  sampleSize?: number;
  /** Máximo de sugestões devolvidas (padrão 5). */
  maxResults?: number;
  /** Pontuação mínima (0 a 1) para aparecer (padrão 0.3). */
  minScore?: number;
  /** Orçamento de células lidas nas colunas candidatas (padrão 1.000.000). */
  maxCells?: number;
  /** Linhas lidas por coluna (padrão 50.000). */
  maxRowsPerColumn?: number;
  /** Colunas que já estão ligadas e não devem ser sugeridas de novo. */
  exclude?: { sheetId: string; column: string }[];
}

export interface GhostLinkMetrics {
  /** Fração dos valores da origem (amostra) que existem na coluna candidata. */
  containment: number;
  /** Fração dos valores da candidata (amostra) que existem na origem. */
  reverseContainment: number;
  /** Jaccard estimado entre os conjuntos de valores distintos. */
  jaccard: number;
  overlapCount: number;
  sourceDistinct: number;
  candidateDistinct: number;
  /** Valores distintos / preenchidos na candidata (1 = chave primária perfeita). */
  candidateUniqueness: number;
  nameSimilarity: number;
  /** Origem numérica e candidata em texto (ou o contrário): o casamento é por texto. */
  typeMismatch: boolean;
}

export interface GhostSuggestion {
  sheetId: string;
  sheetName: string;
  column: string;
  columnIndex: number;
  /** 0 a 1. */
  score: number;
  reason: string;
  metrics: GhostLinkMetrics;
}

export interface GhostLinkResult {
  suggestions: GhostSuggestion[];
  scannedCells: number;
  /** O orçamento acabou antes de olhar todas as colunas. */
  truncated: boolean;
}

export const DEFAULT_SAMPLE_SIZE = 1000;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MIN_SCORE = 0.3;
const DEFAULT_MAX_CELLS = 1_000_000;
const DEFAULT_MAX_ROWS = 50_000;
const MIN_OVERLAP = 2;

type Group = 'numeric' | 'text' | 'date' | 'boolean';

interface Profile {
  group: Group;
  /** Valores distintos normalizados, na ordem em que aparecem. */
  values: string[];
  valueSet: Set<string>;
  filled: number;
  /** Os números do grupo 
umeric estão guardados como texto (ex.: "001"). */
  numericAsText: boolean;
}

const groupOf = (kind: CellKind): Group => (kind === 'number' || kind === 'numericText' ? 'numeric' : kind);

const clampInt = (value: number | undefined, fallback: number, min: number, max: number): number =>
  value === undefined || !Number.isFinite(value) ? fallback : Math.min(max, Math.max(min, Math.floor(value)));

/** Lê uma coluna: grupo de tipo predominante e valores distintos normalizados. */
function profileColumn(sheet: Sheet, column: SheetColumn, maxRows: number): { profile: Profile; cells: number } {
  const counts: Record<Group, number> = { numeric: 0, text: 0, date: 0, boolean: 0 };
  const kindCounts = { number: 0, numericText: 0 };
  const valueSet = new Set<string>();
  const values: string[] = [];
  let filled = 0;
  const last = Math.min(sheet.rowCount, maxRows + 1);
  for (let r = 1; r < last; r++) {
    const raw = cellValue(sheet, r, column.index);
    const kind = classifyValue(raw);
    if (!kind) continue;
    counts[groupOf(kind)]++;
    if (kind === 'number' || kind === 'numericText') kindCounts[kind]++;
    const key = normalizeKey(raw);
    if (key === null) continue;
    filled++;
    if (!valueSet.has(key)) {
      valueSet.add(key);
      values.push(key);
    }
  }
  const order: Group[] = ['text', 'numeric', 'date', 'boolean'];
  const group = order.reduce((best, g) => (counts[g] > counts[best] ? g : best), 'text' as Group);
  const numericAsText = kindCounts.numericText > kindCounts.number;
  return { profile: { group, values, valueSet, filled, numericAsText }, cells: last - 1 };
}

/** Amostra determinística e espaçada (não só o começo da coluna). */
function evenSample(values: readonly string[], size: number): string[] {
  if (values.length <= size) return [...values];
  const sample: string[] = [];
  for (let i = 0; i < size; i++) sample.push(values[Math.floor((i * values.length) / size)]);
  return sample;
}

function fractionIn(sample: readonly string[], set: ReadonlySet<string>): number {
  if (sample.length === 0) return 0;
  let hits = 0;
  for (const value of sample) if (set.has(value)) hits++;
  return hits / sample.length;
}

const stripAccents = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '');

/** Palavras do cabeçalho: "AgenteID", "Agente ID" e "agente_id" dão {agente, id}. */
function headerTokens(header: string): Set<string> {
  const spaced = stripAccents(header).replace(/([a-z])([A-Z])/g, '$1 $2');
  return new Set(spaced.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function nameSimilarity(a: string, b: string): number {
  const ta = headerTokens(a);
  const tb = headerTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;
  return shared / (ta.size + tb.size - shared);
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const percent = (n: number): string => `${Math.round(n * 100)}%`;

function describe(
  sourceHeader: string,
  candidate: { sheetName: string; column: string },
  m: GhostLinkMetrics
): string {
  const parts: string[] = [];
  if (m.containment >= m.reverseContainment) {
    parts.push(`${percent(m.containment)} dos valores de "${sourceHeader}" existem em "${candidate.column}" (${candidate.sheetName})`);
  } else {
    parts.push(`${percent(m.reverseContainment)} dos valores de "${candidate.column}" (${candidate.sheetName}) existem em "${sourceHeader}"`);
  }
  if (m.nameSimilarity >= 0.5) parts.push('nomes de coluna parecidos');
  if (m.candidateUniqueness >= 0.99 && m.candidateDistinct > 1) parts.push('a coluna candidata tem valores únicos (boa chave de busca)');
  if (m.typeMismatch) parts.push('tipos diferentes (número x texto): o casamento será feito pelo texto');
  return `${parts.join('; ')}.`;
}

/**
 * Sugere colunas de outras tabelas que combinam com `source`. Não altera nada.
 * `source.column` é o cabeçalho (ou o índice) da coluna na planilha `source.sheetId`.
 */
export function suggestGhostLinks(
  sheets: readonly Sheet[],
  source: { sheetId: string; column: string | number },
  options: GhostLinkOptions = {}
): GhostLinkResult {
  const sampleSize = clampInt(options.sampleSize, DEFAULT_SAMPLE_SIZE, 1, DEFAULT_SAMPLE_SIZE);
  const maxResults = clampInt(options.maxResults, DEFAULT_MAX_RESULTS, 0, 50);
  const maxCells = clampInt(options.maxCells, DEFAULT_MAX_CELLS, 0, 50_000_000);
  const maxRows = clampInt(options.maxRowsPerColumn, DEFAULT_MAX_ROWS, 1, 1_000_000);
  const minScore = options.minScore === undefined || !Number.isFinite(options.minScore) ? DEFAULT_MIN_SCORE : options.minScore;
  const excluded = new Set((options.exclude ?? []).map(e => `${e.sheetId}\u0000${e.column}`));

  const empty: GhostLinkResult = { suggestions: [], scannedCells: 0, truncated: false };
  const sourceSheet = sheets.find(s => s.id === source.sheetId);
  if (!sourceSheet) return empty;
  const sourceColumn = listColumns(sourceSheet).find(c =>
    typeof source.column === 'number' ? c.index === source.column : c.header === source.column
  );
  if (!sourceColumn) return empty;

  const sourceProfile = profileColumn(sourceSheet, sourceColumn, maxRows).profile;
  if (sourceProfile.group === 'boolean' || sourceProfile.values.length < 2) return empty;
  const sourceSample = evenSample(sourceProfile.values, sampleSize);

  let scannedCells = 0;
  let truncated = false;
  const suggestions: GhostSuggestion[] = [];

  for (const sheet of sheets) {
    if (sheet.id === sourceSheet.id) continue;
    for (const column of listColumns(sheet)) {
      if (excluded.has(`${sheet.id}\u0000${column.header}`)) continue;
      if (scannedCells >= maxCells) {
        truncated = true;
        continue;
      }

      const { profile, cells } = profileColumn(sheet, column, maxRows);
      scannedCells += cells;
      if (profile.group === 'boolean' || profile.values.length < 2) continue;
      // Datas só combinam com datas; os demais grupos podem casar pelo texto.
      if ((profile.group === 'date') !== (sourceProfile.group === 'date')) continue;
      const typeMismatch =
        profile.group !== sourceProfile.group ||
        (profile.group === 'numeric' && profile.numericAsText !== sourceProfile.numericAsText);

      const candidateSample = evenSample(profile.values, sampleSize);
      const containment = fractionIn(sourceSample, profile.valueSet);
      const reverseContainment = fractionIn(candidateSample, sourceProfile.valueSet);
      const overlapCount = Math.round(containment * sourceProfile.values.length);
      if (overlapCount < MIN_OVERLAP && Math.round(reverseContainment * profile.values.length) < MIN_OVERLAP) continue;

      const intersection = Math.max(
        containment * sourceProfile.values.length,
        reverseContainment * profile.values.length
      );
      const union = sourceProfile.values.length + profile.values.length - intersection;
      const jaccard = union > 0 ? Math.min(1, intersection / union) : 0;
      const sim = nameSimilarity(sourceColumn.header, column.header);
      const candidateUniqueness = profile.filled > 0 ? profile.values.length / profile.filled : 0;
      // Quem "contém" a outra é a candidata a chave: a unicidade dela pesa mais.
      const keyUniqueness = containment >= reverseContainment ? candidateUniqueness : sourceProfile.filled > 0 ? sourceProfile.values.length / sourceProfile.filled : 0;

      const best = Math.max(containment, reverseContainment);
      const support = Math.min(1, Math.max(overlapCount, Math.round(reverseContainment * profile.values.length)) / 10);
      let score = (0.55 * best + 0.2 * jaccard + 0.1 * keyUniqueness + 0.15 * sim) * (0.5 + 0.5 * support);
      if (Math.min(sourceProfile.values.length, profile.values.length) < 3) score *= 0.4;
      if (typeMismatch) score *= 0.9;
      score = round4(Math.min(1, Math.max(0, score)));
      if (score < minScore) continue;

      const metrics: GhostLinkMetrics = {
        containment: round4(containment),
        reverseContainment: round4(reverseContainment),
        jaccard: round4(jaccard),
        overlapCount,
        sourceDistinct: sourceProfile.values.length,
        candidateDistinct: profile.values.length,
        candidateUniqueness: round4(candidateUniqueness),
        nameSimilarity: round4(sim),
        typeMismatch,
      };
      suggestions.push({
        sheetId: sheet.id,
        sheetName: sheet.name,
        column: column.header,
        columnIndex: column.index,
        score,
        reason: describe(sourceColumn.header, { sheetName: sheet.name, column: column.header }, metrics),
        metrics,
      });
    }
  }

  suggestions.sort(
    (a, b) => b.score - a.score || a.sheetName.localeCompare(b.sheetName) || a.columnIndex - b.columnIndex
  );
  return { suggestions: suggestions.slice(0, maxResults), scannedCells, truncated };
}
