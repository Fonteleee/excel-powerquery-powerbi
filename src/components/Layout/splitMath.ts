// src/components/Layout/splitMath.ts
// Matemática pura do divisor 75% / 25% e da regra de recolher a barra lateral.

export const DEFAULT_SIDE_RATIO = 0.25;
export const MIN_SIDE_PX = 280;
export const MAX_SIDE_RATIO = 0.6;
export const SPLIT_STORAGE_KEY = 'nocodb_split_side_ratio_v1';

/** Limita a fração do painel lateral: nunca menor que MIN_SIDE_PX nem maior que MAX_SIDE_RATIO. */
export function clampSideRatio(ratio: number, containerWidth: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SIDE_RATIO;
  const min = containerWidth > 0 ? Math.min(MIN_SIDE_PX / containerWidth, MAX_SIDE_RATIO) : 0.1;
  return Math.min(MAX_SIDE_RATIO, Math.max(min, ratio));
}

/** Lê a preferência guardada; qualquer valor inválido volta ao padrão de 25%. */
export function parseStoredRatio(raw: string | null): number {
  if (raw === null) return DEFAULT_SIDE_RATIO;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0.05 && n <= MAX_SIDE_RATIO ? n : DEFAULT_SIDE_RATIO;
}

export interface SidebarDecision {
  sidebarOpen: boolean;
  autoCollapsed: boolean;
}

/**
 * Recolhe a barra lateral sozinha quando o painel está aberto e falta espaço; reabre só se foi ela quem recolheu.
 * `containerWidth` é a largura da área dividida (grade + painel).
 */
export function decideSidebar(input: {
  containerWidth: number;
  sidebarWidth: number;
  sidePanelOpen: boolean;
  sidebarOpen: boolean;
  autoCollapsed: boolean;
  minNeeded?: number;
}): SidebarDecision {
  const needed = input.minNeeded ?? 960;
  const { sidebarOpen, autoCollapsed } = input;
  if (input.containerWidth <= 0) return { sidebarOpen, autoCollapsed };
  if (input.sidePanelOpen && sidebarOpen && input.containerWidth < needed) {
    return { sidebarOpen: false, autoCollapsed: true };
  }
  if (autoCollapsed && !sidebarOpen && (!input.sidePanelOpen || input.containerWidth >= needed + input.sidebarWidth)) {
    return { sidebarOpen: true, autoCollapsed: false };
  }
  return { sidebarOpen, autoCollapsed };
}
