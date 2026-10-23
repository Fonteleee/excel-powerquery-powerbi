// src/engine/__bench__/bench.ts
// Harness de desempenho do motor de fórmulas. Execute com `npm run bench` (loader SSR do Vite).
// Uso: npm run bench -- [--profile=quick|full] [--only=trecho-do-nome] [--runs=3]

import { recalculateSheet } from '../formulaParser';
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
  checksum: string;
}

type Engine = {
  name: string;
  /** Recalcula a planilha-alvo por inteiro. */
  full: (sheet: Sheet, all: Sheet[]) => Sheet;
};

const ENGINES: Engine[] = [{ name: 'varredura (atual)', full: (sheet, all) => recalculateSheet(sheet, all) }];

/** Soma estável dos valores numéricos e contagem de erros: serve para comparar motores entre si. */
export function checksum(sheet: Sheet): string {
  let sum = 0;
  let errors = 0;
  let cells = 0;
  for (const cell of Object.values(sheet.data)) {
    if (!cell.raw.startsWith('=')) continue;
    cells++;
    if (typeof cell.value === 'number') sum += cell.value;
    else if (typeof cell.value === 'string' && cell.value.startsWith('#')) errors++;
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

function targetOf(scenario: Scenario, sheets: Sheet[]): Sheet {
  return sheets.find(s => s.id === scenario.targetId)!;
}

function measureFull(scenario: Scenario, engine: Engine, runs: number): Measurement {
  const times: number[] = [];
  let last = '';
  for (let i = 0; i < runs; i++) {
    const sheets = cloneSheets(scenario.sheets);
    const target = targetOf(scenario, sheets);
    const { ms, result } = time(() => engine.full(target, sheets));
    times.push(ms);
    last = checksum(result);
  }
  return { scenario: scenario.name, engine: engine.name, operation: 'recálculo completo', ms: median(times), checksum: last };
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
    crossSheetLookups(1000, 1000),
    crossSheetLookups(10_000, 1000),
    runningTotals(2000),
  ];
}

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

  const rows: Measurement[] = [];
  for (const scenario of scenarios(profile)) {
    if (only && !scenario.name.includes(only)) continue;
    // Cenários grandes rodam uma vez só: a variância é pequena perto do custo.
    const effectiveRuns = Object.keys(scenario.sheets[0].data).length > 100_000 ? 1 : runs;
    for (const engine of ENGINES) {
      const m = measureFull(scenario, engine, effectiveRuns);
      rows.push(m);
      console.log(`${pad(m.scenario, 38)} ${pad(m.engine, 20)} ${pad(m.operation, 20)} ${m.ms.toFixed(1).padStart(10)} ms   ${m.checksum}`);
    }
  }
  console.log(`\nNode ${typeof process === 'undefined' ? '?' : process.version} — mediana de ${runs} execução(ões); cenários grandes rodam 1 vez.`);
  return rows.length > 0 ? 0 : 1;
}
