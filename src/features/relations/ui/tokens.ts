// src/features/relations/ui/tokens.ts
// Tokens de design da aba de Relacionamentos: UMA fonte para cores dos cabos, escala tipográfica,
// espaçamento, raios e sombras. Só vetor (SVG/CSS): nada de bitmap na interface, então fica nítido em qualquer DPI.
// `tokenCssVars()` publica tudo como variáveis CSS (`--rel-*`) no elemento raiz do canvas.

export const COLORS = {
  canvas: '#f8fafc',
  dot: '#b6c2d3',
  card: '#ffffff',
  cardHeader: '#f1f5f9',
  cardBorder: '#cbd5e1',
  ink: '#0f172a',
  inkMuted: '#475569',
  accent: '#4338ca',
  selected: '#4338ca',
  ok: '#047857',
  warn: '#b45309',
  danger: '#be123c',
  pin: '#64748b',
} as const;

export type CableTone = 'raw' | 'lookup' | 'aggregate' | 'error';

/** Cores semânticas dos cabos. Todas passam de 3:1 sobre o fundo do canvas (WCAG para gráficos). */
export const CABLES: Record<CableTone, { color: string; glow: string; soft: string; label: string }> = {
  raw: { color: '#0e7490', glow: 'rgba(6, 182, 212, 0.55)', soft: '#ecfeff', label: 'Dados brutos' },
  lookup: { color: '#7c3aed', glow: 'rgba(139, 92, 246, 0.55)', soft: '#f5f3ff', label: 'Busca / cruzamento' },
  aggregate: { color: '#c2410c', glow: 'rgba(249, 115, 22, 0.55)', soft: '#fff7ed', label: 'Agregação' },
  error: { color: '#e11d48', glow: 'rgba(255, 23, 68, 0.6)', soft: '#fff1f2', label: 'Erro / órfãos' },
};

/** Escala tipográfica em px (inteiros para texto nítido). */
export const TYPE_SCALE = {
  micro: 10,
  caption: 11,
  body: 12,
  label: 13,
  title: 14,
  heading: 16,
} as const;

/** Espaçamento em px (base 4). */
export const SPACING = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32 } as const;

export const RADII = { chip: 999, card: 14, node: 12, control: 8 } as const;

export const SHADOWS = {
  card: '0 1px 2px rgba(15, 23, 42, 0.10), 0 6px 18px rgba(15, 23, 42, 0.08)',
  cardActive: '0 2px 4px rgba(15, 23, 42, 0.12), 0 12px 28px rgba(67, 56, 202, 0.22)',
  drawer: '-8px 0 32px rgba(15, 23, 42, 0.14)',
  popover: '0 10px 32px rgba(15, 23, 42, 0.22)',
} as const;

/** Medidas do desenho (unidades de mundo). */
export const LAYOUT = {
  cardWidth: 288,
  hexWidth: 176,
  hexHeight: 120,
  outputWidth: 208,
  drawerWidth: 420,
  listMaxHeight: 288,
} as const;

/** Variáveis CSS publicadas no elemento raiz do canvas. */
export function tokenCssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(COLORS)) vars[`--rel-${kebab(name)}`] = value;
  for (const [tone, def] of Object.entries(CABLES)) {
    vars[`--rel-cable-${tone}`] = def.color;
    vars[`--rel-cable-${tone}-glow`] = def.glow;
    vars[`--rel-cable-${tone}-soft`] = def.soft;
  }
  for (const [name, px] of Object.entries(TYPE_SCALE)) vars[`--rel-text-${name}`] = `${px}px`;
  for (const [name, px] of Object.entries(SPACING)) vars[`--rel-space-${name}`] = `${px}px`;
  for (const [name, px] of Object.entries(RADII)) vars[`--rel-radius-${name}`] = `${px}px`;
  for (const [name, value] of Object.entries(SHADOWS)) vars[`--rel-shadow-${kebab(name)}`] = value;
  return vars;
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`);
}

/** Razão de contraste WCAG entre duas cores `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`cor inválida: ${hex}`);
  const channel = (offset: number): number => {
    const v = parseInt(m[1].slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}
