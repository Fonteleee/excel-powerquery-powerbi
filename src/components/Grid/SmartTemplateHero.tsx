import React, { useState } from 'react';
import {
  FileSpreadsheet,
  TrendingUp,
  Users,
  Package,
  ShoppingBag,
  Sparkles,
  ArrowRight,
  Send,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import {
  createSalesSampleSheet,
  createHRStaffSampleSheet,
  createFinancialBudgetSheet,
} from '../../data/sampleDatasets';
import { askGeminiCopilot } from '../../services/geminiService';
import { AgentAction } from '../../engine/agentActionProtocol';
import { applyAgentActions } from '../../engine/agentActionExecutor';

interface SmartTemplateHeroProps {
  onLoadTemplate: (sheet: Sheet) => void;
  onExecuteAgentActions: (actions: AgentAction[]) => void;
  onOpenImportModal: () => void;
  activeSheet: Sheet;
}

export const SmartTemplateHero: React.FC<SmartTemplateHeroProps> = ({
  onLoadTemplate,
  onExecuteAgentActions,
  onOpenImportModal,
  activeSheet,
}) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateAiSheet = async () => {
    if (!customPrompt.trim() || isLoading) return;
    setIsLoading(true);
    try {
      const res = await askGeminiCopilot(
        `Crie uma nova planilha completa a partir do zero sobre: ${customPrompt.trim()}`,
        activeSheet
      );
      if (res.actions && res.actions.length > 0) {
        onExecuteAgentActions(res.actions);
      }
    } catch (err) {
      console.error('Erro ao gerar planilha via AI:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const templates = [
    {
      id: 'dre',
      title: 'DRE & Orçamento Corporativo',
      desc: 'Receitas, custos operacionais, impostos e margem EBITDA com fórmulas.',
      icon: <TrendingUp className="size-5 text-emerald-600" />,
      tag: 'Finanças',
      action: () => {
        const sheet = createFinancialBudgetSheet();
        onLoadTemplate(sheet);
      },
    },
    {
      id: 'sales',
      title: 'Vendas & Comissões de Equipe',
      desc: 'Metas, faturamento, comissões de vendedores e status de entrega.',
      icon: <ShoppingBag className="size-5 text-blue-600" />,
      tag: 'Comercial',
      action: () => {
        const sheet = createSalesSampleSheet();
        onLoadTemplate(sheet);
      },
    },
    {
      id: 'hr',
      title: 'Gestão de Pessoas & Salários',
      desc: 'Cadastro de equipe, cargos, salários brutos, benefícios e líquido.',
      icon: <Users className="size-5 text-purple-600" />,
      tag: 'RH & DP',
      action: () => {
        const sheet = createHRStaffSampleSheet();
        onLoadTemplate(sheet);
      },
    },
    {
      id: 'cashflow',
      title: 'Fluxo de Caixa 12 Meses',
      desc: 'Projeção mensal de entradas, saídas fixas/variáveis e saldo acumulado.',
      icon: <FileSpreadsheet className="size-5 text-amber-600" />,
      tag: 'Fluxo de Caixa',
      action: () => {
        // Gerar via IA ou dataset
        setCustomPrompt('Fluxo de caixa de 12 meses para 2026 com projeção de receitas e despesas');
      },
    },
  ];

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-slate-900/5 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 mb-2">
            <Sparkles className="size-3.5" /> Estação de Trabalho Inteligente
          </div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">
            Como você gostaria de começar hoje?
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Escolha um modelo pronto profissional ou peça para a IA construir uma planilha completa do zero.
          </p>
        </div>

        {/* Input Inteligente com IA */}
        <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-50/40 p-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerateAiSheet()}
              disabled={isLoading}
              placeholder="Descreva o que precisa (ex: 'Controle de estoque com curva ABC' ou 'DRE anual')..."
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
            <button
              onClick={handleGenerateAiSheet}
              disabled={!customPrompt.trim() || isLoading}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  <span>Criando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  <span>Criar com IA</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Grade de Modelos Prontos */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {templates.map(tmpl => (
            <div
              key={tmpl.id}
              onClick={tmpl.action}
              className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 transition-all hover:border-emerald-400 hover:shadow-md hover:scale-[1.01]"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-emerald-50 transition-colors">
                    {tmpl.icon}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {tmpl.tag}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-800 text-xs group-hover:text-emerald-700 transition-colors">
                  {tmpl.title}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  {tmpl.desc}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                <span>Carregar modelo</span>
                <ArrowRight className="size-3" />
              </div>
            </div>
          ))}
        </div>

        {/* Rodapé com Importar Arquivo */}
        <div className="flex items-center justify-center pt-2 border-t border-slate-100 text-xs text-slate-500">
          <span>Já tem uma planilha existente?</span>
          <button
            onClick={onOpenImportModal}
            className="ml-1.5 flex items-center gap-1 font-bold text-emerald-700 hover:underline"
          >
            <FolderOpen className="size-3.5" />
            <span>Importar CSV ou XLSX</span>
          </button>
        </div>
      </div>
    </div>
  );
};
