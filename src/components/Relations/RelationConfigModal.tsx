import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  ArrowRight,
  Calculator,
  Search,
  Sparkles,
  Layers,
  Plus,
  Check,
  Split,
  Table2,
  FileSpreadsheet,
  HelpCircle,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { RelationEdge, RelationFormulaType, RelationOutputDestination } from '../../types/relations';
import { getColumnHeaderName, generateRelationFormula } from '../../engine/relationFormulaEngine';
import { colIndexToLabel } from '../../engine/formulaParser';

interface RelationConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  edgeDraft: Partial<RelationEdge> | null;
  sheets: Sheet[];
  onSaveRelation: (edge: RelationEdge) => void;
  onDeleteRelation?: (edgeId: string) => void;
}

const FORMULA_OPTIONS: {
  type: RelationFormulaType;
  name: string;
  desc: string;
  badge: string;
  icon: React.ReactNode;
}[] = [
  {
    type: 'PROCX',
    name: 'PROCX (Busca e Cruzamento Inteligente)',
    desc: 'Cruza a chave da tabela de origem com a tabela destino e traz a coluna selecionada.',
    badge: 'Recomendado',
    icon: <Search className="size-4 text-emerald-600" />,
  },
  {
    type: 'SOMASE',
    name: 'SOMASE (Soma Condicional)',
    desc: 'Soma os valores da coluna de destino agrupados pela chave correspondente.',
    badge: 'Agregação',
    icon: <Calculator className="size-4 text-indigo-600" />,
  },
  {
    type: 'CONT.SE',
    name: 'CONT.SE (Contagem de Registros)',
    desc: 'Conta a quantidade de ocorrências da chave na tabela relacionada.',
    badge: 'Contagem',
    icon: <Layers className="size-4 text-purple-600" />,
  },
  {
    type: 'MEDIASE',
    name: 'MÉDIASE (Média Condicional)',
    desc: 'Calcula a média aritmética dos valores correspondentes da tabela relacionada.',
    badge: 'Média',
    icon: <Calculator className="size-4 text-sky-600" />,
  },
  {
    type: 'UNIRTEXTO',
    name: 'UNIRTEXTO (Agrupar Textos)',
    desc: 'Agrupa e concatena múltiplos valores encontrados separados por delimitador.',
    badge: 'Texto',
    icon: <Split className="size-4 text-amber-600" />,
  },
  {
    type: 'PROCV',
    name: 'PROCV (Busca Clássica)',
    desc: 'Cruzamento tradicional do Excel baseado em índice de colunas.',
    badge: 'Legado',
    icon: <Search className="size-4 text-slate-500" />,
  },
  {
    type: 'FILTRO',
    name: 'FILTRO (Matriz Dinâmica)',
    desc: 'Retorna múltiplos registros relacionados derramando pelas células.',
    badge: 'Matriz',
    icon: <Sparkles className="size-4 text-rose-600" />,
  },
];

