// src/engine/recalc/engine.test.ts
// Testes do motor por grafo: equivalência com o motor antigo, recálculo incremental, ciclos e matrizes dinâmicas.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Sheet } from '../../types/spreadsheet';
import { createRng } from '../__bench__/syntheticSheets';
import { cellPosToKey, parseCellAddress } from '../formulaParser';
import { buildSheet, cellAt, valueAt, withCell } from '../testing/sheets';
import { RecalcEngine } from './engine';
import { recalculateFrom, recalculateSheet } from './recalculate';

const at = (address: string) => {
  const pos = parseCellAddress(address)!;
  return { row: pos.row, col: pos.col };
};
const change = (sheetId: string, address: string) => ({ sheetId, ...at(address) });

/** Valores de todas as células, para comparar duas execuções. */
function snapshot(sheet: Sheet): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, cell] of Object.entries(sheet.data)) out[k] = cell.value;
  return out;
}

describe('equivalência entre o motor por grafo e o motor antigo', () => {
  /** Planilha aleatória, sem ciclos: cada fórmula só lê células "anteriores" numa ordem embaralhada. */
  function randomWorkbook(seed: number): Sheet[] {
    const rng = createRng(seed);
    const pick = <T,>(items: T[]) => items[Math.floor(rng() * items.length)];
    const cadastro = buildSheet('cad', 'Cadastro', [
      ['CAT-1', 'Alimentos', 0.1],
      ['CAT-2', 'Bebidas', 0.2],
      ['CAT-3', 'Limpeza', 0.3],
      ['CAT-4', 'Higiene', 0.4],
    ]);
    const grid: (string | number | null)[][] = [];
    const rows = 40;
    for (let r = 0; r < rows; r++) {
      const line: (string | number | null)[] = [];
      line[0] = pick(['CAT-1', 'CAT-2', 'CAT-3', 'CAT-4', 'CAT-9']);
      line[1] = Math.floor(rng() * 100);
      const choices = [
        `=B${r + 1}*2`,
        r > 0 ? `=B${r + 1}+C${r}` : `=B${r + 1}+1`,
        `=SE(B${r + 1}>50; "alto"; "baixo")`,
        `=PROCX(A${r + 1}; Cadastro!A:A; Cadastro!B:B; "?")`,
        `=PROCV(A${r + 1}; Cadastro!A1:C4; 3; FALSO)`,
        `=SOMASE(A$1:A$${rows}; A${r + 1}; B$1:B$${rows})`,
        `=CONT.SE(A$1:A$${rows}; A${r + 1})`,
        `=SOMA(B1:B${r + 1})`,
        `=MÉDIA(B${Math.max(1, r)}:B${r + 1})`,
        `=SEERRO(PROCV(A${r + 1}; Cadastro!A1:C4; 2; FALSO); "sem cadastro")`,
        `=B${r + 1}&"-"&A${r + 1}`,
      ];
      line[2] = pick(choices);
      line[3] = r > 3 ? `=C${r}` : null;
      grid.push(line);
    }
    return [buildSheet('main', 'Principal', grid, rows + 5), cadastro];
  }

  for (let seed = 1; seed <= 12; seed++) {
    it(`planilha aleatória #${seed}: mesmos valores nos dois motores`, () => {
      const [main, cad] = randomWorkbook(seed);
      const legacy = recalculateSheet(main, [main, cad], { engine: 'legacy' });
      const graph = recalculateSheet(main, [main, cad], { engine: 'graph' });
      assert.deepEqual(snapshot(graph), snapshot(legacy));
    });
  }

  it('planilha de vendas de exemplo coincide nos dois motores', async () => {
    const { createSalesSampleSheet } = await import('../../data/sampleDatasets');
    const sheet = createSalesSampleSheet();
    const legacy = recalculateSheet(sheet, [sheet], { engine: 'legacy' });
    const graph = recalculateSheet(sheet, [sheet], { engine: 'graph' });
    assert.deepEqual(snapshot(graph), snapshot(legacy));
  });
});

