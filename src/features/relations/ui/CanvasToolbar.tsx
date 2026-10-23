// src/features/relations/ui/CanvasToolbar.tsx
// Barra de ações do canvas, controles de zoom e legenda dos cabos (cor + ícone + rótulo).

import React, { useState } from 'react';
import { ChevronDown, Database, Funnel, Link2, Maximize2, Minus, Play, Plus, Search, Sigma, Table2, TriangleAlert, FileOutput } from 'lucide-react';
import { TransformParams } from '../model/graph';
import { CABLES, CableTone } from './tokens';

interface ToolbarProps {
  availableSheets: { id: string; name: string }[];
  showKeysOnly: boolean;
  outputCount: number;
  errorCount: number;
  onAddTable: (sheetId: string) => void;
  onNewTable: () => void;
  onAddTransform: (op: TransformParams['op']) => void;
  onAddOutput: () => void;
  onToggleKeysOnly: (value: boolean) => void;
  onRun: () => void;
}

const btn =
  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[length:var(--rel-text-body)] font-bold transition-colors';

export const CanvasToolbar: React.FC<ToolbarProps> = ({
  availableSheets, showKeysOnly, outputCount, errorCount, onAddTable, onNewTable, onAddTransform, onAddOutput, onToggleKeysOnly, onRun,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="relative z-30 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <div className="relative">
        <button type="button" onClick={() => setMenuOpen(v => !v)} aria-haspopup="menu" aria-expanded={menuOpen} className={`${btn} border-cyan-300 bg-cyan-50 text-cyan-900 hover:bg-cyan-100`}>
          <Table2 className="size-4" aria-hidden /> Tabela <ChevronDown className="size-3.5" aria-hidden />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onPointerDown={() => setMenuOpen(false)} aria-hidden />
            <div role="menu" className="rel-popover absolute left-0 top-full z-40 mt-1 w-64 p-1">
              {availableSheets.length === 0 && (
                <div className="px-3 py-2 text-[length:var(--rel-text-caption)] text-slate-700">Todas as planilhas já estão no fluxo.</div>
              )}
              {availableSheets.map(sheet => (
                <button
                  key={sheet.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAddTable(sheet.id);
                    setMenuOpen(false);
                  }}
                  className="block w-full truncate rounded-lg px-3 py-1.5 text-left text-[length:var(--rel-text-body)] font-semibold hover:bg-slate-100"
                >
                  {sheet.name}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onNewTable();
                  setMenuOpen(false);
                }}
                className="mt-1 flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-left text-[length:var(--rel-text-body)] font-bold text-indigo-800 hover:bg-indigo-50"
              >
                <Plus className="size-4" aria-hidden /> Nova ou importar…
              </button>
            </div>
          </>
        )}
      </div>

      <button type="button" onClick={() => onAddTransform('lookup')} className={`${btn} border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100`} title="Buscar valores de outra tabela (PROCX)">
        <Search className="size-4" aria-hidden /> Buscar
      </button>
      <button type="button" onClick={() => onAddTransform('aggregate')} className={`${btn} border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100`} title="Somar, contar ou tirar a média por grupo (SOMASE)">
        <Sigma className="size-4" aria-hidden /> Agregar
      </button>
      <button type="button" onClick={() => onAddTransform('filter')} className={`${btn} border-cyan-300 bg-white text-cyan-900 hover:bg-cyan-50`} title="Manter só as linhas que atendem a uma condição (FILTRO)">
        <Funnel className="size-4" aria-hidden /> Filtrar
      </button>
      <button type="button" onClick={onAddOutput} className={`${btn} border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`} title="Gerar o resultado em uma nova aba">
        <FileOutput className="size-4" aria-hidden /> Saída
      </button>

      <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-[length:var(--rel-text-body)] font-semibold text-slate-800">
        <input type="checkbox" checked={showKeysOnly} onChange={e => onToggleKeysOnly(e.target.checked)} className="size-3.5 accent-indigo-700" />
        Apenas chaves
      </label>

      <div className="ml-auto flex items-center gap-2">
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-[length:var(--rel-text-caption)] font-bold text-[var(--rel-danger)]" role="status">
            <TriangleAlert className="size-4" aria-hidden /> {errorCount} {errorCount === 1 ? 'nó com erro' : 'nós com erro'}
          </span>
        )}
        <button
          type="button"
          onClick={onRun}
          disabled={outputCount === 0}
          title={outputCount === 0 ? 'Adicione uma saída para gerar abas' : 'Calcula o fluxo e grava as abas de saída'}
          className={`${btn} border-emerald-800 bg-emerald-700 text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-600`}
        >
          <Play className="size-4" aria-hidden /> Executar fluxo
        </button>
      </div>
    </div>
  );
};

interface ZoomProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}

export const ZoomControls: React.FC<ZoomProps> = ({ zoom, onZoomIn, onZoomOut, onFit, onReset }) => {
  const b = 'flex size-8 items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100';
  return (
    <div className="absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded-xl border border-slate-300 bg-white p-1 shadow-md" role="group" aria-label="Zoom">
      <button type="button" className={b} onClick={onZoomOut} aria-label="Afastar" title="Afastar"><Minus className="size-4" /></button>
      <button type="button" onClick={onReset} title="Voltar a 100%" className="rel-num min-w-12 rounded-lg px-1 py-1 text-[length:var(--rel-text-body)] font-bold text-slate-900 hover:bg-slate-100">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className={b} onClick={onZoomIn} aria-label="Aproximar" title="Aproximar"><Plus className="size-4" /></button>
      <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden />
      <button type="button" className={b} onClick={onFit} aria-label="Ajustar à tela" title="Ajustar à tela"><Maximize2 className="size-4" /></button>
    </div>
  );
};

const LEGEND: { tone: CableTone; icon: React.ReactNode; text: string }[] = [
  { tone: 'raw', icon: <Database className="size-3" aria-hidden />, text: 'Dados brutos' },
  { tone: 'lookup', icon: <Link2 className="size-3" aria-hidden />, text: 'Busca / cruzamento' },
  { tone: 'aggregate', icon: <Sigma className="size-3" aria-hidden />, text: 'Agregação' },
  { tone: 'error', icon: <TriangleAlert className="size-3" aria-hidden />, text: 'Erro ou órfãos (tracejado)' },
];

export const CanvasLegend: React.FC<{ className?: string }> = ({ className = '' }) => (
  <ul className={`absolute bottom-4 z-10 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 shadow-md ${className}`} aria-label="Legenda dos cabos">
    {LEGEND.map(item => (
      <li key={item.tone} className="flex items-center gap-2 py-0.5 text-[length:var(--rel-text-caption)] font-semibold text-slate-800">
        <svg width="26" height="8" aria-hidden>
          <line x1="1" y1="4" x2="25" y2="4" stroke={CABLES[item.tone].color} strokeWidth="3" strokeLinecap="round" strokeDasharray={item.tone === 'error' ? '6 4' : undefined} />
        </svg>
        <span style={{ color: CABLES[item.tone].color }}>{item.icon}</span>
        {item.text}
      </li>
    ))}
  </ul>
);
