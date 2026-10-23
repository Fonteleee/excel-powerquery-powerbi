// src/engine/autoFillEngine.ts
// Séries inteligentes do preenchimento (alça de arraste): números, datas, dias da semana e meses em
// pt-BR, códigos "ID-001" e padrões texto+número. Funções puras.

export type AutoFillType = 'series' | 'copy' | 'formatting_only' | 'no_formatting';

type Fill = string | number;

const WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];
const WEEKDAYS_MID = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Rótulos exibidos (com acentos) para cada lista normalizada. */
const DISPLAY: Record<string, string[]> = {
  wl: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
  wm: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
  ws: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  ml: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  ms: MONTHS_SHORT,
};
const LISTS: [string, string[]][] = [
  ['wm', WEEKDAYS_MID],
  ['wl', WEEKDAYS_LONG],
  ['ws', WEEKDAYS_SHORT],
  ['ml', MONTHS_LONG],
  ['ms', MONTHS_SHORT],
];

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.$/, '').trim();

const repeat = (source: readonly Fill[], length: number): Fill[] =>
  Array.from({ length }, (_, i) => source[i % source.length]);

const roundTo = (n: number, decimals: number): number => {
  const f = 10 ** Math.min(10, decimals);
  return Math.round(n * f) / f;
};

const decimalsOf = (n: number): number => {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

/** Passo constante entre valores consecutivos; se não for constante, a média (como a tendência linear). */
function stepOf(values: number[]): number {
  if (values.length < 2) return 1;
  const diffs = values.slice(1).map((v, i) => v - values[i]);
  const first = diffs[0];
  if (diffs.every(d => Math.abs(d - first) < 1e-9)) return first;
  return (values[values.length - 1] - values[0]) / (values.length - 1);
}

// ---------- números ----------

const NUMBER = /^[-+]?\d+(?:[.,]\d+)?$/;

function numberSeries(strs: string[], length: number): Fill[] | null {
  if (!strs.every(s => NUMBER.test(s))) return null;
  const nums = strs.map(s => parseFloat(s.replace(',', '.')));
  const step = stepOf(nums);
  const last = nums[nums.length - 1];
  const decimals = Math.max(decimalsOf(step), ...nums.map(decimalsOf));
  return Array.from({ length }, (_, i) => roundTo(last + step * (i + 1), decimals));
}

// ---------- datas ----------

interface ParsedDate {
  utcDay: number; // dias desde 1970-01-01 (UTC)
  y: number;
  m: number; // 1-12
  d: number;
  iso: boolean;
  sep: string;
  pad: boolean;
  shortYear: boolean;
}

const DAY_MS = 86_400_000;

function parseDate(s: string): ParsedDate | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const br = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})$/.exec(s);
  let y: number, m: number, d: number;
  let sep = '/';
  let pad = true;
  let shortYear = false;
  if (iso) {
    y = +iso[1]; m = +iso[2]; d = +iso[3];
  } else if (br) {
    d = +br[1]; m = +br[3]; y = +br[4]; sep = br[2];
    pad = br[1].length === 2 || br[3].length === 2;
    shortYear = br[4].length === 2;
    if (shortYear) y += 2000;
  } else return null;
  const t = Date.UTC(y, m - 1, d);
  const check = new Date(t);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { utcDay: Math.round(t / DAY_MS), y, m, d, iso: !!iso, sep, pad, shortYear };
}

function formatDate(day: number, style: ParsedDate): string {
  const dt = new Date(day * DAY_MS);
  const two = (n: number) => String(n).padStart(2, '0');
  const dd = style.pad || style.iso ? two(dt.getUTCDate()) : String(dt.getUTCDate());
  const mm = style.pad || style.iso ? two(dt.getUTCMonth() + 1) : String(dt.getUTCMonth() + 1);
  const yy = dt.getUTCFullYear();
  if (style.iso) return `${yy}-${mm}-${dd}`;
  return `${dd}${style.sep}${mm}${style.sep}${style.shortYear ? two(yy % 100) : yy}`;
}

