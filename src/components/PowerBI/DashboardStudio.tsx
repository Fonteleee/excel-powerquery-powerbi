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
}


export const DashboardStudio: React.FC<DashboardStudioProps> = ({ sheet, onClose }) => {
  const [activeTab, setActiveTab] = useState<'kpi_charts' | 'pivot_table' | 'ai_assistant'>('kpi_charts');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  // Extract columns
  const columnProfiles = useMemo(() => {
    return profileSheetColumns(sheet, 0);
  }, [sheet]);

  // Dynamic Selected Dimension (X-Axis / Slice) & Metric (Y-Axis / Value)
  const defaultDimensionCol = useMemo(() => {
    const textCol = columnProfiles.find(cp => cp.inferredType === 'text' && cp.colIndex !== 0);
    if (textCol) return textCol.colIndex;
    return columnProfiles[0]?.colIndex ?? 0;
  }, [columnProfiles]);

  const defaultMetricCol = useMemo(() => {
    const numOrTimeCol = columnProfiles.find(
      cp => cp.inferredType === 'currency' || cp.inferredType === 'number' || /tempo|hora|pausa|logado/i.test(cp.colName)
    );
    if (numOrTimeCol) return numOrTimeCol.colIndex;
    return columnProfiles[1]?.colIndex ?? 1;
  }, [columnProfiles]);

  const [selectedDimensionCol, setSelectedDimensionCol] = useState<number>(defaultDimensionCol);
  const [selectedMetricCol, setSelectedMetricCol] = useState<number>(defaultMetricCol);
  const [selectedAggregation, setSelectedAggregation] = useState<AggregationType>('SUM');

  // Active Metric Column Profile
  const activeMetricProfile = useMemo(() => {
    return columnProfiles.find(cp => cp.colIndex === selectedMetricCol) || columnProfiles[0];
  }, [columnProfiles, selectedMetricCol]);

  const activeDimensionProfile = useMemo(() => {
    return columnProfiles.find(cp => cp.colIndex === selectedDimensionCol) || columnProfiles[0];
  }, [columnProfiles, selectedDimensionCol]);

  // Is metric a Time/Clock column?
  const isMetricTime = useMemo(() => {
    const name = activeMetricProfile?.colName?.toLowerCase() || '';
    const hasTimeKeyword = /tempo|hora|pausa|logado|dura[cç][aã]o|perman[eê]ncia|chamada|atendimento|time/i.test(name);
    return hasTimeKeyword;
  }, [activeMetricProfile]);

  // Is metric Currency?
  const isMetricCurrency = useMemo(() => {
    const name = activeMetricProfile?.colName?.toLowerCase() || '';
    const isExplicitCur = activeMetricProfile?.inferredType === 'currency';
    const hasCurKeyword = /pre[cç]o|valor|sal[aá]rio|faturamento|custo|lucro|receita|venda|r\$/i.test(name) && !isMetricTime;
    return isExplicitCur || hasCurKeyword;
  }, [activeMetricProfile, isMetricTime]);

  // Helper to format values according to metric type
  const formatMetricValue = (val: number, isAverage = false): string => {
    if (isMetricTime) {
      return formatSecondsToTime(Math.round(val), 'time_hh_mm_ss');
    }
    if (isMetricCurrency) {
      return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (selectedAggregation === 'COUNT') {
      return `${Math.round(val)} registros`;
    }
    return val.toLocaleString('pt-BR', {
      minimumFractionDigits: isAverage ? 2 : (Number.isInteger(val) ? 0 : 2),
      maximumFractionDigits: 2,
    });
  };

  // Generate dynamic aggregated chart data based on user selected dimension and metric
  const { chartData, topChartData, totalSum, avgVal, maxCategory, rowCount } = useMemo(() => {
    const aggMap = new Map<string, { sum: number; count: number; max: number; min: number }>();
    let total = 0;
    let validCount = 0;

    for (let r = 1; r < sheet.rowCount; r++) {
      const dimRaw = getCellValue(sheet, r, selectedDimensionCol);
      const metRaw = getCellValue(sheet, r, selectedMetricCol);

      if (dimRaw !== null && dimRaw !== undefined && String(dimRaw).trim() !== '') {
        const dimKey = String(dimRaw).trim();

        let numVal: number | null = null;

        if (isMetricTime) {
          if (metRaw !== null && metRaw !== undefined && String(metRaw).trim() !== '') {
            numVal = valueToSeconds(metRaw);
          }
        } else {
          numVal = parseNumberSafely(metRaw);
        }

        const effectiveVal = numVal !== null ? numVal : (selectedAggregation === 'COUNT' ? 1 : 0);

        if (!aggMap.has(dimKey)) {
          aggMap.set(dimKey, { sum: 0, count: 0, max: -Infinity, min: Infinity });
        }

        const entry = aggMap.get(dimKey)!;
        entry.sum += effectiveVal;
        entry.count += 1;
        if (effectiveVal > entry.max) entry.max = effectiveVal;
        if (effectiveVal < entry.min) entry.min = effectiveVal;

        total += effectiveVal;
        validCount++;
      }
    }

    const items = Array.from(aggMap.entries()).map(([name, stat]) => {
      let finalVal = stat.sum;
      if (selectedAggregation === 'AVERAGE') finalVal = stat.count > 0 ? stat.sum / stat.count : 0;
      else if (selectedAggregation === 'COUNT') finalVal = stat.count;
      else if (selectedAggregation === 'MAX') finalVal = stat.max !== -Infinity ? stat.max : 0;
      else if (selectedAggregation === 'MIN') finalVal = stat.min !== Infinity ? stat.min : 0;

      return {
        name,
        value: finalVal,
        rawCount: stat.count,
        percent: total > 0 ? (stat.sum / total) * 100 : 0,
      };
    });

    items.sort((a, b) => b.value - a.value);

    let topItems = [...items];
    if (items.length > 7) {
      const top6 = items.slice(0, 6);
      const otherSum = items.slice(6).reduce((acc, curr) => acc + curr.value, 0);
      const otherPercent = items.slice(6).reduce((acc, curr) => acc + curr.percent, 0);
      topItems = [
        ...top6,
        {
          name: 'Outros',
          value: otherSum,
          rawCount: items.slice(6).reduce((acc, curr) => acc + curr.rawCount, 0),
          percent: otherPercent,
        },
      ];
    }

    const average = validCount > 0 ? total / validCount : 0;

    return {
      chartData: items,
      topChartData: topItems,
      totalSum: total,
      avgVal: average,
      maxCategory: items[0] || null,
      rowCount: validCount,
    };
  }, [sheet, selectedDimensionCol, selectedMetricCol, selectedAggregation, isMetricTime]);

  const chartColors = [
    '#107c41', '#0284c7', '#d97706', '#7c3aed', '#db2777', '#059669',
    '#ea580c', '#4f46e5', '#0891b2', '#ca8a04', '#64748b',
  ];

  const pivotConfig = useMemo(() => ({
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
    { title: `Total ${activeMetricProfile.colName}`, value: formatMetricValue(totalSum) },
    { title: 'Média por Registro', value: formatMetricValue(avgVal, true) },
    { title: 'Maior Categoria', value: maxCategory?.name || 'N/A' },
    { title: 'Total de Linhas', value: `${rowCount}` },
  ], [activeMetricProfile, totalSum, avgVal, maxCategory, rowCount]);

  const [chatMessages, setChatMessages] = useState<{ sender: 'ai' | 'user'; text: string }[]>([
    {
      sender: 'ai',
      text: 'Olá! Sou o Assistente de Dados do Power BI Studio. Posso responder perguntas sobre seus dados, ranking de colaboradores, tempos de atendimento e gerar insights automáticos.',
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState('');

  const handleSendQuestion = () => {
    if (!inputQuestion.trim()) return;

    const userText = inputQuestion.trim();
    setChatMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setInputQuestion('');

    setTimeout(() => {
      let reply = '';
      const lower = userText.toLowerCase();

      if (lower.includes('maior') || lower.includes('top') || lower.includes('destaque') || lower.includes('ranking')) {
        if (maxCategory) {
          reply = `🏆 O maior destaque em **${activeDimensionProfile.colName}** é **${maxCategory.name}** com **${formatMetricValue(maxCategory.value)}** (${maxCategory.percent.toFixed(1)}% do todo). Em segundo lugar está **${chartData[1]?.name || 'N/A'}** com **${chartData[1] ? formatMetricValue(chartData[1].value) : '0'}**.`;
        } else {
          reply = 'Não identifiquei dados suficientes para calcular o ranking.';
        }
      } else if (lower.includes('total') || lower.includes('soma')) {
        reply = `📊 O total acumulado de **${activeMetricProfile.colName}** é de **${formatMetricValue(totalSum)}** distribuído em **${rowCount}** registros analisados.`;
      } else if (lower.includes('média') || lower.includes('media')) {
        reply = `📈 A média geral por registro em **${activeMetricProfile.colName}** é de **${formatMetricValue(avgVal, true)}**.`;
      } else {
        reply = `Entendido! Analisando **${sheet.name}**: temos **${rowCount}** linhas e **${chartData.length}** categorias distintas em **${activeDimensionProfile.colName}**. O maior valor é **${maxCategory ? maxCategory.name : 'N/A'}** com **${maxCategory ? formatMetricValue(maxCategory.value) : '0'}**.`;
      }

      setChatMessages(prev => [...prev, { sender: 'ai', text: reply }]);
    }, 400);
  };

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] text-slate-900 select-none overflow-hidden font-sans">
      {/* 1. TOP HEADER */}
      <div className="h-12 px-4 bg-[#ffffff] border-b border-slate-200 flex items-center justify-between shadow-xs z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
            <span>Voltar para Planilha</span>
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-2.5">
            {/* 3D Brand Emblem */}
            <div className="relative size-7 rounded-lg overflow-hidden border border-amber-200 shadow-xs emblem-glint group cursor-pointer">
              <img
                src={brandEmblem}
                alt="Vertex Emblem"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-xs font-extrabold text-slate-900 font-mono">POWER BI</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-mono font-bold border border-amber-200">
                  COCKPIT
                </span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono mt-0.5">({sheet.name})</span>
            </div>
          </div>
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
          <button
            onClick={() => setActiveTab('kpi_charts')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'kpi_charts' ? 'bg-amber-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <BarChart2 className="size-3.5" /> Dashboard
          </button>
          <button
            onClick={() => setActiveTab('pivot_table')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'pivot_table' ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Table className="size-3.5" /> Matriz
          </button>
          <button
            onClick={() => setActiveTab('ai_assistant')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'ai_assistant' ? 'bg-purple-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Sparkles className="size-3.5" /> IA
          </button>
        </div>

        <button
          onClick={() => exportPivotReportToExcel(sheet, pivotResult, kpis, `PowerBI_${sheet.name}`)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
        >
          <BespokeExportIcon size={14} /> Exportar XLSX
        </button>
      </div>


      {/* 2. FIELD WELLS */}
      <div className="h-12 px-4 bg-[#f8fafc] border-b border-slate-200 flex items-center justify-between gap-4 text-xs text-slate-700">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold text-[11px]">Dimensão (Eixo X):</span>
            <select
              value={selectedDimensionCol}
              onChange={e => setSelectedDimensionCol(parseInt(e.target.value, 10))}
              className="h-7 px-2.5 bg-white border border-slate-300 rounded-md font-semibold text-slate-800 focus:outline-hidden focus:border-amber-500 cursor-pointer shadow-2xs"
            >
              {columnProfiles.map(cp => <option key={cp.colIndex} value={cp.colIndex} className="bg-white text-slate-900">{cp.colName}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold text-[11px]">Métrica (Valores):</span>
            <select
              value={selectedMetricCol}
              onChange={e => setSelectedMetricCol(parseInt(e.target.value, 10))}
              className="h-7 px-2.5 bg-white border border-slate-300 rounded-md font-semibold text-slate-800 focus:outline-hidden focus:border-amber-500 cursor-pointer shadow-2xs"
            >
              {columnProfiles.map(cp => <option key={cp.colIndex} value={cp.colIndex} className="bg-white text-slate-900">{cp.colName}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold text-[11px]">Cálculo:</span>
            <select
              value={selectedAggregation}
              onChange={e => setSelectedAggregation(e.target.value as AggregationType)}
              className="h-7 px-2.5 bg-white border border-slate-300 rounded-md font-semibold text-slate-800 focus:outline-hidden focus:border-amber-500 cursor-pointer shadow-2xs"
            >
              <option value="SUM" className="bg-white text-slate-900">Soma (Total)</option>
              <option value="AVERAGE" className="bg-white text-slate-900">Média</option>
              <option value="COUNT" className="bg-white text-slate-900">Contagem</option>
              <option value="MAX" className="bg-white text-slate-900">Máximo</option>
              <option value="MIN" className="bg-white text-slate-900">Mínimo</option>
            </select>
          </div>
        </div>

        {filterCategory && (
          <button
            onClick={() => setFilterCategory(null)}
            className="text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 cursor-pointer"
          >
            ✕ Limpar Filtro ({filterCategory})
          </button>
        )}
      </div>

      {/* 3. DASHBOARD BODY */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {activeTab === 'kpi_charts' && (
          <div className="space-y-4 max-w-7xl mx-auto">
            {/* 4 KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 truncate max-w-[180px]">Total {activeMetricProfile.colName}</span>
                  <div className="p-1.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                    {isMetricTime ? <Clock className="size-4" /> : isMetricCurrency ? <DollarSign className="size-4" /> : <Hash className="size-4" />}
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">{formatMetricValue(totalSum)}</div>
                <div className="text-[11px] text-slate-500 font-sans">Soma acumulada</div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 truncate max-w-[180px]">Média por Registro</span>
                  <div className="p-1.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200"><Activity className="size-4" /></div>
                </div>
                <div className="text-2xl font-bold font-mono text-sky-700 tabular-nums">{formatMetricValue(avgVal, true)}</div>
                <div className="text-[11px] text-slate-500 font-sans">Média calculada sobre {rowCount} itens</div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 truncate max-w-[180px]">Maior Categoria</span>
                  <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"><TrendingUp className="size-4" /></div>
                </div>
                <div className="text-xl font-bold font-mono text-emerald-700 truncate">{maxCategory?.name || 'N/A'}</div>
                <div className="text-[11px] text-slate-500 font-sans">Valor: <strong className="text-slate-900">{maxCategory ? formatMetricValue(maxCategory.value) : '0'}</strong></div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Total de Linhas</span>
                  <div className="p-1.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200"><Layers className="size-4" /></div>
                </div>
                <div className="text-2xl font-bold font-mono text-purple-700 tabular-nums">{rowCount} <span className="text-sm font-sans font-normal text-slate-500">linhas</span></div>
                <div className="text-[11px] text-slate-500 font-sans">{chartData.length} categorias distintas</div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Distribuição de {activeMetricProfile.colName} por {activeDimensionProfile.colName}
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.slice(0, 15)} margin={{ top: 10, right: 10, bottom: 40 }}>
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} angle={-30} textAnchor="end" interval={0} height={50} />
                      <YAxis
                        stroke="#64748b"
                        fontSize={10}
                        tickFormatter={(v: number) => isMetricTime ? `${Math.round(v / 3600)}h` : isMetricCurrency ? `R$${v}` : String(v)}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(val: any) => [formatMetricValue(Number(val)), activeMetricProfile.colName]}
                      />
                      <Bar dataKey="value" onClick={(e: any) => setFilterCategory(e.name)} className="cursor-pointer" radius={[4, 4, 0, 0]}>
                        {chartData.slice(0, 15).map((entry, i) => (
                          <Cell key={i} fill={chartColors[i % chartColors.length]} opacity={filterCategory && filterCategory !== entry.name ? 0.3 : 1} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Participação Percentual (%)</h3>
                <div className="h-64 w-full flex items-center justify-between gap-4">
                  <div className="h-full w-1/2 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPie>
                        <Pie data={topChartData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {topChartData.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          formatter={(val: any) => [formatMetricValue(Number(val)), 'Valor']}
                        />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>

                  <div className="w-1/2 overflow-y-auto max-h-56 pr-2 space-y-1 text-xs">
                    {topChartData.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => setFilterCategory(item.name !== 'Outros' ? item.name : null)}
                        className={`flex items-center justify-between p-2 rounded-md transition-colors cursor-pointer ${
                          filterCategory === item.name ? 'bg-amber-100 font-bold text-amber-900' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate max-w-[120px]">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                          />
                          <span className="truncate text-slate-900 text-xs font-semibold">{item.name}</span>
                        </div>
                        <span className="font-mono text-xs font-semibold text-slate-600">{item.percent.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PIVOT TABLE TAB */}
        {activeTab === 'pivot_table' && (
          <div className="max-w-7xl mx-auto bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Table className="size-4 text-emerald-700" /> Matriz de Dados
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-2.5 text-left text-slate-800 font-bold border-r border-slate-200">{activeDimensionProfile.colName}</th>
                    <th className="p-2.5 text-right text-slate-800 font-bold border-r border-slate-200">Total {activeMetricProfile.colName}</th>
                    <th className="p-2.5 text-right text-slate-800 font-bold border-r border-slate-200">Qtd Linhas</th>
                    <th className="p-2.5 text-right text-slate-800 font-bold">% do Total</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 text-left font-sans text-slate-900 font-medium border-r border-slate-100">{row.name}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-800 border-r border-slate-100 tabular-nums">{formatMetricValue(row.value)}</td>
                      <td className="p-2.5 text-right text-slate-600 border-r border-slate-100 tabular-nums">{row.rawCount}</td>
                      <td className="p-2.5 text-right text-slate-600 font-semibold tabular-nums">{row.percent.toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-200">
                    <td className="p-2.5 text-left font-sans text-slate-900 border-r border-slate-200">Total Geral</td>
                    <td className="p-2.5 text-right text-emerald-800 border-r border-slate-200 tabular-nums">{formatMetricValue(totalSum)}</td>
                    <td className="p-2.5 text-right text-slate-900 border-r border-slate-200 tabular-nums">{rowCount}</td>
                    <td className="p-2.5 text-right text-slate-900 tabular-nums">100,0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AI ASSISTANT TAB */}
        {activeTab === 'ai_assistant' && (
          <div className="max-w-3xl mx-auto bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col h-[480px] overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-md bg-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="size-3.5" />
                </div>
                <span className="text-xs font-bold text-slate-900">Assistente Analítico de Dados</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3.5 rounded-xl text-xs leading-relaxed ${msg.sender === 'user' ? 'bg-purple-600 text-white font-medium shadow-xs' : 'bg-slate-100 text-slate-800 border border-slate-200'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3.5 border-t border-slate-200 bg-white flex items-center gap-2">
              <input
                type="text"
                value={inputQuestion}
                onChange={e => setInputQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendQuestion()}
                placeholder="Ex: Qual atendente teve maior tempo logado? Qual a média?"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-purple-600"
              />
              <button
                onClick={handleSendQuestion}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Send className="size-3.5" />
                <span>Perguntar</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


