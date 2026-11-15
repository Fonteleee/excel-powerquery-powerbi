// src/components/Modals/FormulaWizardModal.tsx
// Assistente de fórmulas guiado: 1) o usuário escolhe O QUE quer fazer, em português; 2) responde perguntas
// simples (escolhendo colunas pelo nome) e confere a prévia com os próprios dados antes de inserir.
// A lógica (receitas, montagem da fórmula, explicação) fica em features/formulaWizard/recipes.ts.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown, Calculator, CaseSensitive, Check, ChevronLeft, CircleAlert, Columns3, Filter, FunctionSquare, GitBranch,
  Hash, Link2, ListChecks, Percent, Search, Sigma, Sparkles, SquareDivide, Table2, Wand2, X,
} from 'lucide-react';
import { FORMULA_CATALOG, cellPosToKey, colIndexToLabel, evaluateFormula } from '../../engine/formulaParser';
import { formatCellValue } from '../../engine/formulas/formatting';
import { dataColumns } from '../../engine/sheetColumns';
import { CellFormat, CellPosition, CellRange, FormulaParamGuide, Sheet } from '../../types/spreadsheet';
import {
  ArgValues, buildFormula, ColumnOption, columnRange, explain, friendlyError, initialValues, lastDataRow, listColumnOptions,
  Recipe, RecipeArg, rowCell, searchRecipes,
} from '../../features/formulaWizard/recipes';

export interface FormulaInsertOptions {
  formula: string;
  targetMode: 'active_cell' | 'first_empty_col' | 'below_selection' | 'fill_column' | 'custom' | 'cells';
  customCell?: string;
  fillRange?: CellRange;
  /** Modo 'cells': cada célula a escrever (o assistente já resolveu onde e o quê). */
  cells?: { row: number; col: number; raw: string; format?: CellFormat }[];
}

interface FormulaWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  allSheets: Sheet[];
  activeCell: CellPosition;
  selectedRange: CellRange;
  onInsertFormula: (options: FormulaInsertOptions) => void;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  somar: Sigma, media: Calculator, contar: Hash, maior_menor: ArrowUpDown, conta_colunas: SquareDivide, percentual: Percent,
  arredondar: Wand2, somar_se: Filter, contar_se: ListChecks, se: GitBranch, buscar: Search, juntar: Link2, texto: CaseSensitive,
};

const GROUP_ORDER: Recipe['group'][] = ['Contas', 'Condições', 'Buscar', 'Textos'];
const GROUP_HINT: Record<Recipe['group'], string> = {
  Contas: 'Somar, médias e contas entre colunas',
  Condições: 'Só o que atende a uma regra',
  Buscar: 'Cruzar com outra tabela',
  Textos: 'Juntar e arrumar textos',
};

type Destination = 'coluna_nova' | 'celula' | 'abaixo';

// Botões com "degrau": a sombra sólida embaixo some ao pressionar.
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_#065f46] transition-all hover:bg-emerald-500 active:translate-y-[4px] active:shadow-none disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-[0_4px_0_#94a3b8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 cursor-pointer';
const BTN_GHOST =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_3px_0_#cbd5e1] transition-all hover:bg-slate-50 active:translate-y-[3px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 cursor-pointer';
const FIELD =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-inner transition-colors hover:border-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/25';
const KICKER = 'font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500';

