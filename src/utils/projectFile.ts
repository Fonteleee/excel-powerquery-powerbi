// src/utils/projectFile.ts
// Arquivo de projeto .verxel: guarda o trabalho inteiro (abas, fluxo de Relacionamentos, aba ativa,
// favoritas e preferências) num único arquivo que pode ser levado a outro computador.
//
// FORMATO
//   Conteúdo lógico: JSON UTF-8 { formato: 'verxel-projeto', versao: 1, criadoEm: ISO, sheets, activeSheetId,
//   starredSheetIds, relationEdges, flowGraph, preferences }.
//   Em disco: gzip desse JSON (CompressionStream('gzip')) quando o navegador suporta; senão JSON puro.
//   Ao abrir, o tipo é detectado pelos bytes mágicos do gzip (1f 8b), então os dois jeitos abrem em qualquer lugar.
//
// SEGURANÇA: o arquivo é só dado. Nada é executado; chaves __proto__/constructor/prototype em QUALQUER
// profundidade rejeitam o arquivo; imagens só aceitas como data:image/...; tamanho descomprimido limitado.

import type { Sheet } from '../types/spreadsheet';
import { FORBIDDEN_KEYS } from '../features/relations/model/graph';
import { parseFlowGraph } from '../features/relations/model/schema';

export const PROJECT_FORMAT = 'verxel-projeto';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.verxel';
/** Limite do conteúdo descomprimido (proteção contra arquivos "bomba"). */
export const MAX_PROJECT_BYTES = 400 * 1024 * 1024;
const MAX_SHEETS = 200;
const MAX_DEPTH = 64;

export interface ProjectData {
  sheets: Sheet[];
  activeSheetId: string;
  starredSheetIds: string[];
  relationEdges: unknown[];
  /** Grafo do fluxo de Relacionamentos (FlowGraph), ou null quando não há. */
  flowGraph: unknown | null;
  preferences: Record<string, unknown>;
}

export interface ProjectEnvelope extends ProjectData {
  formato: typeof PROJECT_FORMAT;
  versao: number;
  criadoEm: string;
}

export type ParseProjectResult =
  | { ok: true; project: ProjectEnvelope }
  | { ok: false; error: string };

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Texto JSON do projeto (sem compactar). */
export function serializeProject(data: ProjectData, now: Date = new Date()): string {
  const envelope: ProjectEnvelope = {
    formato: PROJECT_FORMAT,
    versao: PROJECT_VERSION,
    criadoEm: now.toISOString(),
    ...data,
  };
  return JSON.stringify(envelope);
}

/** Procura chaves proibidas em qualquer profundidade (iterativo: sem estouro de pilha). */
export function findForbiddenKey(root: unknown): string | null {
  const stack: Array<{ v: unknown; d: number }> = [{ v: root, d: 0 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop()!;
    if (typeof v !== 'object' || v === null) continue;
    if (d > MAX_DEPTH) return '(estrutura profunda demais)';
    if (Array.isArray(v)) {
      for (const item of v) stack.push({ v: item, d: d + 1 });
      continue;
    }
    for (const key of Object.keys(v)) {
      if (FORBIDDEN_KEYS.has(key)) return key;
      stack.push({ v: (v as Json)[key], d: d + 1 });
    }
  }
  return null;
}

function validateSheet(raw: unknown, index: number): string | null {
  const at = `aba ${index + 1}`;
  if (!isRecord(raw)) return `${at}: formato inválido`;
  if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 128) return `${at}: id inválido`;
  if (typeof raw.name !== 'string' || raw.name.length > 256) return `${at}: nome inválido`;
  if (!isRecord(raw.data)) return `${at}: dados das células inválidos`;
  const rows = raw.rowCount;
  const cols = raw.colCount;
  if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 1 || rows > 1_048_576) return `${at}: rowCount inválido`;
  if (typeof cols !== 'number' || !Number.isInteger(cols) || cols < 1 || cols > 16_384) return `${at}: colCount inválido`;
  for (const f of ['colWidths', 'rowHeights'] as const) {
    if (raw[f] !== undefined && !isRecord(raw[f])) return `${at}: ${f} inválido`;
  }
  for (const f of ['mergedRegions', 'conditionalRules', 'charts', 'images', 'validations', 'hiddenRows', 'hiddenCols'] as const) {
    if (raw[f] !== undefined && !Array.isArray(raw[f])) return `${at}: ${f} inválido`;
  }
  return null;
}

