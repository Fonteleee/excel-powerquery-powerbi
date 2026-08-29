import { CellRange, Sheet } from '../types/spreadsheet';
import { cellPosToKey, parseCellAddress } from './formulaParser';

export type AutoFillType = 'series' | 'copy' | 'formatting_only' | 'no_formatting';

const DAYS_OF_WEEK_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DAYS_OF_WEEK_PT_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const MONTHS_PT_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Parses date string in Brazilian (DD/MM/YYYY) or ISO format (YYYY-MM-DD)
 */
function parseDateString(str: string): Date | null {
  const brMatch = str.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    let year = parseInt(brMatch[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }
  const isoMatch = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(str.trim());
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDateToBR(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Detects whether a string is an alphanumeric code with a numeric suffix (e.g. "AG-001", "Item 1", "MAT8090")
 */
function parseAlphanumericCode(str: string): { prefix: string; num: number; padLen: number } | null {
  const match = str.trim().match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const num = parseInt(numStr, 10);
    return {
      prefix,
      num,
      padLen: numStr.startsWith('0') ? numStr.length : 0,
    };
  }
  return null;
}

/**
 * Computes the smart series for dragging vertically or horizontally
 */
export function computeSmartSeries(
  sourceValues: (string | number)[],
  targetLength: number,
  mode: AutoFillType = 'series'
): (string | number)[] {
  if (sourceValues.length === 0 || targetLength <= 0) return [];

  // If user requested "copy", just repeat the source array cyclically
  if (mode === 'copy') {
    const result: (string | number)[] = [];
    for (let i = 0; i < targetLength; i++) {
      result.push(sourceValues[i % sourceValues.length]);
    }
    return result;
  }

  const strValues = sourceValues.map(v => String(v).trim());

  // 1. Check Arithmetic Number Progression
  const numValues = strValues.map(s => {
    const clean = s.replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
  });

  const allNumbers = numValues.every(n => n !== null);
  if (allNumbers && numValues.length > 0) {
    let step = 1;
    if (numValues.length > 1) {
      step = (numValues[numValues.length - 1]! - numValues[0]!) / (numValues.length - 1);
    }
    const lastNum = numValues[numValues.length - 1]!;
    const isFloat = String(lastNum).includes('.') || String(step).includes('.');

    const result: number[] = [];
    for (let i = 1; i <= targetLength; i++) {
      const next = lastNum + step * i;
      result.push(isFloat ? Math.round(next * 100) / 100 : Math.round(next));
    }
    return result;
  }

  // 2. Check Date Sequence (e.g. "29/08/2026")
  const dateValues = strValues.map(parseDateString);
  const allDates = dateValues.every(d => d !== null);
  if (allDates && dateValues.length > 0) {
    let dayStep = 1;
    if (dateValues.length > 1) {
      const diffMs = dateValues[dateValues.length - 1]!.getTime() - dateValues[0]!.getTime();
      dayStep = Math.round(diffMs / (1000 * 60 * 60 * 24)) / (dateValues.length - 1);
      if (dayStep === 0) dayStep = 1;
    }
    const lastDate = dateValues[dateValues.length - 1]!;
    const result: string[] = [];

    for (let i = 1; i <= targetLength; i++) {
      const nextDate = new Date(lastDate);
      nextDate.setDate(lastDate.getDate() + Math.round(dayStep * i));
      result.push(formatDateToBR(nextDate));
    }
    return result;
  }

  // 3. Check Alphanumeric Pattern (e.g. "AG-001" -> "AG-002", "CMAC8040" -> "CMAC8041")
  const codePatterns = strValues.map(parseAlphanumericCode);
  const allCodes = codePatterns.every(c => c !== null && c.prefix === codePatterns[0]?.prefix);
  if (allCodes && codePatterns.length > 0) {
    let step = 1;
    if (codePatterns.length > 1) {
      step = (codePatterns[codePatterns.length - 1]!.num - codePatterns[0]!.num) / (codePatterns.length - 1);
      if (step === 0) step = 1;
    }
    const lastCode = codePatterns[codePatterns.length - 1]!;
    const result: string[] = [];

    for (let i = 1; i <= targetLength; i++) {
      const nextNum = lastCode.num + Math.round(step * i);
      const nextNumStr = lastCode.padLen > 0 ? String(nextNum).padStart(lastCode.padLen, '0') : String(nextNum);
      result.push(`${lastCode.prefix}${nextNumStr}`);
    }
    return result;
  }

  // 4. Check Day of Week Sequence
  const firstStr = strValues[0];
  const dayIdx = DAYS_OF_WEEK_PT.findIndex(d => d.toLowerCase() === firstStr.toLowerCase());
  if (dayIdx >= 0) {
    const result: string[] = [];
    for (let i = 1; i <= targetLength; i++) {
      const nextDay = DAYS_OF_WEEK_PT[(dayIdx + i) % DAYS_OF_WEEK_PT.length];
      result.push(nextDay);
    }
    return result;
  }

  const dayShortIdx = DAYS_OF_WEEK_PT_SHORT.findIndex(d => d.toLowerCase() === firstStr.toLowerCase());
  if (dayShortIdx >= 0) {
    const result: string[] = [];
    for (let i = 1; i <= targetLength; i++) {
      const nextDay = DAYS_OF_WEEK_PT_SHORT[(dayShortIdx + i) % DAYS_OF_WEEK_PT_SHORT.length];
      result.push(nextDay);
    }
    return result;
  }

  // 5. Check Month of Year Sequence
  const monthIdx = MONTHS_PT.findIndex(m => m.toLowerCase() === firstStr.toLowerCase());
  if (monthIdx >= 0) {
    const result: string[] = [];
    for (let i = 1; i <= targetLength; i++) {
      const nextMonth = MONTHS_PT[(monthIdx + i) % MONTHS_PT.length];
      result.push(nextMonth);
    }
    return result;
  }

  const monthShortIdx = MONTHS_PT_SHORT.findIndex(m => m.toLowerCase() === firstStr.toLowerCase());
  if (monthShortIdx >= 0) {
    const result: string[] = [];
    for (let i = 1; i <= targetLength; i++) {
      const nextMonth = MONTHS_PT_SHORT[(monthShortIdx + i) % MONTHS_PT_SHORT.length];
      result.push(nextMonth);
    }
    return result;
  }

  // Default fallback: repeat source sequence cyclically
  const result: (string | number)[] = [];
  for (let i = 0; i < targetLength; i++) {
    result.push(sourceValues[i % sourceValues.length]);
  }
  return result;
}
