// src/utils/contrast.ts
// Garante texto legível sobre qualquer cor de fundo (ex.: cabeçalho escuro com fonte escura).

const DARK_TEXT = '#0f172a';
const LIGHT_TEXT = '#ffffff';
const MIN_CONTRAST = 3;

/** "#rgb" ou "#rrggbb" -> [r, g, b]; devolve null para qualquer outra coisa. */
export function parseHexColor(color: string | undefined): [number, number, number] | null {
  if (!color) return null;
  const hex = color.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex);
  if (short) return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16)];
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex);
  return long ? [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)] : null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Razão de contraste WCAG entre duas cores hex (1 a 21); null se alguma não for hex. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHexColor(a);
  const cb = parseHexColor(b);
  if (!ca || !cb) return null;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Cor de texto legível sobre `background`. Mantém a cor pedida se ela já tiver contraste suficiente;
 * senão escolhe branco ou o escuro padrão, o que contrastar mais.
 */
export function readableTextColor(background: string, preferred?: string): string {
  const bg = parseHexColor(background);
  if (!bg) return preferred ?? DARK_TEXT;
  if (preferred) {
    const ratio = contrastRatio(background, preferred);
    if (ratio === null || ratio >= MIN_CONTRAST) return preferred;
  }
  const light = contrastRatio(background, LIGHT_TEXT) ?? 0;
  const dark = contrastRatio(background, DARK_TEXT) ?? 0;
  return light >= dark ? LIGHT_TEXT : DARK_TEXT;
}