/** Normaliza campos opcionais e descarta imagens que não sejam data:image/ (nada de URLs externas). */
function cleanSheet(raw: Json): Sheet {
  const s = raw as unknown as Sheet;
  return {
    ...s,
    colWidths: s.colWidths ?? {},
    rowHeights: s.rowHeights ?? {},
    mergedRegions: s.mergedRegions ?? [],
    conditionalRules: s.conditionalRules ?? [],
    images: s.images?.filter(img => isRecord(img) && typeof img.src === 'string' && /^data:image\//i.test(img.src)),
  };
}

/** Valida o texto JSON de um projeto. Não executa nada do conteúdo. */
export function parseProject(text: string): ParseProjectResult {
  if (text.length > MAX_PROJECT_BYTES) return { ok: false, error: 'Arquivo grande demais.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return { ok: false, error: 'O arquivo não é um projeto Verxel válido (JSON ilegível).' };
  }
  if (!isRecord(parsed) || parsed.formato !== PROJECT_FORMAT) {
    return { ok: false, error: 'Este arquivo não é um projeto Verxel (.verxel).' };
  }
  if (typeof parsed.versao !== 'number' || !Number.isInteger(parsed.versao) || parsed.versao < 1) {
    return { ok: false, error: 'Versão do projeto ausente ou inválida.' };
  }
  if (parsed.versao > PROJECT_VERSION) {
    return { ok: false, error: `Projeto criado numa versão mais nova (${parsed.versao}). Atualize o Verxel para abri-lo.` };
  }
  const bad = findForbiddenKey(parsed);
  if (bad) return { ok: false, error: `Arquivo recusado: contém a chave proibida "${bad}".` };

  const sheetsRaw = parsed.sheets;
  if (!Array.isArray(sheetsRaw) || sheetsRaw.length === 0) return { ok: false, error: 'O projeto não tem nenhuma aba.' };
  if (sheetsRaw.length > MAX_SHEETS) return { ok: false, error: `Abas demais (máximo ${MAX_SHEETS}).` };
  const ids = new Set<string>();
  for (let i = 0; i < sheetsRaw.length; i++) {
    const err = validateSheet(sheetsRaw[i], i);
    if (err) return { ok: false, error: `Projeto inválido: ${err}.` };
    const id = (sheetsRaw[i] as Json).id as string;
    if (ids.has(id)) return { ok: false, error: `Projeto inválido: id de aba repetido (${id}).` };
    ids.add(id);
  }
  const sheets = (sheetsRaw as Json[]).map(cleanSheet);

  const activeRaw = typeof parsed.activeSheetId === 'string' ? parsed.activeSheetId : '';
  const activeSheetId = ids.has(activeRaw) ? activeRaw : sheets[0].id;
  const starredSheetIds = Array.isArray(parsed.starredSheetIds)
    ? parsed.starredSheetIds.filter((x): x is string => typeof x === 'string' && ids.has(x))
    : [];
  const relationEdges = Array.isArray(parsed.relationEdges) ? parsed.relationEdges.filter(isRecord) : [];

  let flowGraph: unknown | null = null;
  if (parsed.flowGraph !== null && parsed.flowGraph !== undefined) {
    const g = parseFlowGraph(parsed.flowGraph);
    if (g.ok) flowGraph = g.graph;
    // Fluxo inválido não bloqueia a abertura das abas: o fluxo apenas não é restaurado.
  }
  const preferences = isRecord(parsed.preferences) ? parsed.preferences : {};

  return {
    ok: true,
    project: {
      formato: PROJECT_FORMAT,
      versao: parsed.versao,
      criadoEm: typeof parsed.criadoEm === 'string' ? parsed.criadoEm : '',
      sheets,
      activeSheetId,
      starredSheetIds,
      relationEdges,
      flowGraph,
      preferences,
    },
  };
}

function uniqueName(base: string, taken: Set<string>): string {
  const clean = base.trim() || 'Aba';
  if (!taken.has(clean.toLowerCase())) return clean;
  for (let n = 2; ; n++) {
    const candidate = `${clean} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * "Acrescentar abas": devolve as abas de entrada com ids e nomes únicos em relação às existentes.
 * `makeId` é injetável para teste. Não altera os objetos de entrada.
 */
export function appendableSheets(
  existing: readonly Sheet[],
  incoming: readonly Sheet[],
  makeId: () => string = () => `sheet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
): Sheet[] {
  const ids = new Set(existing.map(s => s.id));
  const names = new Set(existing.map(s => s.name.toLowerCase()));
  return incoming.map(s => {
    let id = s.id;
    while (ids.has(id)) id = makeId();
    ids.add(id);
    const name = uniqueName(s.name, names);
    names.add(name.toLowerCase());
    return { ...s, id, name };
  });
}

// ---------- Bytes (gzip opcional) ----------

const hasCompression = (): boolean =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined';

async function pipeBytes(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const reader = source.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error('Conteúdo descomprimido acima do limite.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Bytes prontos para gravar: gzip quando disponível, senão JSON puro UTF-8. */
export async function encodeProject(data: ProjectData, now: Date = new Date()): Promise<{ bytes: Uint8Array; compressed: boolean }> {
  const raw = new TextEncoder().encode(serializeProject(data, now));
  if (hasCompression()) {
    try {
      return { bytes: await pipeBytes(raw, new CompressionStream('gzip'), Number.MAX_SAFE_INTEGER), compressed: true };
    } catch {
      // cai no JSON puro
    }
  }
  return { bytes: raw, compressed: false };
}

/** Lê bytes de um .verxel (gzip ou JSON puro) e valida. */
export async function decodeProject(bytes: Uint8Array): Promise<ParseProjectResult> {
  try {
    let raw = bytes;
    if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (!hasCompression()) return { ok: false, error: 'Este navegador não consegue descompactar o arquivo.' };
      raw = await pipeBytes(bytes, new DecompressionStream('gzip'), MAX_PROJECT_BYTES);
    } else if (bytes.length > MAX_PROJECT_BYTES) {
      return { ok: false, error: 'Arquivo grande demais.' };
    }
    return parseProject(new TextDecoder('utf-8').decode(raw));
  } catch {
    return { ok: false, error: 'Não foi possível ler o arquivo (corrompido ou grande demais).' };
  }
}