function addMonths(p: ParsedDate, months: number): number {
  const total = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = total % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.round(Date.UTC(y, m, Math.min(p.d, lastDay)) / DAY_MS);
}

function dateSeries(strs: string[], length: number): Fill[] | null {
  const dates = strs.map(parseDate);
  if (!dates.every((d): d is ParsedDate => d !== null)) return null;
  const last = dates[dates.length - 1];
  const days = dates.map(d => d.utcDay);
  const monthIndex = dates.map(d => d.y * 12 + d.m - 1);

  const sameDom = dates.length > 1 && dates.every(d => d.d === dates[0].d);
  const monthStep = stepOf(monthIndex);
  const dayStep = stepOf(days);
  if (sameDom && Number.isInteger(monthStep) && monthStep !== 0 && Math.abs(dayStep) >= 28) {
    return Array.from({ length }, (_, i) => formatDate(addMonths(last, monthStep * (i + 1)), last));
  }
  const step = dates.length > 1 && Math.round(dayStep) !== 0 ? Math.round(dayStep) : 1;
  return Array.from({ length }, (_, i) => formatDate(last.utcDay + step * (i + 1), last));
}

// ---------- dias da semana e meses ----------

function applyCase(sample: string, text: string): string {
  if (sample.length > 1 && sample === sample.toUpperCase() && sample !== sample.toLowerCase()) return text.toUpperCase();
  if (sample[0] !== sample[0].toLowerCase()) return text[0].toUpperCase() + text.slice(1);
  return text;
}

function nameSeries(strs: string[], length: number): Fill[] | null {
  for (const [id, list] of LISTS) {
    const idx = strs.map(s => list.indexOf(normalize(s)));
    if (idx.some(i => i < 0)) continue;
    const size = list.length;
    let step = 1;
    if (idx.length > 1) {
      const diffs = idx.slice(1).map((v, i) => (((v - idx[i]) % size) + size) % size);
      if (diffs.every(d => d === diffs[0]) && diffs[0] !== 0) step = diffs[0];
    }
    const last = idx[idx.length - 1];
    const sample = strs[strs.length - 1];
    return Array.from({ length }, (_, i) => applyCase(sample, DISPLAY[id][(last + step * (i + 1)) % size]));
  }
  return null;
}

// ---------- texto + número ----------

const CODE = /^(.*?)(\d+)(\D*)$/;

function codeSeries(strs: string[], length: number): Fill[] | null {
  const parts = strs.map(s => CODE.exec(s));
  if (!parts.every((p): p is RegExpExecArray => p !== null)) return null;
  const { 1: prefix, 3: suffix } = parts[0];
  if (!parts.every(p => p[1] === prefix && p[3] === suffix)) return null;
  const nums = parts.map(p => parseInt(p[2], 10));
  const step = Math.round(stepOf(nums)) || 1;
  const lastDigits = parts[parts.length - 1][2];
  const width = lastDigits.length > 1 && lastDigits.startsWith('0') ? lastDigits.length : 0;
  const last = nums[nums.length - 1];
  return Array.from({ length }, (_, i) => {
    const n = last + step * (i + 1);
    const digits = n < 0 ? String(n) : String(n).padStart(width, '0');
    return `${prefix}${digits}${suffix}`;
  });
}

/** Série para arrastar vertical ou horizontalmente a partir dos valores de origem. */
export function computeSmartSeries(
  sourceValues: (string | number)[],
  targetLength: number,
  mode: AutoFillType = 'series'
): (string | number)[] {
  if (sourceValues.length === 0 || targetLength <= 0) return [];
  if (mode === 'copy') return repeat(sourceValues, targetLength);

  const strs = sourceValues.map(v => String(v).trim());
  if (strs.some(s => s === '')) return repeat(sourceValues, targetLength);

  return (
    numberSeries(strs, targetLength) ??
    dateSeries(strs, targetLength) ??
    nameSeries(strs, targetLength) ??
    codeSeries(strs, targetLength) ??
    repeat(sourceValues, targetLength)
  );
}
