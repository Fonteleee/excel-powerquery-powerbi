// src/features/relations/model/viewState.ts
// Estado de VISUALIZAÇÃO do canvas (não faz parte do grafo): cards recolhidos, zoom/pan, planilhas já vistas.
// Tudo que vem do armazenamento passa por `parseViewState`, que nunca lança e sempre devolve valores seguros.

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export interface StoredViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface FlowViewState {
  /** Ids de nós de tabela recolhidos. */
  collapsed: string[];
  /** Planilhas que já ganharam (ou tiveram removido) o nó de tabela; só as novas entram sozinhas. */
  knownSheetIds: string[];
  /** Relações legadas já tratadas (convertidas ou dispensadas pelo usuário). */
  legacyHandled: boolean;
  showKeysOnly: boolean;
  viewport: StoredViewport;
}

const MAX_LIST = 500;
const MAX_ID_LENGTH = 128;
const MAX_PAN = 1_000_000;

export const DEFAULT_VIEWPORT: StoredViewport = { zoom: 1, panX: 40, panY: 30 };

export function createDefaultViewState(): FlowViewState {
  return {
    collapsed: [],
    knownSheetIds: [],
    legacyHandled: false,
    showKeysOnly: false,
    viewport: { ...DEFAULT_VIEWPORT },
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= MAX_LIST) break;
    if (typeof item === 'string' && item.length > 0 && item.length <= MAX_ID_LENGTH) out.push(item);
  }
  return out;
}

function finiteIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function parseViewState(input: unknown): FlowViewState {
  const base = createDefaultViewState();
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return base;
  const raw = input as Record<string, unknown>;
  const vp = typeof raw.viewport === 'object' && raw.viewport !== null ? (raw.viewport as Record<string, unknown>) : {};

  return {
    collapsed: stringList(raw.collapsed),
    knownSheetIds: stringList(raw.knownSheetIds),
    legacyHandled: raw.legacyHandled === true,
    showKeysOnly: raw.showKeysOnly === true,
    viewport: {
      zoom: finiteIn(vp.zoom, MIN_ZOOM, MAX_ZOOM, DEFAULT_VIEWPORT.zoom),
      panX: finiteIn(vp.panX, -MAX_PAN, MAX_PAN, DEFAULT_VIEWPORT.panX),
      panY: finiteIn(vp.panY, -MAX_PAN, MAX_PAN, DEFAULT_VIEWPORT.panY),
    },
  };
}
