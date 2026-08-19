import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Replace, X, ChevronDown, ChevronUp, Check, ArrowRight, Table, Hash } from 'lucide-react';
import { Sheet, CellPosition } from '../../types/spreadsheet';
import { cellPosToAddress, cellPosToKey, colIndexToLabel, recalculateSheet } from '../../engine/formulaParser';

interface FindReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  activeCell: CellPosition;
  onSelectCell: (pos: CellPosition) => void;
  onUpdateSheet: (sheet: Sheet) => void;
}

export const FindReplaceModal: React.FC<FindReplaceModalProps> = ({
  isOpen,
  onClose,
  sheet,
  activeCell,
  onSelectCell,
  onUpdateSheet,
}) => {
  const [activeTab, setActiveTab] = useState<'find' | 'replace'>('find');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchEntireCell, setMatchEntireCell] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setStatusMessage(null);
    }
  }, [isOpen]);

  // Find all matches in sheet
  const matches = useMemo(() => {
    if (!findText.trim()) return [];

    const list: { row: number; col: number; key: string; address: string; value: string; raw: string }[] = [];
    const query = matchCase ? findText : findText.toLowerCase();

    for (let r = 0; r < sheet.rowCount; r++) {
      for (let c = 0; c < sheet.colCount; c++) {
        const key = cellPosToKey(r, c);
        const cell = sheet.data[key];
        if (!cell) continue;

        const valStr = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
        const rawStr = cell.raw || '';

        const targetVal = matchCase ? valStr : valStr.toLowerCase();
        const targetRaw = matchCase ? rawStr : rawStr.toLowerCase();

        let isMatch = false;
        if (matchEntireCell) {
          isMatch = targetVal === query || targetRaw === query;
        } else {
          isMatch = targetVal.includes(query) || targetRaw.includes(query);
        }

        if (isMatch) {
          list.push({
            row: r,
            col: c,
            key,
            address: `${colIndexToLabel(c)}${r + 1}`,
            value: valStr,
            raw: rawStr,
          });
        }
      }
    }
    return list;
  }, [sheet, findText, matchCase, matchEntireCell]);

  // Current match index based on active cell
  const currentMatchIndex = useMemo(() => {
    return matches.findIndex(m => m.row === activeCell.row && m.col === activeCell.col);
  }, [matches, activeCell]);

  // Find Next
  const handleFindNext = () => {
    if (matches.length === 0) {
      setStatusMessage('Nenhum resultado encontrado.');
      return;
    }

    let nextIdx = 0;
    if (currentMatchIndex !== -1 && currentMatchIndex < matches.length - 1) {
      nextIdx = currentMatchIndex + 1;
    } else {
      nextIdx = 0;
    }

    const target = matches[nextIdx];
    onSelectCell({ row: target.row, col: target.col });
    setStatusMessage(`Ocorrência ${nextIdx + 1} de ${matches.length} (Célula ${target.address})`);
  };

  // Find Previous
  const handleFindPrev = () => {
    if (matches.length === 0) {
      setStatusMessage('Nenhum resultado encontrado.');
      return;
    }

    let prevIdx = matches.length - 1;
    if (currentMatchIndex > 0) {
      prevIdx = currentMatchIndex - 1;
    }

    const target = matches[prevIdx];
    onSelectCell({ row: target.row, col: target.col });
    setStatusMessage(`Ocorrência ${prevIdx + 1} de ${matches.length} (Célula ${target.address})`);
  };

  // Replace single instance
  const handleReplaceCurrent = () => {
    const key = cellPosToKey(activeCell.row, activeCell.col);
    const cell = sheet.data[key];
    if (!cell) {
      handleFindNext();
      return;
    }

    const valStr = String(cell.raw || cell.value || '');
    let replaced = '';

    if (matchEntireCell) {
      replaced = replaceText;
    } else {
      const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
      replaced = valStr.replace(regex, replaceText);
    }

    const updatedData = {
      ...sheet.data,
      [key]: {
        ...cell,
        raw: replaced,
        value: replaced.startsWith('=') ? null : replaced,
      },
    };

    const recalculated = recalculateSheet({ ...sheet, data: updatedData });
    onUpdateSheet(recalculated);
    handleFindNext();
    setStatusMessage(`Substituído em ${cellPosToAddress(activeCell)}`);
  };

  // Replace All
  const handleReplaceAll = () => {
    if (matches.length === 0) {
      setStatusMessage('Nenhum resultado para substituir.');
      return;
    }

    const updatedData = { ...sheet.data };
    let count = 0;

    matches.forEach(m => {
      const cell = updatedData[m.key];
      if (cell) {
        const valStr = String(cell.raw || cell.value || '');
        let replaced = '';
        if (matchEntireCell) {
          replaced = replaceText;
        } else {
          const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
          replaced = valStr.replace(regex, replaceText);
        }

        updatedData[m.key] = {
          ...cell,
          raw: replaced,
          value: replaced.startsWith('=') ? null : replaced,
        };
        count++;
      }
    });

    const recalculated = recalculateSheet({ ...sheet, data: updatedData });
    onUpdateSheet(recalculated);
    setStatusMessage(`✅ Sucesso! ${count} ocorrências substituídas.`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-12 px-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              {activeTab === 'find' ? <Search className="size-4" /> : <Replace className="size-4" />}
            </div>
            <span>Localizar e Substituir</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
              Ctrl+L
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs: Localizar / Substituir */}
        <div className="flex border-b border-slate-200 bg-slate-100/50 px-5 pt-2 gap-2">
          <button
            onClick={() => setActiveTab('find')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'find'
                ? 'border-emerald-600 text-emerald-900 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Localizar
          </button>
          <button
            onClick={() => setActiveTab('replace')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'replace'
                ? 'border-emerald-600 text-emerald-900 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Substituir
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Find Field */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 flex items-center justify-between">
              <span>Localizar:</span>
              {findText.trim() && (
                <span className="text-[11px] font-mono text-emerald-700 font-bold">
                  {matches.length} {matches.length === 1 ? 'resultado' : 'resultados'}
                </span>
              )}
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={findText}
                onChange={e => setFindText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleFindNext();
                  if (e.key === 'Escape') onClose();
                }}
                placeholder="Digite o texto, número ou fórmula para buscar..."
                className="w-full h-8 px-3 pr-8 bg-slate-50 border border-slate-300 focus:border-emerald-600 focus:bg-white rounded-lg font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden"
              />
              <Search className="absolute right-2.5 top-2.5 size-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Replace Field */}
          {activeTab === 'replace' && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="font-semibold text-slate-700">Substituir por:</label>
              <div className="relative">
                <input
                  type="text"
                  value={replaceText}
                  onChange={e => setReplaceText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleReplaceCurrent();
                    if (e.key === 'Escape') onClose();
                  }}
                  placeholder="Novo valor a ser inserido..."
                  className="w-full h-8 px-3 pr-8 bg-slate-50 border border-slate-300 focus:border-emerald-600 focus:bg-white rounded-lg font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden"
                />
                <Replace className="absolute right-2.5 top-2.5 size-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Search Options */}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={e => setMatchCase(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span>Coincidir maiúsculas / minúsculas</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={matchEntireCell}
                onChange={e => setMatchEntireCell(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span>Conteúdo da célula inteira</span>
            </label>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[11px] flex items-center gap-1.5 animate-in fade-in">
              <Check className="size-3.5 text-emerald-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Results List table (Toggleable) */}
          {matches.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
              <div
                onClick={() => setShowAllResults(!showAllResults)}
                className="p-2 px-3 flex items-center justify-between text-slate-700 font-bold cursor-pointer hover:bg-slate-100 transition-colors"
              >
                <span>Ver lista de todas as {matches.length} ocorrências</span>
                {showAllResults ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </div>

              {showAllResults && (
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-200 bg-white">
                  {matches.map((m, i) => (
                    <div
                      key={i}
                      onClick={() => onSelectCell({ row: m.row, col: m.col })}
                      className={`px-3 py-1.5 flex items-center justify-between hover:bg-emerald-50 cursor-pointer text-[11px] font-mono ${
                        m.row === activeCell.row && m.col === activeCell.col
                          ? 'bg-emerald-100/70 font-bold text-emerald-950'
                          : 'text-slate-700'
                      }`}
                    >
                      <span className="font-bold text-emerald-800 w-16">{m.address}</span>
                      <span className="truncate flex-1 px-2">{m.value || m.raw}</span>
                      <span className="text-[10px] text-slate-400">Linha {m.row + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleFindPrev}
              disabled={matches.length === 0}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
            >
              Anterior
            </button>
            <button
              onClick={handleFindNext}
              disabled={matches.length === 0}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
            >
              Próximo
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'replace' && (
              <>
                <button
                  onClick={handleReplaceCurrent}
                  disabled={matches.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 text-slate-800 font-bold text-xs transition-colors cursor-pointer"
                >
                  Substituir
                </button>
                <button
                  onClick={handleReplaceAll}
                  disabled={matches.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
                >
                  Substituir Tudo
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
