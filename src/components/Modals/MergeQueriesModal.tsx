import React, { useState, useMemo, useEffect } from 'react';
import {
  GitMerge,
  Table,
  Check,
  X,
  Layers,
  ArrowRight,
  Info,
  Sparkles,
  Code2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Link,
  ChevronDown,
  ChevronUp,
  Sliders,
  Database,
  MoveHorizontal,
  Compass,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import {
  JoinKind,
  executeMergeQueries,
  MergeQueriesResult,
} from '../../engine/mergeQueriesEngine';
import { getCellValue, colIndexToLabel } from '../../engine/formulaParser';

interface MergeQueriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  primarySheet: Sheet;
  allSheets: Sheet[];
  onApplyMergeResult: (result: MergeQueriesResult) => void;
}

interface FriendlyJoinOption {
  kind: JoinKind;
  title: string;
  badge: string;
  badgeColor: string;
  simpleExplanation: string;
  technicalName: string;
}

const FRIENDLY_JOIN_OPTIONS: FriendlyJoinOption[] = [
  {
    kind: 'LeftOuter',
    title: 'Trazer tudo da Tabela 1 + Dados da Tabela 2 (Recomendado)',
    badge: 'Padrão / Como PROCV',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    simpleExplanation: 'Mantém todas as linhas da tabela principal. Traz as colunas extras quando encontrar correspondência; se não encontrar, deixa o campo vazio.',
    technicalName: 'Left Outer Join (Table.NestedJoin)',
  },
  {
    kind: 'Inner',
    title: 'Apenas registros presentes em AMBAS as tabelas',
    badge: 'Intersecção Exata',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    simpleExplanation: 'Elimina linhas que não possuam correspondência exata em ambas as tabelas.',
    technicalName: 'Inner Join',
  },
  {
    kind: 'FullOuter',
    title: 'Todas as linhas de AMBAS as tabelas',
    badge: 'Junção Total',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    simpleExplanation: 'Combina todos os dados das duas tabelas, preenchendo com nulo onde não houver par.',
    technicalName: 'Full Outer Join',
  },
  {
    kind: 'LeftAnti',
    title: 'Apenas o que NÃO foi encontrado na Tabela 2',
    badge: 'Diagnóstico de Faltantes',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
    simpleExplanation: 'Ideal para auditoria: mostra quais itens da primeira tabela estão faltando no seu cadastro/tabela de apoio.',
    technicalName: 'Left Anti Join',
  },
  {
    kind: 'RightOuter',
    title: 'Trazer tudo da Tabela 2 + Dados da Tabela 1',
    badge: 'Externa Direita',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    simpleExplanation: 'Mantém todas as linhas da tabela secundária e busca os dados na primeira.',
    technicalName: 'Right Outer Join',
  },
];

