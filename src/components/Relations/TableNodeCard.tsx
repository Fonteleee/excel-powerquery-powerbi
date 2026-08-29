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
  MoreVertical,
  Trash2,
  Plus,
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
  onSelectNode: (sheetId: string) => void;
  onStartConnection: (sheetId: string, colIdx: number, e: React.MouseEvent) => void;
  onEndConnection: (sheetId: string, colIdx: number) => void;
  onNodeMouseDown: (e: React.MouseEvent, sheetId: string) => void;
  onToggleCollapse: (sheetId: string) => void;
  onDeleteTable?: (sheetId: string) => void;
}

export const TableNodeCard: React.FC<TableNodeCardProps> = ({
  sheet,
  node,
  showAllFields,
  showKeysOnly,
  isSelected,
  canDelete = false,
  onSelectNode,
  onStartConnection,
  onEndConnection,
  onNodeMouseDown,
  onToggleCollapse,
  onDeleteTable,
}) => {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const getFieldTypeIcon = (colIdx: number) => {
    // Detect type by sample values or column name
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
    if (header.includes('valor') || header.includes('preço') || header.includes('preco') || header.includes('total') || header.includes('r$')) {
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
  }));

  const visibleColumns = columns.filter(col => {
    if (showKeysOnly) return col.isKey;
    return true;
  });

  return (
    <div
      style={{
        transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
        position: 'absolute',
        left: 0,
        top: 0,
      }}
      onClick={() => onSelectNode(sheet.id)}
      className={`w-72 bg-white rounded-2xl border transition-shadow shadow-md select-none font-sans overflow-hidden group ${
        isSelected
          ? 'border-indigo-600 ring-2 ring-indigo-500/30 shadow-xl'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-lg'
      }`}
    >
      {/* Node Header (Draggable Handle) */}
      <div
        onMouseDown={e => onNodeMouseDown(e, sheet.id)}
        className="px-3.5 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between cursor-grab active:cursor-grabbing hover:bg-slate-100/80 transition-colors"
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
          <span className="text-[10px] px-1.5 py-0.2 bg-slate-200/70 text-slate-600 font-semibold rounded-full">
            {sheet.colCount}
          </span>

          {/* Delete Table Button */}
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
              title={showConfirmDelete ? 'Clique novamente para confirmar a exclusão' : 'Excluir Tabela'}
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

      {/* Node Fields List */}
      {!node.isCollapsed && showAllFields && (
        <div className="p-1.5 space-y-0.5 max-h-80 overflow-y-auto bg-white divide-y divide-slate-50">
          {visibleColumns.map(col => (
            <div
              key={col.idx}
              className="group/field relative flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-indigo-50/60 transition-colors text-xs text-slate-700"
            >
              {/* Left Connection Port (Target) */}
              <div
                onMouseUp={() => onEndConnection(sheet.id, col.idx)}
                title="Soltar conexão aqui (Campo Destino)"
                className="absolute -left-2 top-1/2 -translate-y-1/2 size-3.5 rounded-full bg-white border-2 border-slate-300 hover:border-indigo-600 hover:bg-indigo-500 hover:scale-125 transition-all cursor-pointer shadow-xs z-10"
              />

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

              {/* Right Connection Port (Source Drag Handle) */}
              <div
                onMouseDown={e => {
                  e.stopPropagation();
                  onStartConnection(sheet.id, col.idx, e);
                }}
                title="Arrastar para conectar a outra tabela"
                className="absolute -right-2 top-1/2 -translate-y-1/2 size-3.5 rounded-full bg-white border-2 border-indigo-500 hover:bg-indigo-600 hover:scale-125 transition-all cursor-crosshair shadow-xs z-10 flex items-center justify-center group-hover/field:border-indigo-600"
              >
                <div className="size-1 bg-indigo-500 rounded-full group-hover/field:bg-white" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Node Footer */}
      <div className="px-3 py-1.5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
        <span>{sheet.rowCount} linhas</span>
        <span className="font-mono text-[9px] text-slate-400">ID: {sheet.id.slice(0, 7)}</span>
      </div>
    </div>
  );
};