export const FormulaWizardModal: React.FC<FormulaWizardModalProps> = ({ isOpen, onClose, sheet, allSheets, activeCell, selectedRange, onInsertFormula }) => {
  const [search, setSearch] = useState('');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [advanced, setAdvanced] = useState<FormulaParamGuide | null>(null);
  const [showAdvancedList, setShowAdvancedList] = useState(false);
  const [values, setValues] = useState<ArgValues>({});
  const [destination, setDestination] = useState<Destination>('celula');
  const [header, setHeader] = useState('');

  const columns = useMemo(() => (isOpen ? listColumnOptions(allSheets, sheet.id) : []), [isOpen, allSheets, sheet.id]);
  const byId = useMemo(() => new Map(columns.map(c => [c.id, c])), [columns]);
  const activeColumns = useMemo(() => columns.filter(c => c.isActiveSheet), [columns]);
  const lastRow = useMemo(() => (isOpen ? lastDataRow(sheet) : 1), [isOpen, sheet]);
  const dataRowCount = lastRow; // linhas 2..última (a linha 1 é o cabeçalho)
  const newColIndex = useMemo(() => {
    if (!isOpen) return 0;
    const cols = dataColumns(sheet);
    return cols.length > 0 ? cols[cols.length - 1] + 1 : 0;
  }, [isOpen, sheet]);

  // Ao abrir, começa sempre da escolha do objetivo.
  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setRecipe(null);
    setAdvanced(null);
    setShowAdvancedList(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeAddress = `${colIndexToLabel(activeCell.col)}${activeCell.row + 1}`;
  const singleRow = Math.max(1, activeCell.row);
  const ctxFor = (row: number) => ({ column: (id: string | undefined) => (id ? byId.get(id) : undefined), row });

  const chooseRecipe = (r: Recipe) => {
    const selectedCols: number[] = [];
    // Uma seleção de várias colunas (ou de uma coluna inteira) indica o que o usuário quer usar.
    if (selectedRange.endCol > selectedRange.startCol || selectedRange.endRow > selectedRange.startRow) {
      for (let c = selectedRange.startCol; c <= selectedRange.endCol && selectedCols.length < 6; c++) selectedCols.push(c);
    }
    setRecipe(r);
    setAdvanced(null);
    setValues(initialValues(r, columns, selectedCols));
    setDestination(r.shape === 'por_linha' ? 'coluna_nova' : 'celula');
    setHeader(r.resultHeader ?? '');
  };

  const chooseAdvanced = (f: FormulaParamGuide) => {
    setAdvanced(f);
    setRecipe(null);
    setValues(Object.fromEntries(f.params.map(p => [p.name, p.defaultValue ?? ''])));
    setDestination('celula');
  };

  // ---------- fórmula, explicação e prévia ----------
  const firstRow = recipe?.shape === 'por_linha' && destination === 'celula' ? singleRow : 1;
  let formula = '';
  let sentence = '';
  if (recipe) {
    formula = buildFormula(recipe, values, ctxFor(firstRow));
    sentence = explain(recipe, values, ctxFor(firstRow));
  } else if (advanced) {
    const args = advanced.params.map(p => (values[p.name] ?? '').trim());
    while (args.length > 0 && args[args.length - 1] === '' && advanced.params[args.length - 1].optional) args.pop();
    const required = advanced.params.every((p, i) => p.optional || (args[i] ?? '') !== '');
    formula = required ? `=${advanced.name}(${args.join(';')})` : '';
    sentence = advanced.description;
  }

  const evaluate = (text: string): { shown: string; error: string | null } => {
    try {
      const value = evaluateFormula(text, sheet, allSheets);
      const flat = Array.isArray(value) ? (Array.isArray(value[0]) ? value[0][0] : value[0]) : value;
      const error = friendlyError(flat);
      const format: CellFormat | undefined = recipe?.id === 'percentual' ? { type: 'percentage', decimals: 1 } : undefined;
      return { shown: error ? String(flat) : formatCellValue(flat, format) || '(vazio)', error };
    } catch {
      return { shown: '#ERRO!', error: 'Não foi possível calcular com essas escolhas.' };
    }
  };

  const previewColumns: ColumnOption[] = recipe
    ? recipe.args.filter(a => a.kind === 'celula').map(a => byId.get(values[a.key])).filter((c): c is ColumnOption => Boolean(c))
    : [];
  const perRow = Boolean(recipe && recipe.shape === 'por_linha' && destination === 'coluna_nova');
  const previewRows = formula && recipe && perRow
    ? Array.from({ length: Math.min(5, dataRowCount) }, (_, i) => {
        const row = i + 1;
        return { row, result: evaluate(buildFormula(recipe, values, ctxFor(row))) };
      })
    : [];
  const single = formula && !perRow ? evaluate(formula) : null;

  // ---------- destino ----------
  // "Abaixo da coluna": a coluna dos valores (a somada), não a do filtro.
  const columnArgs = recipe?.args.filter(a => a.kind === 'coluna') ?? [];
  const firstColumnArg = columnArgs.find(a => a.preferNumeric) ?? columnArgs[0];
  const belowColumn = firstColumnArg ? byId.get(values[firstColumnArg.key]) : undefined;
  const canPlaceBelow = recipe?.shape === 'total' && belowColumn?.isActiveSheet;
  const belowAddress = belowColumn ? `${belowColumn.letter}${lastRow + 3}` : '';
  const activeHasContent = Boolean(sheet.data[cellPosToKey(activeCell.row, activeCell.col)]?.raw);

  const handleInsert = () => {
    if (!formula) return;
    const format: CellFormat | undefined = recipe?.id === 'percentual' ? { type: 'percentage', decimals: 1 } : undefined;
    let cells: NonNullable<FormulaInsertOptions['cells']> = [];
    if (recipe && perRow) {
      cells = [{ row: 0, col: newColIndex, raw: header.trim() || recipe.resultHeader || 'Resultado', format: { bold: true } }];
      for (let row = 1; row <= lastRow; row++) cells.push({ row, col: newColIndex, raw: buildFormula(recipe, values, ctxFor(row)), format });
    } else if (destination === 'abaixo' && belowColumn) {
      cells = [{ row: lastRow + 2, col: belowColumn.col, raw: formula, format: { bold: true } }];
    } else {
      cells = [{ row: activeCell.row, col: activeCell.col, raw: formula, format }];
    }
    onInsertFormula({ formula, targetMode: 'cells', cells });
    onClose();
  };

  const missing = recipe ? recipe.args.filter(a => !a.optional && !(values[a.key] ?? '').trim()).length : 0;
  const results = searchRecipes(search);
  const advancedResults = FORMULA_CATALOG.filter(f => {
    const t = search.trim().toLowerCase();
    return t === '' || f.name.toLowerCase().includes(t) || f.description.toLowerCase().includes(t);
  });
  const inStepTwo = Boolean(recipe || advanced);

  // ---------- controles de cada pergunta ----------
  const set = (key: string, value: string) => setValues(prev => ({ ...prev, [key]: value }));

  const columnSelect = (arg: RecipeArg) => {
    const options = arg.kind === 'celula' || !arg.anySheet ? activeColumns : columns;
    const groups = new Map<string, ColumnOption[]>();
    for (const o of options) groups.set(o.sheetName, [...(groups.get(o.sheetName) ?? []), o]);
    const chosen = byId.get(values[arg.key]);
    return (
      <div className="space-y-1.5">
        <div className="relative">
          <Columns3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-emerald-700" />
          <select value={values[arg.key] ?? ''} onChange={e => set(arg.key, e.target.value)} className={`${FIELD} appearance-none pl-9 font-semibold`} aria-label={arg.question}>
            <option value="">Escolha uma coluna…</option>
            {[...groups.entries()].map(([sheetName, list]) => (
              <optgroup key={sheetName} label={list[0].isActiveSheet ? `Esta tabela (${sheetName})` : `Tabela ${sheetName}`}>
                {list.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.header} — coluna {o.letter}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {chosen && (
          <p className="font-mono text-[11px] text-slate-500">
            {arg.kind === 'celula' ? `usa ${rowCell(chosen, firstRow)} em cada linha` : `usa ${columnRange(chosen).replace(/\$/g, '')} (${chosen.lastRow} linhas)`}
          </p>
        )}
      </div>
    );
  };

  const control = (arg: RecipeArg) => {
    if (arg.kind === 'coluna' || arg.kind === 'celula') return columnSelect(arg);
    if (arg.kind === 'opcao' || arg.kind === 'operador') {
      return (
        <div className="flex flex-wrap gap-2">
          {(arg.options ?? []).map(o => {
            const on = (values[arg.key] ?? '') === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => set(arg.key, o.value)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                  on ? 'border-emerald-700 bg-emerald-600 text-white shadow-[0_3px_0_#065f46]' : 'border-slate-300 bg-white text-slate-700 shadow-[0_3px_0_#cbd5e1] hover:bg-slate-50'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <input
        type="text"
        inputMode={arg.kind === 'numero' ? 'decimal' : undefined}
        value={values[arg.key] ?? ''}
        onChange={e => set(arg.key, e.target.value)}
        placeholder={arg.placeholder ?? (arg.optional ? 'Opcional' : '')}
        aria-label={arg.question}
        className={FIELD}
      />
    );
  };

  const destinationButton = (value: Destination, title: string, detail: string) => {
    const on = destination === value;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setDestination(value)}
        className={`flex-1 rounded-xl border p-3 text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
          on ? 'border-emerald-600 bg-emerald-50 shadow-[0_3px_0_#059669]' : 'border-slate-300 bg-white shadow-[0_3px_0_#cbd5e1] hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <span className={`flex size-4 items-center justify-center rounded-full border ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400'}`}>{on && <Check className="size-3" />}</span>
          {title}
        </div>
        <p className="mt-1 pl-6 text-xs text-slate-600">{detail}</p>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Assistente de fórmulas">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-[#f6f4f0] shadow-2xl ring-1 ring-black/10">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-4 bg-white px-6 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-[0_4px_0_#065f46]">
              <FunctionSquare className="size-6" />
            </div>
            <div>
              <p className={KICKER}>Assistente de fórmulas</p>
              <h3 className="text-lg font-extrabold tracking-tight text-slate-900">
                {inStepTwo ? (recipe?.title ?? advanced?.name) : 'O que você quer fazer?'}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ol className="hidden items-center gap-2 sm:flex" aria-label="Etapas">
              {['Escolher', 'Responder e conferir'].map((label, i) => {
                const current = (i === 1) === inStepTwo;
                const done = i === 0 && inStepTwo;
                return (
                  <li key={label} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${current ? 'bg-emerald-600 text-white' : done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    <span className="font-mono">{done ? '✓' : i + 1}</span>
                    {label}
                  </li>
                );
              })}
            </ol>
            <button onClick={onClose} aria-label="Fechar assistente" className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer">
              <X className="size-5" />
            </button>
          </div>
        </div>

        {!inStepTwo ? (
          /* ---------- Etapa 1: escolher o objetivo ---------- */
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && results.length > 0) chooseRecipe(results[0]);
                }}
                placeholder="Escreva com suas palavras: somar vendas, trazer o preço, juntar nome e sobrenome…"
                aria-label="Buscar o que você quer fazer"
                className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 pl-12 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/25"
              />
            </div>

            {results.length === 0 && (
              <p className="mt-6 rounded-2xl bg-white p-5 text-sm text-slate-700 shadow-sm">
                Não achei um atalho para “{search}”. Tente outras palavras ou veja todas as funções abaixo.
              </p>
            )}

            {GROUP_ORDER.map(group => {
              const list = results.filter(r => r.group === group);
              if (list.length === 0) return null;
              return (
                <section key={group} className="mt-5">
                  <div className="mb-2 flex items-baseline gap-2">
                    <h4 className={KICKER}>{group}</h4>
                    <span className="text-xs text-slate-500">{GROUP_HINT[group]}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map(r => {
                      const Icon = ICONS[r.id] ?? Sparkles;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => chooseRecipe(r)}
                          className="group flex items-start gap-3 rounded-2xl bg-white p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.18)] ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:ring-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 cursor-pointer"
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 shadow-[0_3px_0_#a7f3d0] transition-colors group-hover:bg-emerald-600 group-hover:text-white group-hover:shadow-[0_3px_0_#065f46]">
                            <Icon className="size-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-slate-900">{r.title}</span>
                            <span className="mt-0.5 block text-xs text-slate-600">{r.blurb}</span>
                            <span className="mt-1.5 block truncate font-mono text-[10px] uppercase tracking-wide text-slate-500">Ex.: {r.example}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {/* Para quem já conhece as funções */}
            <section className="mt-6">
              <button
                type="button"
                onClick={() => setShowAdvancedList(v => !v)}
                aria-expanded={showAdvancedList}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-white cursor-pointer"
              >
                <Table2 className="size-4 text-slate-500" />
                {showAdvancedList ? 'Ocultar a lista de funções' : `Já conheço as funções: ver a lista completa (${FORMULA_CATALOG.length})`}
              </button>
              {(showAdvancedList || (search.trim() !== '' && results.length === 0)) && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {advancedResults.map(f => (
                    <button
                      key={f.name}
                      type="button"
                      onClick={() => chooseAdvanced(f)}
                      title={f.description}
                      className="rounded-xl bg-white px-3 py-2 text-left ring-1 ring-black/5 transition-all hover:ring-emerald-500 cursor-pointer"
                    >
                      <span className="block font-mono text-xs font-bold text-slate-900">{f.name}</span>
                      <span className="block truncate text-[11px] text-slate-600">{f.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          /* ---------- Etapa 2: responder e conferir ---------- */
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {recipe && <p className="text-sm text-slate-700">{recipe.blurb} <span className="text-slate-500">Ex.: {recipe.example}.</span></p>}
              {advanced && (
                <p className="text-sm text-slate-700">
                  {advanced.description} <span className="font-mono text-xs text-slate-500">{advanced.syntax}</span>
                </p>
              )}

              {recipe?.args.map((arg, i) => (
                <div key={arg.key} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="mb-2 flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-bold text-white">{i + 1}</span>
                    <div>
                      <label className="text-sm font-bold text-slate-900">
                        {arg.question} {arg.optional && <span className="font-normal text-slate-500">(opcional)</span>}
                      </label>
                      {arg.help && <p className="text-xs text-slate-600">{arg.help}</p>}
                    </div>
                  </div>
                  {control(arg)}
                </div>
              ))}

              {advanced?.params.map((p, i) => (
                <div key={p.name} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="mb-2 flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-bold text-white">{i + 1}</span>
                    <div>
                      <label className="font-mono text-sm font-bold text-slate-900">
                        {p.name} {p.optional && <span className="font-sans font-normal text-slate-500">(opcional)</span>}
                      </label>
                      <p className="text-xs text-slate-600">{p.description}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={values[p.name] ?? ''} onChange={e => set(p.name, e.target.value)} placeholder={p.defaultValue ? `Ex.: ${p.defaultValue}` : 'Ex.: B2:B20'} aria-label={p.name} className={`${FIELD} font-mono`} />
                    <select
                      value=""
                      onChange={e => {
                        const o = byId.get(e.target.value);
                        if (o) set(p.name, columnRange(o).replace(/\$/g, ''));
                      }}
                      aria-label={`Preencher ${p.name} com uma coluna`}
                      className={`${FIELD} w-44 shrink-0 text-xs`}
                    >
                      <option value="">Usar uma coluna…</option>
                      {columns.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.isActiveSheet ? '' : `${o.sheetName} · `}{o.header} ({o.letter})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}

              {/* Onde colocar o resultado */}
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <p className="mb-2 text-sm font-bold text-slate-900">Onde colocar o resultado?</p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {recipe?.shape === 'por_linha' &&
                    destinationButton('coluna_nova', 'Em uma coluna nova', `Calcula as ${dataRowCount} linhas de uma vez, na coluna ${colIndexToLabel(newColIndex)}.`)}
                  {destinationButton('celula', `Só na célula ${activeAddress}`, activeHasContent ? 'Atenção: substitui o que está nessa célula.' : 'A célula que está selecionada na planilha.')}
                  {canPlaceBelow && destinationButton('abaixo', `Abaixo da coluna (${belowAddress})`, 'Como uma linha de total no fim dos dados.')}
                </div>
                {perRow && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="wizard-header">Nome da coluna nova</label>
                    <input id="wizard-header" type="text" value={header} onChange={e => setHeader(e.target.value)} className={FIELD} placeholder="Ex.: Total" />
                  </div>
                )}
              </div>
            </div>

            {/* Painel de conferência */}
            <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto bg-slate-950 px-5 py-5 text-slate-100 lg:w-[360px]">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-400">Em palavras</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-100">{formula ? sentence : 'Responda as perguntas ao lado. A explicação e a prévia aparecem aqui.'}</p>
              </div>

              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-400">Prévia com os seus dados</p>
                {!formula && (
                  <p className="mt-2 flex items-start gap-2 rounded-xl bg-slate-900 p-3 text-xs text-slate-300 ring-1 ring-slate-800">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
                    {missing > 0 ? `Falta responder ${missing} pergunta${missing > 1 ? 's' : ''}.` : 'Preencha os campos obrigatórios.'}
                  </p>
                )}
                {single && (
                  <div className="mt-2 rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800">
                    <p className={`break-words font-mono text-2xl font-extrabold ${single.error ? 'text-amber-400' : 'text-white'}`}>{single.shown}</p>
                    {single.error && <p className="mt-1 text-xs text-amber-300">{single.error}</p>}
                  </div>
                )}
                {previewRows.length > 0 && (
                  <div className="mt-2 overflow-hidden rounded-2xl ring-1 ring-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 font-mono text-[10px] uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-2 py-2 font-extrabold">#</th>
                          {previewColumns.slice(0, 2).map(c => (
                            <th key={c.id} className="max-w-[90px] truncate px-2 py-2 font-extrabold">{c.header}</th>
                          ))}
                          <th className="px-2 py-2 font-extrabold text-emerald-400">{header.trim() || 'Resultado'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map(({ row, result }) => (
                          <tr key={row} className="border-t border-slate-800">
                            <td className="px-2 py-1.5 font-mono text-slate-500">{row + 1}</td>
                            {previewColumns.slice(0, 2).map(c => (
                              <td key={c.id} className="max-w-[90px] truncate px-2 py-1.5 text-slate-300">
                                {formatCellValue(sheet.data[cellPosToKey(row, c.col)]?.value, sheet.data[cellPosToKey(row, c.col)]?.format)}
                              </td>
                            ))}
                            <td className={`px-2 py-1.5 font-mono font-bold ${result.error ? 'text-amber-400' : 'text-white'}`} title={result.error ?? undefined}>{result.shown}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dataRowCount > previewRows.length && <p className="bg-slate-900 px-3 py-1.5 text-[11px] text-slate-400">…e mais {dataRowCount - previewRows.length} {dataRowCount - previewRows.length === 1 ? 'linha' : 'linhas'}.</p>}
                    {previewRows.some(r => r.result.error) && <p className="bg-slate-900 px-3 py-2 text-xs text-amber-300">{previewRows.find(r => r.result.error)?.result.error}</p>}
                  </div>
                )}
              </div>

              {formula && (
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-400">Fórmula que será escrita</p>
                  <p className="mt-1.5 break-all rounded-xl bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-300 ring-1 ring-slate-800">{formula}</p>
                  {recipe && <p className="mt-1.5 text-[11px] text-slate-400">Função usada: {recipe.fn}. Você não precisa decorar isso.</p>}
                </div>
              )}
            </aside>
          </div>
        )}

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-3 bg-white px-6 py-4 shadow-[0_-1px_0_rgba(0,0,0,0.06)]">
          {inStepTwo ? (
            <button type="button" onClick={() => { setRecipe(null); setAdvanced(null); }} className={BTN_GHOST}>
              <ChevronLeft className="size-4" /> Escolher outra coisa
            </button>
          ) : (
            <p className="text-xs text-slate-600">Dica: selecione as colunas na planilha antes de abrir; o assistente já as sugere.</p>
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className={BTN_GHOST}>Cancelar</button>
            {inStepTwo && (
              <button type="button" onClick={handleInsert} disabled={!formula} className={BTN_PRIMARY}>
                <Check className="size-4" />
                {perRow ? `Criar coluna com ${dataRowCount} linhas` : 'Inserir na planilha'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
