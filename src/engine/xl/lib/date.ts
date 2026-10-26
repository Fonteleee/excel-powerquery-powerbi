// src/engine/xl/lib/date.ts
// Datas e horas. Datas são números de série (como no Excel); as funções que devolvem data devolvem o texto
// "dd/mm/aaaa" (é assim que as células de data do sistema são guardadas).

import { Call } from '../call';
import { parseNumberSafely } from '../../formulas/numbers';
import {
  formatDateSerial,
  isMatrix,
  mapMatrix,
  NUM,
  parseDateText,
  partsFromSerial,
  Scalar,
  serialFromParts,
  toNumber,
  Value,
  VALOR,
  XlError,
} from '../values';
import { def } from './registry';

/** Data ou hora (texto "05/01/2024", "03:17:26", número) -> número de série. */
export function toSerial(v: Scalar): number {
  if (typeof v === 'string') {
    const d = parseDateText(v);
    if (d !== null) return d;
    const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());
    if (t) return (Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3] ?? 0)) / 86400;
    const n = parseNumberSafely(v);
    if (n !== null) return n;
    throw new XlError(VALOR);
  }
  return toNumber(v);
}

const dateText = (serial: number): string => formatDateSerial(Math.floor(serial));

function addMonths(serial: number, months: number): number {
  const { year, month, day } = partsFromSerial(serial);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return serialFromParts(y, m, Math.min(day, lastDay));
}

const part = (names: string[], fn: (serial: number) => number): void =>
  def(names, (c: Call): Value => {
    c.expect(1);
    return mapMatrix(c.value(0), v => fn(toSerial(v)));
  });

part(['ANO', 'YEAR'], s => partsFromSerial(s).year);
part(['MÊS', 'MES', 'MONTH'], s => partsFromSerial(s).month);
part(['DIA', 'DAY'], s => partsFromSerial(s).day);
part(['HORA', 'HOUR'], s => Math.floor(Math.round((s - Math.floor(s)) * 86400) / 3600) % 24);
part(['MINUTO', 'MINUTE'], s => Math.floor(Math.round((s - Math.floor(s)) * 86400) / 60) % 60);
part(['SEGUNDO', 'SECOND'], s => Math.round((s - Math.floor(s)) * 86400) % 60);

def(['DATA', 'DATE'], (c: Call): Value => {
  c.expect(3);
  let y = c.int(0);
  const m = c.int(1);
  const d = c.int(2);
  if (y >= 0 && y < 1900) y += 1900;
  if (y < 0 || y > 9999) throw new XlError(NUM);
  // Meses e dias fora do intervalo "rolam" como no Excel (DATA(2024;13;1) = 01/01/2025).
  const base = addMonths(serialFromParts(y, 1, 1), m - 1);
  return dateText(base + d - 1);
});

def(['VALOR.DATA', 'DATEVALUE'], (c: Call): Value => {
  c.expect(1);
  return Math.floor(toSerial(c.scalar(0)));
});

