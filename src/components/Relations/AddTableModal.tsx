import React, { useState } from 'react';
import {
  X,
  Plus,
  Table2,
  FileSpreadsheet,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  Upload,
  Check,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import {
  createEmptySheet,
  createSalesSampleSheet,
  createHRStaffSampleSheet,
  createFinancialBudgetSheet,
  createAgentPauseSampleSheet,
} from '../../data/sampleDatasets';

interface AddTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSheet: (newSheet: Sheet) => void;
  onOpenImport?: () => void;
}

export const AddTableModal: React.FC<AddTableModalProps> = ({
  isOpen,
  onClose,
  onAddSheet,
  onOpenImport,
}) => {
  const [tabType, setTabType] = useState<'custom' | 'templates'>('templates');
  const [customName, setCustomName] = useState('Tabela_Auxiliar');
  const [rowsCount, setRowsCount] = useState(50);
  const [colsCount, setColsCount] = useState(15);

  if (!isOpen) return null;

  const handleCreateBlank = () => {
    const name = customName.trim() || 'Nova_Tabela';
    const sheetId = `sheet-${Date.now()}`;
    const newSheet = createEmptySheet(sheetId, name, rowsCount, colsCount);

    // Set initial friendly headers
    const sampleHeaders = ['Id', 'Nome', 'Categoria', 'Valor', 'Data', 'Status'];
    sampleHeaders.forEach((h, col) => {
      newSheet.data[`R0C${col}`] = {
        raw: h,
        value: h,
        format: { bold: true, bgColor: '#f1f5f9' },
      };
    });

    onAddSheet(newSheet);
    onClose();
  };

  const handleSelectTemplate = (templateType: string) => {
    const sheetId = `sheet-${Date.now()}`;
    let newSheet: Sheet;

    if (templateType === 'sales') {
      newSheet = createSalesSampleSheet(sheetId, 'Vendas_e_Comissoes');
    } else if (templateType === 'hr') {
      newSheet = createHRStaffSampleSheet(sheetId, 'RH_e_Funcionarios');
    } else if (templateType === 'finance') {
      newSheet = createFinancialBudgetSheet(sheetId, 'Orcamento_Financeiro');
    } else {
      newSheet = createAgentPauseSampleSheet(sheetId, 'Pausas_e_Atendimento');
    }

    onAddSheet(newSheet);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150 font-sans">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shadow-xs">
              <Plus className="size-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Adicionar Tabela ao Diagrama</h3>
              <p className="text-xs text-slate-500">Escolha uma tabela pronta ou crie uma em branco</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 px-6 pt-2 gap-2">
          <button
            onClick={() => setTabType('templates')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              tabType === 'templates'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Modelos de Tabelas Prontas
          </button>
          <button
            onClick={() => setTabType('custom')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              tabType === 'custom'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Criar Tabela em Branco
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tabType === 'templates' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Escolha o modelo para adicionar ao canvas:
              </div>

              {/* Vendas */}
              <button
                onClick={() => handleSelectTemplate('sales')}
                className="w-full p-3.5 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all text-left flex items-start gap-3.5 group cursor-pointer shadow-2xs hover:shadow-xs"
              >
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                  <TrendingUp className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-950">
                    Vendas, Produtos & Comissões
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Contém ID Venda, Vendedor, Região, Preço Unitário, Descontos e Status.
                  </div>
                </div>
              </button>

              {/* RH & Funcionários */}
              <button
                onClick={() => handleSelectTemplate('hr')}
                className="w-full p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-left flex items-start gap-3.5 group cursor-pointer shadow-2xs hover:shadow-xs"
              >
                <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">
                  <Users className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-950">
                    RH, Funcionários & Folha de Pagamento
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Contém Matrícula, Nome, Cargo, Salário Base, Horas Extras e E-mail.
                  </div>
                </div>
              </button>

              {/* Financeiro */}
              <button
                onClick={() => handleSelectTemplate('finance')}
                className="w-full p-3.5 rounded-2xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 transition-all text-left flex items-start gap-3.5 group cursor-pointer shadow-2xs hover:shadow-xs"
              >
                <div className="p-2.5 rounded-xl bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
                  <DollarSign className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-purple-950">
                    Orçamento & DRE Financeiro
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Contém Categorias, Orçado vs Realizado e Variações R$ e %.
                  </div>
                </div>
              </button>

              {/* Pausas & Atendimento */}
              <button
                onClick={() => handleSelectTemplate('agent')}
                className="w-full p-3.5 rounded-2xl border border-slate-200 hover:border-sky-500 hover:bg-sky-50/50 transition-all text-left flex items-start gap-3.5 group cursor-pointer shadow-2xs hover:shadow-xs"
              >
                <div className="p-2.5 rounded-xl bg-sky-100 text-sky-800 border border-sky-200 shrink-0">
                  <Clock className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-sky-950">
                    Acompanhamento de Pausas & Atendimento
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Contém Agente ID, Estado Atual, Motivo da Pausa e Tempos Totais.
                  </div>
                </div>
              </button>
            </div>
          )}

          {tabType === 'custom' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome da Nova Tabela:
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="Ex: Tabela_Metas_2026"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Quantidade de Linhas:
                  </label>
                  <input
                    type="number"
                    value={rowsCount}
                    onChange={e => setRowsCount(parseInt(e.target.value, 10) || 50)}
                    min={10}
                    max={1000}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Quantidade de Colunas:
                  </label>
                  <input
                    type="number"
                    value={colsCount}
                    onChange={e => setColsCount(parseInt(e.target.value, 10) || 15)}
                    min={5}
                    max={50}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateBlank}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Plus className="size-4" />
                <span>Criar Tabela em Branco</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {onOpenImport && (
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 text-[11px]">Tem uma planilha existente?</span>
            <button
              onClick={() => {
                onClose();
                onOpenImport();
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 text-indigo-700 font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              <Upload className="size-3.5" />
              <span>Importar Arquivo (.XLSX / .CSV)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
