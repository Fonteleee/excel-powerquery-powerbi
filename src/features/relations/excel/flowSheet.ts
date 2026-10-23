// src/features/relations/excel/flowSheet.ts
// Formato da aba oculta `_Flow_v1`: o grafo vira linhas (uma por nó e por aresta) + JSON, com versão
// do formato e checksum para detectar edição manual. Funções puras, sem dependência de biblioteca de Excel.

import { FLOW_GRAPH_VERSION, FlowGraph } from '../model/graph';
import { MAX_EDGES, MAX_NODES, parseFlowGraph } from '../model/schema';
import { restoreSpreadsheetText, sanitizeRows } from './sanitize';

export const FLOW_SHEET_NAME = '_Flow_v1';
export const FLOW_SHEET_FORMAT = 'nocodb-flow';
export const FLOW_SHEET_VERSION = 1;
export const FLOW_SHEET_HEADER = ['Tipo', 'Id', 'Descrição', 'Parte', 'JSON'] as const;

/** Excel aceita 32.767 caracteres por célula; fica folga para o marcador `j:`. */
const CHUNK_SIZE = 30_000;
const JSON_MARKER = 'j:';
/** Limites de leitura: nada que venha do arquivo é confiável. */
const MAX_ROWS = (MAX_NODES + MAX_EDGES) * 8 + 20;
const MAX_TOTAL_CHARS = 8_000_000;
const MAX_CELL_CHARS = 32_767;

export type FlowSheetCell = string | number;
export type FlowSheetRows = FlowSheetCell[][];

export type FlowSheetParseResult =
  | {
      ok: true;
      graph: FlowGraph;
      /** O checksum não confere: alguém editou a aba à mão (o grafo continua validado). */
      modified: boolean;
      warnings: string[];
      /** Nome que cada planilha tinha na exportação (para religar por nome em outra sessão). */
      sheetNames: Map<string, string>;
    }
  | { ok: false; errors: string[] };

