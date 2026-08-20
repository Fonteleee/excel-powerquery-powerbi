import React, { useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Sparkles,
  Split,
  BarChart2,
  FileSpreadsheet,
  Download,
  Upload,
  Undo2,
  Redo2,
  Merge,
  Search,
  ChevronDown,
  Database,
  LayoutDashboard,
  Type,
  Grid,
  Keyboard,
  Filter,
  Trash2,
} from 'lucide-react';


import brandEmblem from '../../assets/brand_emblem.jpg';
import {
  BespokeGridIcon,
  BespokeQueryIcon,
  BespokeAnalyticsIcon,
  BespokeExportIcon,
  BespokeSparkIcon,
} from '../Icons/BespokeIcons';
import { Sheet, CellRange, CellFormat } from '../../types/spreadsheet';
import { cellPosToKey, recalculateSheet } from '../../engine/formulaParser';
import { exportSheetToExcel } from '../../utils/excelExporter';


interface RibbonBarProps {
  sheet: Sheet;
  selectedRange: CellRange;
  activeView: 'spreadsheet' | 'powerquery' | 'powerbi';
  onSetActiveView: (view: 'spreadsheet' | 'powerquery' | 'powerbi') => void;
  onUpdateSheet: (sheet: Sheet) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenQuickAnalysis: () => void;
  onOpenFormulaWizard: () => void;
  onOpenTextToColumns: () => void;
  onOpenConditionalModal: () => void;
  onOpenImportExport: () => void;
  onOpenShortcutsModal: () => void;
  onOpenFindReplace: () => void;
  onInsertFormulaTemplate: (template: string) => void;
}


