import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  ArrowRight,
  Calculator,
  Search,
  Sparkles,
  Layers,
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
  CheckCircle2,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { RelationEdge, RelationFormulaType, RelationOutputDestination } from '../../types/relations';
import { getColumnHeaderName, generateRelationFormula } from '../../engine/relationFormulaEngine';
import { colIndexToLabel, cellPosToKey, evaluateFormula } from '../../engine/formulaParser';

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

  // Wizard active step (1 to 4)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

  const [formulaType, setFormulaType] = useState<RelationFormulaType>(isSameSheet ? 'SUM_COLS' : 'PROCX');
  const [sourceColIdx, setSourceColIdx] = useState<number>(0);
  const [targetColIdx, setTargetColIdx] = useState<number>(0);
  const [returnColIdx, setReturnColIdx] = useState<number>(0);
  const [outputDestination, setOutputDestination] = useState<RelationOutputDestination>('next_column');
  const [customColName, setCustomColName] = useState<string>('');
  const [delimiter, setDelimiter] = useState<string>(' - ');
  const [ifNotFound, setIfNotFound] = useState<string>('');
  const [compareOperator, setCompareOperator] = useState<'>' | '>=' | '<' | '<=' | '=' | '<>'>('>=');
  const [ifTrueValue, setIfTrueValue] = useState<string>('Sim');
  const [ifFalseValue, setIfFalseValue] = useState<string>('Não');

  useEffect(() => {
    if (edgeDraft && sourceSheet && targetSheet) {
      const srcIdx = edgeDraft.sourceColIdx ?? 0;
      const tgtIdx = edgeDraft.targetColIdx ?? 0;
      setSourceColIdx(srcIdx);

      const isSame = sourceSheet.id === targetSheet.id;
      const initialFormula = edgeDraft.formulaType || (isSame ? 'SUM_COLS' : 'PROCX');
      setFormulaType(initialFormula);

      if (['PROCX', 'PROCV', 'SOMASE', 'MEDIASE', 'FILTRO'].includes(initialFormula)) {
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
      if (edgeDraft.ifNotFound !== undefined) setIfNotFound(edgeDraft.ifNotFound);
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

  const formulaCategories = isSameSheet
    ? [
        {
          type: 'PROCX' as RelationFormulaType,
          name: 'Auto-PROCX na Mesma Tabela',
          desc: 'Busca um campo relacionado cruzando colunas da própria tabela.',
          badge: 'Cruzamento',
          icon: <Search className="size-4 text-emerald-600" />,
        },
        {
          type: 'SUM_COLS' as RelationFormulaType,
          name: 'Soma das Colunas (A + B)',
          desc: 'Soma os valores numéricos linha a linha em uma nova coluna.',
          badge: 'Matemática',
          icon: <Calculator className="size-4 text-emerald-600" />,
        },
        {
          type: 'SUB_COLS' as RelationFormulaType,
          name: 'Subtração / Margem (A - B)',
          desc: 'Calcula a diferença entre valores das duas colunas.',
          badge: 'Diferença',
          icon: <Diff className="size-4 text-sky-600" />,
        },
        {
          type: 'MULT_COLS' as RelationFormulaType,
          name: 'Multiplicação (A * B)',
          desc: 'Multiplica duas colunas (ex: Quantidade * Preço Unitário).',
          badge: 'Produto',
          icon: <Calculator className="size-4 text-purple-600" />,
        },
        {
          type: 'DIV_COLS' as RelationFormulaType,
          name: 'Divisão / Razão (A / B)',
          desc: 'Calcula a razão proporcional protegida contra divisão por zero.',
          badge: 'Razão',
          icon: <Divide className="size-4 text-amber-600" />,
        },
        {
          type: 'PCT_DIFF' as RelationFormulaType,
          name: 'Variação Percentual (Δ%)',
          desc: 'Calcula o crescimento/variação percentual relativa.',
          badge: 'Porcentagem',
          icon: <Percent className="size-4 text-indigo-600" />,
        },
        {
          type: 'CONCAT' as RelationFormulaType,
          name: 'Juntar Textos / Concatenar',
          desc: 'Une o texto de duas colunas com separador customizado.',
          badge: 'Texto',
          icon: <Combine className="size-4 text-rose-600" />,
        },
        {
          type: 'IF_COMPARE' as RelationFormulaType,
          name: 'Regra Condicional (SE)',
          desc: 'Avalia regra lógica e retorna status personalizado.',
          badge: 'Lógica',
          icon: <Sparkles className="size-4 text-indigo-600" />,
        },
      ]
    : [
        {
          type: 'PROCX' as RelationFormulaType,
          name: 'PROCX (Cruzamento Inteligente)',
          desc: 'Cruza a chave da tabela de origem com a de destino e traz o dado desejado.',
          badge: 'Recomendado ⭐',
          icon: <Search className="size-4 text-emerald-600" />,
        },
        {
          type: 'SOMASE' as RelationFormulaType,
          name: 'SOMASE (Soma Agrupada por Chave)',
          desc: 'Soma os valores da outra tabela correspondentes a este registro.',
          badge: 'Agregação',
          icon: <Calculator className="size-4 text-indigo-600" />,
        },
        {
          type: 'CONT.SE' as RelationFormulaType,
          name: 'CONT.SE (Contagem de Ocorrências)',
          desc: 'Conta quantas vezes este registro aparece na outra tabela.',
          badge: 'Contagem',
          icon: <Layers className="size-4 text-purple-600" />,
        },
        {
          type: 'MEDIASE' as RelationFormulaType,
          name: 'MÉDIASE (Média Condicional)',
          desc: 'Calcula a média aritmética dos valores correspondentes da outra tabela.',
          badge: 'Média',
          icon: <Calculator className="size-4 text-sky-600" />,
        },
        {
          type: 'UNIRTEXTO' as RelationFormulaType,
          name: 'UNIRTEXTO (Agrupar Múltiplos Textos)',
          desc: 'Agrupa vários registros vinculados separados por vírgula ou traço.',
          badge: 'Texto',
          icon: <Split className="size-4 text-amber-600" />,
        },
      ];

  const currentEdge: RelationEdge = {
    id: edgeDraft.id || `edge-${Date.now()}`,
    sourceSheetId: sourceSheet.id,
    sourceColIdx,
    targetSheetId: targetSheet.id,
    targetColIdx,
    formulaType,
    returnColIdx,
    outputDestination,
    customColName: customColName.trim() || undefined,
    delimiter,
    ifNotFound,
    compareOperator,
    ifTrueValue,
    ifFalseValue,
    createdAt: Date.now(),
  };

  // Gerar amostra de 3 linhas de teste reais para o Passo 4
  const previewRows = [1, 2, 3].map(rowIdx => {
    const srcCell = sourceSheet.data[cellPosToKey(rowIdx, sourceColIdx)];
    const srcVal = srcCell?.value !== undefined && srcCell?.value !== null ? String(srcCell.value) : `[Vazio]`;

    const formula = generateRelationFormula(currentEdge, sourceSheet, targetSheet, rowIdx);
    let calculated = '';
    try {
      calculated = evaluateFormula(formula, sourceSheet, sheets);
    } catch {
      calculated = '#ERRO!';
    }

    return {
      rowIdx: rowIdx + 1, // Excel row number (1-based header is row 1, data is 2, 3, 4)
      sourceValue: srcVal,
      formula,
      calculatedValue: calculated !== undefined && calculated !== null && calculated !== '' ? String(calculated) : '—',
    };
  });

  const handleSave = () => {
    onSaveRelation(currentEdge);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150 font-sans">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header com Stepper */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/90 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shadow-xs">
                <Zap className="size-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Assistente de Cruzamento & Fórmulas
                </h3>
                <p className="text-xs text-slate-500">
                  {sourceSheet.name} ➔ {targetSheet.name}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar assistente de cruzamento"
              className="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors btn-tactile cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Stepper Progress Bar */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            {[
              { num: 1, label: '1. Ação' },
              { num: 2, label: '2. Chaves' },
              { num: 3, label: '3. Retorno' },
              { num: 4, label: '4. Teste 3 Linhas' },
            ].map(step => (
              <button
                key={step.num}
                type="button"
                onClick={() => setActiveStep(step.num as any)}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold text-center border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeStep === step.num
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : activeStep > step.num
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {activeStep > step.num ? <CheckCircle2 className="size-3 text-emerald-700" /> : null}
                <span>{step.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body: Passo a Passo */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* PASSO 1: TIPO DE AÇÃO */}
          {activeStep === 1 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                Passo 1: Qual operação você deseja realizar?
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {formulaCategories.map(opt => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => {
                      setFormulaType(opt.type);
                      setActiveStep(2);
                    }}
                    className={`p-3.5 rounded-2xl border text-left flex items-start justify-between transition-all cursor-pointer ${
                      formulaType === opt.type
                        ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
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
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {opt.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-medium mt-1">{opt.desc}</p>
                      </div>
                    </div>
                    {formulaType === opt.type && (
                      <Check className="size-4 text-indigo-600 shrink-0 mt-1" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PASSO 2: PAREAMENTO DE CHAVES */}
          {activeStep === 2 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Passo 2: Quais colunas fazem a ligação entre as tabelas?
              </div>

              {/* Diagrama Visual de Ligação */}
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between gap-4">
                {/* Coluna Origem */}
                <div className="flex-1 space-y-1.5">
                  <span className="text-[11px] font-bold text-indigo-950 block truncate">
                    Tabela Origem ({sourceSheet.name})
                  </span>
                  <select
                    value={sourceColIdx}
                    onChange={e => setSourceColIdx(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  >
                    {sourceColumns.map(col => (
                      <option key={col.idx} value={col.idx}>
                        {col.letter}: {col.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ícone de Ligação */}
                <div className="size-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <ArrowRight className="size-4" />
                </div>

                {/* Coluna Destino */}
                <div className="flex-1 space-y-1.5">
                  <span className="text-[11px] font-bold text-indigo-950 block truncate">
                    Tabela Destino ({targetSheet.name})
                  </span>
                  <select
                    value={targetColIdx}
                    onChange={e => setTargetColIdx(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  >
                    {targetColumns.map(col => (
                      <option key={col.idx} value={col.idx}>
                        {col.letter}: {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center gap-2">
                <Info className="size-4 text-indigo-600 shrink-0" />
                <span>
                  O Excel irá comparar cada linha de <strong>{getColumnHeaderName(sourceSheet, sourceColIdx)}</strong> com a coluna <strong>{getColumnHeaderName(targetSheet, targetColIdx)}</strong>.
                </span>
              </div>
            </div>
          )}

          {/* PASSO 3: COLUNA DE RETORNO & DESTINO */}
          {activeStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Passo 3: Qual valor trazer e onde salvar o resultado?
              </div>

              {/* Coluna de Retorno para Lookups */}
              {isLookupType && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Coluna que você quer trazer da tabela {targetSheet.name}:
                  </label>
                  <select
                    value={returnColIdx}
                    onChange={e => setReturnColIdx(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2.5 bg-white border border-indigo-300 rounded-xl text-xs font-bold text-indigo-950 focus:ring-2 focus:ring-indigo-500 shadow-xs"
                  >
                    {targetColumns.map(col => (
                      <option key={col.idx} value={col.idx}>
                        👉 Trazer {col.letter}: {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Se não encontrar (Fallback opcional) */}
              {isLookupType && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Texto se não encontrar correspondência (Opcional):
                  </label>
                  <input
                    type="text"
                    value={ifNotFound}
                    onChange={e => setIfNotFound(e.target.value)}
                    placeholder='Ex: "Não Encontrado" ou deixe em branco'
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 font-medium"
                  />
                </div>
              )}

              {/* Nome Personalizado da Nova Coluna */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Título do Cabeçalho da Nova Coluna:
                </label>
                <input
                  type="text"
                  value={customColName}
                  onChange={e => setCustomColName(e.target.value)}
                  placeholder={`Ex: ${targetSheet.name}_${getColumnHeaderName(targetSheet, returnColIdx)}`}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 font-semibold"
                />
              </div>

              {/* Local de Destino */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
                  Onde inserir o resultado:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOutputDestination('next_column')}
                    className={`p-2.5 rounded-2xl border text-xs font-semibold text-left transition-all cursor-pointer flex items-center gap-2 ${
                      outputDestination === 'next_column'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-xs'
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
                    onClick={() => setOutputDestination('new_sheet')}
                    className={`p-2.5 rounded-2xl border text-xs font-semibold text-left transition-all cursor-pointer flex items-center gap-2 ${
                      outputDestination === 'new_sheet'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <FileSpreadsheet className="size-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold">Nova Aba</div>
                      <div className="text-[10px] text-slate-500 font-normal">Planilha gerada</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOutputDestination('below_row')}
                    className={`p-2.5 rounded-2xl border text-xs font-semibold text-left transition-all cursor-pointer flex items-center gap-2 ${
                      outputDestination === 'below_row'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <TrendingUp className="size-4 text-teal-600 shrink-0" />
                    <div>
                      <div className="font-bold">Rodapé</div>
                      <div className="text-[10px] text-slate-500 font-normal">Linha de totais</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 4: LIVE PREVIEW COM 3 LINHAS DE DADOS REAIS */}
          {activeStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="size-3.5 text-indigo-600" />
                  <span>Passo 4: Simulação Real com as 3 Primeiras Linhas</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Validação Ativa
                </span>
              </div>

              {/* Tabela de Amostra de 3 Linhas */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-700">
                      <th className="p-2.5 w-12 text-center">Linha</th>
                      <th className="p-2.5">Chave Origem ({getColumnHeaderName(sourceSheet, sourceColIdx)})</th>
                      <th className="p-2.5 text-indigo-700 bg-indigo-50/50">Valor Retornado / Calculado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map(row => (
                      <tr key={row.rowIdx} className="hover:bg-slate-50/60">
                        <td className="p-2.5 text-center font-mono text-[10px] text-slate-600 font-bold">
                          #{row.rowIdx}
                        </td>
                        <td className="p-2.5 font-semibold text-slate-800">
                          {row.sourceValue}
                        </td>
                        <td className="p-2.5 font-bold text-emerald-600 bg-emerald-50/30">
                          {row.calculatedValue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Caixa da Fórmula Injetada */}
              <div className="p-3 bg-slate-900 text-slate-100 rounded-2xl space-y-1.5 shadow-inner">
                <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>Fórmula Excel gerada dinamicamente:</span>
                  <span className="text-emerald-400 font-bold">Injeção Automática</span>
                </div>
                <div className="p-2 bg-slate-950 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto select-all border border-slate-800">
                  {previewRows[0]?.formula}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer com Navegação de Passos */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          <div>
            {activeStep > 1 ? (
              <button
                type="button"
                onClick={() => setActiveStep((activeStep - 1) as any)}
                className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-200 font-bold transition-colors cursor-pointer"
              >
                Voltar
              </button>
            ) : edgeDraft.id && onDeleteRelation ? (
              <button
                type="button"
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
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-200 font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeStep < 4 ? (
              <button
                type="button"
                onClick={() => setActiveStep((activeStep + 1) as any)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <span>Avançar</span>
                <ChevronRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-2 active:scale-95"
              >
                <Sparkles className="size-4" />
                <span>Aplicar & Injetar Fórmulas</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
