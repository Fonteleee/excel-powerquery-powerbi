import React, { useState } from 'react';
import {
  FunctionSquare,
  Search,
  Check,
  X,
  BookOpen,
} from 'lucide-react';
import { FORMULA_CATALOG, evaluateFormula } from '../../engine/formulaParser';
import { FormulaParamGuide, Sheet } from '../../types/spreadsheet';

interface FormulaWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  allSheets: Sheet[];
  onInsertFormula: (formula: string) => void;
}

export const FormulaWizardModal: React.FC<FormulaWizardModalProps> = ({
  isOpen,
  onClose,
  sheet,
  allSheets,
  onInsertFormula,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedFormula, setSelectedFormula] = useState<FormulaParamGuide>(FORMULA_CATALOG[0]);
  const [paramValues, setParamValues] = useState<{ [paramName: string]: string }>({
    pesquisa_valor: 'A2',
    pesquisa_matriz: 'B2:B20',
    matriz_retorno: 'C2:C20',
    se_não_encontrado: '"Não Encontrado"',
    modo_correspondência: '0',
  });

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
    const initialParams: { [key: string]: string } = {};
    formula.params.forEach(p => {
      initialParams[p.name] = p.defaultValue || '';
    });
    setParamValues(initialParams);
  };

  const buildFormulaString = (): string => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-800 border border-blue-200">
              <FunctionSquare className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Assistente Visual de Fórmulas</h3>
                <span className="px-2 py-0.5 text-xs rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                  Modo Fácil para Leigos
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Preencha os campos abaixo sem precisar decorar a sintaxe da fórmula
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Formula List */}
          <div className="w-1/3 border-r border-slate-200 bg-slate-50/50 flex flex-col">
            {/* Search */}
            <div className="p-3 border-b border-slate-200">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar função..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* Category pills */}
              <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 text-[10px] rounded-md font-bold whitespace-nowrap cursor-pointer transition-colors ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white'
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
                      ? 'bg-blue-50 border border-blue-300 text-blue-900 font-bold'
                      : 'hover:bg-slate-100 text-slate-700 border border-transparent'
                  }`}
                >
                  <div>
                    <div className="font-mono font-bold">{f.name}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[170px]">{f.category}</div>
                  </div>
                  {selectedFormula.name === f.name && <Check className="size-3.5 text-blue-600 font-bold" />}
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Parameters Form */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5 bg-white">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-mono font-extrabold text-blue-700">{selectedFormula.name}</span>
                <span className="px-2 py-0.5 text-[11px] rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                  {selectedFormula.category}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">{selectedFormula.description}</p>
            </div>

            {/* Parameter Fields */}
            <div className="space-y-3.5">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="size-3.5 text-blue-600" />
                Argumentos da Função:
              </div>

              {selectedFormula.params.map(param => (
                <div key={param.name} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono font-bold text-slate-800 flex items-center gap-1.5">
                      {param.name}
                      {param.optional && (
                        <span className="text-[10px] text-slate-500 font-sans font-normal">(opcional)</span>
                      )}
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-500">{param.description}</p>
                  <input
                    type="text"
                    placeholder={`Ex: ${param.name === 'pesquisa_valor' ? 'A2' : 'B2:B20'}`}
                    value={paramValues[param.name] ?? ''}
                    onChange={e =>
                      setParamValues({
                        ...paramValues,
                        [param.name]: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-emerald-800 font-bold focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                  />
                </div>
              ))}
            </div>

            {/* Formula Output Preview */}
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
              <div className="flex items-center justify-between text-xs text-blue-900 font-bold">
                <span>Fórmula Gerada:</span>
                <span className="text-[11px] text-slate-500">Resultado em tempo real:</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="font-mono text-sm font-bold text-emerald-800 bg-white px-3 py-1.5 rounded-lg border border-slate-300 flex-1 truncate">
                  {generatedFormula}
                </div>
                <div className="font-mono text-sm font-extrabold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-300 min-w-[80px] text-right">
                  {livePreviewResult !== null ? String(livePreviewResult) : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500">
            Exemplo: <span className="font-mono text-slate-700 font-bold">{selectedFormula.example}</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                onInsertFormula(generatedFormula);
                onClose();
              }}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              <Check className="size-4" />
              Inserir na Célula
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
