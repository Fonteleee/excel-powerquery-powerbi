import React, { useState } from 'react';
import {
  X,
  Palette,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  DollarSign,
  Clock,
  Calendar,
  Percent,
  Hash,
  Type,
  Check,
  Sparkles,
} from 'lucide-react';
import { Sheet, CellRange, CellFormat, CellFormatType } from '../../types/spreadsheet';
import { cellPosToKey, recalculateSheet } from '../../engine/formulaParser';

interface NocoFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  selectedRange: CellRange;
  onUpdateSheet: (sheet: Sheet) => void;
}

const PRESET_BG_COLORS = [
  { label: 'Sem preenchimento', val: 'transparent', border: '#e2e8f0' },
  { label: 'Azul Claro', val: '#eff6ff', border: '#bfdbfe' },
  { label: 'Verde Suave', val: '#f0fdf4', border: '#bbf7d0' },
  { label: 'Amarelo Alerta', val: '#fefce8', border: '#fef08a' },
  { label: 'Vermelho / Rosa', val: '#fff1f2', border: '#fecdd3' },
  { label: 'Roxo NocoDB', val: '#faf5ff', border: '#e9d5ff' },
  { label: 'Índigo Real', val: '#e0e7ff', border: '#c7d2fe' },
  { label: 'Cinza Neutro', val: '#f1f5f9', border: '#cbd5e1' },
  { label: 'Verde Esmeralda', val: '#10b981', text: '#ffffff' },
  { label: 'Azul Royal', val: '#2563eb', text: '#ffffff' },
  { label: 'Índigo Escuro', val: '#4f46e5', text: '#ffffff' },
  { label: 'Grafite Obsidian', val: '#1e293b', text: '#ffffff' },
];

const PRESET_TEXT_COLORS = [
  { label: 'Padrão', val: '#0f172a' },
  { label: 'Azul', val: '#1d4ed8' },
  { label: 'Verde', val: '#15803d' },
  { label: 'Vermelho', val: '#b91c1c' },
  { label: 'Roxo', val: '#7e22ce' },
  { label: 'Cinza', val: '#64748b' },
  { label: 'Branco', val: '#ffffff' },
];

const FONT_FAMILIES = [
  { label: 'Plus Jakarta Sans (Moderna)', val: 'Plus Jakarta Sans, sans-serif' },
  { label: 'Inter (Padrão)', val: 'Inter, sans-serif' },
  { label: 'JetBrains Mono (Números & Código)', val: 'JetBrains Mono, monospace' },
  { label: 'Roboto (Google)', val: 'Roboto, sans-serif' },
  { label: 'Arial (Clássico)', val: 'Arial, sans-serif' },
  { label: 'Consolas (Mono)', val: 'Consolas, monospace' },
];