export const MergeQueriesModal: React.FC<MergeQueriesModalProps> = ({
  isOpen,
  onClose,
  primarySheet,
  allSheets,
  onApplyMergeResult,
}) => {
  // Available secondary sheets
  const secondarySheetsAvailable = useMemo(() => {
    const others = allSheets.filter(s => s.id !== primarySheet.id);
    return others.length > 0 ? others : allSheets;
  }, [allSheets, primarySheet]);

  const [selectedSecondarySheetId, setSelectedSecondarySheetId] = useState<string>(
    secondarySheetsAvailable[0]?.id || primarySheet.id
  );

  const secondarySheet = useMemo(() => {
    return allSheets.find(s => s.id === selectedSecondarySheetId) || secondarySheetsAvailable[0] || primarySheet;
  }, [allSheets, selectedSecondarySheetId, secondarySheetsAvailable, primarySheet]);

  // Selected key columns (arrays for composite join keys)
  const [primaryKeyCols, setPrimaryKeyCols] = useState<number[]>([0]);
  const [secondaryKeyCols, setSecondaryKeyCols] = useState<number[]>([0]);

  // Join Kind
  const [joinKind, setJoinKind] = useState<JoinKind>('LeftOuter');

  // Placement for new expanded columns
  const [placement, setPlacement] = useState<'next_to_key' | 'end_of_table'>('next_to_key');

  // Expanded columns from secondary table
  const secondaryColIndices = useMemo(() => {
    const indices: number[] = [];
    for (let c = 0; c < secondarySheet.colCount; c++) {
      const h = getCellValue(secondarySheet, 0, c);
      if (h !== null && h !== undefined && String(h).trim() !== '') {
        indices.push(c);
      }
    }
    return indices.length > 0 ? indices : [0, 1, 2];
  }, [secondarySheet]);

  const [expandedCols, setExpandedCols] = useState<number[]>([]);
  const [usePrefix, setUsePrefix] = useState(true);
  const [prefixText, setPrefixText] = useState(secondarySheet.name);
  const [showMCode, setShowMCode] = useState(false);
  const [showAdvancedJoins, setShowAdvancedJoins] = useState(false);

  // Initialize expanded columns when secondary table changes
  useEffect(() => {
    const nonKeys = secondaryColIndices.filter(c => !secondaryKeyCols.includes(c));
    setExpandedCols(nonKeys.length > 0 ? nonKeys : secondaryColIndices);
    setPrefixText(secondarySheet.name);
  }, [secondarySheet.id, secondaryColIndices]);

  // Auto-Suggest Key Columns (Proactive Intelligence)
  const handleAutoDetectKeys = () => {
    const primCols: { index: number; name: string }[] = [];
    for (let c = 0; c < primarySheet.colCount; c++) {
      const h = getCellValue(primarySheet, 0, c);
      if (h !== null && h !== undefined && String(h).trim() !== '') {
        primCols.push({ index: c, name: String(h).trim().toLowerCase() });
      }
    }

    const secCols: { index: number; name: string }[] = [];
    for (let c = 0; c < secondarySheet.colCount; c++) {
      const h = getCellValue(secondarySheet, 0, c);
      if (h !== null && h !== undefined && String(h).trim() !== '') {
        secCols.push({ index: c, name: String(h).trim().toLowerCase() });
      }
    }

    const matchedPrim: number[] = [];
    const matchedSec: number[] = [];

    primCols.forEach(p => {
      // Find matching or similar name in secondary
      const match = secCols.find(s => {
        const cleanP = p.name.replace(/[^a-z0-9]/g, '');
        const cleanS = s.name.replace(/[^a-z0-9]/g, '');
        return cleanP === cleanS || cleanP.includes(cleanS) || cleanS.includes(cleanP);
      });

      if (match && !matchedSec.includes(match.index)) {
        matchedPrim.push(p.index);
        matchedSec.push(match.index);
      }
    });

    if (matchedPrim.length > 0) {
      setPrimaryKeyCols(matchedPrim);
      setSecondaryKeyCols(matchedSec);
    }
  };

  // Toggle key column selection for primary
  const handleTogglePrimaryKey = (colIdx: number) => {
    if (primaryKeyCols.includes(colIdx)) {
      if (primaryKeyCols.length > 1) {
        setPrimaryKeyCols(primaryKeyCols.filter(c => c !== colIdx));
      }
    } else {
      setPrimaryKeyCols([...primaryKeyCols, colIdx]);
    }
  };

  // Toggle key column selection for secondary
  const handleToggleSecondaryKey = (colIdx: number) => {
    if (secondaryKeyCols.includes(colIdx)) {
      if (secondaryKeyCols.length > 1) {
        setSecondaryKeyCols(secondaryKeyCols.filter(c => c !== colIdx));
      }
    } else {
      setSecondaryKeyCols([...secondaryKeyCols, colIdx]);
    }
  };

  // Live preview & match calculation
  const mergePreviewResult = useMemo(() => {
    if (!primarySheet || !secondarySheet) return null;
    if (primaryKeyCols.length === 0 || secondaryKeyCols.length === 0) return null;

    try {
      return executeMergeQueries({
        primarySheet,
        secondarySheet,
        primaryKeyCols,
        secondaryKeyCols,
        joinKind,
        expandedSecondaryCols: expandedCols.length > 0 ? expandedCols : [0],
        placement,
        usePrefix,
        prefixText,
      });
    } catch (e) {
      return null;
    }
  }, [
    primarySheet,
    secondarySheet,
    primaryKeyCols,
    secondaryKeyCols,
    joinKind,
    expandedCols,
    placement,
    usePrefix,
    prefixText,
  ]);

  if (!isOpen) return null;

  const handleConfirmMerge = () => {
    if (mergePreviewResult) {
      onApplyMergeResult(mergePreviewResult);
      onClose();
    }
  };

  const primaryTotalRows = Math.max(primarySheet.rowCount - 1, 0);
  const matchedRows = mergePreviewResult?.matchedCount || 0;
  const matchPercentage = primaryTotalRows > 0 ? Math.round((matchedRows / primaryTotalRows) * 100) : 100;
  const isMatchGreat = matchPercentage >= 80;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-5xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[92vh] font-sans text-xs">
        {/* TOP HEADER */}
        <div className="px-6 py-3.5 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 border border-white/20 shadow-inner">
              <GitMerge className="size-5 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight">Mesclar Consultas (Cruzamento Inteligente)</h2>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 font-mono text-[10px] font-bold border border-purple-400/30">
                  PROCV / PROCX Visual
                </span>
              </div>
              <p className="text-[11px] text-purple-200/90 mt-0.5">
                Conecte duas tabelas pelas colunas comuns e anexe novas informações com precisão.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-purple-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/70 scrollbar-thin">
          {/* PASSO 1: SELEÇÃO DAS TABELAS E COLUNAS-CHAVE */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-5 rounded-full bg-purple-700 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                  1
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                  Selecione as Colunas em Comum para Cruzar os Dados
                </h3>
              </div>

              <button
                type="button"
                onClick={handleAutoDetectKeys}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold transition-all cursor-pointer shadow-2xs group text-xs"
              >
                <Sparkles className="size-3.5 text-purple-600 group-hover:scale-110 transition-transform" />
                <span>Auto-Detectar Chaves ✨</span>
              </button>
            </div>

            {/* TWO TABLES COMPARISON CONTAINER */}
            <div className="grid grid-cols-1 gap-3">
              {/* TABELA 1: PRINCIPAL */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                    <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                      Tabela 1 (Origem):
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-mono font-bold text-xs border border-emerald-200">
                      {primarySheet.name}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    Clique nas colunas para marcar a chave (🔑)
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-28 bg-slate-50">
                  <table className="border-collapse table-fixed w-max text-xs font-mono bg-white">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                      <tr>
                        {Array.from({ length: primarySheet.colCount }).map((_, colIdx) => {
                          const headerVal = getCellValue(primarySheet, 0, colIdx);
                          if (headerVal === null && colIdx > 6) return null;
                          const headerText = headerVal !== null && headerVal !== undefined ? String(headerVal) : `Col ${colIndexToLabel(colIdx)}`;
                          const isSelectedKey = primaryKeyCols.includes(colIdx);
                          const keyOrder = primaryKeyCols.indexOf(colIdx) + 1;

                          return (
                            <th
                              key={colIdx}
                              onClick={() => handleTogglePrimaryKey(colIdx)}
                              className={`p-2 border-r border-slate-200 text-left transition-all cursor-pointer select-none ${
                                isSelectedKey
                                  ? 'bg-purple-100 text-purple-950 border-b-2 border-b-purple-700 shadow-inner'
                                  : 'hover:bg-slate-200/80 text-slate-700'
                              }`}
                              style={{ minWidth: '130px', maxWidth: '180px' }}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold truncate font-sans text-[11px]">{headerText}</span>
                                {isSelectedKey && (
                                  <span className="px-1 py-0.5 rounded-full bg-purple-700 text-white text-[9px] font-mono font-black shrink-0">
                                    🔑 Chave {keyOrder}
                                  </span>
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: Math.min(primarySheet.rowCount - 1, 3) }).map((_, rIdx) => {
                        const r = rIdx + 1;
                        return (
                          <tr key={r} className="border-b border-slate-100 hover:bg-slate-50/50">
                            {Array.from({ length: primarySheet.colCount }).map((_, colIdx) => {
                              const headerVal = getCellValue(primarySheet, 0, colIdx);
                              if (headerVal === null && colIdx > 6) return null;
                              const val = getCellValue(primarySheet, r, colIdx);
                              const isSelectedKey = primaryKeyCols.includes(colIdx);
                              return (
                                <td
                                  key={colIdx}
                                  onClick={() => handleTogglePrimaryKey(colIdx)}
                                  className={`px-2 py-1 border-r border-slate-100 truncate cursor-pointer text-[10px] ${
                                    isSelectedKey ? 'bg-purple-50/70 font-semibold text-purple-950' : 'text-slate-700'
                                  }`}
                                >
                                  {val !== null && val !== undefined ? String(val) : ''}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABELA 2: SECUNDÁRIA / MAPEAMENTO */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-indigo-500 ring-2 ring-indigo-100" />
                    <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                      Tabela 2 (Tabela de Apoio / Mapeamento):
                    </span>
                    <select
                      value={selectedSecondarySheetId}
                      onChange={e => setSelectedSecondarySheetId(e.target.value)}
                      className="px-2 py-0.5 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-300 rounded-md font-sans font-bold text-xs text-indigo-950 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {allSheets.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.rowCount - 1} linhas)
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    Selecione a coluna que corresponde à chave da Tabela 1
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-28 bg-slate-50">
                  <table className="border-collapse table-fixed w-max text-xs font-mono bg-white">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                      <tr>
                        {Array.from({ length: secondarySheet.colCount }).map((_, colIdx) => {
                          const headerVal = getCellValue(secondarySheet, 0, colIdx);
                          if (headerVal === null && colIdx > 6) return null;
                          const headerText = headerVal !== null && headerVal !== undefined ? String(headerVal) : `Col ${colIndexToLabel(colIdx)}`;
                          const isSelectedKey = secondaryKeyCols.includes(colIdx);
                          const keyOrder = secondaryKeyCols.indexOf(colIdx) + 1;

                          return (
                            <th
                              key={colIdx}
                              onClick={() => handleToggleSecondaryKey(colIdx)}
                              className={`p-2 border-r border-slate-200 text-left transition-all cursor-pointer select-none ${
                                isSelectedKey
                                  ? 'bg-indigo-100 text-indigo-950 border-b-2 border-b-indigo-700 shadow-inner'
                                  : 'hover:bg-slate-200/80 text-slate-700'
                              }`}
                              style={{ minWidth: '130px', maxWidth: '180px' }}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold truncate font-sans text-[11px]">{headerText}</span>
                                {isSelectedKey && (
                                  <span className="px-1 py-0.5 rounded-full bg-indigo-700 text-white text-[9px] font-mono font-black shrink-0">
                                    🔑 Chave {keyOrder}
                                  </span>
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: Math.min(secondarySheet.rowCount - 1, 3) }).map((_, rIdx) => {
                        const r = rIdx + 1;
                        return (
                          <tr key={r} className="border-b border-slate-100 hover:bg-slate-50/50">
                            {Array.from({ length: secondarySheet.colCount }).map((_, colIdx) => {
                              const headerVal = getCellValue(secondarySheet, 0, colIdx);
                              if (headerVal === null && colIdx > 6) return null;
                              const val = getCellValue(secondarySheet, r, colIdx);
                              const isSelectedKey = secondaryKeyCols.includes(colIdx);
                              return (
                                <td
                                  key={colIdx}
                                  onClick={() => handleToggleSecondaryKey(colIdx)}
                                  className={`px-2 py-1 border-r border-slate-100 truncate cursor-pointer text-[10px] ${
                                    isSelectedKey ? 'bg-indigo-50/70 font-semibold text-indigo-950' : 'text-slate-700'
                                  }`}
                                >
                                  {val !== null && val !== undefined ? String(val) : ''}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* PASSO 2: TIPO DE CRUZAMENTO (JOIN KIND) */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="size-5 rounded-full bg-purple-700 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                2
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                Como você deseja cruzar os dados? (Tipo de Junção)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {FRIENDLY_JOIN_OPTIONS.slice(0, showAdvancedJoins ? 5 : 3).map(opt => {
                const isSelected = joinKind === opt.kind;
                return (
                  <div
                    key={opt.kind}
                    onClick={() => setJoinKind(opt.kind)}
                    className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/60 shadow-xs ring-2 ring-purple-200'
                        : 'border-slate-200 bg-white hover:border-purple-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <span className={`size-3 rounded-full border-2 ${isSelected ? 'border-purple-700 bg-purple-700' : 'border-slate-400'}`} />
                        {opt.title}
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${opt.badgeColor} shrink-0`}>
                        {opt.badge}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      {opt.simpleExplanation}
                    </p>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedJoins(!showAdvancedJoins)}
              className="text-[11px] text-purple-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              {showAdvancedJoins ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              <span>{showAdvancedJoins ? 'Ocultar Junções Avançadas' : 'Ver Todas as Opções Avançadas de Junção (Anti-Join, Right-Join)'}</span>
            </button>
          </div>

          {/* PASSO 3: ONDE POSICIONAR & QUAIS COLUNAS TRAZER */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-5 rounded-full bg-purple-700 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                  3
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                  Posicionamento e Escolha das Novas Colunas
                </h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (expandedCols.length === secondaryColIndices.length) {
                    setExpandedCols([]);
                  } else {
                    setExpandedCols([...secondaryColIndices]);
                  }
                }}
                className="text-[11px] text-purple-700 font-bold hover:underline cursor-pointer"
              >
                {expandedCols.length === secondaryColIndices.length ? 'Desmarcar Todas' : 'Selecionar Todas as Colunas'}
              </button>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
              {/* Placement Selector */}
              <div className="space-y-1.5 pb-2.5 border-b border-slate-100">
                <label className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                  <MoveHorizontal className="size-3.5 text-purple-700" />
                  Onde você deseja inserir as novas colunas na tabela resultante?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                      placement === 'next_to_key'
                        ? 'bg-purple-50/70 border-purple-400 font-bold text-purple-950 ring-1 ring-purple-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="placement"
                      checked={placement === 'next_to_key'}
                      onChange={() => setPlacement('next_to_key')}
                      className="text-purple-700 size-3.5"
                    />
                    <div>
                      <span className="text-xs block font-bold">Ao lado da coluna chave (Recomendado)</span>
                      <span className="text-[10px] text-slate-500 font-normal">Insere logo após a chave de ligação</span>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                      placement === 'end_of_table'
                        ? 'bg-purple-50/70 border-purple-400 font-bold text-purple-950 ring-1 ring-purple-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="placement"
                      checked={placement === 'end_of_table'}
                      onChange={() => setPlacement('end_of_table')}
                      className="text-purple-700 size-3.5"
                    />
                    <div>
                      <span className="text-xs block font-bold">No final da tabela</span>
                      <span className="text-[10px] text-slate-500 font-normal">Anexa à direita na última coluna</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Columns to Expand Checkboxes */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 text-[11px] block">
                  Colunas da Tabela 2 para incluir:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-28 overflow-y-auto p-1 scrollbar-thin">
                  {secondaryColIndices.map(cIdx => {
                    const headerVal = getCellValue(secondarySheet, 0, cIdx);
                    const colName = headerVal !== null && headerVal !== undefined ? String(headerVal) : `Col ${colIndexToLabel(cIdx)}`;
                    const isChecked = expandedCols.includes(cIdx);
                    const isKey = secondaryKeyCols.includes(cIdx);

                    return (
                      <label
                        key={cIdx}
                        className={`flex items-center gap-1.5 p-1.5 rounded-md border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-purple-50 border-purple-300 text-purple-950 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setExpandedCols(expandedCols.filter(c => c !== cIdx));
                            } else {
                              setExpandedCols([...expandedCols, cIdx]);
                            }
                          }}
                          className="rounded text-purple-700 size-3 focus:ring-purple-500"
                        />
                        <span className="truncate text-[11px]">{colName}</span>
                        {isKey && <span className="text-[9px] text-slate-400 font-normal">(Chave)</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium text-[11px]">
                  <input
                    type="checkbox"
                    checked={usePrefix}
                    onChange={e => setUsePrefix(e.target.checked)}
                    className="rounded text-purple-700 size-3"
                  />
                  <span>Adicionar prefixo da tabela (ex: <code>{secondarySheet.name}.Coluna</code>)</span>
                </label>

                {usePrefix && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-[10px]">Prefixo:</span>
                    <input
                      type="text"
                      value={prefixText}
                      onChange={e => setPrefixText(e.target.value)}
                      className="h-6 px-2 bg-slate-50 border border-slate-300 rounded text-[11px] font-mono font-bold text-slate-800"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* DIAGNÓSTICO & ESTIMATIVA EM TEMPO REAL */}
          <div className={`p-3 rounded-xl border transition-all ${
            isMatchGreat ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950' : 'bg-amber-50/80 border-amber-300 text-amber-950'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isMatchGreat ? (
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 text-amber-600 shrink-0" />
                )}
                <div>
                  <div className="font-bold text-[11px]">
                    {isMatchGreat ? 'Conexão Identificada com Sucesso!' : 'Atenção na Correspondência das Chaves'}
                  </div>
                  <div className="text-[10px] mt-0.5">
                    A seleção corresponde a <strong>{matchedRows} de {primaryTotalRows} linhas ({matchPercentage}%)</strong> da primeira tabela.
                    {expandedCols.length > 0 && ` Serão adicionadas ${expandedCols.length} novas colunas ${placement === 'next_to_key' ? 'ao lado da chave' : 'no final da tabela'}.`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowMCode(!showMCode)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 border border-slate-300 hover:bg-white text-slate-700 font-mono text-[10px] font-bold cursor-pointer transition-colors"
              >
                <Code2 className="size-3 text-purple-700" />
                <span>{showMCode ? 'Ocultar Código M' : 'Ver Código M'}</span>
              </button>
            </div>

            {/* M Formula Code View */}
            {showMCode && mergePreviewResult && (
              <div className="mt-2 p-2 bg-slate-950 text-emerald-400 font-mono text-[10px] rounded-lg overflow-x-auto whitespace-pre leading-relaxed border border-slate-800 shadow-inner">
                {mergePreviewResult.formulaM}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="size-3.5 text-purple-600 shrink-0" />
            <span>O cruzamento é adicionado como uma etapa reversível no pipeline do Power Query.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold transition-colors cursor-pointer text-xs"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmMerge}
              disabled={!mergePreviewResult || expandedCols.length === 0}
              className="px-5 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs text-xs"
            >
              <Check className="size-3.5" />
              <span>Concluir Mesclagem</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
