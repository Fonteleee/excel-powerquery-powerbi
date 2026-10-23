// src/engine/formulas/numbers.ts
// Conversão de números (PT-BR/US), comparação de valores estilo Excel e conversão de tempo em segundos.

// Helper to safely parse numbers with Brazilian or US format
export function parseNumberSafely(val: any, allowTimeAsSeconds = false): number | null {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val !== 'string') return null;
  const str = val.trim();
  if (!str) return null;

  // If contains time colon (e.g. "05:27:26", "04:03:02", "12:30")
  if (str.includes(':')) {
    if (allowTimeAsSeconds && /^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
      return valueToSeconds(str);
    }
    return null;
  }



  // If date format (e.g. "10/01/2023", "2023-01-10"), it is DATE, NOT a number!
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(str) || /^\d{4}-\d{2}-\d{2}$/.test(str)) return null;

  // Handle currency prefixes like "R$", "$", "€"
  const cleanStr = str
    .replace(/^[R$€\s]+|[R$€\s]+$/g, '')
    .replace(/%/g, '')
    .trim();

  if (!cleanStr) return null;

  // If Brazilian format: 1.234,56 or 1234,56
  if (cleanStr.includes(',') && !cleanStr.includes('.')) {
    const normalized = cleanStr.replace(',', '.');
    if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) return null;
    const num = parseFloat(normalized);
    if (!isNaN(num)) return str.includes('%') ? num / 100 : num;
  } else if (cleanStr.includes('.') && cleanStr.includes(',')) {
    if (cleanStr.lastIndexOf(',') > cleanStr.lastIndexOf('.')) {
      // 1.234,56 -> 1234.56
      const normalized = cleanStr.replace(/\./g, '').replace(',', '.');
      if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) return null;
      const num = parseFloat(normalized);
      if (!isNaN(num)) return str.includes('%') ? num / 100 : num;
    } else {
      // 1,234.56 -> 1234.56
      const normalized = cleanStr.replace(/,/g, '');
      if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) return null;
      const num = parseFloat(normalized);
      if (!isNaN(num)) return str.includes('%') ? num / 100 : num;
    }
  } else {
    // US or plain integer: e.g. 1234.56 or 1234 or -50
    if (!/^[-+]?\d+(\.\d+)?$/.test(cleanStr)) return null;
    const num = parseFloat(cleanStr);
    if (!isNaN(num)) return str.includes('%') ? num / 100 : num;
  }
  return null;
}

/**
 * Normalizador e comparador universal de valores do Excel.
 * Suporta string vs número ("100,00" == 100), trim de espaços, case-insensitivity e wildcards.
 */
export function valuesMatch(cellVal: any, criteriaVal: any): boolean {
  if (cellVal === null || cellVal === undefined) return false;
  if (criteriaVal === null || criteriaVal === undefined) return false;
  if (cellVal === criteriaVal) return true;

  // Normalização de string
  const strCell = String(cellVal).trim().toLowerCase();
  const strCriteria = String(criteriaVal).trim().toLowerCase();
  if (strCell === strCriteria) return true;

  // Comparação numérica segura (suporta formato PT-BR e US)
  const numCell = parseNumberSafely(cellVal);
  const numCriteria = parseNumberSafely(criteriaVal);
  if (numCell !== null && numCriteria !== null && Math.abs(numCell - numCriteria) < 1e-9) {
    return true;
  }

  // Suporte a Wildcards (* e ?)
  if (typeof criteriaVal === 'string' && (criteriaVal.includes('*') || criteriaVal.includes('?'))) {
    const regexPattern = '^' + strCriteria.replace(/[-[\]{}()+.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    try {
      return new RegExp(regexPattern, 'i').test(strCell);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Helper to convert any value into total seconds
 * Supports:
 * - Numbers: 60 (as min = 3600s, as hrs = 216000s)
 * - Strings: "60", "60m", "60 min", "1h 30m", "01:00:00", "01:00"
 */
export function valueToSeconds(value: any, specificMode?: 'hours' | 'minutes' | 'seconds' | 'auto'): number {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'string') {
    const trimmed = value.trim();

    // Check HH:MM:SS or HH:MM
    const timeMatch = trimmed.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10) || 0;
      const m = parseInt(timeMatch[2], 10) || 0;
      const s = parseInt(timeMatch[3], 10) || 0;
      return h * 3600 + m * 60 + s;
    }

    // Check Duration strings like "1h 30m", "60min", "60m", "45s", "120 seg"
    const durMatch = trimmed.match(/^(?:(\d+)\s*h(?:oras?)?)?\s*(?:(\d+)\s*m(?:in(?:utos?)?)?)?\s*(?:(\d+)\s*s(?:eg(?:undos?)?)?)?$/i);
    if (durMatch && (durMatch[1] || durMatch[2] || durMatch[3])) {
      const h = parseInt(durMatch[1] || '0', 10);
      const m = parseInt(durMatch[2] || '0', 10);
      const s = parseInt(durMatch[3] || '0', 10);
      return h * 3600 + m * 60 + s;
    }
  }

  const num = parseNumberSafely(value);
  if (num === null) return 0;

  if (specificMode === 'hours') return Math.round(num * 3600);
  if (specificMode === 'minutes') return Math.round(num * 60);
  if (specificMode === 'seconds') return Math.round(num);

  // Auto inference:
  // If Excel fraction of day (e.g. 0.041666 = 1h, 0.5 = 12h, 0.137106 -> 03:17:26)
  if (num > 0 && num < 1) return Math.round(num * 86400);

  // If numbers > 1440 (likely seconds, e.g. 11846 -> 03:17:26, 3600 -> 01:00:00)
  if (num > 1440) return Math.round(num);

  // If 0..24 (e.g. 1 -> 1h = 3600s = 01:00:00, 2 -> 2h = 02:00:00, 3.29 -> 03:17:26)
  if (num >= 0 && num <= 24) return Math.round(num * 3600);

  // If 25..1440 (likely minutes, e.g. 60 -> 60min = 3600s = 01:00:00, 90 -> 01:30:00)
  if (num > 24 && num <= 1440) return Math.round(num * 60);

  return Math.round(num);
}
