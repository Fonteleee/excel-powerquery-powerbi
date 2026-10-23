// src/engine/__bench__/bench.ts
// Harness de desempenho do motor de fórmulas. Execute com `npm run bench` (loader SSR do Vite).
// Uso: npm run bench -- [--profile=quick|full] [--only=trecho-do-nome] [--runs=3] [--engines=legacy,graph]
//
// Medidas por cenário:
//   recálculo completo      recalculateSheet da aba-alvo (sem valores calculados)
//   construção do grafo     (só motor 'graph') custo de montar o grafo uma vez
//   edição pontual          depois de calculado, alterar UMA célula de entrada e recalcular:
//                           legacy = recalculateSheet inteiro; graph = RecalcEngine.apply (só o ramo afetado)

import { recalculateSheet } from '../formulaParser';
import { RecalcEngine } from '../recalc/engine';
import { Sheet } from '../../types/spreadsheet';
import {
  Scenario,
  cloneSheets,
  crossSheetLookups,
  formulaChain,
  independentRows,
  runningTotals,
} from './syntheticSheets';

interface Measurement {
  scenario: string;
  engine: string;
  operation: string;
  ms: number;
  detail: string;
}

type EngineName = 'legacy' | 'graph';

/** Soma estável dos valores numéricos e contagem de erros: serve para comparar motores entre si. */
export function checksum(sheets: Sheet[]): string {
  let sum = 0;
  let errors = 0;
  let cells = 0;
  for (const sheet of sheets) {
    for (const cell of Object.values(sheet.data)) {
      if (!cell.raw.startsWith('=')) continue;
      cells++;
      if (typeof cell.value === 'number') sum += cell.value;
      else if (typeof cell.value === 'string' && cell.value.startsWith('#')) errors++;
    }
  }
  return `formulas=${cells} soma=${Math.round(sum * 100) / 100} erros=${errors}`;
}

