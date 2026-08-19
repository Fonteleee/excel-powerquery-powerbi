import React, { useState } from 'react';
import { Columns, Split, Check, X, ArrowRight } from 'lucide-react';
import { CellRange, Sheet } from '../../types/spreadsheet';
import { colIndexToLabel, getCellValue } from '../../engine/formulaParser';

interface TextToColumnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRange: CellRange;
  sheet: Sheet;
  onApplySplit: (delimiter: string, customChar?: string) => void;
}

export const TextToColumnsModal: React.FC<TextToColumnsModalProps> = ({
  isOpen,
  onClose,
  selectedRange,
  sheet,
  onApplySplit,
}) => {
  const [selectedDelimiter, setSelectedDelimiter] = useState<string>(';');
  const [customDelimiter, setCustomDelimiter] = useState<string>('-');

  if (!isOpen) return null;

  const targetCol = selectedRange.startCol;
  const colLetter = colIndexToLabel(targetCol);

  // Get sample rows from selected column
  const sampleRows: string[] = [];
  for (let r = selectedRange.startRow; r <= Math.min(selectedRange.endRow, selectedRange.startRow + 8); r++) {
    const val = getCellValue(sheet, r, targetCol);
    if (val !== null && val !== undefined && val !== '') {
      sampleRows.push(String(val));
    }
  }

  const effectiveDelimiter = selectedDelimiter === 'custom' ? customDelimiter : selectedDelimiter;

  // Split preview
  const previewData = sampleRows.map(rowStr => {
    if (selectedDelimiter === 'space') {
      return rowStr.split(/\s+/);
    }
    return rowStr.split(effectiveDelimiter);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-100 text-purple-800 border border-purple-200">
              <Split className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Assistente de Delimitador (Texto para Colunas)</h3>
              <p className="text-xs text-slate-500">
                Dividir dados da Coluna <span className="font-mono text-purple-800 font-bold">{colLetter}</span> em múltiplas colunas
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[460px] bg-white">
          {/* Delimiters selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Escolha o caractere delimitador / separador:
            </label>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: ';', label: 'Ponto e Vírgula ( ; )' },
                { id: ',', label: 'Vírgula ( , )' },
                { id: 'space', label: 'Espaço' },
                { id: '-', label: 'Hífen / Traço ( - )' },
                { id: '/', label: 'Barra ( / )' },
                { id: 'custom', label: 'Personalizado' },
              ].map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDelimiter(d.id)}
                  className={`p-3 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer flex items-center justify-between ${
                    selectedDelimiter === d.id
                      ? 'bg-purple-50 border-purple-500 text-purple-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{d.label}</span>
                  {selectedDelimiter === d.id && <Check className="size-3.5 text-purple-600 font-bold" />}
                </button>
              ))}
            </div>

            {selectedDelimiter === 'custom' && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <label className="text-xs text-slate-600 font-medium">Digite seu caractere separador:</label>
                <input
                  type="text"
                  maxLength={5}
                  value={customDelimiter}
                  onChange={e => setCustomDelimiter(e.target.value)}
                  className="w-24 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-purple-800 font-bold text-center focus:outline-hidden focus:border-purple-500"
                />
              </div>
            )}
          </div>

          {/* Live Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 font-bold">
              <span>Pré-visualização do resultado dividido:</span>
              <span className="text-[11px] text-slate-500 font-normal">
                {previewData[0]?.length || 1} colunas geradas
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-x-auto max-h-48 scrollbar-thin">
              <table className="w-full text-xs text-left border-collapse bg-white">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-slate-600 font-mono text-[11px]">
                    <th className="py-2 px-3 border-r border-slate-200">Linha</th>
                    {previewData[0]?.map((_, colIdx) => (
                      <th key={colIdx} className="py-2 px-3 border-r border-slate-200 font-bold text-purple-800">
                        {colIndexToLabel(targetCol + colIdx)} ({colIdx + 1})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((cols, rIdx) => (
                    <tr key={rIdx} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-slate-400 border-r border-slate-200">
                        {selectedRange.startRow + rIdx + 1}
                      </td>
                      {cols.map((cellText, cIdx) => (
                        <td key={cIdx} className="py-2 px-3 font-mono text-slate-800 border-r border-slate-200">
                          {cellText}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {sampleRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-slate-400">
                        Selecione uma coluna com dados para visualizar a divisão
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500">
            As colunas adjacentes serão preenchidas com os novos dados
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                onApplySplit(selectedDelimiter, customDelimiter);
                onClose();
              }}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              <Split className="size-4" />
              Dividir em Colunas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
