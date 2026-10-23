// src/features/relations/ui/format.ts
// Formatação de números e textos curtos da interface (pura, em pt-BR).

/** 950 -> "950", 1234 -> "1,2 mil", 2_500_000 -> "2,5 mi". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const trim = (value: number): string => (Math.round(value * 10) / 10).toString().replace('.', ',');
  if (abs < 1000) return String(Math.round(n));
  if (abs < 1_000_000) return `${trim(n / 1000)} mil`;
  return `${trim(n / 1_000_000)} mi`;
}

export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return '—';
  const rounded = Math.round(rate * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toString().replace('.', ',')}%`;
}

export function pluralize(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${formatCount(n)} ${many}`;
}

/** Texto de célula para a grade de preview. */
export function cellText(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6).replace('.', ',');
  return String(value);
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}
