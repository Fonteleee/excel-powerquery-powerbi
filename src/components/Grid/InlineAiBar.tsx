import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Send,
  X,
  Sigma,
  TrendingUp,
  DollarSign,
  PieChart,
  Table,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ArrowDownLeft,
  MapPin,
  BarChart2,
  Copy,
  Check,
  Zap,
  Loader2,
  RotateCcw,
  Plus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { Sheet, CellPosition, CellRange } from '../../types/spreadsheet';
import { askGeminiCopilot, CopilotResult } from '../../services/geminiService';
import { AgentAction } from '../../engine/agentActionProtocol';
import {
  rangeToAddress,
  colIndexToLabel,
  cellPosToKey,
  getCellValue,
  recalculateSheet,
  parseNumberSafely,
} from '../../engine/formulaParser';

type CopilotPhase = 'idle' | 'loading' | 'preview' | 'placing' | 'validating' | 'done' | 'error';

interface PlacementOption {
  label: string;
  description: string;
  icon: React.ReactNode;
  action: 'first_empty_col' | 'active_cell' | 'custom';
}

interface ValidationResult {
  ok: boolean;
  formula?: string;
  computedValue?: string | number | null;
  errorText?: string;
}

interface InlineAiBarProps {
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; left: number };
  sheet: Sheet;
  allSheets: Sheet[];
  activeCell: CellPosition;
  selectedRange: CellRange;
  onExecuteAgentActions: (actions: AgentAction[]) => void;
  onUpdateSheet?: (sheet: Sheet) => void;
}

const CHART_COLORS = ['#107c41', '#2563eb', '#f59e0b', '#7c3aed', '#ec4899', '#06b6d4'];

