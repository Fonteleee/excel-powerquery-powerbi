import React, { useState } from 'react';
import {
  Sparkles,
  BarChart2,
  PieChart,
  TrendingUp,
  Calculator,
  Table,
  Palette,
  Check,
  X,
  Sigma,
  Percent,
  Layers,
  ArrowUpDown,
  Activity,
  Download,
} from 'lucide-react';
import { CellRange, Sheet, ConditionalFormatRule } from '../../types/spreadsheet';
import { colIndexToLabel, getFlatRangeValues, parseNumberSafely } from '../../engine/formulaParser';
import { exportSheetToExcel } from '../../utils/excelExporter';


interface QuickAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRange: CellRange;
  sheet: Sheet;
  onApplyConditionalRule: (rule: ConditionalFormatRule) => void;
  onInsertTotals: (type: 'SUM' | 'AVG' | 'COUNT' | 'PERCENT' | 'SUMPRODUCT' | 'WEIGHTED_AVG', direction: 'row' | 'col') => void;
  onOpenChart: (type: 'bar' | 'column' | 'line' | 'pie' | 'area' | 'radar') => void;
  onOpenPivot: () => void;
}

export const QuickAnalysisModal: React.FC<QuickAnalysisModalProps> = ({
  isOpen,
  onClose,
  selectedRange,
  sheet,
  onApplyConditionalRule,
  onInsertTotals,
  onOpenChart,
  onOpenPivot,
}) => {
  const [activeTab, setActiveTab] = useState<'formatting' | 'charts' | 'totals' | 'tables'>('totals');

  if (!isOpen) return null;

  const rangeAddress = `${colIndexToLabel(selectedRange.startCol)}${selectedRange.startRow + 1}:${colIndexToLabel(selectedRange.endCol)}${selectedRange.endRow + 1}`;
  const values = getFlatRangeValues(sheet, selectedRange);
  const numericValues = values.map(v => parseNumberSafely(v, true)).filter((n): n is number => n !== null);


  const previewSum = numericValues.reduce((a, b) => a + b, 0);
  const previewAvg = numericValues.length > 0 ? previewSum / numericValues.length : 0;
  const previewCount = values.filter(v => v !== null && v !== undefined && v !== '').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#0f172a] border border-white/15 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#090d16]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-xs">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">Lente de Análise Rápida</h3>
                <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  CTRL + Q
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Intervalo: <span className="font-mono text-emerald-400 font-bold">{rangeAddress}</span> ({numericValues.length} números detectados)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-white/10 bg-[#111827] px-4">
          <button
            onClick={() => setActiveTab('totals')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'totals'
                ? 'border-emerald-400 text-emerald-400 font-bold bg-white/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calculator className="size-4" />
            Totais & Cálculos
          </button>
          <button
            onClick={() => setActiveTab('formatting')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'formatting'
                ? 'border-emerald-400 text-emerald-400 font-bold bg-white/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="size-4" />
            Formatação Condicional
          </button>
          <button
            onClick={() => setActiveTab('charts')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'charts'
                ? 'border-emerald-400 text-emerald-400 font-bold bg-white/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="size-4" />
            Gráficos Instantâneos
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'tables'
                ? 'border-emerald-400 text-emerald-400 font-bold bg-white/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="size-4" />
            Tabela Dinâmica
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 max-h-[420px] overflow-y-auto bg-[#0f172a] text-slate-200">

          {/* TOTAIS & CÁLCULOS */}
          {activeTab === 'totals' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-center">
                  <div className="text-xs text-slate-500 font-bold">SOMA SELEÇÃO</div>
                  <div className="text-lg font-mono font-extrabold text-emerald-700">
                    {previewSum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-center border-x border-slate-200">
                  <div className="text-xs text-slate-500 font-bold">MÉDIA</div>
                  <div className="text-lg font-mono font-extrabold text-blue-700">
                    {previewAvg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-500 font-bold">CONTAGEM</div>
                  <div className="text-lg font-mono font-extrabold text-slate-800">{previewCount}</div>
                </div>
              </div>

              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Inserir linha / coluna de cálculo automático:
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => {
                    onInsertTotals('SUM', 'col');
                    onClose();
                  }}
                  className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 transition-all text-center group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 group-hover:bg-emerald-600 group-hover:text-white transition-colors mb-2">
                    <Sigma className="size-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Soma na Linha</span>
                  <span className="text-[11px] text-slate-500">Abaixo de cada coluna</span>
                </button>

                <button
                  onClick={() => {
                    onInsertTotals('AVG', 'col');
                    onClose();
                  }}
                  className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all text-center group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-800 group-hover:bg-blue-600 group-hover:text-white transition-colors mb-2">
                    <Activity className="size-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Média na Linha</span>
                  <span className="text-[11px] text-slate-500">Abaixo da seleção</span>
                </button>

                <button
                  onClick={() => {
                    onInsertTotals('SUMPRODUCT', 'col');
                    onClose();
                  }}
                  className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 transition-all text-center group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-800 group-hover:bg-purple-600 group-hover:text-white transition-colors mb-2">
                    <Layers className="size-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Somarproduto</span>
                  <span className="text-[11px] text-slate-500">Multiplica colunas</span>
                </button>

                <button
                  onClick={() => {
                    onInsertTotals('WEIGHTED_AVG', 'col');
                    onClose();
                  }}
                  className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 transition-all text-center group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-amber-100 text-amber-900 group-hover:bg-amber-600 group-hover:text-white transition-colors mb-2">
                    <ArrowUpDown className="size-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Média Ponderada</span>
                  <span className="text-[11px] text-slate-500">Com base em pesos</span>
                </button>

                <button
                  onClick={() => {
                    onInsertTotals('PERCENT', 'col');
                    onClose();
                  }}
                  className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 transition-all text-center group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-teal-100 text-teal-800 group-hover:bg-teal-600 group-hover:text-white transition-colors mb-2">
                    <Percent className="size-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">% do Total</span>
                  <span className="text-[11px] text-slate-500">Proporção individual</span>
                </button>

                <button
                  onClick={() => {
                    onInsertTotals('SUM', 'row');
                    onClose();
                  }}
                  className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 transition-all text-center group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 group-hover:bg-emerald-600 group-hover:text-white transition-colors mb-2">
                    <Sigma className="size-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Soma na Coluna</span>
                  <span className="text-[11px] text-slate-500">À direita de cada linha</span>
                </button>
              </div>
            </div>
          )}

          {/* FORMATAÇÃO CONDICIONAL */}
          {activeTab === 'formatting' && (
            <div className="space-y-4">
              {numericValues.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
                  <div className="size-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <div>
                    <div className="font-bold text-amber-300">Onde as Barras de Dados e Cores aparecem?</div>
                    <div className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                      Elas são renderizadas <strong>diretamente no fundo das células selecionadas na planilha</strong>. Como a seleção atual ({rangeAddress}) possui 0 números ou tempos, selecione colunas com valores (ex: <em>Tempo em Pausa</em>, <em>Qtd</em>, <em>Faturamento</em>) para ver as barras e o mapa de calor!
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400 shrink-0" />
                  <span>As barras e cores serão aplicadas <strong>no fundo das células de {rangeAddress}</strong> ({numericValues.length} números detectados).</span>
                </div>
              )}

              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Estilos Visuais em 1 Clique (Nas Células da Planilha):
              </div>


              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    onApplyConditionalRule({
                      id: `rule-${Date.now()}`,
                      type: 'data_bar',
                      range: selectedRange,
                      style: { barColor: '#107c41' },
                    });
                    onClose();
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/50 transition-all text-left cursor-pointer group"
                >
                  <div className="w-10 h-8 rounded bg-white/10 flex flex-col justify-center gap-1 p-1">
                    <div className="h-1.5 w-3/4 bg-emerald-400 rounded-xs"></div>
                    <div className="h-1.5 w-1/2 bg-emerald-400 rounded-xs"></div>
                    <div className="h-1.5 w-full bg-emerald-400 rounded-xs"></div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-emerald-400">Barras de Dados</div>
                    <div className="text-[11px] text-slate-400">Gradiente proporcional ao valor</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    onApplyConditionalRule({
                      id: `rule-${Date.now()}`,
                      type: 'color_scale_3',
                      range: selectedRange,
                      style: {
                        minColor: '#fecaca',
                        midColor: '#fef08a',
                        maxColor: '#bbf7d0',
                      },
                    });
                    onClose();
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/50 transition-all text-left cursor-pointer group"
                >
                  <div className="w-10 h-8 rounded flex overflow-hidden border border-white/20">
                    <div className="w-1/3 h-full bg-emerald-400"></div>
                    <div className="w-1/3 h-full bg-amber-400"></div>
                    <div className="w-1/3 h-full bg-rose-400"></div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-emerald-400">Escala de Cores (Calor)</div>
                    <div className="text-[11px] text-slate-400">Verde (alto), Amarelo, Vermelho (baixo)</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    onApplyConditionalRule({
                      id: `rule-${Date.now()}`,
                      type: 'icon_set',
                      range: selectedRange,
                      style: { iconSet: 'traffic' },
                    });
                    onClose();
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/50 transition-all text-left cursor-pointer group"
                >
                  <div className="w-10 h-8 rounded bg-white/10 flex items-center justify-center gap-1 border border-white/10">
                    <span className="size-2 rounded-full bg-emerald-400"></span>
                    <span className="size-2 rounded-full bg-amber-400"></span>
                    <span className="size-2 rounded-full bg-rose-400"></span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-emerald-400">Conjunto de Ícones</div>
                    <div className="text-[11px] text-slate-400">Semáforos de status</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    onApplyConditionalRule({
                      id: `rule-${Date.now()}`,
                      type: 'highlight_above_avg',
                      range: selectedRange,
                      style: { bgColor: '#dcfce7', textColor: '#166534' },
                    });
                    onClose();
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/50 transition-all text-left cursor-pointer group"
                >
                  <div className="w-10 h-8 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xs font-bold text-emerald-400">
                    &gt; X̄
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-emerald-400">Acima da Média</div>
                    <div className="text-[11px] text-slate-400">Realçar valores superiores a {previewAvg.toFixed(1)}</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* GRÁFICOS */}
          {activeTab === 'charts' && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Gerar Gráfico Instantâneo a partir da seleção:
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => {
                    onOpenChart('column');
                    onClose();
                  }}
                  className="flex flex-col items-center p-4 rounded-xl bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/40 transition-all text-center group cursor-pointer"
                >
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors mb-2">
                    <BarChart2 className="size-6" />
                  </div>
                  <span className="text-xs font-bold text-white">Colunas</span>
                  <span className="text-[11px] text-slate-400">Comparação vertical</span>
                </button>

                <button
                  onClick={() => {
                    onOpenChart('line');
                    onClose();
                  }}
                  className="flex flex-col items-center p-4 rounded-xl bg-white/5 hover:bg-sky-500/10 border border-white/10 hover:border-sky-500/40 transition-all text-center group cursor-pointer"
                >
                  <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition-colors mb-2">
                    <TrendingUp className="size-6" />
                  </div>
                  <span className="text-xs font-bold text-white">Linhas</span>
                  <span className="text-[11px] text-slate-400">Evolução temporal</span>
                </button>

                <button
                  onClick={() => {
                    onOpenChart('pie');
                    onClose();
                  }}
                  className="flex flex-col items-center p-4 rounded-xl bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/40 transition-all text-center group cursor-pointer"
                >
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors mb-2">
                    <PieChart className="size-6" />
                  </div>
                  <span className="text-xs font-bold text-white">Pizza / Rosca</span>
                  <span className="text-[11px] text-slate-400">Participação de fatias</span>
                </button>
              </div>
            </div>
          )}

          {/* TABELAS & DINÂMICAS */}
          {activeTab === 'tables' && (
            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <Table className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Criar Tabela Dinâmica do Intervalo</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Gera relatório multidimensional com agrupamentos dinâmicos, subtotais e filtros cruzados no Power BI Studio.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => {
                      onOpenPivot();
                      onClose();
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                  >
                    <Table className="size-4" />
                    Abrir Construtor de Tabela Dinâmica
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#090d16] text-xs text-slate-400">
          <button
            onClick={() => exportSheetToExcel(sheet, `${sheet.name}_Analise_Rapida`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-emerald-400 border border-white/10 font-bold transition-colors cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>Exportar Seleção (.XLSX)</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};