/** FNV-1a de 32 bits em hexadecimal (com prefixo, para o Excel nunca tratar como número). Não é criptografia: só detecta edição acidental. */
export function flowChecksum(parts: readonly string[]): string {
  let hash = 0x811c9dc5;
  const text = parts.join('\n');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, '0')}`;
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < text.length || start === 0; start += CHUNK_SIZE) {
    chunks.push(text.slice(start, start + CHUNK_SIZE));
  }
  return chunks;
}

function describeNode(node: FlowGraph['nodes'][number]): string {
  const label = node.label?.trim() ? ` "${node.label.trim()}"` : '';
  if (node.kind === 'table') return `Tabela${label} (${node.sheetId})`;
  if (node.kind === 'output') return `Saída${label} (${node.sheetName})`;
  return `Transformação ${node.params.op}${label}`;
}

export interface SerializeOptions {
  /** Nome atual de cada planilha (id -> nome), gravado para reconectar por nome ao reimportar. */
  sheetNames?: Readonly<Record<string, string>>;
}

/** Linhas prontas para virar a aba. Todo texto passa por `sanitizeRows` (injeção de fórmula). */
export function serializeFlowToRows(graph: FlowGraph, options: SerializeOptions = {}): FlowSheetRows {
  const nodeTexts = graph.nodes.map(node => JSON.stringify(node));
  const edgeTexts = graph.edges.map(edge => JSON.stringify(edge));
  const checksum = flowChecksum([`v${FLOW_SHEET_VERSION}`, ...nodeTexts, ...edgeTexts]);

  const rows: FlowSheetRows = [
    [...FLOW_SHEET_HEADER],
    ['META', 'formato', FLOW_SHEET_FORMAT, '', ''],
    ['META', 'versao', String(FLOW_SHEET_VERSION), '', ''],
    ['META', 'nos', String(graph.nodes.length), '', ''],
    ['META', 'arestas', String(graph.edges.length), '', ''],
    ['META', 'checksum', checksum, '', ''],
  ];

  const names = options.sheetNames ?? {};
  const seenSheets = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind !== 'table' || seenSheets.has(node.sheetId)) continue;
    seenSheets.add(node.sheetId);
    const name = Object.prototype.hasOwnProperty.call(names, node.sheetId) ? names[node.sheetId] : undefined;
    if (typeof name === 'string' && name !== '') rows.push(['SHEET', node.sheetId, name, '', '']);
  }

  graph.nodes.forEach((node, i) => {
    chunkText(nodeTexts[i]).forEach((chunk, part) => {
      rows.push(['NODE', node.id, describeNode(node), part + 1, `${JSON_MARKER}${chunk}`]);
    });
  });
  graph.edges.forEach((edge, i) => {
    chunkText(edgeTexts[i]).forEach((chunk, part) => {
      rows.push(['EDGE', edge.id, `${edge.from} -> ${edge.to} (${edge.toPort})`, part + 1, `${JSON_MARKER}${chunk}`]);
    });
  });
  return sanitizeRows(rows);
}

function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.length > MAX_CELL_CHARS ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

interface Piece {
  type: 'NODE' | 'EDGE';
  id: string;
  parts: string[];
}

/**
 * Reconstrói o grafo a partir das linhas lidas de uma planilha. Nada é confiável:
 * limites de tamanho, versão, JSON protegido e validação completa por `parseFlowGraph`.
 */
export function parseFlowFromRows(rows: readonly (readonly unknown[])[]): FlowSheetParseResult {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, errors: ['A aba do fluxo está vazia'] };
  if (rows.length > MAX_ROWS) return { ok: false, errors: [`A aba do fluxo tem linhas demais (limite ${MAX_ROWS})`] };

  const meta = new Map<string, string>();
  const sheetNames = new Map<string, string>();
  const pieces: Piece[] = [];
  const pieceByKey = new Map<string, Piece>();
  let totalChars = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) return { ok: false, errors: [`Linha ${r + 1}: formato inválido`] };
    const cells = [row[0], row[1], row[2], row[3], row[4]].map(cellText);
    if (cells.some(c => c === null)) return { ok: false, errors: [`Linha ${r + 1}: célula inválida ou grande demais`] };
    const [type, rawId, description, part, json] = cells as string[];
    const id = restoreSpreadsheetText(rawId);
    totalChars += type.length + id.length + description.length + json.length;
    if (totalChars > MAX_TOTAL_CHARS) return { ok: false, errors: ['A aba do fluxo é grande demais'] };

    if (type === 'META') {
      meta.set(id, description);
    } else if (type === 'SHEET') {
      if (sheetNames.size < MAX_NODES) sheetNames.set(id, restoreSpreadsheetText(description));
    } else if (type === 'NODE' || type === 'EDGE') {
      if (!json.startsWith(JSON_MARKER)) {
        return { ok: false, errors: [`Linha ${r + 1}: conteúdo JSON sem o marcador "${JSON_MARKER}"`] };
      }
      const key = `${type}:${id}`;
      let piece = pieceByKey.get(key);
      if (!piece) {
        piece = { type, id, parts: [] };
        pieceByKey.set(key, piece);
        pieces.push(piece);
      }
      if (Number(part) !== piece.parts.length + 1) {
        return { ok: false, errors: [`Linha ${r + 1}: partes fora de ordem para ${type} "${id}"`] };
      }
      piece.parts.push(json.slice(JSON_MARKER.length));
    }
    // Outras linhas (cabeçalho, comentários) são ignoradas.
  }

  if (meta.get('formato') !== FLOW_SHEET_FORMAT) {
    return { ok: false, errors: ['A aba não é um fluxo exportado por este aplicativo (formato desconhecido)'] };
  }
  if (meta.get('versao') !== String(FLOW_SHEET_VERSION)) {
    return { ok: false, errors: [`Versão do formato do fluxo não suportada: "${meta.get('versao') ?? ''}"`] };
  }
  if (pieces.filter(p => p.type === 'NODE').length > MAX_NODES || pieces.filter(p => p.type === 'EDGE').length > MAX_EDGES) {
    return { ok: false, errors: ['O fluxo excede os limites de nós ou arestas'] };
  }

  const nodes: unknown[] = [];
  const edges: unknown[] = [];
  const texts: { nodes: string[]; edges: string[] } = { nodes: [], edges: [] };
  const warnings: string[] = [];

  for (const piece of pieces) {
    const text = piece.parts.join('');
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, errors: [`${piece.type} "${piece.id}": JSON inválido`] };
    }
    if (typeof value === 'object' && value !== null && (value as { id?: unknown }).id !== piece.id) {
      warnings.push(`${piece.type} "${piece.id}": o id da coluna não bate com o do JSON`);
    }
    if (piece.type === 'NODE') {
      nodes.push(value);
      texts.nodes.push(text);
    } else {
      edges.push(value);
      texts.edges.push(text);
    }
  }

  const parsed = parseFlowGraph({ version: FLOW_GRAPH_VERSION, nodes, edges });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const checksum = flowChecksum([`v${FLOW_SHEET_VERSION}`, ...texts.nodes, ...texts.edges]);
  const countsMatch =
    meta.get('nos') === String(nodes.length) && meta.get('arestas') === String(edges.length);
  const modified = meta.get('checksum') !== checksum || !countsMatch || warnings.length > 0;
  if (modified) warnings.unshift('A aba do fluxo foi editada fora do aplicativo (o checksum não confere)');

  return { ok: true, graph: parsed.graph, modified, warnings, sheetNames };
}
