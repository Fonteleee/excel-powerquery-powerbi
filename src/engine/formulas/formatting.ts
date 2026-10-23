// src/engine/formulas/formatting.ts
// Formatação de valores para exibição (moeda, percentual, tempo, texto).

import { CellFormat } from '../../types/spreadsheet';
import { parseNumberSafely, valueToSeconds } from './numbers';

/**
/**
 * Formats total seconds into desired time string
 */
export function formatSecondsToTime(
  totalSeconds: number,
  formatType: 'time' | 'time_hh_mm' | 'time_hh_mm_ss' | 'time_duration' | 'time_minutes_label'
): string {
  const isNeg = totalSeconds < 0;
  const absSec = Math.abs(totalSeconds);

  const hours = Math.floor(absSec / 3600);
  const minutes = Math.floor((absSec % 3600) / 60);
  const seconds = Math.floor(absSec % 60);

  const pad = (n: number) => String(n).padStart(2, '0');

  if (formatType === 'time_minutes_label') {
    // Total in minutes (e.g. 60m, 15m, 120m, 0m)
    const totalMin = Math.round(absSec / 60);
    return `${isNeg ? '-' : ''}${totalMin}m`;
  }

  if (formatType === 'time_hh_mm') {
    return `${isNeg ? '-' : ''}${pad(hours)}:${pad(minutes)}`;
  }

  if (formatType === 'time_duration') {
    if (hours > 0) {
      return `${isNeg ? '-' : ''}${hours}h ${pad(minutes)}m${seconds > 0 ? ` ${pad(seconds)}s` : ''}`;
    }
    return `${isNeg ? '-' : ''}${minutes}m${seconds > 0 ? ` ${pad(seconds)}s` : ''}`;
  }


  // Default 'time' or 'time_hh_mm_ss' -> HH:MM:SS
  return `${isNeg ? '-' : ''}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Format cell value for display
export function formatCellValue(value: any, format?: CellFormat): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' && value.startsWith('#')) return value; // Error flag

  const type = format?.type || 'general';
  const decimals = format?.decimals !== undefined ? format.decimals : 2;

  // Explicit TEXT format
  if (type === 'text') {
    let text = String(value);
    if (format?.textCase === 'uppercase') text = text.toUpperCase();
    else if (format?.textCase === 'lowercase') text = text.toLowerCase();
    else if (format?.textCase === 'capitalize') text = text.replace(/\b\w/g, c => c.toUpperCase());
    return text;
  }

  // Time & Duration formats
  if (
    type === 'time' ||
    type === 'time_hh_mm' ||
    type === 'time_hh_mm_ss' ||
    type === 'time_duration' ||
    type === 'time_minutes_label'
  ) {
    const totalSec = valueToSeconds(value, 'auto');
    return formatSecondsToTime(totalSec, type);
  }
  if (type === 'time_from_decimal_hours') {
    const totalSec = valueToSeconds(value, 'hours');
    return formatSecondsToTime(totalSec, 'time_hh_mm_ss');
  }
  if (type === 'time_from_minutes') {
    const totalSec = valueToSeconds(value, 'minutes');
    return formatSecondsToTime(totalSec, 'time_hh_mm_ss');
  }

  if (type === 'time_from_seconds') {
    const totalSec = valueToSeconds(value, 'seconds');
    return formatSecondsToTime(totalSec, 'time_hh_mm_ss');
  }

  const numVal = parseNumberSafely(value);


  if (numVal !== null) {
    if (type === 'currency') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(numVal);
    }
    if (type === 'currency_usd') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(numVal);
    }
    if (type === 'currency_eur') {
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(numVal);
    }
    if (type === 'percentage') {
      const pct = numVal > 1 && numVal <= 100 ? numVal : numVal * 100;
      return `${pct.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}%`;
    }
    if (type === 'number') {
      return numVal.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    if (type === 'date') {
      const d = new Date(numVal > 10000000000 ? numVal : (numVal - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('pt-BR');
      }
    }
  }

  let text = String(value);
  if (format?.textCase === 'uppercase') text = text.toUpperCase();
  else if (format?.textCase === 'lowercase') text = text.toLowerCase();
  else if (format?.textCase === 'capitalize') text = text.replace(/\b\w/g, c => c.toUpperCase());

  return text;
}
