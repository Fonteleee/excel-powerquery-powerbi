// src/features/charts/chartPng.ts
// Desenha um gráfico da planilha como imagem PNG (canvas), para ir dentro do arquivo .xlsx.

import { Sheet, SheetChart } from '../../types/spreadsheet';
import { chartModel } from './chartData';

const SCALE = 2;

const compact = (v: number): string => (Math.abs(v) >= 1000 ? v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }) : String(Math.round(v * 100) / 100));

/** PNG (data URL) do gráfico; null quando o gráfico não tem dados ou o navegador não tem canvas. */
export function chartToPngDataUrl(sheet: Sheet, chart: SheetChart): string | null {
  if (typeof document === 'undefined') return null;
  const model = chartModel(sheet, chart);
  if (!model.ok) return null;
  const width = Math.round(chart.width);
  const height = Math.round(chart.height);
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.textBaseline = 'top';
  ctx.fillText(chart.title, 12, 10, width - 24);

  const top = 36;
  const legendH = model.series.length > 1 && chart.type !== 'pie' ? 22 : 0;
  const left = 52;
  const plot = { x: left, y: top, w: width - left - 14, h: height - top - legendH - 30 };
  ctx.font = '11px sans-serif';

  if (chart.type === 'pie') {
    const key = model.series[0].key;
    const total = model.data.reduce((sum, d) => sum + Math.max(0, Number(d[key]) || 0), 0) || 1;
    const radius = Math.max(10, Math.min(width, height - top - legendH - 8) / 2 - 12);
    const cx = width / 2;
    const cy = top + (height - top - legendH) / 2;
    let angle = -Math.PI / 2;
    model.data.forEach((d, i) => {
      const part = (Math.max(0, Number(d[key]) || 0) / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, angle, angle + part);
      ctx.closePath();
      ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length];
      ctx.fill();
      angle += part;
    });
    return canvas.toDataURL('image/png');
  }

  const all = model.data.flatMap(d => model.series.map(s => Number(d[s.key]) || 0));
  const max = Math.max(...all, 0) || 1;
  const min = Math.min(...all, 0);
  const span = max - min || 1;
  const y = (v: number): number => plot.y + plot.h - ((v - min) / span) * plot.h;
  ctx.strokeStyle = '#e2e8f0';
  ctx.fillStyle = '#64748b';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = min + (span * i) / 4;
    ctx.beginPath();
    ctx.moveTo(plot.x, y(v));
    ctx.lineTo(plot.x + plot.w, y(v));
    ctx.stroke();
    ctx.fillText(compact(v), plot.x - 6, y(v));
  }
  const n = model.data.length;
  const slot = plot.w / n;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plot.w / 56))));
  model.data.forEach((d, i) => {
    if (i % every === 0) ctx.fillText(String(d[model.xKey]).slice(0, 10), plot.x + slot * i + slot / 2, plot.y + plot.h + 6);
  });

  model.series.forEach((s, si) => {
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    if (chart.type === 'bar') {
      const bar = (slot * 0.7) / model.series.length;
      model.data.forEach((d, i) => {
        const v = Number(d[s.key]) || 0;
        ctx.fillRect(plot.x + slot * i + slot * 0.15 + bar * si, Math.min(y(v), y(0)), Math.max(1, bar - 1), Math.abs(y(v) - y(0)));
      });
      return;
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    model.data.forEach((d, i) => {
      const px = plot.x + slot * i + slot / 2;
      if (i === 0) ctx.moveTo(px, y(Number(d[s.key]) || 0));
      else ctx.lineTo(px, y(Number(d[s.key]) || 0));
    });
    ctx.stroke();
    if (chart.type === 'area') {
      ctx.lineTo(plot.x + slot * (n - 1) + slot / 2, y(0));
      ctx.lineTo(plot.x + slot / 2, y(0));
      ctx.closePath();
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  });

  if (legendH) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let lx = 14;
    model.series.forEach(s => {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, height - 16, 10, 10);
      ctx.fillStyle = '#334155';
      ctx.fillText(s.name, lx + 14, height - 11);
      lx += 28 + ctx.measureText(s.name).width;
    });
  }
  return canvas.toDataURL('image/png');
}

const PIE_COLORS = ['#107c41', '#2563eb', '#f59e0b', '#7c3aed', '#ec4899', '#06b6d4', '#14b8a6', '#ef4444'];