// ─── Mini chart rendered inline inside the Copilot panel ───
const MiniChart: React.FC<{ result: CopilotResult; sheet: Sheet }> = ({ result, sheet }) => {
  const chart = result.suggestedChart;
  if (!chart || !chart.data || chart.data.length === 0) return null;

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {chart.title}
      </p>
      <ResponsiveContainer width="100%" height={130}>
        {chart.type === 'pie' ? (
          <RechartsPieChart>
            <Pie data={chart.data} dataKey={chart.series[0]?.key || 'value'} nameKey={chart.xAxisKey} cx="50%" cy="50%" outerRadius={52} innerRadius={26}>
              {chart.data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any) => Number(v).toLocaleString('pt-BR')} />
          </RechartsPieChart>
        ) : chart.type === 'line' ? (
          <LineChart data={chart.data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <XAxis dataKey={chart.xAxisKey} tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: any) => Number(v).toLocaleString('pt-BR')} />
            {chart.series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        ) : chart.type === 'area' ? (
          <AreaChart data={chart.data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <XAxis dataKey={chart.xAxisKey} tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: any) => Number(v).toLocaleString('pt-BR')} />
            {chart.series.map((s, i) => (
              <Area key={s.key} type="monotone" dataKey={s.key} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length] + '33'} strokeWidth={2} />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={chart.data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <XAxis dataKey={chart.xAxisKey} tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: any) => Number(v).toLocaleString('pt-BR')} />
            {chart.series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

// ─── Auto-validate a formula against the live sheet ───
function validateFormula(formula: string, sheet: Sheet, allSheets: Sheet[], row: number, col: number): ValidationResult {
  if (!formula || !formula.startsWith('=')) {
    return { ok: true };
  }
  try {
    // Create a temp sheet copy with the formula in the target cell
    const tempData = { ...sheet.data };
    const key = cellPosToKey(row, col);
    tempData[key] = { ...(tempData[key] || { format: {} }), raw: formula, value: null };
    const tempSheet: Sheet = { ...sheet, data: tempData };
    const recalced = recalculateSheet(tempSheet, allSheets);
    const val = getCellValue(recalced, row, col, allSheets);
    const isError = typeof val === 'string' && val.startsWith('#');
    if (isError) {
      return { ok: false, formula, computedValue: val, errorText: `Fórmula retornou ${val}` };
    }
    const display =
      typeof val === 'number'
        ? val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
        : String(val ?? '');
    return { ok: true, formula, computedValue: display };
  } catch (err: any) {
    return { ok: false, formula, errorText: err.message || 'Erro ao avaliar fórmula.' };
  }
}

// ─── Find first empty column after existing data ───
function findFirstEmptyCol(sheet: Sheet): number {
  let maxCol = -1;
  for (const key of Object.keys(sheet.data)) {
    const m = key.match(/^R\d+C(\d+)$/);
    if (m) {
      const c = parseInt(m[1], 10);
      if (c > maxCol) maxCol = c;
    }
  }
  return maxCol + 1;
}

export const InlineAiBar: React.FC<InlineAiBarProps> = ({
  isOpen,
  onClose,
  position,
  sheet,
  allSheets,
  activeCell,
  selectedRange,
  onExecuteAgentActions,
  onUpdateSheet,
}) => {
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<CopilotPhase>('idle');
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [customCell, setCustomCell] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [appliedSummary, setAppliedSummary] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const rangeStr = rangeToAddress(selectedRange);
  const isMultiCell =
    selectedRange.startRow !== selectedRange.endRow ||
    selectedRange.startCol !== selectedRange.endCol;

  const activeCellLabel = `${colIndexToLabel(activeCell.col)}${activeCell.row + 1}`;

  useEffect(() => {
    if (isOpen && phase === 'idle') {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen, phase]);

  if (!isOpen) return null;

  // ── STEP 1: Execute Prompt ──
  const handleExecutePrompt = async (customText?: string) => {
    const text = customText || prompt.trim();
    if (!text || phase === 'loading') return;

    setPhase('loading');
    setResult(null);
    setValidation(null);
    setErrorMsg('');

    try {
      const contextPrompt = isMultiCell
        ? `No intervalo selecionado ${rangeStr}: ${text}`
        : `Na célula ${activeCellLabel}: ${text}`;

      const res = await askGeminiCopilot(contextPrompt, sheet);

      // Auto-validate formula immediately if present
      let val: ValidationResult | null = null;
      if (res.suggestedFormula) {
        val = validateFormula(res.suggestedFormula, sheet, allSheets, activeCell.row, activeCell.col);
        setValidation(val);
      } else if (res.actions) {
        const setCellsAction = res.actions.find(a => a.type === 'set_cells') as any;
        if (setCellsAction?.cells?.[0]?.raw?.startsWith('=')) {
          const { row, col, raw } = setCellsAction.cells[0];
          val = validateFormula(raw, sheet, allSheets, row, col);
          setValidation(val);
        }
      }

      setResult(res);
      setPhase('preview');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao contatar a IA.');
      setPhase('error');
    }
  };

  // ── STEP 2: Apply with placement ──
  const handleApply = (placement: 'active_cell' | 'first_empty_col' | 'custom', customAddress?: string) => {
    if (!result) return;
    setPhase('validating');

    try {
      let actions: AgentAction[] = result.actions || [];

      // Derive target row/col
      let targetRow = activeCell.row;
      let targetCol = activeCell.col;

      if (placement === 'first_empty_col') {
        targetCol = findFirstEmptyCol(sheet);
        targetRow = 0;
      } else if (placement === 'custom' && customAddress) {
        const match = customAddress.toUpperCase().match(/^([A-Z]+)(\d+)$/);
        if (match) {
          targetCol = 0;
          const label = match[1];
          for (let i = 0; i < label.length; i++) {
            targetCol = targetCol * 26 + (label.charCodeAt(i) - 64);
          }
          targetCol -= 1;
          targetRow = parseInt(match[2], 10) - 1;
        }
      }

      // If there's only a suggestedFormula (no full actions), convert it
      if ((!actions || actions.length === 0) && result.suggestedFormula) {
        actions = [
          {
            type: 'set_cells',
            cells: [{ row: targetRow, col: targetCol, raw: result.suggestedFormula }],
          },
        ];
      } else if (actions.length > 0 && placement !== 'active_cell') {
        // Remap set_cells actions to the new placement
        actions = actions.map(a => {
          if (a.type === 'set_cells') {
            return {
              ...a,
              cells: a.cells.map((c, idx) => ({
                ...c,
                row: targetRow + idx,
                col: targetCol,
              })),
            };
          }
          return a;
        });
      }

      // Perform a final validation before applying
      const formulaAction = actions.find(a => a.type === 'set_cells') as any;
      let finalValidation: ValidationResult = { ok: true };
      if (formulaAction?.cells?.[0]?.raw?.startsWith('=')) {
        const { row, col, raw } = formulaAction.cells[0];
        finalValidation = validateFormula(raw, sheet, allSheets, row, col);
      }

      onExecuteAgentActions(actions);

      const cellLabel = `${colIndexToLabel(targetCol)}${targetRow + 1}`;
      const summary = finalValidation.computedValue
        ? `✓ Aplicado em ${cellLabel} → ${finalValidation.computedValue}`
        : `✓ ${actions.length} ação(ões) aplicada(s)`;

      setAppliedSummary(summary);
      setValidation(finalValidation);
      setPhase('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao aplicar ações.');
      setPhase('error');
    }
  };

  const handleCopyResult = () => {
    const text = result?.text || result?.suggestedFormula || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleReset = () => {
    setPhase('idle');
    setResult(null);
    setValidation(null);
    setErrorMsg('');
    setAppliedSummary('');
    setCustomCell('');
    setPrompt('');
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  // ── Quick action chips ──
  const quickActions = isMultiCell
    ? [
        { label: 'Somar tudo', icon: <Sigma className="size-3 text-emerald-600" />, prompt: `Calcule a SOMA total do intervalo ${rangeStr} e insira o resultado logo abaixo.` },
        { label: 'Calcular Média', icon: <TrendingUp className="size-3 text-blue-600" />, prompt: `Calcule a MÉDIA dos valores em ${rangeStr}.` },
        { label: 'Formatar R$', icon: <DollarSign className="size-3 text-amber-600" />, prompt: `Formate os valores numéricos de ${rangeStr} como moeda R$.` },
        { label: 'Gerar Gráfico', icon: <BarChart2 className="size-3 text-purple-600" />, prompt: `Gere um gráfico de barras comparativo para os dados em ${rangeStr}.` },
      ]
    : [
        { label: 'Criar DRE', icon: <Table className="size-3 text-emerald-600" />, prompt: 'Crie uma planilha DRE financeira completa para 2026 com 12 meses.' },
        { label: 'Fluxo de Caixa', icon: <TrendingUp className="size-3 text-blue-600" />, prompt: 'Crie um Fluxo de Caixa anual com entradas, saídas e saldo acumulado por mês.' },
        { label: 'Calcular Total', icon: <Sigma className="size-3 text-amber-600" />, prompt: `Insira uma fórmula SOMA para a coluna ${colIndexToLabel(activeCell.col)} nesta célula.` },
        { label: 'Gráfico aqui', icon: <PieChart className="size-3 text-purple-600" />, prompt: 'Crie um gráfico de pizza comparativo com os dados da planilha atual.' },
      ];

  // ─── PLACEMENT BUTTONS ───
  const placementOptions: PlacementOption[] = [
    { label: 'Nesta célula', description: activeCellLabel, icon: <MapPin className="size-3.5" />, action: 'active_cell' },
    { label: 'Primeira coluna vazia', description: `Col. ${colIndexToLabel(findFirstEmptyCol(sheet))}`, icon: <ArrowDownLeft className="size-3.5" />, action: 'first_empty_col' },
    { label: 'Célula específica', description: '', icon: <Plus className="size-3.5" />, action: 'custom' },
  ];

  // ─── TEXT DISPLAY ───
  const displayText = result?.text || '';
  const truncated = displayText.length > 280 ? displayText.slice(0, 280) + '…' : displayText;

  // Panel y constraint
  const panelTop = Math.max(80, Math.min((typeof window !== 'undefined' ? window.innerHeight : 800) - 520, position.top));
  const panelLeft = Math.max(10, Math.min((typeof window !== 'undefined' ? window.innerWidth : 1400) - 430, position.left));

  return (
    <div
      style={{ top: `${panelTop}px`, left: `${panelLeft}px` }}
      className="fixed z-[120] flex w-[420px] flex-col overflow-hidden rounded-2xl border border-emerald-500/25 bg-white shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200"
    >
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-lg bg-white/20">
            <Sparkles className="size-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Copilot Excel</span>
          <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-[10px] font-bold text-white/90">
            {isMultiCell ? rangeStr : activeCellLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {phase !== 'idle' && (
            <button
              onClick={handleReset}
              title="Nova pergunta"
              className="rounded-lg p-1 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="flex flex-col gap-0 overflow-y-auto" style={{ maxHeight: '480px' }}>

        {/* ═══ PHASE: IDLE — Input + Quick Chips ═══ */}
        {phase === 'idle' && (
          <div className="p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleExecutePrompt();
                  if (e.key === 'Escape') onClose();
                }}
                placeholder="O que deseja fazer? (some, calcule %, crie planilha…)"
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
              <button
                onClick={() => handleExecutePrompt()}
                disabled={!prompt.trim()}
                className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow hover:bg-emerald-700 transition-all disabled:opacity-35"
              >
                <Send className="size-3.5" />
              </button>
            </div>

            {/* Quick chips */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {quickActions.map((qa, idx) => (
                <button
                  key={idx}
                  onClick={() => handleExecutePrompt(qa.prompt)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                >
                  {qa.icon}
                  <span>{qa.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[9px] text-slate-400 text-center">Ctrl+K abre este painel · Escape fecha</p>
          </div>
        )}

        {/* ═══ PHASE: LOADING ═══ */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 py-8 px-4">
            <div className="relative flex size-10 items-center justify-center rounded-full bg-emerald-50">
              <Loader2 className="size-5 text-emerald-600 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800">Analisando sua planilha…</p>
              <p className="text-[11px] text-slate-500 mt-0.5">A IA está processando e gerando o resultado</p>
            </div>
            <div className="h-1 w-48 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500 animate-pulse rounded-full w-2/3" />
            </div>
          </div>
        )}

        {/* ═══ PHASE: PREVIEW ═══ */}
        {phase === 'preview' && result && (
          <div className="flex flex-col gap-0">
            {/* AI Response text */}
            {displayText && (
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Resposta da IA</p>
                <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">{truncated}</p>
              </div>
            )}

            {/* Formula preview + auto-validation badge */}
            {(result.suggestedFormula || (result.actions?.some(a => a.type === 'set_cells'))) && (
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fórmula Gerada</p>
                <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2">
                  <code className="flex-1 text-[11px] font-mono text-emerald-300 break-all">
                    {result.suggestedFormula || (result.actions?.find(a => a.type === 'set_cells') as any)?.cells?.[0]?.raw}
                  </code>
                </div>

                {/* Validation result */}
                {validation && (
                  <div className={`mt-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    validation.ok
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {validation.ok ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="size-3.5 shrink-0 text-red-600" />
                    )}
                    <span>
                      {validation.ok
                        ? `Validado ✓ — Resultado: ${validation.computedValue ?? 'OK'}`
                        : `Falha na validação: ${validation.errorText}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Inline chart */}
            {result.suggestedChart && (
              <div className="border-b border-slate-100 px-4 py-3">
                <MiniChart result={result} sheet={sheet} />
              </div>
            )}

            {/* Actions preview */}
            {result.actions && result.actions.length > 0 && (
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {result.actions.length} Ação(ões) Prontas
                </p>
                <div className="flex flex-col gap-1">
                  {result.actions.slice(0, 3).map((a, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800 border border-emerald-100">
                      <Zap className="size-2.5 text-emerald-600" />
                      <span className="font-mono">{a.type.replace(/_/g, ' ')}</span>
                      {a.type === 'create_sheet_from_scratch' && <span>→ "{(a as any).sheetName}"</span>}
                      {a.type === 'set_cells' && <span>→ {(a as any).cells?.length} célula(s)</span>}
                    </div>
                  ))}
                  {result.actions.length > 3 && (
                    <p className="text-[9px] text-slate-400 pl-1">+{result.actions.length - 3} mais…</p>
                  )}
                </div>
              </div>
            )}

            {/* Placement options */}
            <div className="px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Onde aplicar?</p>
              <div className="flex flex-col gap-1.5">
                {placementOptions.map(opt => (
                  opt.action === 'custom' ? (
                    <div key="custom" className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                        {opt.icon}
                        <span className="font-medium">{opt.label}:</span>
                      </div>
                      <input
                        type="text"
                        value={customCell}
                        onChange={e => setCustomCell(e.target.value.toUpperCase())}
                        placeholder="ex: D5"
                        className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-mono text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      />
                      <button
                        onClick={() => handleApply('custom', customCell)}
                        disabled={!customCell.trim()}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-40"
                      >
                        <ChevronRight className="size-3" />
                        Aplicar
                      </button>
                    </div>
                  ) : (
                    <button
                      key={opt.action}
                      onClick={() => handleApply(opt.action)}
                      className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-emerald-400 hover:bg-emerald-50 transition-colors group"
                    >
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 group-hover:border-emerald-300 group-hover:text-emerald-600 transition-colors">
                        {opt.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 group-hover:text-emerald-800">{opt.label}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{opt.description}</p>
                      </div>
                      <ChevronRight className="size-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                    </button>
                  )
                ))}
              </div>
            </div>

            {/* Copy response button */}
            <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
              <button
                onClick={handleCopyResult}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-100 transition-colors"
              >
                {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                {copied ? 'Copiado!' : 'Copiar resposta'}
              </button>
              <p className="text-[9px] text-slate-400">{result.modelUsed}</p>
            </div>
          </div>
        )}

        {/* ═══ PHASE: VALIDATING ═══ */}
        {phase === 'validating' && (
          <div className="flex flex-col items-center gap-3 py-8 px-4">
            <Loader2 className="size-7 text-emerald-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-800">Validando resultado…</p>
            <p className="text-[11px] text-slate-500">Verificando se a fórmula funciona corretamente</p>
          </div>
        )}

        {/* ═══ PHASE: DONE ═══ */}
        {phase === 'done' && (
          <div className="flex flex-col items-center gap-3 py-8 px-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="size-6 text-emerald-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800">Aplicado com sucesso!</p>
              <p className="mt-0.5 text-[11px] font-mono text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1 mt-2">{appliedSummary}</p>
            </div>
            {validation && !validation.ok && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 text-center">
                <AlertTriangle className="size-3.5 inline mr-1 text-amber-600" />
                {validation.errorText}
              </div>
            )}
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <RotateCcw className="size-3" /> Nova ação
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Fechar <X className="size-3" />
              </button>
            </div>
          </div>
        )}

        {/* ═══ PHASE: ERROR ═══ */}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3 py-8 px-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="size-5 text-red-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800">Algo deu errado</p>
              <p className="mt-1 text-[11px] text-slate-500 max-w-xs">{errorMsg}</p>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              <RotateCcw className="size-3" /> Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
