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
  TrendingUp,
  Percent,
  Divide,
  Diff,
  Combine,
  Info,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { RelationEdge, RelationFormulaType, RelationOutputDestination } from '../../types/relations';
import { getColumnHeaderName, generateRelationFormula } from '../../engine/relationFormulaEngine';
import { colIndexToLabel, evaluateFormula } from '../../engine/formulaParser';

interface RelationConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  edgeDraft: Partial<RelationEdge> | null;
  sheets: Sheet[];
  onSaveRelation: (edge: RelationEdge) => void;
  onDeleteRelation?: (edgeId: string) => void;
}

export const RelationConfigModal: React.FC<RelationConfigModalProps> = ({
  isOpen,
  onClose,
  edgeDraft,
  sheets,
  onSaveRelation,
  onDeleteRelation,
}) => {
  const sourceSheet = sheets.find(s => s.id === edgeDraft?.sourceSheetId);
  const targetSheet = sheets.find(s => s.id === edgeDraft?.targetSheetId);
  const isSameSheet = sourceSheet && targetSheet && sourceSheet.id === targetSheet.id;

  const [formulaType, setFormulaType] = useState<RelationFormulaType>(isSameSheet ? 'SUM_COLS' : 'PROCX');
  const [sourceColIdx, setSourceColIdx] = useState<number>(0);
  const [targetColIdx, setTargetColIdx] = useState<number>(0);
  const [returnColIdx, setReturnColIdx] = useState<number>(0);
  const [outputDestination, setOutputDestination] = useState<RelationOutputDestination>('next_column');
  const [customColName, setCustomColName] = useState<string>('');
  const [delimiter, setDelimiter] = useState<string>(' - ');
  const [ifNotFound, setIfNotFound] = useState<string>('');
  const [compareOperator, setCompareOperator] = useState<'>' | '>=' | '<' | '<=' | '=' | '<>'>('>=');
  const [ifTrueValue, setIfTrueValue] = useState<string>('Meta Atingida');
  const [ifFalseValue, setIfFalseValue] = useState<string>('Pendente');

  useEffect(() => {
    if (edgeDraft && sourceSheet && targetSheet) {
      const srcIdx = edgeDraft.sourceColIdx ?? 0;
      const tgtIdx = edgeDraft.targetColIdx ?? 0;
      setSourceColIdx(srcIdx);

      const isSame = sourceSheet.id === targetSheet.id;
      const initialFormula = edgeDraft.formulaType || (isSame ? 'SUM_COLS' : 'PROCX');
      setFormulaType(initialFormula);

      if (initialFormula === 'PROCX' || initialFormula === 'PROCV' || initialFormula === 'SOMASE' || initialFormula === 'MEDIASE' || initialFormula === 'FILTRO') {
        // Find matching key in targetSheet (same column name as source if exists)
        const sourceColName = getColumnHeaderName(sourceSheet, srcIdx).toLowerCase();
        let matchedTargetKey = tgtIdx;
        for (let c = 0; c < targetSheet.colCount; c++) {
          if (getColumnHeaderName(targetSheet, c).toLowerCase() === sourceColName) {
            matchedTargetKey = c;
            break;
          }
        }
        setTargetColIdx(matchedTargetKey);
        setReturnColIdx(tgtIdx !== matchedTargetKey ? tgtIdx : (matchedTargetKey === 0 ? Math.min(1, targetSheet.colCount - 1) : 0));
      } else {
        setTargetColIdx(tgtIdx);
        setReturnColIdx(tgtIdx);
      }

      if (edgeDraft.returnColIdx !== undefined) setReturnColIdx(edgeDraft.returnColIdx);
      if (edgeDraft.outputDestination) setOutputDestination(edgeDraft.outputDestination);
      if (edgeDraft.customColName) setCustomColName(edgeDraft.customColName);
      if (edgeDraft.delimiter) setDelimiter(edgeDraft.delimiter);
      if (edgeDraft.ifNotFound) setIfNotFound(edgeDraft.ifNotFound);
      if (edgeDraft.compareOperator) setCompareOperator(edgeDraft.compareOperator);
      if (edgeDraft.ifTrueValue) setIfTrueValue(edgeDraft.ifTrueValue);
      if (edgeDraft.ifFalseValue) setIfFalseValue(edgeDraft.ifFalseValue);
    }
  }, [edgeDraft, sourceSheet, targetSheet]);

  if (!isOpen || !edgeDraft || !sourceSheet || !targetSheet) return null;

  const sourceColumns = Array.from({ length: sourceSheet.colCount }, (_, i) => ({
    idx: i,
    name: getColumnHeaderName(sourceSheet, i),
    letter: colIndexToLabel(i),
  })).filter(c => c.name.trim() !== '');

  const targetColumns = Array.from({ length: targetSheet.colCount }, (_, i) => ({
    idx: i,
    name: getColumnHeaderName(targetSheet, i),
    letter: colIndexToLabel(i),
  })).filter(c => c.name.trim() !== '');

  const isLookupType = ['PROCX', 'PROCV', 'SOMASE', 'CONT.SE', 'MEDIASE', 'FILTRO', 'UNIRTEXTO'].includes(formulaType);

  // Formula Options for Intra-Table (Single Sheet) vs Cross-Table
  const formulaOptions: {
    type: RelationFormulaType;
    name: string;
    desc: string;
    badge: string;
    icon: React.ReactNode;
  }[] = isSameSheet
    ? [
        {
          type: 'PROCX',
          name: `Auto-PROCX na Mesma Tabela (Buscar por Chave)`,
          desc: 'Busca um valor cruzando colunas da própria tabela (ex: Buscar Nome pelo ID).',
          badge: 'Cruzamento',
          icon: <Search className="size-4 text-emerald-600" />,
        },
        {
          type: 'SUM_COLS',
          name: `Soma das Colunas (A + B)`,
          desc: 'Soma os valores numéricos das duas colunas linha a linha.',
          badge: 'Aritmética',
          icon: <Calculator className="size-4 text-emerald-600" />,
        },
        {
          type: 'SUB_COLS',
          name: `Subtração / Diferença (A - B)`,
          desc: 'Calcula a diferença entre os valores das duas colunas.',
          badge: 'Diferença',
          icon: <Diff className="size-4 text-sky-600" />,
        },
        {
          type: 'MULT_COLS',
          name: `Multiplicação (A * B)`,
          desc: 'Multiplica os valores (ex: Quantidade * Preço Unitário).',
          badge: 'Produto',
          icon: <Calculator className="size-4 text-purple-600" />,
        },
        {
          type: 'DIV_COLS',
          name: `Divisão / Razão (A / B)`,
          desc: 'Calcula a proporção entre as colunas com proteção contra divisão por zero.',
          badge: 'Razão',
          icon: <Divide className="size-4 text-amber-600" />,
        },
        {
          type: 'PCT_DIFF',
          name: `Variação Percentual (Δ% entre Colunas)`,
          desc: 'Calcula o crescimento/variação percentual relativa.',
          badge: 'Porcentagem',
          icon: <Percent className="size-4 text-indigo-600" />,
        },
        {
          type: 'CONCAT',
          name: `Juntar / Concatenar (A & B)`,
          desc: 'Concatena os textos das duas colunas com espaço ou separador.',
          badge: 'Texto',
          icon: <Combine className="size-4 text-rose-600" />,
        },
        {
          type: 'IF_COMPARE',
          name: `Condicional SE (A vs B)`,
          desc: 'Avalia regra lógica e retorna status personalizado.',
          badge: 'Lógica',
          icon: <Sparkles className="size-4 text-indigo-600" />,
        },
        {
          type: 'ROW_LAG',
          name: `Diferença com a Linha Anterior (Lag)`,
          desc: 'Calcula o delta entre a linha atual e a linha anterior (A2 - A1).',
          badge: 'Linha a Linha',
          icon: <TrendingUp className="size-4 text-teal-600" />,
        },
        {
          type: 'RUNNING_TOTAL',
          name: `Soma Acumulada Linha a Linha`,
          desc: 'Soma progressiva cumulativa ao longo das linhas da tabela.',
          badge: 'Acumulado',
          icon: <Layers className="size-4 text-emerald-600" />,
        },
      ]
    : [
        {
          type: 'PROCX',
          name: 'PROCX (Cruzamento Inteligente)',
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

  // Draft edge for preview calculation
  const currentEdge: RelationEdge = {
    id: edgeDraft.id || 'draft',
    sourceSheetId: sourceSheet.id,
    sourceColIdx: sourceColIdx,
    targetSheetId: targetSheet.id,
    targetColIdx: targetColIdx,
    formulaType,
    returnColIdx: returnColIdx,
    outputDestination,
    customColName: customColName.trim() || undefined,
    delimiter,
    ifNotFound,
    compareOperator,
    ifTrueValue,
    ifFalseValue,
    createdAt: Date.now(),
  };

  // Preview formula for row 1 (Excel row 2)
  const previewFormula = generateRelationFormula(currentEdge, sourceSheet, targetSheet, 1);

  // Live evaluation of sample result
  let previewCalculatedValue: any = '';
  try {
    previewCalculatedValue = evaluateFormula(previewFormula, sourceSheet, sheets);
  } catch (err: any) {
    previewCalculatedValue = '#ERRO!';
  }

  const handleSave = () => {
    onSaveRelation(currentEdge);
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
              <h3 className="text-sm font-bold text-slate-900">
                {isSameSheet ? 'Configurar Cálculo & Cruzamento' : 'Configurar Cruzamento Relacional (PROCX)'}
              </h3>
              <p className="text-xs text-slate-500">
                {isSameSheet
                  ? `Transformação e fórmula na tabela ${sourceSheet.name}`
                  : `Cruzamento de dados entre ${sourceSheet.name} e ${targetSheet.name}`}
              </p>
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
          {/* Column Mappings Configuration Panel */}
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-3">
            <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
              <Info className="size-3.5 text-indigo-600" />
              <span>Mapeamento de Colunas do Cruzamento:</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* Source Column (Lookup Key) */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  1. Chave de Busca ({sourceSheet.name}):
                </label>
                <select
                  value={sourceColIdx}
                  onChange={e => setSourceColIdx(parseInt(e.target.value, 10))}
                  className="w-full px-2.5 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  {sourceColumns.map(col => (
                    <option key={col.idx} value={col.idx}>
                      {col.letter}: {col.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Match Key */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  2. Chave de Destino ({targetSheet.name}):
                </label>
                <select
                  value={targetColIdx}
                  onChange={e => setTargetColIdx(parseInt(e.target.value, 10))}
                  className="w-full px-2.5 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  {targetColumns.map(col => (
                    <option key={col.idx} value={col.idx}>
                      {col.letter}: {col.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Return Column Selector for PROCX / Lookups */}
            {isLookupType && (
              <div className="pt-2 border-t border-indigo-100">
                <label className="text-[11px] font-bold text-indigo-900 block mb-1 flex items-center justify-between">
                  <span>3. Coluna de Retorno (Dado que você deseja trazer):</span>
                  <span className="text-[10px] text-indigo-600 font-normal">Tabela: {targetSheet.name}</span>
                </label>
                <select
                  value={returnColIdx}
                  onChange={e => setReturnColIdx(parseInt(e.target.value, 10))}
                  className="w-full px-2.5 py-2 bg-white border border-indigo-300 rounded-xl text-xs font-bold text-indigo-950 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                >
                  {targetColumns.map(col => (
                    <option key={col.idx} value={col.idx}>
                      👉 Trazer {col.letter}: {col.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Formula Type Selection */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2 uppercase tracking-wider">
              {isSameSheet ? 'Escolha a Operação / Fórmula entre as Colunas:' : 'Operação de Cruzamento / Fórmula:'}
            </label>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto p-0.5">
              {formulaOptions.map(opt => (
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

          {/* Fallback text when not found */}
          {isLookupType && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Texto se não encontrar correspondência (Opcional):
              </label>
              <input
                type="text"
                value={ifNotFound}
                onChange={e => setIfNotFound(e.target.value)}
                placeholder='Ex: "Não encontrado" ou deixe vazio para branco'
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          )}

          {/* Output Destination Selection */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
              Onde salvar o resultado do cálculo:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setOutputDestination('next_column')}
                className={`p-2.5 rounded-2xl border text-xs font-semibold text-left transition-all cursor-pointer flex items-center gap-2 ${
                  outputDestination === 'next_column'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Table2 className="size-4 text-indigo-600 shrink-0" />
                <div>
                  <div className="font-bold">Próxima Coluna</div>
                  <div className="text-[10px] text-slate-500 font-normal">Na tabela atual</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutputDestination('below_row')}
                className={`p-2.5 rounded-2xl border text-xs font-semibold text-left transition-all cursor-pointer flex items-center gap-2 ${
                  outputDestination === 'below_row'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <TrendingUp className="size-4 text-teal-600 shrink-0" />
                <div>
                  <div className="font-bold">Linha Abaixo</div>
                  <div className="text-[10px] text-slate-500 font-normal">Totais no rodapé</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutputDestination('new_sheet')}
                className={`p-2.5 rounded-2xl border text-xs font-semibold text-left transition-all cursor-pointer flex items-center gap-2 ${
                  outputDestination === 'new_sheet'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <FileSpreadsheet className="size-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold">Nova Aba</div>
                  <div className="text-[10px] text-slate-500 font-normal">Planilha gerada</div>
                </div>
              </button>
            </div>
          </div>

          {/* Formula Live Preview Box */}
          <div className="p-3.5 bg-slate-900 text-slate-100 rounded-2xl space-y-2 shadow-inner">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Pré-visualização da Fórmula Excel (Linha 2):</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <Sparkles className="size-3" />
                <span>Resultado: {String(previewCalculatedValue || '""')}</span>
              </span>
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
              Excluir Conexão
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
            <span>Executar Cálculo & Injetar Fórmulas</span>
          </button>
        </div>
      </div>
    </div>
  );
};