describe('recalculateFrom / RecalcEngine.apply (incremental)', () => {
  const base = () =>
    buildSheet('s', 'S', [
      [1, '=A1+1', '=B1*2'],
      [10, '=A2+B1', '=SOMA(A1:B2)'],
      ['x', 'y', '=A1+A2'],
    ]);

  it('recalcula só o ramo afetado e coincide com o recálculo completo', () => {
    const calculated = recalculateSheet(base());
    const edited = withCell(calculated, 'A1', '5');
    const result = recalculateFrom([edited], [change('s', 'A1')]);
    const full = recalculateSheet(edited);
    assert.deepEqual(snapshot(result.sheets[0]), snapshot(full));
    assert.equal(valueAt(result.sheets[0], 'C1'), 12);
    // B1, C1, B2, C2, C3 dependem de A1; A2/A3/B3 não são fórmulas
    assert.equal(result.recalculated, 5);
    assert.equal(result.stats.formulas, 5);
  });

  it('uma edição em célula sem dependentes não recalcula nada', () => {
    const calculated = recalculateSheet(base());
    const edited = withCell(calculated, 'B3', 'z');
    const result = recalculateFrom([edited], [change('s', 'B3')]);
    assert.equal(result.recalculated, 0);
  });

  it('não muta a entrada e reaproveita as abas não afetadas (copy-on-write)', () => {
    const s = recalculateSheet(base());
    const other = buildSheet('o', 'Outra', [[1, 2, 3]]);
    const edited = withCell(s, 'A1', '7');
    const before = JSON.stringify(edited.data);
    const result = recalculateFrom([edited, other], [change('s', 'A1')]);
    assert.equal(JSON.stringify(edited.data), before);
    assert.notEqual(result.sheets[0], edited);
    assert.equal(result.sheets[1], other);
  });

  it('propaga entre abas (célula e intervalo) e respeita a edição da fórmula', () => {
    const cad = buildSheet('cad', 'Cadastro', [['A', 'um'], ['B', 'dois']]);
    const dados = buildSheet('dados', 'Dados', [['B', '=PROCX(A1; Cadastro!A:A; Cadastro!B:B)', '=Cadastro!B1']]);
    const start = [recalculateSheet(dados, [dados, cad]), cad];
    assert.equal(valueAt(start[0], 'B1'), 'dois');

    const cadEdited = withCell(cad, 'B2', 'DOIS');
    let r = recalculateFrom([start[0], cadEdited], [change('cad', 'B2')]);
    assert.equal(valueAt(r.sheets[0], 'B1'), 'DOIS');
    assert.equal(valueAt(r.sheets[0], 'C1'), 'um');

    const formulaEdited = withCell(r.sheets[0], 'C1', '=Cadastro!B2&"!"');
    r = recalculateFrom([formulaEdited, cadEdited], [change('dados', 'C1')]);
    assert.equal(valueAt(r.sheets[0], 'C1'), 'DOIS!');
  });

  it('remover uma fórmula tira suas dependências do grafo', () => {
    const engine = new RecalcEngine([recalculateSheet(base())]);
    const sheet = withCell(recalculateSheet(base()), 'B1', '');
    const r = engine.apply([sheet], [change('s', 'B1')]);
    assert.equal(cellAt(r.sheets[0], 'B1'), undefined);
    assert.equal(valueAt(r.sheets[0], 'C1'), 0);
  });

  it('o mesmo RecalcEngine atende várias edições seguidas', () => {
    let sheets = [recalculateSheet(base())];
    const engine = new RecalcEngine(sheets);
    for (const raw of ['2', '3', '4']) {
      sheets = [withCell(sheets[0], 'A1', raw)];
      sheets = engine.apply(sheets, [change('s', 'A1')]).sheets;
      assert.equal(valueAt(sheets[0], 'B1'), Number(raw) + 1);
    }
    sheets = [withCell(sheets[0], 'D1', '=C1+1')];
    sheets = engine.apply(sheets, [change('s', 'D1')]).sheets;
    assert.equal(valueAt(sheets[0], 'D1'), 11);
  });

  it('fórmulas voláteis (HOJE) são recalculadas a cada rodada', () => {
    const calculated = recalculateSheet(buildSheet('s', 'S', [['=HOJE()', 1]]));
    const stale = { ...calculated, data: { ...calculated.data, R0C0: { ...calculated.data.R0C0, value: 'ontem' } } };
    const r = recalculateFrom([withCell(stale, 'B1', '2')], [change('s', 'B1')]);
    assert.match(String(valueAt(r.sheets[0], 'A1')), /^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('incremental aleatório coincide com o recálculo completo', () => {
    const rng = createRng(99);
    const grid: (string | number)[][] = [];
    for (let r = 0; r < 30; r++) {
      grid.push([Math.floor(rng() * 10), r === 0 ? '=A1' : `=A${r + 1}+B${r}`, `=SOMA(B1:B${r + 1})`]);
    }
    let sheets = [recalculateSheet(buildSheet('s', 'S', grid, 40))];
    const engine = new RecalcEngine(sheets);
    for (let i = 0; i < 25; i++) {
      const row = Math.floor(rng() * 30);
      sheets = [withCell(sheets[0], `A${row + 1}`, String(Math.floor(rng() * 100)))];
      sheets = engine.apply(sheets, [change('s', `A${row + 1}`)]).sheets;
      assert.deepEqual(snapshot(sheets[0]), snapshot(recalculateSheet(sheets[0])), `após edição ${i} (linha ${row + 1})`);
    }
  });
});

describe('referência circular', () => {
  it('marca #CIRCULAR! com mensagem clara e não derruba o resto', () => {
    const sheet = buildSheet('s', 'Plan1', [['=B1', '=A1', '=A1+5', 7, '=D1*2']]);
    const engine = new RecalcEngine([sheet], 's');
    const r = engine.recalculateAll([sheet], 's');
    const out = r.sheets[0];
    assert.equal(valueAt(out, 'A1'), '#CIRCULAR!');
    assert.equal(valueAt(out, 'B1'), '#CIRCULAR!');
    assert.equal(cellAt(out, 'A1')?.error, '#CIRCULAR!');
    assert.match(cellAt(out, 'A1')?.errorDetail ?? '', /Referência circular: Plan1!A1 → B1 → A1|Referência circular: Plan1!B1 → A1 → B1/);
    assert.equal(valueAt(out, 'E1'), 14);
    assert.equal(r.cycles.length, 1);
    assert.deepEqual([...r.cycles[0].cells].sort(), ['Plan1!A1', 'Plan1!B1']);
    // C1 depende do ciclo: recebe erro de valor (texto em aritmética), nunca trava
    assert.equal(typeof valueAt(out, 'C1'), 'string');
  });

  it('auto-referência e SOMA da própria coluna', () => {
    const sheet = buildSheet('s', 'S', [[1, '=A1+1'], [2, '=SOMA(B1:B3)'], [3, 5]]);
    const out = recalculateSheet({ ...sheet, data: { ...sheet.data, R0C1: { raw: '=B1+1', value: null } } });
    assert.equal(valueAt(out, 'B1'), '#CIRCULAR!');
    assert.equal(valueAt(out, 'B2'), '#CIRCULAR!');
  });

  it('corrigir a fórmula elimina o erro na rodada seguinte', () => {
    const sheet = buildSheet('s', 'S', [['=B1', '=A1']]);
    const engine = new RecalcEngine([sheet], 's');
    const first = engine.recalculateAll([sheet], 's');
    assert.equal(valueAt(first.sheets[0], 'A1'), '#CIRCULAR!');
    const fixed = withCell(first.sheets[0], 'B1', '3');
    const r = engine.apply([fixed], [change('s', 'B1')]);
    assert.equal(valueAt(r.sheets[0], 'A1'), 3);
    assert.equal(r.cycles.length, 0);
  });
});

describe('desempenho estrutural', () => {
  it('cadeia de 20 mil fórmulas calcula sem estourar a pilha', () => {
    const grid: (string | number)[][] = [[1]];
    for (let r = 1; r < 20_000; r++) grid.push([`=A${r}+1`]);
    const out = recalculateSheet(buildSheet('s', 'S', grid, 20_010));
    assert.equal(valueAt(out, 'A20000'), 20_000);
  });

  it('o motor antigo e o grafo concordam em cadeias curtas', () => {
    const grid: (string | number)[][] = [[1]];
    for (let r = 1; r < 50; r++) grid.push([`=A${r}*1.01`]);
    const sheet = buildSheet('s', 'S', grid);
    assert.deepEqual(
      snapshot(recalculateSheet(sheet, [sheet], { engine: 'graph' })),
      snapshot(recalculateSheet(sheet, [sheet], { engine: 'legacy' }))
    );
  });
});

describe('matrizes dinâmicas no motor por grafo', () => {
  const key = (a: string) => {
    const p = at(a);
    return cellPosToKey(p.row, p.col);
  };

  it('FILTRO acompanha mudanças na origem (cresce e encolhe, limpando o resíduo)', () => {
    const sheet = buildSheet('s', 'S', [
      ['a', 1, null, '=FILTRO(A1:A4; B1:B4>1; "nada")'],
      ['b', 2],
      ['c', 3],
      ['d', 0],
    ]);
    const engine = new RecalcEngine([sheet]);
    let sheets = engine.apply([sheet], [change('s', 'D1')]).sheets;
    assert.equal(valueAt(sheets[0], 'D1'), 'b');
    assert.equal(valueAt(sheets[0], 'D2'), 'c');
    assert.equal(cellAt(sheets[0], 'D3'), undefined);

    sheets = [withCell(sheets[0], 'B4', '9')];
    sheets = engine.apply(sheets, [change('s', 'B4')]).sheets;
    assert.equal(valueAt(sheets[0], 'D3'), 'd');

    sheets = [withCell(withCell(sheets[0], 'B2', '0'), 'B3', '0')];
    sheets = engine.apply(sheets, [change('s', 'B2'), change('s', 'B3')]).sheets;
    assert.equal(valueAt(sheets[0], 'D1'), 'd');
    assert.equal(cellAt(sheets[0], 'D2'), undefined);
    assert.equal(cellAt(sheets[0], 'D3'), undefined);
  });

  it('trocar a fórmula-mãe por um valor limpa as células derramadas', () => {
    const sheet = buildSheet('s', 'S', [['=SEQUÊNCIA(4)']]);
    const engine = new RecalcEngine([sheet]);
    let sheets = engine.apply([sheet], [change('s', 'A1')]).sheets;
    assert.equal(valueAt(sheets[0], 'A4'), 4);

    sheets = [withCell(sheets[0], 'A1', 'texto')];
    sheets = engine.apply(sheets, [change('s', 'A1')]).sheets;
    assert.equal(valueAt(sheets[0], 'A1'), 'texto');
    for (const a of ['A2', 'A3', 'A4']) assert.equal(cellAt(sheets[0], a), undefined, a);
  });

  it('digitar numa célula derramada bloqueia (#DESPEJAR!) e apagar libera de novo', () => {
    const sheet = buildSheet('s', 'S', [['=SEQUÊNCIA(3)']]);
    const engine = new RecalcEngine([sheet]);
    let sheets = engine.apply([sheet], [change('s', 'A1')]).sheets;
    assert.equal(cellAt(sheets[0], 'A3')?.isSpill, true);

    sheets = [withCell(sheets[0], 'A3', 'intruso')];
    sheets = engine.apply(sheets, [change('s', 'A3')]).sheets;
    assert.equal(valueAt(sheets[0], 'A1'), '#DESPEJAR!');
    assert.equal(cellAt(sheets[0], 'A2'), undefined);
    assert.equal(valueAt(sheets[0], 'A3'), 'intruso');

    sheets = [withCell(sheets[0], 'A3', '')];
    sheets = engine.apply(sheets, [change('s', 'A3')]).sheets;
    assert.equal(valueAt(sheets[0], 'A1'), 1);
    assert.equal(valueAt(sheets[0], 'A3'), 3);
  });

  it('quem lê a área derramada é recalculado quando a matriz muda de tamanho', () => {
    const sheet = buildSheet('s', 'S', [['=SEQUÊNCIA(B1)', 3, '=SOMA(A1:A10)']]);
    const engine = new RecalcEngine([sheet]);
    let sheets = engine.apply([sheet], [change('s', 'A1'), change('s', 'C1')]).sheets;
    assert.equal(valueAt(sheets[0], 'C1'), 6);

    sheets = [withCell(sheets[0], 'B1', '5')];
    sheets = engine.apply(sheets, [change('s', 'B1')]).sheets;
    assert.equal(valueAt(sheets[0], 'C1'), 15);

    sheets = [withCell(sheets[0], 'B1', '2')];
    sheets = engine.apply(sheets, [change('s', 'B1')]).sheets;
    assert.equal(valueAt(sheets[0], 'C1'), 3);
    assert.equal(cellAt(sheets[0], 'A4'), undefined);
  });

  it('recálculo completo equivale ao motor antigo para ÚNICO, CLASSIFICAR e SEQUÊNCIA', () => {
    const grid = [['b', 3], ['a', 1], ['b', 2], ['c', 5], ['=ÚNICO(A1:A4)', null, '=CLASSIFICAR(A1:B4; 2; -1)', null, '=SEQUÊNCIA(2;2)']];
    const sheet = buildSheet('s', 'S', grid, 20);
    const legacy = recalculateSheet(sheet, [sheet], { engine: 'legacy' });
    const graph = recalculateSheet(sheet, [sheet], { engine: 'graph' });
    assert.deepEqual(snapshot(graph), snapshot(legacy));
    assert.equal(graph.data[key('A6')]?.isSpill, true);
  });

  it('uma matriz não sobrescreve a derramada por outra (conflito entre duas fórmulas)', () => {
    const sheet = buildSheet('s', 'S', [['=SEQUÊNCIA(3)', '=SEQUÊNCIA(3)'], [null, null]]);
    const out = recalculateSheet({
      ...sheet,
      data: { ...sheet.data, R1C0: { raw: '', value: null } },
    });
    assert.equal(valueAt(out, 'A1'), 1);
    assert.equal(valueAt(out, 'B1'), 1);
  });
});
