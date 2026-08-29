import React from 'react';
import {
  Sigma,
  Filter,
  Table2,
  Trash2,
  Play,
  Layers,
  ChevronDown,
  Plus,
  X,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { getColumnHeaderName } from '../../engine/relationFormulaEngine';

export type ActionBlockType = 'groupby' | 'filter' | 'output';

export interface ActionBlockData {
  id: string;
  type: ActionBlockType;
  x: number;
  y: number;
  sourceSheetId: string;
  // Group By settings
  groupByCols?: number[];
  aggregations?: { colIdx: number; aggType: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX'; outputName?: string }[];
  // Filter settings
  filterConditions?: { colIdx: number; operator: string; value: string }[];
  // Output settings
  outputSheetName?: string;
}

interface ActionBlockCardProps {
  block: ActionBlockData;
  sheets: Sheet[];
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updated: ActionBlockData) => void;
  onDelete: () => void;
  onExecute: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export const ActionBlockCard: React.FC<ActionBlockCardProps> = ({
  block,
  sheets,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onExecute,
  onMouseDown,
}) => {
  const currentSheet = sheets.find(s => s.id === block.sourceSheetId) || sheets[0];
  const sheetCols = currentSheet
    ? Array.from({ length: currentSheet.colCount }, (_, i) => ({
        idx: i,
        name: getColumnHeaderName(currentSheet, i),
      }))
    : [];

  const getHeaderConfig = () => {
    switch (block.type) {
      case 'groupby':
        return {
          title: 'Bloco de Agrupamento',
          badge: 'Group By & Aggregate',
          icon: <Sigma className="size-4" />,
          bgHeader: 'bg-indigo-600',
          borderColor: 'border-indigo-200',
          accentText: 'text-indigo-600',
        };
      case 'filter':
        return {
          title: 'Bloco de Filtragem',
          badge: 'Filter & Split',
          icon: <Filter className="size-4" />,
          bgHeader: 'bg-amber-600',
          borderColor: 'border-amber-200',
          accentText: 'text-amber-600',
        };
      case 'output':
        return {
          title: 'Tabela de Saída',
          badge: 'Output Sheet',
          icon: <Table2 className="size-4" />,
          bgHeader: 'bg-emerald-600',
          borderColor: 'border-emerald-200',
          accentText: 'text-emerald-600',
        };
    }
  };

  const config = getHeaderConfig();

  return (
    <div
      onClick={onSelect}
      style={{
        transform: `translate(${block.x}px, ${block.y}px)`,
      }}
      className={`absolute w-84 select-none rounded-2xl border bg-white shadow-xl transition-shadow ${
        isSelected
          ? `ring-2 ring-offset-2 ring-indigo-500 shadow-2xl border-indigo-300`
          : `${config.borderColor} hover:shadow-2xl`
      }`}
    >
      {/* Header Bar */}
      <div
        onMouseDown={onMouseDown}
        className={`flex items-center justify-between rounded-t-2xl px-4 py-2.5 text-white ${config.bgHeader} cursor-grab active:cursor-grabbing`}
      >
        <div className="flex items-center gap-2">
          {config.icon}
          <div>
            <h4 className="text-xs font-bold leading-tight">{config.title}</h4>
            <span className="text-[10px] font-medium text-white/80">{config.badge}</span>
          </div>
        </div>

        <button
          onClick={e => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded-lg p-1 text-white/80 hover:bg-black/20 hover:text-white transition-colors cursor-pointer"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Body Content */}
      <div className="p-3.5 space-y-3 text-xs">
        {/* Source Table Selector */}
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">Tabela de Entrada:</label>
          <select
            value={block.sourceSheetId}
            onChange={e => onUpdate({ ...block, sourceSheetId: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
          >
            {sheets.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* GROUP BY CONFIG */}
        {block.type === 'groupby' && (
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Agrupar por (Dimensão):</label>
              <select
                value={block.groupByCols?.[0] ?? 0}
                onChange={e => onUpdate({ ...block, groupByCols: [parseInt(e.target.value, 10)] })}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
              >
                {sheetCols.map(c => (
                  <option key={c.idx} value={c.idx}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Métrica & Operação:</label>
              <div className="flex gap-1.5">
                <select
                  value={block.aggregations?.[0]?.colIdx ?? 1}
                  onChange={e =>
                    onUpdate({
                      ...block,
                      aggregations: [
                        {
                          colIdx: parseInt(e.target.value, 10),
                          aggType: block.aggregations?.[0]?.aggType || 'SUM',
                        },
                      ],
                    })
                  }
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
                >
                  {sheetCols.map(c => (
                    <option key={c.idx} value={c.idx}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={block.aggregations?.[0]?.aggType ?? 'SUM'}
                  onChange={e =>
                    onUpdate({
                      ...block,
                      aggregations: [
                        {
                          colIdx: block.aggregations?.[0]?.colIdx ?? 1,
                          aggType: e.target.value as any,
                        },
                      ],
                    })
                  }
                  className="w-24 rounded-lg border border-slate-200 bg-indigo-50 font-bold text-indigo-800 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="SUM">Soma</option>
                  <option value="AVG">Média</option>
                  <option value="COUNT">Contagem</option>
                  <option value="MIN">Mínimo</option>
                  <option value="MAX">Máximo</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* FILTER CONFIG */}
        {block.type === 'filter' && (
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Coluna para Filtrar:</label>
              <select
                value={block.filterConditions?.[0]?.colIdx ?? 0}
                onChange={e =>
                  onUpdate({
                    ...block,
                    filterConditions: [
                      {
                        colIdx: parseInt(e.target.value, 10),
                        operator: block.filterConditions?.[0]?.operator || '>',
                        value: block.filterConditions?.[0]?.value || '0',
                      },
                    ],
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:outline-none"
              >
                {sheetCols.map(c => (
                  <option key={c.idx} value={c.idx}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-1.5">
              <select
                value={block.filterConditions?.[0]?.operator ?? '>'}
                onChange={e =>
                  onUpdate({
                    ...block,
                    filterConditions: [
                      {
                        colIdx: block.filterConditions?.[0]?.colIdx ?? 0,
                        operator: e.target.value,
                        value: block.filterConditions?.[0]?.value || '0',
                      },
                    ],
                  })
                }
                className="w-24 rounded-lg border border-slate-200 bg-amber-50 font-bold text-amber-900 px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none"
              >
                <option value=">">Maior (&gt;)</option>
                <option value=">=">Maior Igual (&gt;=)</option>
                <option value="<">Menor (&lt;)</option>
                <option value="<=">Menor Igual (&lt;=)</option>
                <option value="=">Igual (=)</option>
                <option value="<>">Diferente (&lt;&gt;)</option>
                <option value="contains">Contém</option>
              </select>

              <input
                type="text"
                value={block.filterConditions?.[0]?.value ?? '0'}
                placeholder="Valor alvo"
                onChange={e =>
                  onUpdate({
                    ...block,
                    filterConditions: [
                      {
                        colIdx: block.filterConditions?.[0]?.colIdx ?? 0,
                        operator: block.filterConditions?.[0]?.operator || '>',
                        value: e.target.value,
                      },
                    ],
                  })
                }
                className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* OUTPUT SHEET CONFIG */}
        {block.type === 'output' && (
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">Nome da Nova Planilha:</label>
            <input
              type="text"
              value={block.outputSheetName || `Consolidado_${currentSheet?.name.slice(0, 10)}`}
              onChange={e => onUpdate({ ...block, outputSheetName: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={e => {
            e.stopPropagation();
            onExecute();
          }}
          className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white shadow-sm transition-all btn-tactile cursor-pointer ${
            block.type === 'output'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : block.type === 'filter'
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          <Play className="size-3.5 fill-current" />
          <span>{block.type === 'output' ? 'Gerar Tabela de Saída' : 'Executar e Gerar Aba'}</span>
        </button>
      </div>
    </div>
  );
};
