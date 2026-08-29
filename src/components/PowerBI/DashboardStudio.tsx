import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Activity,
  Table,
  Sparkles,
  Send,
  Layers,
  Download,
  Clock,
  Hash,
  ArrowLeft,
  BarChart2,
  FolderOpen,
  PieChart as PieIcon,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart as RechartsPie,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from 'recharts';
import brandEmblem from '../../assets/brand_emblem.jpg';
import {
  BespokeAnalyticsIcon,
  BespokeExportIcon,
  BespokeSparkIcon,
} from '../Icons/BespokeIcons';
import { Sheet } from '../../types/spreadsheet';
import { PivotConfig, AggregationType } from '../../types/analytics';
import { computePivotTable } from '../../engine/pivotEngine';
import { profileSheetColumns } from '../../engine/dataProfiler';
import { getCellValue, parseNumberSafely, valueToSeconds, formatSecondsToTime } from '../../engine/formulaParser';
import { exportPivotReportToExcel } from '../../utils/excelExporter';

interface DashboardStudioProps {
  sheet: Sheet;
  onClose: () => void;
  onLoadSampleSales?: () => void;
}

export const DashboardStudio: React.FC<DashboardStudioProps> = ({ sheet, onClose, onLoadSampleSales }) => {
  const [activeTab, setActiveTab] = useState<'kpi_charts' | 'pivot_table' | 'ai_assistant'>('kpi_charts');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  // Extract columns
  const columnProfiles = useMemo(() => {
    return profileSheetColumns(sheet, 0);
  }, [sheet]);

  const hasData = useMemo(() => {
    return columnProfiles.length > 0 && sheet.rowCount > 1 && Object.keys(sheet.data).length > 2;
  }, [columnProfiles, sheet]);

  // Dynamic Selected Dimension (X-Axis / Slice) & Metric (Y-Axis / Value)
  const defaultDimensionCol = useMemo(() => {
    const textCol = columnProfiles.find(cp => cp.inferredType === 'text' && !/^id\b|c[oó]digo/i.test(cp.colName));
    if (textCol) return textCol.colIndex;
    return columnProfiles[0]?.colIndex ?? 0;
  }, [columnProfiles]);

  const defaultMetricCol = useMemo(() => {
    // Prefer currency/revenue/profit columns first, then numeric columns with positive sum
    const curCol = columnProfiles.find(
      cp => (cp.inferredType === 'currency' || /l[ií]quido|faturamento|total|valor|receita|pre[cç]o|comiss/i.test(cp.colName)) && !/^id\b/i.test(cp.colName)
    );
    if (curCol) return curCol.colIndex;

    const numCol = columnProfiles.find(
      cp => (cp.inferredType === 'number' || cp.inferredType === 'time') && !/^id\b/i.test(cp.colName)
    );
    if (numCol) return numCol.colIndex;

    return columnProfiles[columnProfiles.length > 1 ? 1 : 0]?.colIndex ?? 0;
  }, [columnProfiles]);

  const [selectedDimensionCol, setSelectedDimensionCol] = useState<number>(defaultDimensionCol);
  const [selectedMetricCol, setSelectedMetricCol] = useState<number>(defaultMetricCol);
  const [selectedAggregation, setSelectedAggregation] = useState<AggregationType>('SUM');

  // Active Metric Column Profile
  const activeMetricProfile = useMemo(() => {
    return columnProfiles.find(cp => cp.colIndex === selectedMetricCol) || columnProfiles[0] || { colName: 'Valor', colIndex: 0, inferredType: 'number' };
  }, [columnProfiles, selectedMetricCol]);

  const activeDimensionProfile = useMemo(() => {
    return columnProfiles.find(cp => cp.colIndex === selectedDimensionCol) || columnProfiles[0] || { colName: 'Dimensão', colIndex: 0, inferredType: 'text' };
  }, [columnProfiles, selectedDimensionCol]);

  // Is metric a Time/Clock column?
  const isMetricTime = useMemo(() => {
    const name = activeMetricProfile?.colName?.toLowerCase() || '';
    return /tempo|hora|pausa|logado|dura[cç][aã]o|perman[eê]ncia|chamada|atendimento|time/i.test(name);
  }, [activeMetricProfile]);

  // Format metric value helper
  const formatMetricValue = (val: number, isAverage = false): string => {
    if (isMetricTime) {
      return formatSecondsToTime(val, 'time_hh_mm_ss');
    }
    if (activeMetricProfile?.inferredType === 'currency' || /pre[cç]o|valor|sal[aá]rio|faturamento|custo|lucro|receita|venda|r\$/i.test(activeMetricProfile?.colName || '')) {
      return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    return isAverage
      ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : val.toLocaleString('pt-BR');
  };

  // Compute aggregation data for charts
  const { chartData, totalSum, avgVal, maxCategory, rowCount } = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    let validRows = 0;

    for (let r = 1; r < sheet.rowCount; r++) {
      const dimVal = getCellValue(sheet, r, selectedDimensionCol);
      const metVal = getCellValue(sheet, r, selectedMetricCol);

      if (dimVal !== null && dimVal !== undefined && String(dimVal).trim() !== '') {
        const numVal = parseNumberSafely(metVal, isMetricTime) ?? 0;
        const keyStr = String(dimVal).trim();

        map.set(keyStr, (map.get(keyStr) || 0) + numVal);
        total += numVal;
        validRows++;
      }
    }

    const items = Array.from(map.entries()).map(([name, value]) => ({
      name,
      value,
      percent: total > 0 ? (value / total) * 100 : 0,
    })).sort((a, b) => b.value - a.value);

    return {
      chartData: items.slice(0, 10),
      totalSum: total,
      avgVal: validRows > 0 ? total / validRows : 0,
      maxCategory: items[0] || null,
      rowCount: validRows,
    };
  }, [sheet, selectedDimensionCol, selectedMetricCol, isMetricTime]);

  const chartColors = [
    '#059669', '#2563eb', '#f59e0b', '#7c3aed', '#ec4899', '#14b8a6',
    '#ea580c', '#6366f1', '#06b6d4', '#84cc16', '#64748b',
  ];

  const pivotConfig: PivotConfig = useMemo(() => ({
    rowFieldIndices: [selectedDimensionCol],
    columnFieldIndices: [],
    valueFields: [
      {
        colIndex: selectedMetricCol,
        colName: activeMetricProfile?.colName || 'Valor',
        aggregation: selectedAggregation,
        customLabel: `Total ${activeMetricProfile?.colName || 'Valor'}`,
      },
    ],
    filterIndices: {},
    showRowTotals: true,
    showColumnTotals: true,
  }), [selectedDimensionCol, selectedMetricCol, activeMetricProfile, selectedAggregation]);

  const pivotResult = useMemo(() => {
    return computePivotTable(sheet, pivotConfig);
  }, [sheet, pivotConfig]);

  const kpis = useMemo(() => [
    {
      title: `Total ${activeMetricProfile?.colName || 'Valor'}`,
      value: formatMetricValue(totalSum),
      icon: isMetricTime ? (
        <Clock className="size-4 text-sky-600" />
      ) : activeMetricProfile?.inferredType === 'currency' ? (
        <DollarSign className="size-4 text-emerald-600" />
      ) : (
        <Activity className="size-4 text-indigo-600" />
      ),
    },
    { title: 'Média por Registro', value: formatMetricValue(avgVal, true), icon: <TrendingUp className="size-4 text-blue-600" /> },
    { title: 'Maior Categoria', value: maxCategory?.name || 'Nenhum', icon: <Activity className="size-4 text-purple-600" /> },
    { title: 'Total de Linhas', value: `${rowCount} registros`, icon: <Layers className="size-4 text-amber-600" /> },
  ], [activeMetricProfile, totalSum, avgVal, maxCategory, rowCount, isMetricTime]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-50 font-sans">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors btn-tactile cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
            <span>Voltar para Planilha</span>
          </button>

          <div className="h-5 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
              <BarChart2 className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 text-sm">Power BI Visual Studio</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {sheet.name}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs de Visualização */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            onClick={() => setActiveTab('kpi_charts')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all btn-tactile cursor-pointer ${
              activeTab === 'kpi_charts'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart2 className="size-3.5 text-emerald-600" />
            <span>Dashboard & KPIs</span>
          </button>
          <button
            onClick={() => setActiveTab('pivot_table')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all btn-tactile cursor-pointer ${
              activeTab === 'pivot_table'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Table className="size-3.5 text-indigo-600" />
            <span>Tabela Dinâmica</span>
          </button>
        </div>

        <button
          onClick={() => exportPivotReportToExcel(sheet, pivotResult, kpis, `Relatorio_${sheet.name}`)}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors btn-tactile cursor-pointer"
        >
          <Download className="size-3.5" />
          <span>Exportar Relatório</span>
        </button>
      </header>

      {/* Conteúdo Principal */}
      {!hasData ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4">
              <BarChart2 className="size-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Planilha sem dados para visualização</h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Para gerar gráficos analíticos e métricas no Power BI Studio, preencha dados na planilha ou carregue um modelo de exemplo.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {onLoadSampleSales && (
                <button
                  onClick={() => {
                    onLoadSampleSales();
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all btn-tactile cursor-pointer"
                >
                  <Sparkles className="size-4" />
                  <span>Carregar Dataset de Exemplo (Vendas 2026)</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all btn-tactile cursor-pointer"
              >
                <span>Voltar e preencher planilha</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Seletor de Dimensão e Métrica */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">Dimensão (Eixo X):</span>
                <select
                  value={selectedDimensionCol}
                  onChange={e => setSelectedDimensionCol(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                >
                  {columnProfiles.map(cp => (
                    <option key={cp.colIndex} value={cp.colIndex}>
                      {cp.colName} ({cp.inferredType})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">Métrica (Valores):</span>
                <select
                  value={selectedMetricCol}
                  onChange={e => setSelectedMetricCol(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:outline-hidden"
                >
                  {columnProfiles.map(cp => (
                    <option key={cp.colIndex} value={cp.colIndex}>
                      {cp.colName} ({cp.inferredType})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              ⚡ Sincronizado em tempo real com o Excel
            </span>
          </div>

          {/* Cards de KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-emerald-300 transition-all"
              >
                <div>
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">{kpi.title}</span>
                  <div className="mt-1 text-xl font-extrabold text-slate-900 font-mono tracking-tight">{kpi.value}</div>
                </div>
                <div className="flex size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 shadow-2xs">
                  {kpi.icon}
                </div>
              </div>
            ))}
          </div>

          {activeTab === 'kpi_charts' ? (
            /* Gráficos */
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Gráfico de Barras */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-slate-800 text-sm">
                    Distribuição: {activeDimensionProfile.colName} por {activeMetricProfile.colName}
                  </h4>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickFormatter={val => formatMetricValue(Number(val))}
                      />
                      <Tooltip
                        formatter={(val: any) => [formatMetricValue(Number(val)), activeMetricProfile.colName]}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                      />
                      <Bar dataKey="value" fill="#059669" radius={[8, 8, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico de Rosca */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-slate-800 text-sm">
                    Participação Percentual (%)
                  </h4>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={2}
                      >
                        {chartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) => [`${formatMetricValue(Number(val))} (${((Number(val) / (totalSum || 1)) * 100).toFixed(1)}%)`, activeMetricProfile.colName]}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : (
            /* Tabela Dinâmica View */
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Table className="size-4 text-emerald-600" />
                  <h4 className="font-bold text-slate-900 text-sm">
                    Matriz Dinâmica Calculada: {activeDimensionProfile.colName} × {activeMetricProfile.colName}
                  </h4>
                </div>
                <span className="text-xs font-mono text-slate-500 font-medium">
                  {chartData.length} categorias agrupadas
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                      <th className="p-3 border-r border-slate-200 font-semibold">{activeDimensionProfile.colName} (Categoria)</th>
                      <th className="p-3 border-r border-slate-200 text-right font-semibold">{activeMetricProfile.colName} ({selectedAggregation})</th>
                      <th className="p-3 text-right font-semibold">Participação %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {chartData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 border-r border-slate-100 font-sans font-medium text-slate-800">{item.name}</td>
                        <td className="p-3 border-r border-slate-100 text-right font-bold text-slate-900">{formatMetricValue(item.value)}</td>
                        <td className="p-3 text-right text-emerald-700 font-bold">{item.percent.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="bg-emerald-50/60 font-bold border-t-2 border-slate-300 text-slate-900">
                      <td className="p-3 border-r border-emerald-100 font-sans">Total Geral</td>
                      <td className="p-3 border-r border-emerald-100 text-right text-emerald-900 font-mono">{formatMetricValue(totalSum)}</td>
                      <td className="p-3 text-right font-mono text-emerald-900">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
