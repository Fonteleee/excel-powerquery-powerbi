/**
 * High-Resolution Canvas Chart Image Generator for Native Excel Embedding (.XLSX)
 * Generates crisp 2x Retina PNG charts (Bar & Donut/Pie) for direct embedding into Excel via ExcelJS.
 */

export interface ChartDataItem {
  name: string;
  value: number;
  percent?: number;
}

const CATEGORY_COLORS = [
  '#059669', // Emerald
  '#2563eb', // Royal Blue
  '#d97706', // Amber
  '#7c3aed', // Purple
  '#ec4899', // Pink
  '#0891b2', // Cyan
  '#ea580c', // Orange
  '#4f46e5', // Indigo
  '#16a34a', // Green
  '#64748b', // Slate
];

/**
 * Generates a high-resolution Bar Chart PNG image as base64 string
 */
export function generateBarChartImage(
  data: ChartDataItem[],
  options: {
    title: string;
    metricLabel?: string;
    formatValue?: (val: number) => string;
    width?: number;
    height?: number;
  }
): string {
  const width = options.width || 800;
  const height = options.height || 450;
  const scale = 2; // 2x Retina rendering

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Card border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  // Header Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
  ctx.fillText(options.title, 30, 42);

  // Subtitle
  if (options.metricLabel) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.fillText(options.metricLabel, 30, 62);
  }

  const items = data.slice(0, 10);
  if (items.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'italic 14px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Nenhum dado para exibir no gráfico', 30, 120);
    return canvas.toDataURL('image/png');
  }

  const maxVal = Math.max(...items.map(d => d.value), 1);
  const plotX = 70;
  const plotY = 90;
  const plotW = width - 110;
  const plotH = height - 160;

  // Draw horizontal grid lines
  const gridLines = 4;
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridLines; i++) {
    const y = plotY + (plotH / gridLines) * i;
    const val = maxVal * (1 - i / gridLines);
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotW, y);
    ctx.stroke();

    const formatted = options.formatValue ? options.formatValue(val) : Math.round(val).toString();
    ctx.fillText(formatted, plotX - 8, y + 4);
  }

  // Draw Bars
  const barCount = items.length;
  const barGap = 16;
  const barWidth = Math.min(Math.max((plotW - (barCount + 1) * barGap) / barCount, 20), 60);
  const totalBarsWidth = barCount * barWidth + (barCount - 1) * barGap;
  const startX = plotX + (plotW - totalBarsWidth) / 2;

  items.forEach((item, idx) => {
    const x = startX + idx * (barWidth + barGap);
    const barH = Math.max((item.value / maxVal) * plotH, 4);
    const y = plotY + plotH - barH;

    // Bar gradient
    const grad = ctx.createLinearGradient(x, y, x, plotY + plotH);
    grad.addColorStop(0, '#059669');
    grad.addColorStop(1, '#10b981');

    ctx.fillStyle = grad;
    // Rounded top corners
    const r = Math.min(6, barWidth / 2);
    ctx.beginPath();
    ctx.moveTo(x, plotY + plotH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + barWidth - r, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
    ctx.lineTo(x + barWidth, plotY + plotH);
    ctx.closePath();
    ctx.fill();

    // Value label above bar
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    const valStr = options.formatValue ? options.formatValue(item.value) : item.value.toString();
    ctx.fillText(valStr, x + barWidth / 2, y - 6);

    // Category Label below bar
    ctx.fillStyle = '#334155';
    ctx.font = '500 11px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    const rawName = item.name.length > 12 ? item.name.substring(0, 10) + '..' : item.name;
    ctx.fillText(rawName, x + barWidth / 2, plotY + plotH + 18);
  });

  return canvas.toDataURL('image/png');
}

/**
 * Generates a high-resolution Donut / Pie Chart PNG image as base64 string
 */
export function generateDonutChartImage(
  data: ChartDataItem[],
  options: {
    title: string;
    totalSum?: number;
    formatValue?: (val: number) => string;
    width?: number;
    height?: number;
  }
): string {
  const width = options.width || 800;
  const height = options.height || 450;
  const scale = 2; // 2x Retina rendering

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Card border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  // Header Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
  ctx.fillText(options.title, 30, 42);

  const items = data.slice(0, 8);
  if (items.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'italic 14px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Nenhum dado para exibir no gráfico', 30, 120);
    return canvas.toDataURL('image/png');
  }

  const total = options.totalSum || items.reduce((a, b) => a + b.value, 0) || 1;
  const centerX = 230;
  const centerY = 240;
  const outerRadius = 140;
  const innerRadius = 85;

  let currentAngle = -Math.PI / 2;

  // Draw Donut segments
  items.forEach((item, idx) => {
    const sliceAngle = (item.value / total) * (Math.PI * 2);
    const endAngle = currentAngle + sliceAngle;
    const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];

    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, currentAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, currentAngle, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    currentAngle = endAngle;
  });

  // Center Total Card
  ctx.fillStyle = '#64748b';
  ctx.font = '11px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TOTAL', centerX, centerY - 8);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
  const totalFormatted = options.formatValue ? options.formatValue(total) : total.toString();
  ctx.fillText(totalFormatted, centerX, centerY + 12);

  // Draw Legend on the right side
  const legendX = 430;
  let legendY = 90;
  const rowHeight = 36;

  items.forEach((item, idx) => {
    const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
    const pct = ((item.value / total) * 100).toFixed(1);

    // Color marker
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(legendX, legendY + 2, 14, 14, 4);
    ctx.fill();

    // Category name
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    const label = item.name.length > 20 ? item.name.substring(0, 18) + '...' : item.name;
    ctx.fillText(label, legendX + 22, legendY + 14);

    // Value and Percentage
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    const valStr = options.formatValue ? options.formatValue(item.value) : item.value.toString();
    ctx.fillText(`${valStr} (${pct}%)`, legendX + 22, legendY + 28);

    legendY += rowHeight;
  });

  return canvas.toDataURL('image/png');
}
