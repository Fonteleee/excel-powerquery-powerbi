import React, { useState } from 'react';
import {
  Table2,
  Key,
  Type,
  Hash,
  Clock,
  Calendar,
  DollarSign,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  Search,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { RelationNode } from '../../types/relations';
import { getColumnHeaderName } from '../../engine/relationFormulaEngine';
import { colIndexToLabel } from '../../engine/formulaParser';

interface TableNodeCardProps {
  sheet: Sheet;
  node: RelationNode;
  showAllFields: boolean;
  showKeysOnly: boolean;
  isSelected?: boolean;
  canDelete?: boolean;
  activeSourcePin?: { sheetId: string; colIdx: number } | null;
  onSelectNode: (sheetId: string) => void;
  onStartConnection: (sheetId: string, colIdx: number, e?: React.MouseEvent) => void;
  onEndConnection: (sheetId: string, colIdx: number) => void;
  onNodeMouseDown: (e: React.MouseEvent, sheetId: string) => void;
  onToggleCollapse: (sheetId: string) => void;
  onDeleteTable?: (sheetId: string) => void;
  onQuickCross?: (sheetId: string) => void;
}

export const TableNodeCard: React.FC<TableNodeCardProps> = ({
  sheet,
  node,
  showAllFields,
  showKeysOnly,
  isSelected,
  canDelete = false,
  activeSourcePin,
  onSelectNode,
  onStartConnection,
  onEndConnection,
  onNodeMouseDown,
  onToggleCollapse,
  onDeleteTable,
  onQuickCross,
}) => {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const getFieldTypeIcon = (colIdx: number) => {
    const header = getColumnHeaderName(sheet, colIdx).toLowerCase();
    if (colIdx === 0 || header.includes('id') || header.includes('código') || header.includes('codigo')) {
      return <Key className="size-3 text-amber-500 shrink-0" />;
    }
    if (header.includes('tempo') || header.includes('hora') || header.includes('pausa') || header.includes('time')) {
      return <Clock className="size-3 text-sky-500 shrink-0" />;
    }
    if (header.includes('data') || header.includes('date') || header.includes('criado') || header.includes('created')) {
      return <Calendar className="size-3 text-emerald-500 shrink-0" />;
    }
    if (header.includes('valor') || header.includes('preço') || header.includes('preco') || header.includes('total') || header.includes('r$') || header.includes('faturamento')) {
      return <DollarSign className="size-3 text-emerald-600 shrink-0" />;
    }
    if (header.includes('qtd') || header.includes('número') || header.includes('numero') || header.includes('meta')) {
      return <Hash className="size-3 text-purple-500 shrink-0" />;
    }
    if (header.includes('ativo') || header.includes('status') || header.includes('deleted')) {
      return <CheckSquare className="size-3 text-indigo-500 shrink-0" />;
    }
    return <Type className="size-3 text-slate-400 shrink-0" />;
  };

  const columns = Array.from({ length: sheet.colCount }, (_, i) => ({
    idx: i,
    name: getColumnHeaderName(sheet, i),
    letter: colIndexToLabel(i),
    isKey: i === 0 || getColumnHeaderName(sheet, i).toLowerCase().includes('id'),
  })).filter(c => c.name.trim() !== '');

  const visibleColumns = columns.filter(col => {
    if (showKeysOnly && !col.isKey) return false;
    if (searchTerm.trim() !== '') {
      return (
        col.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        col.letter.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return true;
  });

  const isConnectingMode = !!activeSourcePin;

  return (
    <div
      style={{
        transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
        position: 'absolute',
        left: 0,
        top: 0,
      }}
      onClick={() => onSelectNode(sheet.id)}
      className={`w-76 bg-white rounded-2xl border transition-all duration-200 shadow-md select-none font-sans overflow-hidden group ${
        isSelected
          ? 'border-indigo-600 ring-2 ring-indigo-500/30 shadow-xl'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-lg'
      }`}
    >
      {/* Node Header */}
      <div
        onMouseDown={e => onNodeMouseDown(e, sheet.id)}
        className="px-3.5 py-2.5 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between cursor-grab active:cursor-grabbing hover:bg-slate-100/90 transition-colors"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="size-6 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
            <Table2 className="size-3.5" />
          </div>
          <span className="text-xs font-bold text-slate-800 truncate" title={sheet.name}>
            {sheet.name}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Quick Cross Action Button */}
          {onQuickCross && (
            <button
              onClick={e => {
                e.stopPropagation();
                onQuickCross(sheet.id);
              }}
              title="Cruzar com outra tabela ou coluna"
              className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center gap-0.5 cursor-pointer shadow-2xs"
            >
              <Plus className="size-2.5" />
              <span>Cruzar</span>
            </button>
          )}

          <span className="text-[10px] px-1.5 py-0.2 bg-slate-200/70 text-slate-600 font-semibold rounded-full">
            {sheet.colCount}
          </span>

          {canDelete && onDeleteTable && (
            <button
              onClick={e => {
                e.stopPropagation();
                if (showConfirmDelete) {
                  onDeleteTable(sheet.id);
                } else {
                  setShowConfirmDelete(true);
                  setTimeout(() => setShowConfirmDelete(false), 3000);
                }
              }}
              title={showConfirmDelete ? 'Confirmar exclusão' : 'Excluir Tabela'}
              className={`size-5 rounded flex items-center justify-center transition-colors cursor-pointer ${
                showConfirmDelete
                  ? 'bg-rose-600 text-white font-bold animate-pulse'
                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
              }`}
            >
              <Trash2 className="size-3" />
            </button>
          )}

          <button
            onClick={e => {
              e.stopPropagation();
              onToggleCollapse(sheet.id);
            }}
            className="size-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            {node.isCollapsed ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
          </button>
        </div>
      </div>

      {/* Micro Column Filter (if > 6 columns) */}
      {!node.isCollapsed && sheet.colCount > 6 && (
        <div className="px-2.5 py-1 bg-slate-50/80 border-b border-slate-100 flex items-center gap-1.5">
          <Search className="size-3 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filtrar campos..."
            className="w-full text-[11px] bg-transparent border-none focus:outline-hidden text-slate-700 placeholder:text-slate-400"
          />
        </div>
      )}

      {/* Node Fields List */}
      {!node.isCollapsed && showAllFields && (
        <div className="p-1.5 space-y-0.5 max-h-72 overflow-y-auto bg-white divide-y divide-slate-50">
          {visibleColumns.map(col => {
            const isSourceActive =
              activeSourcePin?.sheetId === sheet.id && activeSourcePin?.colIdx === col.idx;
            const isValidTarget =
              isConnectingMode && !(activeSourcePin?.sheetId === sheet.id && activeSourcePin?.colIdx === col.idx);

            return (
              <div
                key={col.idx}
                className={`group/field relative flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-xs text-slate-700 ${
                  isSourceActive
                    ? 'bg-indigo-100 text-indigo-900 font-bold'
                    : isValidTarget
                    ? 'hover:bg-emerald-50'
                    : 'hover:bg-indigo-50/60'
                }`}
              >
                {/* Left Port (Target) com Hitbox Expandida de 28px para conformidade Touch Target */}
                <div
                  onClick={e => {
                    e.stopPropagation();
                    if (isConnectingMode) onEndConnection(sheet.id, col.idx);
                  }}
                  onMouseUp={() => onEndConnection(sheet.id, col.idx)}
                  title="Conectar destino aqui"
                  className="absolute -left-3.5 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center cursor-pointer z-20 group/port"
                >
                  <div
                    className={`size-3 rounded-full bg-white border-2 transition-all shadow-xs ${
                      isValidTarget
                        ? 'border-emerald-500 bg-emerald-100 ring-4 ring-emerald-400/40 animate-pulse scale-125'
                        : 'border-slate-300 group-hover/port:border-indigo-600 group-hover/port:bg-indigo-500 group-hover/port:scale-125'
                    }`}
                  />
                </div>

                {/* Field Label & Icon */}
                <div className="flex items-center gap-2 truncate pr-2">
                  {getFieldTypeIcon(col.idx)}
                  <span className={`truncate text-xs ${col.isKey ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                    {col.name}
                  </span>
                  {col.isKey && <span className="text-amber-500 text-[10px] font-bold">*</span>}
                </div>

                {/* Column Letter Badge */}
                <span className="text-[10px] text-slate-400 font-mono shrink-0 group-hover/field:text-indigo-600">
                  {col.letter}
                </span>

                {/* Right Port (Source) com Hitbox Expandida de 28px para facilidade de toque/arraste */}
                <div
                  onClick={e => {
                    e.stopPropagation();
                    onStartConnection(sheet.id, col.idx, e);
                  }}
                  onMouseDown={e => {
                    e.stopPropagation();
                    onStartConnection(sheet.id, col.idx, e);
                  }}
                  title="Clique ou arraste para conectar a outra coluna"
                  className="absolute -right-3.5 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center cursor-crosshair z-20 group/sourceport"
                >
                  <div
                    className={`size-3 rounded-full bg-white border-2 transition-all shadow-xs flex items-center justify-center ${
                      isSourceActive
                        ? 'border-indigo-600 bg-indigo-600 ring-4 ring-indigo-500/40 scale-125'
                        : 'border-indigo-500 group-hover/sourceport:bg-indigo-600 group-hover/sourceport:scale-125'
                    }`}
                  >
                    <div className="size-1 bg-indigo-500 rounded-full group-hover/sourceport:bg-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Node Footer */}
      <div className="px-3 py-1.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
        <span>{sheet.rowCount} linhas</span>
        <span className="font-mono text-[9px] text-slate-400">Aba: {sheet.name}</span>
      </div>
    </div>
  );
};