export const NocoFormatModal: React.FC<NocoFormatModalProps> = ({
  isOpen,
  onClose,
  sheet,
  selectedRange,
  onUpdateSheet,
}) => {
  const [applyScope, setApplyScope] = useState<'selection' | 'row' | 'col'>('selection');
  const [dataType, setDataType] = useState<CellFormatType>('general');
  const [isBold, setIsBold] = useState<boolean>(false);
  const [isItalic, setIsItalic] = useState<boolean>(false);
  const [isUnderline, setIsUnderline] = useState<boolean>(false);
  const [isStrike, setIsStrike] = useState<boolean>(false);
  const [fontFamily, setFontFamily] = useState<string>('Plus Jakarta Sans, sans-serif');
  const [fontSize, setFontSize] = useState<number>(13);
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left');
  const [bgColor, setBgColor] = useState<string>('transparent');
  const [textColor, setTextColor] = useState<string>('#0f172a');
  const [decimals, setDecimals] = useState<number>(2);

  if (!isOpen) return null;

  const handleApplyFormat = () => {
    const newData = { ...sheet.data };

    let startR = Math.min(selectedRange.startRow, selectedRange.endRow);
    let endR = Math.max(selectedRange.startRow, selectedRange.endRow);
    let startC = Math.min(selectedRange.startCol, selectedRange.endCol);
    let endC = Math.max(selectedRange.startCol, selectedRange.endCol);

    if (applyScope === 'row') {
      startC = 0;
      endC = sheet.colCount - 1;
    } else if (applyScope === 'col') {
      startR = 0;
      endR = sheet.rowCount - 1;
    }

    for (let r = startR; r <= endR; r++) {
      for (let c = startC; c <= endC; c++) {
        const key = cellPosToKey(r, c);
        const existing = newData[key] || { raw: '', value: '' };
        const existingFormat = existing.format || {};

        const updatedFormat: CellFormat = {
          ...existingFormat,
          type: dataType,
          bold: isBold,
          italic: isItalic,
          underline: isUnderline,
          strike: isStrike,
          fontFamily,
          fontSize,
          align,
          bgColor: bgColor !== 'transparent' ? bgColor : undefined,
          textColor: textColor !== '#0f172a' ? textColor : undefined,
          decimals,
        };

        newData[key] = {
          ...existing,
          format: updatedFormat,
        };
      }
    }

    const recalculated = recalculateSheet({ ...sheet, data: newData });
    onUpdateSheet(recalculated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Palette className="size-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Formatação & Tipos de Dados</h3>
              <p className="text-xs text-slate-500">Personalize cores, fontes, moeda e formato de tempo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar janela de formatação"
            className="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors btn-tactile cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Scope Selector: Seleção, Linha Inteira, Coluna Inteira */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
              Aplicar Formatação em:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setApplyScope('selection')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  applyScope === 'selection'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Células Selecionadas
              </button>
              <button
                type="button"
                onClick={() => setApplyScope('row')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  applyScope === 'row'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Linha(s) Inteira(s)
              </button>
              <button
                type="button"
                onClick={() => setApplyScope('col')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  applyScope === 'col'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Coluna(s) Inteira(s)
              </button>
            </div>
          </div>

          {/* Data Type Buttons */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
              Tipo de Dado & Formato:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDataType('general')}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  dataType === 'general' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Hash className="size-3.5 text-slate-500" />
                <span>Geral</span>
              </button>

              <button
                type="button"
                onClick={() => setDataType('currency')}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  dataType === 'currency' ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <DollarSign className="size-3.5 text-emerald-600" />
                <span>Moeda R$ (Real)</span>
              </button>

              <button
                type="button"
                onClick={() => setDataType('time_hh_mm_ss')}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  dataType === 'time_hh_mm_ss' ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Clock className="size-3.5 text-amber-600" />
                <span>Tempo (HH:MM:SS)</span>
              </button>

              <button
                type="button"
                onClick={() => setDataType('time_from_minutes')}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  dataType === 'time_from_minutes' ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Clock className="size-3.5 text-amber-600" />
                <span>Tempo em 60m</span>
              </button>

              <button
                type="button"
                onClick={() => setDataType('percentage')}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  dataType === 'percentage' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Percent className="size-3.5 text-blue-600" />
                <span>Porcentagem %</span>
              </button>

              <button
                type="button"
                onClick={() => setDataType('text')}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  dataType === 'text' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Type className="size-3.5 text-purple-600" />
                <span>Texto Puro</span>
              </button>
            </div>
          </div>

          {/* Typography & Font Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Família da Fonte</label>
              <select
                value={fontFamily}
                onChange={e => setFontFamily(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 font-medium"
              >
                {FONT_FAMILIES.map(f => (
                  <option key={f.val} value={f.val}>{f.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tamanho da Fonte</label>
              <select
                value={fontSize}
                onChange={e => setFontSize(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 font-medium"
              >
                {[9, 10, 11, 12, 14, 16, 18, 20, 24].map(sz => (
                  <option key={sz} value={sz}>{sz} pt</option>
                ))}
              </select>
            </div>
          </div>

          {/* Text Styles & Alignments */}
          <div className="flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            {/* Style Toggles */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsBold(!isBold)}
                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                  isBold ? 'bg-white border-indigo-500 text-indigo-700 shadow-xs font-bold' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200'
                }`}
                title="Negrito"
              >
                <Bold className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsItalic(!isItalic)}
                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                  isItalic ? 'bg-white border-indigo-500 text-indigo-700 shadow-xs' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200'
                }`}
                title="Itálico"
              >
                <Italic className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsUnderline(!isUnderline)}
                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                  isUnderline ? 'bg-white border-indigo-500 text-indigo-700 shadow-xs' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200'
                }`}
                title="Sublinhado"
              >
                <Underline className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsStrike(!isStrike)}
                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                  isStrike ? 'bg-white border-indigo-500 text-indigo-700 shadow-xs' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200'
                }`}
                title="Tachado"
              >
                <Strikethrough className="size-4" />
              </button>
            </div>

            {/* Align Toggles */}
            <div className="flex items-center gap-1 border-l border-slate-300 pl-3">
              <button
                type="button"
                onClick={() => setAlign('left')}
                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                  align === 'left' ? 'bg-white border-indigo-500 text-indigo-700 shadow-xs' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200'
                }`}
                title="Alinhar à Esquerda"
              >
                <AlignLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setAlign('center')}
                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                  align === 'center' ? 'bg-white border-indigo-500 text-indigo-700 shadow-xs' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200'
                }`}
                title="Centralizar"
              >
                <AlignCenter className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setAlign('right')}
                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                  align === 'right' ? 'bg-white border-indigo-500 text-indigo-700 shadow-xs' : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200'
                }`}
                title="Alinhar à Direita"
              >
                <AlignRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Color Palettes */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
              Cor de Preenchimento (Fundo):
            </label>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_BG_COLORS.map(c => (
                <button
                  key={c.val}
                  type="button"
                  onClick={() => setBgColor(c.val)}
                  title={c.label}
                  className={`h-7 rounded-lg border flex items-center justify-center transition-all btn-tactile cursor-pointer ${
                    bgColor === c.val ? 'ring-2 ring-indigo-500 scale-105 shadow-xs' : 'hover:opacity-80'
                  }`}
                  style={{ backgroundColor: c.val, borderColor: c.border || c.val }}
                >
                  {bgColor === c.val && (
                    <Check className={`size-3.5 ${c.text ? 'text-white' : 'text-slate-800'}`} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-200 transition-colors font-semibold cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleApplyFormat}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Check className="size-4" />
            <span>Aplicar Formatação</span>
          </button>
        </div>
      </div>
    </div>
  );
};
