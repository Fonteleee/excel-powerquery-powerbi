import React, { useState, useEffect } from 'react';
import {
  FunctionSquare,
  Search,
  Check,
  X,
  BookOpen,
  Sparkles,
  ArrowRight,
  CornerDownRight,
  Rows3,
  Columns3,
  Edit3,
} from 'lucide-react';
import { FORMULA_CATALOG, evaluateFormula, colIndexToLabel } from '../../engine/formulaParser';
import { FormulaParamGuide, Sheet, CellPosition, CellRange } from '../../types/spreadsheet';

export interface FormulaInsertOptions {
  formula: string;
  targetMode: 'active_cell' | 'first_empty_col' | 'below_selection' | 'fill_column' | 'custom';
  customCell?: string;
  fillRange?: CellRange;
}

interface FormulaWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  allSheets: Sheet[];
  activeCell: CellPosition;
  selectedRange: CellRange;
  onInsertFormula: (options: FormulaInsertOptions) => void;
}

export const FormulaWizardModal: React.FC<FormulaWizardModalProps> = ({
  isOpen,
  onClose,
  sheet,
  allSheets,
  activeCell,
  selectedRange,
  onInsertFormula,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedFormula, setSelectedFormula] = useState<FormulaParamGuide>(FORMULA_CATALOG[0]);
  const [paramValues, setParamValues] = useState<{ [paramName: string]: string }>({});
  const [activeParamField, setActiveParamField] = useState<string | null>(null);
  
  // Destination options
  const [targetMode, setTargetMode] = useState<'active_cell' | 'first_empty_col' | 'below_selection' | 'fill_column' | 'custom'>('active_cell');
  const [customCellInput, setCustomCellInput] = useState<string>('');

  // Compute selection smart labels
  const startColLabel = colIndexToLabel(selectedRange.startCol);
  const endColLabel = colIndexToLabel(selectedRange.endCol);
  const startRowLabel = selectedRange.startRow + 1;
  const endRowLabel = selectedRange.endRow + 1;
  const activeCellAddress = `${colIndexToLabel(activeCell.col)}${activeCell.row + 1}`;
  const fullRangeAddress = `${startColLabel}${startRowLabel}:${endColLabel}${endRowLabel}`;
  const isMultiRow = selectedRange.endRow > selectedRange.startRow;
  const isMultiCol = selectedRange.endCol > selectedRange.startCol;

  // Find first empty column
  const findFirstEmptyColIndex = (): number => {
    for (let c = 0; c < sheet.colCount; c++) {
      let hasData = false;
      for (let r = 0; r < Math.min(sheet.rowCount, 50); r++) {
        const val = sheet.data[`${r}_${c}`]?.value;
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          hasData = true;
          break;
        }
      }
      if (!hasData) return c;
    }
    return sheet.colCount;
  };
  const firstEmptyColIdx = findFirstEmptyColIndex();
  const firstEmptyColLabel = colIndexToLabel(firstEmptyColIdx);

  // Helper to compute smart default parameters based on active selection & formula
  const getSmartParams = (formula: FormulaParamGuide): { [key: string]: string } => {
    const params: { [key: string]: string } = {};

    if (formula.name === 'CONCAT' || formula.name === 'UNIRTEXTO') {
      if (formula.name === 'UNIRTEXTO') {
        params['delimitador'] = '" "';
        params['ignorar_vazio'] = 'VERDADEIRO';
        params['texto1'] = `${startColLabel}${startRowLabel}`;
        if (isMultiCol) {
          params['texto2'] = `${endColLabel}${startRowLabel}`;
        }
      } else {
        // CONCAT: Always default to Cell1, " ", Cell2 for names
        if (isMultiCol) {
          params['texto1'] = `${colIndexToLabel(selectedRange.startCol)}${startRowLabel}`;
          params['texto2'] = '" "';
          const secondCol = colIndexToLabel(selectedRange.startCol + 1);
          params['texto3'] = `${secondCol}${startRowLabel}`;
        } else {
          params['texto1'] = `${startColLabel}${startRowLabel}`;
          params['texto2'] = '" "';
        }
      }
    } else if (['SOMA', 'MÉDIA', 'MÁXIMO', 'MÍNIMO', 'CONT.VALORES', 'CONT.SE', 'MULT', 'DESVPAD.P'].includes(formula.name)) {
      params['intervalo'] = fullRangeAddress;
      if (formula.name === 'CONT.SE') {
        params['critérios'] = '">0"';
      }
    } else if (formula.name === 'SOMASE') {
      params['intervalo'] = `${startColLabel}${startRowLabel}:${startColLabel}${endRowLabel}`;
      params['critérios'] = '">0"';
      if (isMultiCol) {
        params['intervalo_soma'] = `${endColLabel}${startRowLabel}:${endColLabel}${endRowLabel}`;
      }
    } else if (formula.name === 'PROCV') {
      params['valor_procurado'] = `${colIndexToLabel(selectedRange.startCol)}${startRowLabel}`;
      params['matriz_tabela'] = fullRangeAddress;
      params['núm_índice_coluna'] = isMultiCol ? String(selectedRange.endCol - selectedRange.startCol + 1) : '2';
      params['procurar_intervalo'] = 'FALSO';
    } else if (formula.name === 'PROCX') {
      params['pesquisa_valor'] = `${colIndexToLabel(selectedRange.startCol)}${startRowLabel}`;
      params['pesquisa_matriz'] = `${startColLabel}${startRowLabel}:${startColLabel}${endRowLabel}`;
      params['matriz_retorno'] = isMultiCol ? `${endColLabel}${startRowLabel}:${endColLabel}${endRowLabel}` : `${startColLabel}${startRowLabel}:${startColLabel}${endRowLabel}`;
      params['se_não_encontrado'] = '"#N/D"';
      params['modo_correspondência'] = '0';
    } else if (formula.name === 'SE' || formula.name === 'SEERRO') {
      if (formula.name === 'SE') {
        params['teste_lógico'] = `${startColLabel}${startRowLabel} > 0`;
        params['valor_se_verdadeiro'] = '"Aprovado"';
        params['valor_se_falso'] = '"Reprovado"';
      } else {
        params['valor'] = `${startColLabel}${startRowLabel}`;
        params['valor_se_erro'] = '0';
      }
    } else if (['MAIÚSCULA', 'MINÚSCULA', 'PRI.MAIÚSCULA', 'ARRUMAR', 'NÚM.CARACT'].includes(formula.name)) {
      params['texto'] = `${startColLabel}${startRowLabel}`;
    } else {
      formula.params.forEach(p => {
        params[p.name] = p.defaultValue || '';
      });
    }

    return params;
  };

  // When modal opens or formula changes, populate smart params
  useEffect(() => {
    if (isOpen) {
      setParamValues(getSmartParams(selectedFormula));
      if (isMultiRow && (selectedFormula.name === 'CONCAT' || selectedFormula.name.startsWith('MAIÚSCULA'))) {
        setTargetMode('fill_column');
      } else if (isMultiRow && ['SOMA', 'MÉDIA', 'MÁXIMO', 'MÍNIMO', 'CONT.VALORES'].includes(selectedFormula.name)) {
        setTargetMode('below_selection');
      }
    }
  }, [isOpen, selectedFormula, selectedRange]);

  if (!isOpen) return null;

  const categories = ['Todas', 'Busca e Referência', 'Lógica', 'Matemática e Estatística', 'Texto'];

  const filteredFormulas = FORMULA_CATALOG.filter(f => {
    const matchesSearch =
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'Todas' || f.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleSelectFormula = (formula: FormulaParamGuide) => {
    setSelectedFormula(formula);
    setParamValues(getSmartParams(formula));
  };

  const buildFormulaString = (): string => {
    if (selectedFormula.name === 'CONCAT' && paramValues['texto3']) {
      return `=CONCAT(${paramValues['texto1'] || '""'}, ${paramValues['texto2'] || '""'}, ${paramValues['texto3'] || '""'})`;
    }

    const argList = selectedFormula.params
      .map(p => paramValues[p.name] || (p.defaultValue ?? ''))
      .filter((val, idx) => {
        return val !== '' || !selectedFormula.params[idx].optional;
      });

    return `=${selectedFormula.name}(${argList.join(', ')})`;
  };

  const generatedFormula = buildFormulaString();
  let livePreviewResult: any = '';
  try {
    livePreviewResult = evaluateFormula(generatedFormula, sheet, allSheets);
  } catch (err: any) {
    livePreviewResult = err.message || '#ERRO!';
  }

  // Quick insertion chips
  const quickRangeChips = [
    { label: `📍 Seleção: ${fullRangeAddress}`, value: fullRangeAddress },
    ...(isMultiCol
      ? [
          {
            label: isMultiRow ? `Coluna 1 (${startColLabel}${startRowLabel}:${startColLabel}${endRowLabel})` : `Coluna 1 (${startColLabel}${startRowLabel})`,
            value: isMultiRow ? `${startColLabel}${startRowLabel}:${startColLabel}${endRowLabel}` : `${startColLabel}${startRowLabel}`,
          },
          {
            label: isMultiRow ? `Coluna 2 (${endColLabel}${startRowLabel}:${endColLabel}${endRowLabel})` : `Coluna 2 (${endColLabel}${startRowLabel})`,
            value: isMultiRow ? `${endColLabel}${startRowLabel}:${endColLabel}${endRowLabel}` : `${endColLabel}${startRowLabel}`,
          },
        ]
      : []),
    { label: `Célula ${startColLabel}${startRowLabel}`, value: `${startColLabel}${startRowLabel}` },
    ...(isMultiCol ? [{ label: `Célula ${endColLabel}${startRowLabel}`, value: `${endColLabel}${startRowLabel}` }] : []),
    { label: 'Espaço (" ")', value: '" "' },
  ];

  const handleApplyChip = (val: string) => {
    if (activeParamField && paramValues[activeParamField] !== undefined) {
      setParamValues(prev => ({ ...prev, [activeParamField]: val }));
    } else {
      // Find first parameter
      const firstParam = selectedFormula.params[0]?.name;
      if (firstParam) {
        setParamValues(prev => ({ ...prev, [firstParam]: val }));
      }
    }
  };

  const handleConfirmInsert = () => {
    onInsertFormula({
      formula: generatedFormula,
      targetMode,
      customCell: customCellInput.trim() || undefined,
      fillRange: isMultiRow ? selectedRange : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
              <FunctionSquare className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Assistente Inteligente de Fórmulas</h3>
                <span className="px-2.5 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold flex items-center gap-1">
                  <Sparkles className="size-3" /> Auto-Detecção Ativa
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Intervalo detectado: <strong className="font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">{fullRangeAddress}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Formula List */}
          <div className="w-72 border-r border-slate-200 bg-slate-50/70 flex flex-col shrink-0">
            {/* Search */}
            <div className="p-3 border-b border-slate-200 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar função (ex: CONCAT, SOMA)..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/30"
                />
              </div>

              {/* Category pills */}
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-1 text-[10px] rounded-md font-bold whitespace-nowrap cursor-pointer transition-colors ${
                      selectedCategory === cat
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredFormulas.map(f => (
                <button
                  key={f.name}
                  onClick={() => handleSelectFormula(f)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-between ${
                    selectedFormula.name === f.name
                      ? 'bg-emerald-50 border border-emerald-400 text-emerald-950 font-bold shadow-2xs'
                      : 'hover:bg-slate-200/70 text-slate-800 border border-transparent'
                  }`}
                >
                  <div>
                    <div className="font-mono font-bold text-slate-900">{f.name}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[180px]">{f.description}</div>
                  </div>
                  {selectedFormula.name === f.name && <Check className="size-4 text-emerald-700 font-bold" />}
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Parameters & Destination */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5 bg-white text-slate-800">
            {/* Header info */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-mono font-extrabold text-emerald-800">{selectedFormula.name}</span>
                  <span className="px-2 py-0.5 text-xs rounded-md bg-slate-200 text-slate-700 font-semibold">
                    {selectedFormula.category}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{selectedFormula.description}</p>
              </div>
              <span className="text-[11px] font-mono bg-white px-2.5 py-1 rounded border border-slate-300 text-slate-700">
                {selectedFormula.syntax}
              </span>
            </div>

            {/* Smart Chips Bar */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-emerald-700" />
                Clique para preencher com seu intervalo selecionado:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickRangeChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyChip(chip.value)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-mono font-semibold transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Parameter Fields */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="size-4 text-emerald-700" />
                Argumentos da Função:
              </div>

              {selectedFormula.params.map(param => (
                <div
                  key={param.name}
                  className={`p-3 rounded-xl border transition-all ${
                    activeParamField === param.name
                      ? 'bg-emerald-50/50 border-emerald-500 ring-1 ring-emerald-500/20'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-mono font-bold text-slate-900 flex items-center gap-1.5">
                      {param.name}
                      {param.optional && (
                        <span className="text-[10px] text-slate-500 font-sans font-normal">(opcional)</span>
                      )}
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-1.5">{param.description}</p>
                  <input
                    type="text"
                    onFocus={() => setActiveParamField(param.name)}
                    placeholder={`Ex: ${param.defaultValue || 'B2:B9'}`}
                    value={paramValues[param.name] ?? ''}
                    onChange={e =>
                      setParamValues({
                        ...paramValues,
                        [param.name]: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-emerald-900 font-bold focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/30"
                  />
                </div>
              ))}

              {/* Extra field for CONCAT if user wants 3rd item */}
              {selectedFormula.name === 'CONCAT' && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="text-xs font-mono font-bold text-slate-900 mb-1 block">
                    texto3 <span className="text-[10px] text-slate-500 font-sans font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    onFocus={() => setActiveParamField('texto3')}
                    placeholder='Ex: " - "'
                    value={paramValues['texto3'] ?? ''}
                    onChange={e => setParamValues({ ...paramValues, texto3: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-emerald-900 font-bold focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/30"
                  />
                </div>
              )}
            </div>

            {/* DESTINATION SELECTOR: Onde Inserir o Resultado */}
            <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CornerDownRight className="size-4 text-emerald-700" />
                  Onde você deseja inserir o resultado?
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* 1. Célula Ativa */}
                <button
                  type="button"
                  onClick={() => setTargetMode('active_cell')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    targetMode === 'active_cell'
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-400 text-slate-800'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs">
                    {activeCellAddress}
                  </div>
                  <div>
                    <div className="text-xs font-bold">Célula Ativa</div>
                    <div className="text-[11px] text-slate-500">Insere em {activeCellAddress}</div>
                  </div>
                </button>

                {/* 2. Nova Coluna ao Lado */}
                <button
                  type="button"
                  onClick={() => setTargetMode('first_empty_col')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    targetMode === 'first_empty_col'
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-400 text-slate-800'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-800 font-bold text-xs flex items-center gap-1">
                    <Columns3 className="size-3.5" /> {firstEmptyColLabel}
                  </div>
                  <div>
                    <div className="text-xs font-bold">1ª Coluna Vazia</div>
                    <div className="text-[11px] text-slate-500">Insere na Coluna {firstEmptyColLabel}</div>
                  </div>
                </button>

                {/* 3. Abaixo da Seleção */}
                <button
                  type="button"
                  onClick={() => setTargetMode('below_selection')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    targetMode === 'below_selection'
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-400 text-slate-800'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-800 font-bold text-xs flex items-center gap-1">
                    <Rows3 className="size-3.5" /> L{endRowLabel + 1}
                  </div>
                  <div>
                    <div className="text-xs font-bold">Linha Abaixo (Total)</div>
                    <div className="text-[11px] text-slate-500">Insere na Linha {endRowLabel + 1}</div>
                  </div>
                </button>

                {/* 4. Preencher Toda a Coluna */}
                <button
                  type="button"
                  onClick={() => setTargetMode('fill_column')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    targetMode === 'fill_column'
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-400 text-slate-800'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1">
                    <Sparkles className="size-3.5" /> L{startRowLabel}..L{endRowLabel}
                  </div>
                  <div>
                    <div className="text-xs font-bold">Replicar na Coluna Inteira</div>
                    <div className="text-[11px] text-slate-500">Calcula todas as {selectedRange.endRow - selectedRange.startRow + 1} linhas</div>
                  </div>
                </button>
              </div>

              {/* 5. Célula Customizada */}
              <div className="flex items-center gap-2 pt-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 shrink-0">
                  <Edit3 className="size-3.5 text-slate-500" /> Ou informe célula específica:
                </label>
                <input
                  type="text"
                  placeholder="Ex: E2, J10, F4"
                  value={customCellInput}
                  onChange={e => {
                    setCustomCellInput(e.target.value.toUpperCase());
                    if (e.target.value) setTargetMode('custom');
                  }}
                  className="w-32 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase text-slate-900 focus:outline-hidden focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Formula Output Preview */}
            <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-300 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-emerald-950 font-bold">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-4 text-emerald-700" /> Fórmula Pronta:
                </span>
                <span className="text-[11px] text-slate-600">Resultado em tempo real:</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="font-mono text-sm font-bold text-emerald-950 bg-white px-3.5 py-2 rounded-lg border border-emerald-300 flex-1 truncate shadow-inner">
                  {generatedFormula}
                </div>
                <div className="font-mono text-sm font-extrabold text-slate-900 bg-white px-4 py-2 rounded-lg border border-slate-300 min-w-[100px] text-right shadow-2xs">
                  {livePreviewResult !== null ? String(livePreviewResult) : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-600">
            Exemplo oficial: <span className="font-mono text-slate-800 font-bold">{selectedFormula.example}</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmInsert}
              className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95"
            >
              <Check className="size-4" />
              Aplicar e Inserir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
