import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ComposedChart,
} from 'recharts';
import { BarChart3, ExternalLink, Copy, Check } from 'lucide-react';

export interface CopilotChartConfig {
  title: string;
  description?: string;
  type: 'bar' | 'line' | 'area' | 'pie' | 'composed';
  xAxisKey: string;
  yAxisLabel?: string;
  data: Array<{ [key: string]: any }>;
  series: Array<{
    key: string;
    name: string;
    color?: string;
    type?: 'bar' | 'line' | 'area';
  }>;
}

const DEFAULT_COLORS = [
  '#107c41', // Excel Green
  '#2563eb', // Blue
  '#f59e0b', // Amber
  '#7c3aed', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#14b8a6', // Teal
];

interface CopilotChartCardProps {
  chart: CopilotChartConfig;
  onOpenPowerBI?: () => void;
}

export const CopilotChartCard: React.FC<CopilotChartCardProps> = ({ chart, onOpenPowerBI }) => {
  const [copied, setCopied] = useState(false);

  if (!chart || !Array.isArray(chart.data) || chart.data.length === 0) {
    return null;
  }

  const handleCopyData = () => {
    try {
      const json = JSON.stringify(chart.data, null, 2);
      navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const formatTooltipValue = (value: any) => {
    if (typeof value === 'number') {
      if (value > 1000) {
        return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return value.toLocaleString('pt-BR');
    }
    return value;
  };

  const renderChart = () => {
    const series: Array<{ key: string; name: string; color?: string; type?: 'bar' | 'line' | 'area' }> =
      chart.series && chart.series.length > 0
        ? chart.series
        : Object.keys(chart.data[0] || {})
            .filter(k => k !== chart.xAxisKey && typeof chart.data[0][k] === 'number')
            .map((k, idx) => ({ key: k, name: k, color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length], type: 'bar' as const }));


    if (chart.type === 'pie') {
      const dataKey = series[0]?.key || Object.keys(chart.data[0])[1];
      return (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Tooltip
              formatter={(value: any) => [formatTooltipValue(value), '']}
              contentStyle={{ backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '6px' }} />
            <Pie
              data={chart.data}
              dataKey={dataKey}
              nameKey={chart.xAxisKey}
              cx="50%"
              cy="50%"
              outerRadius={75}
              innerRadius={30}
              paddingAngle={2}
            >
              {chart.data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chart.type === 'line') {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chart.data} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey={chart.xAxisKey} tick={{ fontSize: 10, fill: '#707070' }} angle={-25} textAnchor="end" interval={0} height={35} />
            <YAxis tick={{ fontSize: 10, fill: '#707070' }} />
            <Tooltip
              formatter={(value: any) => [formatTooltipValue(value), '']}
              contentStyle={{ backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
            {series.map((s, idx) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name || s.key}
                stroke={s.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chart.type === 'area') {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chart.data} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey={chart.xAxisKey} tick={{ fontSize: 10, fill: '#707070' }} angle={-25} textAnchor="end" interval={0} height={35} />
            <YAxis tick={{ fontSize: 10, fill: '#707070' }} />
            <Tooltip
              formatter={(value: any) => [formatTooltipValue(value), '']}
              contentStyle={{ backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
            {series.map((s, idx) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name || s.key}
                stroke={s.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]}
                fill={s.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]}
                fillOpacity={0.25}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (chart.type === 'composed') {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chart.data} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey={chart.xAxisKey} tick={{ fontSize: 10, fill: '#707070' }} angle={-25} textAnchor="end" interval={0} height={35} />
            <YAxis tick={{ fontSize: 10, fill: '#707070' }} />
            <Tooltip
              formatter={(value: any) => [formatTooltipValue(value), '']}
              contentStyle={{ backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
            {series.map((s, idx) => {
              const color = s.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
              if (s.type === 'line') {
                return (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.name || s.key} stroke={color} strokeWidth={2.5} dot={{ r: 3 }} />
                );
              }
              return (
                <Bar key={s.key} dataKey={s.key} name={s.name || s.key} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    // Default: Bar Chart
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chart.data} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey={chart.xAxisKey} tick={{ fontSize: 10, fill: '#707070' }} angle={-25} textAnchor="end" interval={0} height={35} />
          <YAxis tick={{ fontSize: 10, fill: '#707070' }} />
          <Tooltip
            formatter={(value: any) => [formatTooltipValue(value), '']}
            contentStyle={{ backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          />
          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
          {series.map((s, idx) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name || s.key}
              fill={s.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="mt-3 p-3 bg-white border border-[#e0e0e0] rounded-lg shadow-xs flex flex-col gap-2 font-sans select-none animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#f0f0f0] pb-2">
        <div className="flex items-center gap-1.5">
          <div className="size-5 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <BarChart3 className="size-3.5" />
          </div>
          <div>
            <h4 className="font-semibold text-xs text-[#242424] leading-none">{chart.title}</h4>
            {chart.description && (
              <p className="text-[10px] text-[#707070] mt-0.5">{chart.description}</p>
            )}
          </div>
        </div>
        <span className="text-[10px] bg-emerald-50 text-emerald-800 font-semibold px-1.5 py-0.5 rounded border border-emerald-200 uppercase">
          {chart.type}
        </span>
      </div>

      {/* Chart Canvas */}
      <div className="w-full pt-1">
        {renderChart()}
      </div>

      {/* Action Footer */}
      <div className="pt-2 border-t border-[#f0f0f0] flex items-center justify-between gap-2">
        <button
          onClick={handleCopyData}
          className="text-[11px] text-[#707070] hover:text-[#242424] flex items-center gap-1 cursor-pointer transition-colors"
        >
          {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
          <span>{copied ? 'Copiado!' : 'Copiar Dados'}</span>
        </button>

        {onOpenPowerBI && (
          <button
            onClick={onOpenPowerBI}
            className="px-2.5 py-1 bg-[#107c41] hover:bg-[#0e6b37] text-white rounded text-[11px] font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
          >
            <span>Abrir no Power BI Studio</span>
            <ExternalLink className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
};
