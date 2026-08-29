import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Filter,
  Layers,
  ArrowUpDown,
  Palette,
  Paintbrush,
  Rows3,
  Search,
  FunctionSquare,
  Wand2,
  Maximize2,
  MoreHorizontal,
  Plus,
  X,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';

interface NocoTableToolbarProps {
  sheet: Sheet;
  onOpenFormulaWizard: () => void;
  onOpenQuickAnalysis: () => void;
  onOpenConditionalFormat: () => void;
  onOpenFindReplace: () => void;
  onAutoRecognize: () => void;
  onNewRecord: () => void;
  searchFilter: string;
  onSearchChange: (query: string) => void;
  recordCount: number;
  onOpenFields?: () => void;
  onOpenSort?: () => void;
  onOpenFormat?: () => void;
}

export const NocoTableToolbar: React.FC<NocoTableToolbarProps> = ({
  sheet,
  onOpenFormulaWizard,
  onOpenQuickAnalysis,
  onOpenConditionalFormat,
  onOpenFindReplace,
  onAutoRecognize,
  onNewRecord,
  searchFilter,
  onSearchChange,
  recordCount,
  onOpenFields,
  onOpenSort,
  onOpenFormat,
}) => {
  const [isSearchActive, setIsSearchActive] = useState(false);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className="h-9 bg-white border-b border-[#e2e8f0] px-3 flex items-center justify-between gap-2 select-none z-10 font-sans">
      {/* Left Action Buttons */}
      <div className="flex items-center gap-1">
        {/* Campos (Colunas) */}
        <button
          onClick={onOpenFields}
          title="Configurar e visualizar campos"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors btn-tactile cursor-pointer"
        >
          <SlidersHorizontal className="size-3.5 text-slate-700" strokeWidth={2} />
          <span>Campos</span>
          <span className="h-4 px-1.5 inline-flex items-center justify-center bg-indigo-100 text-indigo-800 font-bold rounded-full text-[10px] leading-none">
            {sheet.colCount}
          </span>
        </button>

        {/* Filtro */}
        <button
          onClick={onOpenFindReplace}
          title="Filtrar dados da tabela"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors btn-tactile cursor-pointer"
        >
          <Filter className="size-3.5 text-slate-700" strokeWidth={2} />
          <span>Filtro</span>
        </button>

        {/* Agrupar */}
        <button
          onClick={onOpenSort}
          title="Agrupar e ordenar registros"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors btn-tactile cursor-pointer"
        >
          <Layers className="size-3.5 text-slate-700" strokeWidth={2} />
          <span>Agrupar</span>
        </button>

        {/* Ordenar */}
        <button
          onClick={onOpenSort}
          title="Classificar e ordenar linhas"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors btn-tactile cursor-pointer"
        >
          <ArrowUpDown className="size-3.5 text-slate-700" strokeWidth={2} />
          <span>Ordenar</span>
        </button>

        {/* Formatação (Cores, Fontes, Moeda, Tempo) */}
        {onOpenFormat && (
          <button
            onClick={onOpenFormat}
            title="Formatação de Células, Cores, Fontes, Moeda e Tempo"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold text-indigo-900 hover:bg-indigo-100 bg-indigo-50 border border-indigo-300 transition-colors btn-tactile cursor-pointer shadow-2xs"
          >
            <Paintbrush className="size-3.5 text-indigo-700" strokeWidth={2} />
            <span>Formatar</span>
          </button>
        )}

        {/* Cores (Formatação Condicional) */}
        <button
          onClick={onOpenConditionalFormat}
          title="Formatação Condicional & Escala de Cores"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors btn-tactile cursor-pointer"
        >
          <Palette className="size-3.5 text-slate-700" strokeWidth={2} />
          <span>Cores</span>
        </button>

        {/* Formula Wizard (Assistente de Fórmulas) */}
        <button
          onClick={onOpenFormulaWizard}
          title="Assistente Inteligente de Fórmulas (fx)"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold text-emerald-900 hover:bg-emerald-100 bg-emerald-50 border border-emerald-300 transition-colors btn-tactile cursor-pointer shadow-2xs"
        >
          <FunctionSquare className="size-3.5 text-emerald-700" strokeWidth={2} />
          <span>fx Fórmulas</span>
        </button>

        {/* Análise Rápida */}
        <button
          onClick={onOpenQuickAnalysis}
          title="Análise Rápida (Ctrl+Q)"
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold text-indigo-900 hover:bg-indigo-50 transition-colors btn-tactile cursor-pointer"
        >
          <Wand2 className="size-3.5 text-indigo-700" strokeWidth={2} />
          <span>Análise Rápida</span>
        </button>
      </div>

      {/* Right Tools (Search & Record Count) */}
      <div className="flex items-center gap-2">
        {/* Search Field */}
        <div className="relative flex items-center">
          {isSearchActive ? (
            <div className="flex items-center bg-slate-50 border border-indigo-500 rounded-md px-2 py-0.5 shadow-2xs">
              <Search className="size-3.5 text-slate-400 mr-1" />
              <input
                type="text"
                placeholder="Pesquisar registros..."
                value={searchFilter}
                onChange={e => onSearchChange(e.target.value)}
                className="text-xs bg-transparent focus:outline-hidden w-36 text-slate-800"
                autoFocus
              />
              <button
                onClick={() => {
                  onSearchChange('');
                  setIsSearchActive(false);
                }}
                aria-label="Limpar pesquisa"
                className="size-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 ml-1 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSearchActive(true)}
              title="Pesquisar (Ctrl+F)"
              aria-label="Abrir pesquisa"
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors btn-tactile cursor-pointer"
            >
              <Search className="size-3.5" />
            </button>
          )}
        </div>

        {/* Expand / Maximize Fullscreen */}
        <button
          onClick={handleToggleFullscreen}
          title="Alternar Tela Cheia"
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
};
