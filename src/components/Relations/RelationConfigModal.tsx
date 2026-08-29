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
  GitCommit,
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
  const [returnColIdx, setReturnColIdx] = useState<number>(0);
  const [outputDestination, setOutputDestination] = useState<RelationOutputDestination>('next_column');
  const [customColName, setCustomColName] = useState<string>('');
  const [delimiter, setDelimiter] = useState<string>(' - ');
  const [ifNotFound, setIfNotFound] = useState<string>('');
  const [compareOperator, setCompareOperator] = useState<'>' | '>=' | '<' | '<=' | '=' | '<>'>('>=');
  const [ifTrueValue, setIfTrueValue] = useState<string>('Meta Atingida');
  const [ifFalseValue, setIfFalseValue] = useState<string>('Pendente');

  useEffect(() => {
    if (edgeDraft) {
      if (edgeDraft.formulaType) setFormulaType(edgeDraft.formulaType);
      else setFormulaType(isSameSheet ? 'SUM_COLS' : 'PROCX');
      if (edgeDraft.returnColIdx !== undefined) setReturnColIdx(edgeDraft.returnColIdx);
      else if (targetSheet) setReturnColIdx(Math.min(1, targetSheet.colCount - 1));
      if (edgeDraft.outputDestination) setOutputDestination(edgeDraft.outputDestination);
      if (edgeDraft.customColName) setCustomColName(edgeDraft.customColName);
      if (edgeDraft.delimiter) setDelimiter(edgeDraft.delimiter);
      if (edgeDraft.ifNotFound) setIfNotFound(edgeDraft.ifNotFound);
      if (edgeDraft.compareOperator) setCompareOperator(edgeDraft.compareOperator);
      if (edgeDraft.ifTrueValue) setIfTrueValue(edgeDraft.ifTrueValue);
      if (edgeDraft.ifFalseValue) setIfFalseValue(edgeDraft.ifFalseValue);
    }
  }, [edgeDraft, targetSheet, isSameSheet]);

  if (!isOpen || !edgeDraft || !sourceSheet || !targetSheet) return null;

  const sourceKeyHeader = getColumnHeaderName(sourceSheet, edgeDraft.sourceColIdx || 0);
  const targetKeyHeader = getColumnHeaderName(targetSheet, edgeDraft.targetColIdx || 0);

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
          type: 'SUM_COLS',
          name: `Soma das Colunas (${sourceKeyHeader} + ${targetKeyHeader})`,
          desc: 'Soma os valores numéricos das duas colunas linha a linha.',
          badge: 'Aritmética',
          icon: <Calculator className="size-4 text-emerald-600" />,
        },
        {
          type: 'SUB_COLS',
          name: `Subtração / Diferença (${sourceKeyHeader} - ${targetKeyHeader})`,
          desc: 'Calcula a diferença entre os valores das duas colunas.',
          badge: 'Diferença',
          icon: <Diff className="size-4 text-sky-600" />,
        },
        {
          type: 'MULT_COLS',
          name: `Multiplicação (${sourceKeyHeader} * ${targetKeyHeader})`,
          desc: 'Multiplica os valores (ex: Quantidade * Preço Unitário).',
          badge: 'Produto',
          icon: <Calculator className="size-4 text-purple-600" />,
        },
        {
          type: 'DIV_COLS',
          name: `Divisão / Razão (${sourceKeyHeader} / ${targetKeyHeader})`,
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
          name: `Juntar / Concatenar (${sourceKeyHeader} & ${targetKeyHeader})`,
          desc: 'Concatena os textos das duas colunas com espaço ou separador.',
          badge: 'Texto',
          icon: <Combine className="size-4 text-rose-600" />,
        },
        {
          type: 'IF_COMPARE',
          name: `Condicional SE (${sourceKeyHeader} vs ${targetKeyHeader})`,
          desc: 'Avalia regra lógica e retorna status personalizado.',
          badge: 'Lógica',
          icon: <Sparkles className="size-4 text-indigo-600" />,
        },
        {
          type: 'ROW_LAG',
          name: `Diferença com a Linha Anterior (Variação Linha a Linha)`,
          desc: 'Calcula o delta entre a linha atual e a linha anterior (A2 - A1).',
          badge: 'Linha a Linha',
          icon: <TrendingUp className="size-4 text-teal-600" />,
        },
        {
          type: 'RUNNING_TOTAL',
          name: `Soma Acumulada Linha a Linha (Running Total)`,
          desc: 'Soma progressiva cumulativa ao longo das linhas da tabela.',
          badge: 'Acumulado',
          icon: <Layers className="size-4 text-emerald-600" />,
        },
        {
          type: 'PROCX',
          name: `Auto-PROCX na Mesma Tabela (Hierarquia / Organograma)`,
          desc: 'Busca hierárquica na própria tabela (ex: buscar Gerente pelo ID na mesma lista).',
          badge: 'Hierarquia',
          icon: <Search className="size-4 text-emerald-600" />,
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

  // Preview formula for row 1 (Excel row 2)
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
      compareOperator,
      ifTrueValue,
      ifFalseValue,
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
      compareOperator,
      ifTrueValue,
      ifFalseValue,
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
              <h3 className="text-sm font-bold text-slate-900">
                {isSameSheet ? 'Conexão & Operação Entre Colunas' : 'Configurar Cruzamento Relacional'}
              </h3>
              <p className="text-xs text-slate-500">
                {isSameSheet
                  ? `Transformação e cálculo entre colunas da tabela ${sourceSheet.name}`
                  : `Mapeamento de chaves entre ${sourceSheet.name} e ${targetSheet.name}`}
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
          {/* Connection Summary Pill */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-white border border-indigo-200 font-semibold text-indigo-900 flex items-center gap-1.5 shadow-2xs">
                <Table2 className="size-3.5 text-indigo-600" />
                <span>{sourceSheet.name}</span>
                <span className="text-[10px] font-mono text-indigo-700 font-bold bg-indigo-100 px-1 rounded">
                  {sourceKeyHeader} ({colIndexToLabel(edgeDraft.sourceColIdx || 0)})
                </span>
              </div>
            </div>

            <ArrowRight className="size-4 text-indigo-500 shrink-0 mx-2" />

            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-white border border-indigo-200 font-semibold text-indigo-900 flex items-center gap-1.5 shadow-2xs">
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
              {isSameSheet ? 'Escolha a Operação / Fórmula entre as Colunas:' : 'Operação de Cruzamento / Fórmula:'}
            </label>
            <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto p-0.5">
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

          {/* Dynamic Extra Options for IF_COMPARE */}
          {formulaType === 'IF_COMPARE' && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
              <div className="font-bold text-slate-800">Configuração da Regra SE:</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Operador:</label>
                  <select
                    value={compareOperator}
                    onChange={e => setCompareOperator(e.target.value as any)}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  >
                    <option value=">=">&gt;= (Maior ou Igual)</option>
                    <option value=">">&gt; (Maior que)</option>
                    <option value="<=">&lt;= (Menor ou Igual)</option>
                    <option value="<">&lt; (Menor que)</option>
                    <option value="=">= (Igual a)</option>
                    <option value="<>">&lt;&gt; (Diferente de)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Se Verdadeiro:</label>
                  <input
                    type="text"
                    value={ifTrueValue}
                    onChange={e => setIfTrueValue(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Se Falso:</label>
                  <input
                    type="text"
                    value={ifFalseValue}
                    onChange={e => setIfFalseValue(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
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
                  <div className="text-[10px] text-slate-500 font-normal">Nova coluna na tabela</div>
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
                  <div className="text-[10px] text-slate-500 font-normal">Planilha calculada</div>
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