function time<T>(fn: () => T): { ms: number; result: T } {
  const start = performance.now();
  const result = fn();
  return { ms: performance.now() - start, result };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function recalcFull(engine: EngineName, scenario: Scenario, sheets: Sheet[]): Sheet[] {
  const target = sheets.find(s => s.id === scenario.targetId)!;
  const result = recalculateSheet(target, sheets, { engine });
  return sheets.map(s => (s.id === target.id ? result : s));
}

/** Aplica a edição do cenário (valor constante) sem recalcular. */
function applyEdit(sheets: Sheet[], edit: NonNullable<Scenario['edit']>): Sheet[] {
  return sheets.map(sheet => {
    if (sheet.id !== edit.sheetId) return sheet;
    const numeric = Number(edit.raw);
    const value = Number.isFinite(numeric) ? numeric : edit.raw;
    return { ...sheet, data: { ...sheet.data, [`R${edit.row}C${edit.col}`]: { raw: edit.raw, value } } };
  });
}

function measureFull(scenario: Scenario, engine: EngineName, runs: number): Measurement {
  const times: number[] = [];
  let last = '';
  for (let i = 0; i < runs; i++) {
    const sheets = cloneSheets(scenario.sheets);
    const { ms, result } = time(() => recalcFull(engine, scenario, sheets));
    times.push(ms);
    last = checksum(result);
  }
  return { scenario: scenario.name, engine, operation: 'recálculo completo', ms: median(times), detail: last };
}

function measureEdit(scenario: Scenario, engine: EngineName, runs: number): Measurement[] {
  const edit = scenario.edit;
  if (!edit) return [];
  const out: Measurement[] = [];
  const buildTimes: number[] = [];
  const editTimes: number[] = [];
  const inPlaceTimes: number[] = [];
  let detail = '';

  for (let i = 0; i < runs; i++) {
    // Estado de partida: tudo calculado.
    let sheets = recalcFull('graph', scenario, cloneSheets(scenario.sheets));
    // As demais abas (ex.: Cadastro) também têm de estar calculadas; neste benchmark só têm constantes.
    if (engine === 'legacy') {
      sheets = applyEdit(sheets, edit);
      const { ms, result } = time(() => recalcFull('legacy', scenario, sheets));
      editTimes.push(ms);
      detail = checksum(result);
    } else {
      const built = time(() => new RecalcEngine(sheets));
      buildTimes.push(built.ms);
      sheets = applyEdit(sheets, edit);
      const { ms, result } = time(() =>
        built.result.apply(sheets, [{ sheetId: edit.sheetId, row: edit.row, col: edit.col }])
      );
      editTimes.push(ms);
      detail = `${checksum(result.sheets)} | recalculadas=${result.recalculated} de ${result.stats.formulas}`;

      // Mesma edição, mas o motor é dono do estado (como no worker): sem copiar o mapa de células.
      const owned = recalcFull('graph', scenario, cloneSheets(scenario.sheets));
      const ownedEngine = new RecalcEngine(owned);
      const edited = applyEdit(owned, edit);
      const inPlace = time(() =>
        ownedEngine.apply(edited, [{ sheetId: edit.sheetId, row: edit.row, col: edit.col }], { inPlace: true })
      );
      inPlaceTimes.push(inPlace.ms);
    }
  }
  if (engine === 'graph') {
    out.push({ scenario: scenario.name, engine, operation: 'construção do grafo', ms: median(buildTimes), detail: '' });
  }
  out.push({ scenario: scenario.name, engine, operation: 'edição pontual', ms: median(editTimes), detail });
  if (inPlaceTimes.length > 0) {
    out.push({ scenario: scenario.name, engine, operation: 'edição pontual in-place', ms: median(inPlaceTimes), detail: '' });
  }
  return out;
}

function scenarios(profile: string): Scenario[] {
  if (profile === 'quick') {
    return [independentRows(2000), formulaChain(300), crossSheetLookups(300, 100), runningTotals(500)];
  }
  return [
    independentRows(10_000),
    independentRows(100_000),
    formulaChain(500),
    formulaChain(2000),
    formulaChain(20_000),
    crossSheetLookups(1000, 1000),
    crossSheetLookups(10_000, 1000),
    runningTotals(2000),
    runningTotals(10_000),
  ];
}

/** Cenários grandes demais para o motor antigo (minutos): só o grafo roda. */
const LEGACY_TOO_SLOW = new Set(['cadeia-20000', 'acumulado-10000']);

function flag(args: string[], name: string, fallback: string): string {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

export async function main(args: string[]): Promise<number> {
  const profile = flag(args, 'profile', 'full');
  const only = flag(args, 'only', '');
  const runs = Math.max(1, Number(flag(args, 'runs', '3')) || 3);
  const engines = flag(args, 'engines', 'legacy,graph')
    .split(',')
    .filter((e): e is EngineName => e === 'legacy' || e === 'graph');

  let count = 0;
  for (const scenario of scenarios(profile)) {
    if (only && !scenario.name.includes(only)) continue;
    // Cenários grandes rodam uma vez só: a variância é pequena perto do custo.
    const effectiveRuns = Object.keys(scenario.sheets[0].data).length > 100_000 ? 1 : runs;
    const reference = new Map<string, string>();
    for (const engine of engines) {
      if (engine === 'legacy' && LEGACY_TOO_SLOW.has(scenario.name)) {
        console.log(`${pad(scenario.name, 36)} ${pad(engine, 7)} (não medido: o motor antigo leva muitos minutos neste tamanho)`);
        continue;
      }
      const rows = [measureFull(scenario, engine, effectiveRuns), ...measureEdit(scenario, engine, effectiveRuns)];
      for (const m of rows) {
        count++;
        let verdict = '';
        if (m.operation === 'recálculo completo') {
          const seen = reference.get(m.operation);
          if (seen === undefined) reference.set(m.operation, m.detail);
          else verdict = seen === m.detail ? '  [resultado idêntico ao do outro motor]' : '  [RESULTADO DIFERENTE do outro motor]';
        }
        console.log(
          `${pad(m.scenario, 36)} ${pad(m.engine, 7)} ${pad(m.operation, 20)} ${m.ms.toFixed(1).padStart(11)} ms   ${m.detail}${verdict}`
        );
      }
    }
  }
  console.log(`\nNode ${typeof process === 'undefined' ? '?' : process.version} - mediana de ${runs} execução(ões); cenários grandes rodam 1 vez.`);
  return count > 0 ? 0 : 1;
}
