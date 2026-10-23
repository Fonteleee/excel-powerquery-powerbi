// src/features/relations/analysis/dates.ts
// Reconhecimento e conversão de datas em texto (padrão brasileiro: dia antes do mês).

export type DateFormat = 'dd/mm/yyyy' | 'dd/mm/yy' | 'dd-mm-yyyy' | 'yyyy-mm-dd' | 'yyyy/mm/dd';

export const DATE_FORMATS: readonly DateFormat[] = ['dd/mm/yyyy', 'dd/mm/yy', 'dd-mm-yyyy', 'yyyy-mm-dd', 'yyyy/mm/dd'];

interface DatePattern {
  format: DateFormat;
  pattern: RegExp;
  /** Ordem dos grupos capturados. */
  order: readonly ['d' | 'm' | 'y', 'd' | 'm' | 'y', 'd' | 'm' | 'y'];
}

const PATTERNS: readonly DatePattern[] = [
  { format: 'dd/mm/yyyy', pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['d', 'm', 'y'] },
  { format: 'dd/mm/yy', pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, order: ['d', 'm', 'y'] },
  { format: 'dd-mm-yyyy', pattern: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ['d', 'm', 'y'] },
  { format: 'yyyy-mm-dd', pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ['y', 'm', 'd'] },
  { format: 'yyyy/mm/dd', pattern: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: ['y', 'm', 'd'] },
];

export interface ParsedDate {
  format: DateFormat;
  year: number;
  month: number;
  day: number;
  /** Data real (mês 1-12, dia existente no mês). */
  valid: boolean;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Reconhece o formato do texto (com ou sem validade). Devolve null se não parecer uma data. */
export function parseDateText(text: string): ParsedDate | null {
  const trimmed = text.trim();
  for (const { format, pattern, order } of PATTERNS) {
    const match = pattern.exec(trimmed);
    if (!match) continue;
    const parts = { d: 0, m: 0, y: 0 };
    order.forEach((key, i) => {
      parts[key] = Number(match[i + 1]);
    });
    // Ano de 2 dígitos: 00-69 vira 2000-2069 e 70-99 vira 1970-1999.
    const year = format === 'dd/mm/yy' ? (parts.y <= 69 ? 2000 + parts.y : 1900 + parts.y) : parts.y;
    const valid = parts.m >= 1 && parts.m <= 12 && parts.d >= 1 && parts.d <= daysInMonth(year, parts.m);
    return { format, year, month: parts.m, day: parts.d, valid };
  }
  return null;
}

const pad = (n: number, size = 2): string => String(n).padStart(size, '0');

export function formatDate(date: Pick<ParsedDate, 'year' | 'month' | 'day'>, format: DateFormat): string {
  const { year, month, day } = date;
  switch (format) {
    case 'dd/mm/yyyy':
      return `${pad(day)}/${pad(month)}/${pad(year, 4)}`;
    case 'dd/mm/yy':
      return `${pad(day)}/${pad(month)}/${pad(year % 100)}`;
    case 'dd-mm-yyyy':
      return `${pad(day)}-${pad(month)}-${pad(year, 4)}`;
    case 'yyyy-mm-dd':
      return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
    case 'yyyy/mm/dd':
      return `${pad(year, 4)}/${pad(month)}/${pad(day)}`;
  }
}