export const RelationConfigModal: React.FC<RelationConfigModalProps> = ({
  isOpen,
  onClose,
  edgeDraft,
  sheets,
  onSaveRelation,
  onDeleteRelation,
}) => {
  const [formulaType, setFormulaType] = useState<RelationFormulaType>('PROCX');
  const [returnColIdx, setReturnColIdx] = useState<number>(0);
  const [outputDestination, setOutputDestination] = useState<RelationOutputDestination>('next_column');
  const [customColName, setCustomColName] = useState<string>('');
  const [delimiter, setDelimiter] = useState<string>(', ');
  const [ifNotFound, setIfNotFound] = useState<string>('');

  const sourceSheet = sheets.find(s => s.id === edgeDraft?.sourceSheetId);
  const targetSheet = sheets.find(s => s.id === edgeDraft?.targetSheetId);

  useEffect(() => {
    if (edgeDraft) {
      if (edgeDraft.formulaType) setFormulaType(edgeDraft.formulaType);
      if (edgeDraft.returnColIdx !== undefined) setReturnColIdx(edgeDraft.returnColIdx);
      else if (targetSheet) setReturnColIdx(Math.min(1, targetSheet.colCount - 1));
      if (edgeDraft.outputDestination) setOutputDestination(edgeDraft.outputDestination);
      if (edgeDraft.customColName) setCustomColName(edgeDraft.customColName);
      if (edgeDraft.delimiter) setDelimiter(edgeDraft.delimiter);
      if (edgeDraft.ifNotFound) setIfNotFound(edgeDraft.ifNotFound);
    }
  }, [edgeDraft, targetSheet]);

  if (!isOpen || !edgeDraft || !sourceSheet || !targetSheet) return null;

  const sourceKeyHeader = getColumnHeaderName(sourceSheet, edgeDraft.sourceColIdx || 0);
  const targetKeyHeader = getColumnHeaderName(targetSheet, edgeDraft.targetColIdx || 0);
  const returnHeaderName = getColumnHeaderName(targetSheet, returnColIdx);

  // Generate preview formula for row 1 (index 1 = Row 2 in Excel)
  const previewFormula = generateRelationFormula(
    {
      id: edgeDraft.id || 'draft',
      sourceSheetId: sourceSheet.id,
      sourceColIdx: edgeDraft.sourceColIdx || 0,
      targetSheetId: targetSheet.id,
      targetColIdx: edgeDraft.targetColIdx || 0,
      formulaType,
      returnColIdx,
      outputDestination,
      customColName,
      delimiter,
      ifNotFound,
      createdAt: Date.now(),
    },
    sourceSheet,
    targetSheet,
    1
  );

  const handleSave = () => {
    const finalEdge: RelationEdge = {
      id: edgeDraft.id || `edge-${Date.now()}`,
      sourceSheetId: sourceSheet.id,
      sourceColIdx: edgeDraft.sourceColIdx || 0,
      targetSheetId: targetSheet.id,
      targetColIdx: edgeDraft.targetColIdx || 0,
      formulaType,
      returnColIdx,
      outputDestination,
      customColName: customColName.trim() || undefined,
      delimiter,
      ifNotFound,
      createdAt: edgeDraft.createdAt || Date.now(),
    };

    onSaveRelation(finalEdge);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150 font-sans">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shadow-xs">
              <Zap className="size-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Configurar Cruzamento Relacional</h3>
              <p className="text-xs text-slate-500">Mapeamento de chaves e injeção automática de fórmulas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Connection Summary Pill */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-white border border-indigo-200 font-semibold text-indigo-900 flex items-center gap-1.5">
                <Table2 className="size-3.5 text-indigo-600" />
                <span>{sourceSheet.name}</span>
                <span className="text-[10px] font-mono text-indigo-700 font-bold bg-indigo-100 px-1 rounded">
                  {sourceKeyHeader} ({colIndexToLabel(edgeDraft.sourceColIdx || 0)})
                </span>
              </div>
            </div>

            <ArrowRight className="size-4 text-indigo-500 shrink-0 mx-2" />

            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-white border border-indigo-200 font-semibold text-indigo-900 flex items-center gap-1.5">
                <Table2 className="size-3.5 text-indigo-600" />
                <span>{targetSheet.name}</span>
                <span className="text-[10px] font-mono text-indigo-700 font-bold bg-indigo-100 px-1 rounded">
                  {targetKeyHeader} ({colIndexToLabel(edgeDraft.targetColIdx || 0)})
                </span>
              </div>
            </div>
          </div>

          {/* Formula Type Selection */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2 uppercase tracking-wider">
              Operação de Cruzamento / Fórmula:
            </label>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto p-0.5">
              {FORMULA_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setFormulaType(opt.type)}
                  className={`p-3 rounded-2xl border text-left flex items-start justify-between transition-all cursor-pointer ${
                    formulaType === opt.type
                      ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs shrink-0 mt-0.5">
                      {opt.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{opt.name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </div>
                  {formulaType === opt.type && (
                    <Check className="size-4 text-indigo-600 shrink-0 mt-1" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Return Column Selection (from Target Sheet) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Campo a Retornar ({targetSheet.name}):
              </label>
              <select
                value={returnColIdx}
                onChange={e => setReturnColIdx(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 font-medium"
              >
                {Array.from({ length: targetSheet.colCount }, (_, i) => (
                  <option key={i} value={i}>
                    {colIndexToLabel(i)} - {getColumnHeaderName(targetSheet, i)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Nome da Nova Coluna:
              </label>
              <input
                type="text"
                value={customColName}
                onChange={e => setCustomColName(e.target.value)}
                placeholder={`${targetSheet.name}_${returnHeaderName}`}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 font-medium"
              />
            </div>
          </div>

          {/* Output Destination Selection */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
              Onde salvar a saída do relacionamento:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutputDestination('next_column')}
                className={`p-3 rounded-2xl border text-xs font-semibold text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  outputDestination === 'next_column'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Table2 className="size-4 text-indigo-600 shrink-0" />
                <div>
                  <div className="font-bold">Próxima Coluna Vazia</div>
                  <div className="text-[10px] text-slate-500 font-normal">Na tabela ativa ({sourceSheet.name})</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutputDestination('new_sheet')}
                className={`p-3 rounded-2xl border text-xs font-semibold text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  outputDestination === 'new_sheet'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <FileSpreadsheet className="size-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold">Criar Nova Aba Combinada</div>
                  <div className="text-[10px] text-slate-500 font-normal">Gera nova planilha relacional</div>
                </div>
              </button>
            </div>
          </div>

          {/* Formula Live Preview Box */}
          <div className="p-3.5 bg-slate-900 text-slate-100 rounded-2xl space-y-1.5 shadow-inner">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Pré-visualização da Fórmula Excel (Linha 2):</span>
              <span className="text-emerald-400 font-bold">100% Nativo</span>
            </div>
            <div className="p-2.5 bg-slate-950/80 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto select-all border border-slate-800">
              {previewFormula}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          {edgeDraft.id && onDeleteRelation ? (
            <button
              onClick={() => {
                onDeleteRelation(edgeDraft.id!);
                onClose();
              }}
              className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-xl font-bold transition-colors cursor-pointer"
            >
              Excluir Relação
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-200 transition-colors font-semibold cursor-pointer"
            >
              Cancelar
            </button>
          )}

          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-2 active:scale-95"
          >
            <Sparkles className="size-4" />
            <span>Executar Cruzamento & Injetar Fórmulas</span>
          </button>
        </div>
      </div>
    </div>
  );
};
