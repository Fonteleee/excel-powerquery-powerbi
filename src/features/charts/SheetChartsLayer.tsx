// src/features/charts/SheetChartsLayer.tsx
// Gráficos desenhados dentro da planilha: arrastar para mover, canto inferior direito para redimensionar,
// tipo e exclusão na barra do gráfico. Eles leem as células e se atualizam quando os dados mudam.

import React, { useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Sheet, SheetChart, SheetChartType } from '../../types/spreadsheet';
import { CHART_COLORS, chartModel } from './chartData';

const MIN_W = 240;
const MIN_H = 160;

const TYPE_LABELS: Record<SheetChartType, string> = { bar: 'Barras', line: 'Linhas', area: 'Área', pie: 'Pizza' };

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ChartCardProps {
  sheet: Sheet;
  chart: SheetChart;
  onCommit: (next: SheetChart) => void;
  onDelete: () => void;
}

const ChartBody: React.FC<{ sheet: Sheet; chart: SheetChart }> = ({ sheet, chart }) => {
  const model = useMemo(() => chartModel(sheet, chart), [sheet, chart]);
  if (!model.ok) {
    return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-rose-700">{model.error}</div>;
  }
  const common = { data: model.data, margin: { top: 8, right: 12, left: 0, bottom: 4 } };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey={model.xKey} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
      <YAxis tick={{ fontSize: 11 }} width={48} />
      <Tooltip />
      {model.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
    </>
  );
  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart.type === 'pie' ? (
        <PieChart>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Pie data={model.data} dataKey={model.series[0].key} nameKey={model.xKey} outerRadius="75%" label={false}>
            {model.data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      ) : chart.type === 'line' ? (
        <LineChart {...common}>
          {axes}
          {model.series.map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={model.data.length < 30} isAnimationActive={false} />
          ))}
        </LineChart>
      ) : chart.type === 'area' ? (
        <AreaChart {...common}>
          {axes}
          {model.series.map(s => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={0.25} isAnimationActive={false} />
          ))}
        </AreaChart>
      ) : (
        <BarChart {...common}>
          {axes}
          {model.series.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
};

const ChartCard: React.FC<ChartCardProps> = ({ sheet, chart, onCommit, onDelete }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Geometry | null>(null);
  const geo: Geometry = draft ?? chart;

  /** O grid usa CSS zoom: um pixel do mouse vale menos (ou mais) pixels dentro da planilha. */
  const scale = (): number => {
    const el = cardRef.current;
    return el && el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1;
  };

  const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent<HTMLElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const start = { px: e.clientX, py: e.clientY, ...chart };
    const k = scale() || 1;
    let latest: Geometry = { x: chart.x, y: chart.y, width: chart.width, height: chart.height };
    const move = (ev: PointerEvent): void => {
      const dx = (ev.clientX - start.px) / k;
      const dy = (ev.clientY - start.py) / k;
      latest =
        mode === 'move'
          ? { x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy), width: start.width, height: start.height }
          : { x: start.x, y: start.y, width: Math.max(MIN_W, start.width + dx), height: Math.max(MIN_H, start.height + dy) };
      setDraft(latest);
    };
    const up = (): void => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setDraft(null);
      onCommit({ ...chart, x: Math.round(latest.x), y: Math.round(latest.y), width: Math.round(latest.width), height: Math.round(latest.height) });
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  return (
    <div
      ref={cardRef}
      role="figure"
      aria-label={`Gráfico: ${chart.title}`}
      style={{ left: geo.x, top: geo.y, width: geo.width, height: geo.height }}
      className="pointer-events-auto absolute z-20 flex flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg"
    >
      <div onPointerDown={startDrag('move')} className="flex cursor-move touch-none items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800" title={`${chart.title} (${chart.range})`}>
          {chart.title}
        </span>
        <select
          value={chart.type}
          onPointerDown={e => e.stopPropagation()}
          onChange={e => onCommit({ ...chart, type: e.target.value as SheetChartType })}
          aria-label="Tipo de gráfico"
          className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-700"
        >
          {(Object.keys(TYPE_LABELS) as SheetChartType[]).map(t => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={onDelete}
          aria-label="Excluir gráfico"
          title="Excluir gráfico"
          className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 p-1">
        <ChartBody sheet={sheet} chart={chart} />
      </div>
      <div
        onPointerDown={startDrag('resize')}
        title="Arraste para redimensionar"
        className="absolute bottom-0 right-0 size-4 cursor-se-resize touch-none"
        style={{ background: 'linear-gradient(135deg, transparent 50%, #94a3b8 50%)' }}
      />
    </div>
  );
};

interface SheetChartsLayerProps {
  sheet: Sheet;
  onUpdateSheet: (sheet: Sheet) => void;
}

export const SheetChartsLayer: React.FC<SheetChartsLayerProps> = ({ sheet, onUpdateSheet }) => {
  const charts = sheet.charts ?? [];
  if (charts.length === 0) return null;
  const replace = (next: SheetChart): void => onUpdateSheet({ ...sheet, charts: charts.map(c => (c.id === next.id ? next : c)) });
  const remove = (id: string): void => onUpdateSheet({ ...sheet, charts: charts.filter(c => c.id !== id) });
  return (
    <div className="pointer-events-none absolute left-0 top-0 h-0 w-0" data-sheet-charts>
      {charts.map(chart => (
        <ChartCard key={chart.id} sheet={sheet} chart={chart} onCommit={replace} onDelete={() => remove(chart.id)} />
      ))}
    </div>
  );
};