export const RibbonBar: React.FC<RibbonBarProps> = ({
  sheet,
  selectedRange,
  activeView,
  onSetActiveView,
  onUpdateSheet,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenQuickAnalysis,
  onOpenFormulaWizard,
  onOpenTextToColumns,
  onOpenConditionalModal,
  onOpenImportExport,
  onOpenShortcutsModal,
  onOpenFindReplace,
  onInsertFormulaTemplate,
}) => {

  const [activeRibbonTab, setActiveRibbonTab] = useState<'home' | 'insert' | 'formulas' | 'data' | 'view'>('home');
  const [showColorPicker, setShowColorPicker] = useState<'text' | 'bg' | null>(null);

  // Apply format to all cells in selected range
  const applyFormat = (formatPatch: Partial<CellFormat>) => {
    const updatedData = { ...sheet.data };
    for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
      for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
        const key = cellPosToKey(r, c);
        const existing = updatedData[key] || { raw: '', value: '' };
        updatedData[key] = {
          ...existing,
          format: {
            ...existing.format,
            ...formatPatch,
          },
        };
      }
    }
    const recalculated = recalculateSheet({ ...sheet, data: updatedData });
    onUpdateSheet(recalculated);
  };

  // Merge selected cells
  const handleMergeAndCenter = () => {
    const isAlreadyMerged = sheet.mergedRegions.some(
      m =>
        m.startRow === selectedRange.startRow &&
        m.startCol === selectedRange.startCol &&
        m.endRow === selectedRange.endRow &&
        m.endCol === selectedRange.endCol
    );

    if (isAlreadyMerged) {
      // Unmerge
      const newMerged = sheet.mergedRegions.filter(
        m =>
          !(
            m.startRow === selectedRange.startRow &&
            m.startCol === selectedRange.startCol &&
            m.endRow === selectedRange.endRow &&
            m.endCol === selectedRange.endCol
          )
      );
      onUpdateSheet({ ...sheet, mergedRegions: newMerged });
    } else {
      // Merge and center
      applyFormat({ align: 'center' });
      const newRegion = {
        id: `merge-${Date.now()}`,
        startRow: selectedRange.startRow,
        startCol: selectedRange.startCol,
        endRow: selectedRange.endRow,
        endCol: selectedRange.endCol,
      };
      onUpdateSheet({
        ...sheet,
        mergedRegions: [...sheet.mergedRegions, newRegion],
      });
    }
  };

  // Delete entire selected rows completely
  const handleDeleteSelectedRows = () => {
    const rStart = selectedRange.startRow;
    const rEnd = selectedRange.endRow;
    const countToDelete = rEnd - rStart + 1;

    const updatedData: { [key: string]: any } = {};

    for (let r = 0; r < sheet.rowCount; r++) {
      if (r >= rStart && r <= rEnd) continue; // Skip deleted rows

      const targetR = r > rEnd ? r - countToDelete : r;
      for (let c = 0; c < sheet.colCount; c++) {
        const srcKey = cellPosToKey(r, c);
        const destKey = cellPosToKey(targetR, c);
        if (sheet.data[srcKey]) {
          updatedData[destKey] = sheet.data[srcKey];
        }
      }
    }

    const newRowCount = Math.max(10, sheet.rowCount - countToDelete);
    const recalculated = recalculateSheet({
      ...sheet,
      data: updatedData,
      rowCount: newRowCount,
    });
    onUpdateSheet(recalculated);
  };

  // Colors palette
  const colors = [
    '#000000', '#334155', '#64748b', '#94a3b8', '#cbd5e1', '#ffffff',
    '#107c41', '#16a34a', '#dcfce7', '#0284c7', '#0369a1', '#e0f2fe',
    '#d97706', '#b45309', '#fef3c7', '#dc2626', '#b91c1c', '#fee2e2',
    '#7c3aed', '#6d28d9', '#f3e8ff', '#db2777', '#be185d', '#fce7f3',
  ];

  return (
    <div className="bg-[#ffffff] border-b border-slate-200 flex flex-col select-none z-20 shadow-xs">
      {/* 1. TOP TITLE BAR (Luxury Light Header with 3D Faceted Glass Emblem) */}
      <div className="h-12 px-3.5 flex items-center justify-between border-b border-slate-200 bg-[#ffffff]">
        {/* Left: 3D Faceted Emblem + Engine Branding + Document Name */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            {/* 3D Geometric Faceted Glass Emblem */}
            <div className="relative size-8 rounded-lg overflow-hidden border border-slate-200 shadow-xs emblem-glint group cursor-pointer">
              <img
                src={brandEmblem}
                alt="Vertex Emblem"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-extrabold text-xs tracking-wider text-slate-900 font-mono">VERTEX</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono font-bold border border-emerald-200">
                  STUDIO PRO
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5">Enterprise Suite</span>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          {/* Quick Undo / Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Desfazer (Ctrl+Z)"
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-950 hover:bg-slate-100 disabled:opacity-30 transition-colors cursor-pointer"
            >
              <Undo2 className="size-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="Refazer (Ctrl+Y)"
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-950 hover:bg-slate-100 disabled:opacity-30 transition-colors cursor-pointer"
            >
              <Redo2 className="size-3.5" />
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <div className="flex items-center gap-2 text-xs text-slate-700">
            <span className="font-bold text-slate-900 font-mono">{sheet.name}</span>
            <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              {sheet.rowCount} lin × {sheet.colCount} col
            </span>
          </div>
        </div>

        {/* Center: Machined Capsule Module Switcher with Bespoke Dual-Tone Icons */}
        <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 shadow-inner">
          <button
            onClick={() => {
              onSetActiveView('spreadsheet');
              setActiveRibbonTab('home');
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeView === 'spreadsheet'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <BespokeGridIcon size={15} />
            <span>Planilha</span>
          </button>

          <button
            onClick={() => {
              onSetActiveView('powerquery');
              setActiveRibbonTab('data');
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeView === 'powerquery'
                ? 'bg-indigo-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-indigo-700 hover:bg-white/80'
            }`}
          >
            <BespokeQueryIcon size={15} />
            <span>Power Query</span>
          </button>

          <button
            onClick={() => {
              onSetActiveView('powerbi');
              setActiveRibbonTab('view');
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeView === 'powerbi'
                ? 'bg-amber-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-amber-700 hover:bg-white/80'
            }`}
          >
            <BespokeAnalyticsIcon size={15} />
            <span>Power BI</span>
          </button>
        </div>

        {/* Right: Engine Status, Import & Export Actions */}
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-mono text-emerald-800 font-semibold">
            <span className="size-2 rounded-full bg-emerald-500 led-live-green" />
            <span>60fps Engine</span>
          </div>

          <button
            onClick={onOpenImportExport}
            title="Importar Dados CSV"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
          >
            <Upload className="size-3.5 text-slate-500" />
            <span>Importar CSV</span>
          </button>

          <button
            onClick={() => exportSheetToExcel(sheet, sheet.name)}
            title="Exportar para Excel (.xlsx)"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <BespokeExportIcon size={14} />
            <span>Exportar XLSX</span>
          </button>
        </div>
      </div>


      {/* 2. RIBBON TABS HEADER */}
      <div className="h-8 px-4 flex items-center gap-1 bg-[#f8fafc] border-b border-slate-200 text-xs font-semibold text-slate-600">
        <button
          onClick={() => {
            onSetActiveView('spreadsheet');
            setActiveRibbonTab('home');
          }}
          className={`px-3.5 h-full flex items-center transition-all cursor-pointer ${
            activeRibbonTab === 'home' && activeView === 'spreadsheet'
              ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 bg-white'
              : 'hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          Página Inicial
        </button>

        <button
          onClick={() => {
            onSetActiveView('spreadsheet');
            setActiveRibbonTab('insert');
          }}
          className={`px-3.5 h-full flex items-center transition-all cursor-pointer ${
            activeRibbonTab === 'insert'
              ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 bg-white'
              : 'hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          Inserir
        </button>

        <button
          onClick={() => {
            onSetActiveView('spreadsheet');
            setActiveRibbonTab('formulas');
          }}
          className={`px-3.5 h-full flex items-center transition-all cursor-pointer ${
            activeRibbonTab === 'formulas'
              ? 'text-emerald-700 font-bold border-b-2 border-emerald-600 bg-white'
              : 'hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          Fórmulas
        </button>

        <button
          onClick={() => {
            onSetActiveView('powerquery');
            setActiveRibbonTab('data');
          }}
          className={`px-3.5 h-full flex items-center transition-all cursor-pointer ${
            activeRibbonTab === 'data' || activeView === 'powerquery'
              ? 'text-indigo-700 font-bold border-b-2 border-indigo-600 bg-white'
              : 'hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          Dados & Power Query
        </button>

        <button
          onClick={() => {
            onSetActiveView('powerbi');
            setActiveRibbonTab('view');
          }}
          className={`px-3.5 h-full flex items-center transition-all cursor-pointer ${
            activeRibbonTab === 'view' || activeView === 'powerbi'
              ? 'text-amber-700 font-bold border-b-2 border-amber-600 bg-white'
              : 'hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          Exibir & Power BI
        </button>
      </div>

      {/* 3. RIBBON TOOLBAR BODY */}
      <div className="h-16 px-3 py-1 flex items-center gap-3 overflow-x-auto scrollbar-none bg-white text-xs text-slate-700">
        {/* PÁGINA INICIAL */}
        {activeRibbonTab === 'home' && (
          <>
            {/* Group: Fonte & Formatação de Texto */}
            <div className="flex flex-col items-center justify-between h-full pr-2.5 border-r border-slate-200">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => applyFormat({ bold: !sheet.data[cellPosToKey(selectedRange.startRow, selectedRange.startCol)]?.format?.bold })}
                  title="Negrito (Ctrl+B)"
                  className="p-1 rounded-xs hover:bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  <Bold className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ italic: !sheet.data[cellPosToKey(selectedRange.startRow, selectedRange.startCol)]?.format?.italic })}
                  title="Itálico (Ctrl+I)"
                  className="p-1 rounded-xs hover:bg-slate-100 text-slate-700 cursor-pointer italic"
                >
                  <Italic className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ underline: !sheet.data[cellPosToKey(selectedRange.startRow, selectedRange.startCol)]?.format?.underline })}
                  title="Sublinhado (Ctrl+U)"
                  className="p-1 rounded-xs hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  <Underline className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ strike: !sheet.data[cellPosToKey(selectedRange.startRow, selectedRange.startCol)]?.format?.strike })}
                  title="Tachado"
                  className="p-1 rounded-xs hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  <Strikethrough className="size-3.5" />
                </button>

                <div className="h-3.5 w-px bg-slate-200 mx-0.5" />

                {/* Color Pickers */}
                <div className="relative">
                  <button
                    onClick={() => setShowColorPicker(showColorPicker === 'text' ? null : 'text')}
                    title="Cor da Fonte"
                    className="p-1 rounded-xs hover:bg-slate-100 text-slate-700 flex items-center cursor-pointer"
                  >
                    <Type className="size-3.5 text-red-600" />
                    <ChevronDown className="size-2.5 text-slate-400" />
                  </button>

                  {showColorPicker === 'text' && (
                    <div className="absolute left-0 top-full mt-1 p-2 bg-white border border-slate-300 rounded-md shadow-xl grid grid-cols-6 gap-1 z-50">
                      {colors.map(color => (
                        <button
                          key={color}
                          onClick={() => {
                            applyFormat({ textColor: color });
                            setShowColorPicker(null);
                          }}
                          style={{ backgroundColor: color }}
                          className="size-4 rounded-xs border border-slate-300 hover:scale-110 cursor-pointer"
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    onClick={() => setShowColorPicker(showColorPicker === 'bg' ? null : 'bg')}
                    title="Cor de Preenchimento"
                    className="p-1 rounded-xs hover:bg-slate-100 text-slate-700 flex items-center cursor-pointer"
                  >
                    <Palette className="size-3.5 text-amber-500" />
                    <ChevronDown className="size-2.5 text-slate-400" />
                  </button>

                  {showColorPicker === 'bg' && (
                    <div className="absolute left-0 top-full mt-1 p-2 bg-white border border-slate-300 rounded-md shadow-xl grid grid-cols-6 gap-1 z-50">
                      {colors.map(color => (
                        <button
                          key={color}
                          onClick={() => {
                            applyFormat({ bgColor: color });
                            setShowColorPicker(null);
                          }}
                          style={{ backgroundColor: color }}
                          className="size-4 rounded-xs border border-slate-300 hover:scale-110 cursor-pointer"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-slate-400 font-sans">Fonte</span>
            </div>

            {/* Group: Alinhamento & Mesclar */}
            <div className="flex flex-col items-center justify-between h-full pr-2.5 border-r border-slate-200">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => applyFormat({ align: 'left' })}
                  title="Alinhar à Esquerda"
                  className="p-1 rounded-xs hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  <AlignLeft className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ align: 'center' })}
                  title="Centralizar"
                  className="p-1 rounded-xs hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  <AlignCenter className="size-3.5" />
                </button>
                <button
                  onClick={() => applyFormat({ align: 'right' })}
                  title="Alinhar à Direita"
                  className="p-1 rounded-xs hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  <AlignRight className="size-3.5" />
                </button>

                <div className="h-3.5 w-px bg-slate-200 mx-0.5" />

                <button
                  onClick={handleMergeAndCenter}
                  title="Mesclar e Centralizar Células"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 font-medium cursor-pointer"
                >
                  <Merge className="size-3 text-[#107c41]" />
                  <span>Mesclar</span>
                </button>
              </div>
              <span className="text-[10px] text-slate-400 font-sans">Alinhamento</span>
            </div>

            {/* Group: Número e Formatação de Dados */}
            <div className="flex flex-col items-center justify-between h-full pr-2.5 border-r border-slate-200">
              <div className="flex items-center gap-1.5">
                {/* Format Dropdown */}
                <select
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'currency' || val === 'currency_usd' || val === 'currency_eur') {
                      applyFormat({ type: val as any, decimals: 2, align: 'right' });
                    } else if (val === 'percentage') {
                      applyFormat({ type: val as any, decimals: 1, align: 'right' });
                    } else if (val === 'number') {
                      applyFormat({ type: val as any, decimals: 2, align: 'right' });
                    } else if (val === 'text') {
                      applyFormat({ type: 'text', align: 'left' });
                    } else if (val === 'date') {
                      applyFormat({ type: 'date', align: 'center' });
                    } else if (
                      val === 'time_hh_mm_ss' ||
                      val === 'time' ||
                      val === 'time_hh_mm' ||
                      val === 'time_duration' ||
                      val === 'time_minutes_label' ||
                      val === 'time_from_decimal_hours' ||
                      val === 'time_from_minutes' ||
                      val === 'time_from_seconds'
                    ) {
                      applyFormat({ type: val as any, align: 'center' });
                    } else {
                      applyFormat({ type: 'general' });
                    }
                  }}
                  defaultValue="general"
                  className="h-6 px-2 bg-slate-50 border border-slate-300 rounded-xs text-xs font-medium text-slate-800 focus:outline-hidden focus:border-[#107c41] cursor-pointer"
                >
                  <option value="general">Geral</option>
                  <option value="time_hh_mm_ss">⏱️ Hora (03:17:26)</option>
                  <option value="time_minutes_label">⏱️ Minutos (60m)</option>
                  <option value="time_duration">⏱️ Duração (1h 00m)</option>
                  <option value="currency">Moeda Real (R$)</option>
                  <option value="currency_usd">Moeda Dólar ($)</option>
                  <option value="percentage">Percentual (%)</option>
                  <option value="number">Número (1.250,00)</option>
                  <option value="date">Data (DD/MM/AAAA)</option>
                  <option value="text">Texto Puro</option>
                </select>

                {/* 1-Click Fast Buttons */}
                <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-xs border border-slate-200">
                  <button
                    onClick={() => applyFormat({ type: 'currency', decimals: 2, align: 'right' })}
                    title="Formatar como Moeda (R$)"
                    className="px-1.5 py-0.5 rounded-xs bg-white text-[#107c41] font-bold text-xs border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    R$
                  </button>
                  <button
                    onClick={() => applyFormat({ type: 'percentage', decimals: 1, align: 'right' })}
                    title="Formatar como Percentual (%)"
                    className="px-1.5 py-0.5 rounded-xs bg-white text-slate-700 font-bold text-xs border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    %
                  </button>
                  <button
                    onClick={() => applyFormat({ type: 'time_hh_mm_ss', align: 'center' })}
                    title="Formatar como Horas Completas (03:17:26)"
                    className="px-1.5 py-0.5 rounded-xs bg-white text-blue-700 font-mono font-bold text-[11px] border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    00:00:00
                  </button>
                  <button
                    onClick={() => applyFormat({ type: 'time_minutes_label', align: 'center' })}
                    title="Formatar como Minutos (60m)"
                    className="px-1.5 py-0.5 rounded-xs bg-white text-indigo-700 font-bold text-xs border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    60m
                  </button>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 font-sans">Número</span>
            </div>

            {/* Group: Estilos & Formatação Condicional */}
            <div className="flex flex-col items-center justify-between h-full pr-2.5 border-r border-slate-200">
              <button
                onClick={onOpenConditionalModal}
                className="flex items-center gap-1.5 px-2 py-1 rounded-xs bg-slate-50 hover:bg-emerald-50 text-[#107c41] border border-slate-200 hover:border-emerald-300 text-xs font-semibold cursor-pointer"
              >
                <Palette className="size-3.5" />
                <span>Formatação Condicional</span>
              </button>
              <span className="text-[10px] text-slate-400 font-sans">Estilos</span>
            </div>

            {/* Group: Células & Linhas */}
            <div className="flex flex-col items-center justify-between h-full pr-2.5 border-r border-slate-200">
              <button
                onClick={handleDeleteSelectedRows}
                title="Excluir Linhas Selecionadas (Ctrl + -)"
                className="flex items-center gap-1 px-2 py-1 rounded-xs bg-slate-50 hover:bg-rose-50 text-rose-700 border border-slate-200 hover:border-rose-300 text-xs font-medium cursor-pointer"
              >
                <Trash2 className="size-3.5" />
                <span>Excluir Linhas</span>
              </button>
              <span className="text-[10px] text-slate-400 font-sans">Células</span>
            </div>

            {/* Group: Edição, Filtros & Busca */}
            <div className="flex flex-col items-center justify-between h-full">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    onUpdateSheet({
                      ...sheet,
                      filterEnabled: !sheet.filterEnabled,
                    });
                  }}
                  title="Ativar/Desativar AutoFilter nas Colunas (Ctrl+Shift+L)"
                  className={`flex items-center gap-1 px-2 py-1 rounded-xs text-xs font-bold border transition-colors cursor-pointer ${
                    sheet.filterEnabled
                      ? 'bg-[#107c41] text-white border-[#0e6b37]'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  <Filter className="size-3" />
                  <span>Filtro</span>
                </button>

                <button
                  onClick={onOpenFindReplace}
                  title="Localizar e Substituir (Ctrl+L / Ctrl+F)"
                  className="flex items-center gap-1 px-2 py-1 rounded-xs bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium cursor-pointer"
                >
                  <Search className="size-3" />
                  <span>Localizar (Ctrl+L)</span>
                </button>

                <button
                  onClick={onOpenQuickAnalysis}
                  title="Análise Rápida de Dados (Ctrl+Q)"
                  className="flex items-center gap-1 px-2 py-1 rounded-xs bg-emerald-50 hover:bg-emerald-100 text-[#107c41] border border-emerald-300 text-xs font-bold cursor-pointer"
                >
                  <Sparkles className="size-3" />
                  <span>Ctrl+Q</span>
                </button>
              </div>
              <span className="text-[10px] text-slate-400 font-sans">Edição</span>
            </div>
          </>
        )}

        {/* INSERIR */}
        {activeRibbonTab === 'insert' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSetActiveView('powerbi')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xs bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold cursor-pointer"
            >
              <BarChart2 className="size-4 text-amber-700" />
              <span>Gráficos no Power BI Studio</span>
            </button>

            <button
              onClick={onOpenQuickAnalysis}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-emerald-50 hover:bg-emerald-100 text-[#107c41] border border-emerald-300 text-xs font-bold cursor-pointer"
            >
              <Sparkles className="size-4 text-[#107c41]" />
              <span>Tabela Dinâmica / Análise Rápida</span>
            </button>
          </div>
        )}

        {/* FÓRMULAS */}
        {activeRibbonTab === 'formulas' && (
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenFormulaWizard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#107c41] hover:bg-[#0e6b37] text-white text-xs font-bold cursor-pointer shadow-2xs"
            >
              <span className="font-serif italic font-bold">fx</span>
              <span>Assistente de Fórmulas</span>
            </button>

            <div className="h-6 w-px bg-slate-200" />

            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => onInsertFormulaTemplate('=PROCX(A2; Planilha1!A:A; Planilha1!B:B; "Não Encontrado")')}
                className="px-2 py-1 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-mono font-semibold border border-slate-300 cursor-pointer"
              >
                + PROCX
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=SEERRO(SOMA(A1:A10); 0)')}
                className="px-2 py-1 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-mono font-semibold border border-slate-300 cursor-pointer"
              >
                + SEERRO
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=ÍNDICE(B2:D10; CORRESP("Item"; B2:B10; 0); 2)')}
                className="px-2 py-1 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-mono font-semibold border border-slate-300 cursor-pointer"
              >
                + ÍNDICE/CORRESP
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=SOMARPRODUTO(C2:C10; D2:D10)')}
                className="px-2 py-1 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-mono font-semibold border border-slate-300 cursor-pointer"
              >
                + SOMARPRODUTO
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=MÉDIA.PONDERADA(D2:D10; E2:E10)')}
                className="px-2 py-1 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-mono font-semibold border border-slate-300 cursor-pointer"
              >
                + MÉDIA.PONDERADA
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=UNIRTEXTO(" - "; VERDADEIRO; A2:A10)')}
                className="px-2 py-1 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-mono font-semibold border border-slate-300 cursor-pointer"
              >
                + UNIRTEXTO
              </button>
              <button
                onClick={() => onInsertFormulaTemplate('=CONT.SE(A2:A10; ">0")')}
                className="px-2 py-1 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-mono font-semibold border border-slate-300 cursor-pointer"
              >
                + CONT.SE
              </button>
            </div>
          </div>
        )}

        {/* DADOS (POWER QUERY) */}
        {activeRibbonTab === 'data' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSetActiveView('powerquery')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold cursor-pointer shadow-2xs"
            >
              <Database className="size-3.5" />
              <span>Abrir Editor Power Query</span>
            </button>

            <button
              onClick={onOpenTextToColumns}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-300 cursor-pointer"
            >
              <Split className="size-3.5 text-purple-600" />
              <span>Dividir por Delimitador (Texto para Colunas)</span>
            </button>

            <button
              onClick={onOpenImportExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-300 cursor-pointer"
            >
              <Upload className="size-3.5" />
              <span>Importar Arquivo CSV</span>
            </button>
          </div>
        )}

        {/* EXIBIR (POWER BI) */}
        {activeRibbonTab === 'view' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSetActiveView('powerbi')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer shadow-2xs"
            >
              <LayoutDashboard className="size-3.5" />
              <span>Abrir Painel Power BI</span>
            </button>

            <button
              onClick={() => onSetActiveView('spreadsheet')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-300 cursor-pointer"
            >
              <Grid className="size-3.5 text-[#107c41]" />
              <span>Voltar para Grade da Planilha</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