def(['AGORA', 'NOW'], (): Value => {
  const n = new Date();
  const serial = serialFromParts(n.getFullYear(), n.getMonth() + 1, n.getDate()) + (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 86400;
  return formatDateSerial(serial);
}, true);

def(['TEMPO', 'TIME'], (c: Call): Value => {
  c.expect(3);
  const secs = c.int(0) * 3600 + c.int(1) * 60 + c.int(2);
  if (secs < 0) throw new XlError(NUM);
  return (secs % 86400) / 86400;
});

def(['DIA.DA.SEMANA', 'WEEKDAY'], (c: Call): Value => {
  c.expect(1, 2);
  const wd = partsFromSerial(toSerial(c.scalar(0))).weekday; // 0 = domingo
  const type = c.int(1, 1);
  if (type === 1) return wd + 1;
  if (type === 2) return ((wd + 6) % 7) + 1;
  if (type === 3) return (wd + 6) % 7;
  throw new XlError(NUM);
});

def(['NÚM.SEMANA', 'NUM.SEMANA', 'WEEKNUM'], (c: Call): Value => {
  c.expect(1, 2);
  const serial = toSerial(c.scalar(0));
  const { year } = partsFromSerial(serial);
  const jan1 = serialFromParts(year, 1, 1);
  const startsMonday = c.int(1, 1) === 2;
  const jan1wd = partsFromSerial(jan1).weekday;
  const offset = startsMonday ? (jan1wd + 6) % 7 : jan1wd;
  return Math.floor((Math.floor(serial) - jan1 + offset) / 7) + 1;
});

def(['DIAS', 'DAYS'], (c: Call): Value => {
  c.expect(2);
  return Math.floor(toSerial(c.scalar(0))) - Math.floor(toSerial(c.scalar(1)));
});

def(['DATAM', 'EDATE'], (c: Call): Value => {
  c.expect(2);
  return dateText(addMonths(Math.floor(toSerial(c.scalar(0))), c.int(1)));
});

def(['FIMMÊS', 'FIMMES', 'EOMONTH'], (c: Call): Value => {
  c.expect(2);
  const shifted = addMonths(Math.floor(toSerial(c.scalar(0))), c.int(1));
  const { year, month } = partsFromSerial(shifted);
  return dateText(serialFromParts(year, month + 1, 0));
});

def(['DATADIF', 'DATEDIF'], (c: Call): Value => {
  c.expect(3);
  const a = Math.floor(toSerial(c.scalar(0)));
  const b = Math.floor(toSerial(c.scalar(1)));
  if (b < a) throw new XlError(NUM);
  const unit = c.text(2).toUpperCase();
  const pa = partsFromSerial(a);
  const pb = partsFromSerial(b);
  let months = (pb.year - pa.year) * 12 + (pb.month - pa.month);
  if (pb.day < pa.day) months--;
  switch (unit) {
    case 'D':
      return b - a;
    case 'M':
      return months;
    case 'Y':
      return Math.floor(months / 12);
    case 'YM':
      return months % 12;
    case 'MD': {
      const anchor = addMonths(a, months);
      return b - anchor;
    }
    case 'YD': {
      let anchor = serialFromParts(pb.year, pa.month, pa.day);
      if (anchor > b) anchor = serialFromParts(pb.year - 1, pa.month, pa.day);
      return b - anchor;
    }
    default:
      throw new XlError(NUM);
  }
});

function holidaySet(c: Call, i: number): Set<number> {
  const set = new Set<number>();
  if (!c.has(i)) return set;
  for (const v of c.flat(i)) if (v !== null && v !== '') set.add(Math.floor(toSerial(v)));
  return set;
}

const isWorkday = (serial: number, holidays: Set<number>): boolean => {
  const wd = partsFromSerial(serial).weekday;
  return wd !== 0 && wd !== 6 && !holidays.has(serial);
};

def(['DIATRABALHO', 'WORKDAY'], (c: Call): Value => {
  c.expect(2, 3);
  let serial = Math.floor(toSerial(c.scalar(0)));
  let days = c.int(1);
  const holidays = holidaySet(c, 2);
  const step = days >= 0 ? 1 : -1;
  while (days !== 0) {
    serial += step;
    if (isWorkday(serial, holidays)) days -= step;
  }
  return dateText(serial);
});

def(['DIATRABALHOTOTAL', 'DIAS.ÚTEIS.TOTAL', 'DIAS.UTEIS.TOTAL', 'NETWORKDAYS'], (c: Call): Value => {
  c.expect(2, 3);
  const a = Math.floor(toSerial(c.scalar(0)));
  const b = Math.floor(toSerial(c.scalar(1)));
  const holidays = holidaySet(c, 2);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  let n = 0;
  for (let s = lo; s <= hi; s++) if (isWorkday(s, holidays)) n++;
  return a <= b ? n : -n;
});

export { isMatrix };
