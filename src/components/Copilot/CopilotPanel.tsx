import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Sparkles,
  ShieldCheck,
  Key,
  Copy,
  Check,
  ArrowRight,
  Database,
  Calculator,
  BarChart2,
  Trash2,
  Zap,
  Layers,
  Cpu,
  RefreshCw,
  PlusCircle,
  FileSpreadsheet,
  ClipboardCheck,
  TableProperties,
} from 'lucide-react';
import { Sheet, CellPosition } from '../../types/spreadsheet';
import {
  CopilotMessage,
  askGeminiCopilot,
  getStoredApiKey,
  getStoredModel,
  saveStoredModel,
  STATIC_CANDIDATE_MODELS,
} from '../../services/geminiService';
import { CopilotChartCard } from './CopilotChartCard';
import { CopilotSqlTable } from './CopilotSqlTable';
import { syncSheetToDuckDB, queryDuckDB, DuckDBQueryResult } from '../../engine/duckdbEngine';
import { AgentAction } from '../../engine/agentActionProtocol';

interface CopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  activeCell: CellPosition;
  onInsertFormula: (formula: string) => void;
  onOpenSettings: () => void;
  onOpenPowerBI?: () => void;
  onExecuteAgentActions?: (actions: AgentAction[]) => void;
  onCreateNewSheet?: (name: string, columns: string[], rows: any[]) => void;
}

export const CopilotPanel: React.FC<CopilotPanelProps> = ({
  isOpen,
  onClose,
  sheet,
  activeCell,
  onInsertFormula,
  onOpenSettings,
  onOpenPowerBI,
  onExecuteAgentActions,
  onCreateNewSheet,
}) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Olá! Sou o seu **Autonomous Excel Agent com Google Gemini 3.x e DuckDB-Wasm**.\n\nAgora posso **executar ações reais no seu Excel**:\n- 🏗️ **Criar planilhas inteiras do zero** (Fluxo de Caixa, DRE, Vendas, Estoque)\n- ✏️ **Editar e calcular células em lote** com fórmulas automáticas\n- 🗑️ **Apagar colunas e linhas** sob demanda\n- 📊 **Gerar gráficos dinâmicos** e consultas SQL instantâneas\n- 📋 **Copiar dados formatados** para colar em qualquer aba ou arquivo\n- 🛡️ **Zero vazamento**: Dados protegidos com anonimização LGPD nativa.',
      timestamp: new Date(),
    },
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedFormula, setCopiedFormula] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [appliedActionIds, setAppliedActionIds] = useState<Set<string>>(new Set());
  const [duckdbResults, setDuckdbResults] = useState<Record<string, DuckDBQueryResult>>({});
  const [selectedModel, setSelectedModel] = useState<string>(getStoredModel());

  // DuckDB sync status
  const [indexedCols, setIndexedCols] = useState<string[]>([]);
  const [indexedRows, setIndexedRows] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const apiKey = getStoredApiKey();

  // Sincronizar planilha ativa com DuckDB-Wasm
  useEffect(() => {
    if (isOpen && sheet) {
      syncSheetToDuckDB(sheet).then(res => {
        if (res.success) {
          setIndexedCols(res.columns);
          setIndexedRows(res.rowCount);
        }
      });
    }
  }, [isOpen, sheet]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const handleModelChange = (newModel: string) => {
    setSelectedModel(newModel);
    saveStoredModel(newModel);
  };

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || isLoading) return;

    if (!apiKey) {
      onOpenSettings();
      return;
    }

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await askGeminiCopilot(textToSend, sheet, messages);
      
      const assistantMsgId = `assistant-${Date.now()}`;
      const assistantMsg: CopilotMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: result.text,
        timestamp: new Date(),
        suggestedFormula: result.suggestedFormula,
        suggestedMCode: result.suggestedMCode,
        suggestedChart: result.suggestedChart,
        suggestedSql: result.suggestedSql,
        actions: result.actions,
        maskedItemsCount: result.maskedCount,
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Se houver consulta SQL, executar automaticamente no DuckDB-Wasm
      if (result.suggestedSql) {
        queryDuckDB(result.suggestedSql).then(sqlRes => {
          setDuckdbResults(prev => ({ ...prev, [assistantMsgId]: sqlRes }));
        });
      }

    } catch (err: any) {
      const errorMsg: CopilotMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ **Erro ao consultar Gemini:** ${err?.message || 'Falha desconhecida.'}\n\nVerifique sua chave de API nas configurações ou escolha outro modelo Gemini 3.x.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyActions = (msgId: string, actions: AgentAction[]) => {
    if (onExecuteAgentActions && actions.length > 0) {
      onExecuteAgentActions(actions);
      setAppliedActionIds(prev => new Set(prev).add(msgId));
    }
  };

  const handleCopyFormula = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormula(text);
    setTimeout(() => setCopiedFormula(null), 2000);
  };

  // Copiar resposta formatada para colar direto no Excel (TSV) ou texto limpo
  const handleCopyResponse = (msg: CopilotMessage, asTabularData = false) => {
    let textToCopy = msg.content;

    const createAction = msg.actions?.find(a => a.type === 'create_sheet_from_scratch') as any;
    const duckResult = duckdbResults[msg.id];

    if (asTabularData && createAction && createAction.columns && createAction.rows) {
      // Montar TSV (Tab-Separated Values) que cola perfeitamente em linhas e colunas no Excel
      const headerLine = createAction.columns.join('\t');
      const rowLines = createAction.rows.map((r: any[]) => r.map(v => v === null || v === undefined ? '' : String(v)).join('\t'));
      textToCopy = `${headerLine}\n${rowLines.join('\n')}`;
    } else if (asTabularData && duckResult && duckResult.columns.length > 0) {
      const headerLine = duckResult.columns.join('\t');
      const rowLines = duckResult.rows.map(row => duckResult.columns.map(c => row[c] ?? '').join('\t'));
      textToCopy = `${headerLine}\n${rowLines.join('\n')}`;
    }

    navigator.clipboard.writeText(textToCopy);
    setCopiedMessageId(msg.id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: 'Histórico limpo. O que você gostaria de criar, editar ou analisar na planilha?',
        timestamp: new Date(),
      },
    ]);
    setDuckdbResults({});
  };

  // Sugestões inteligentes baseadas no estado da planilha
  const quickPrompts = [
    {
      label: 'Criar DRE Financeira 2026',
      icon: <FileSpreadsheet className="size-3 text-emerald-600" />,
      prompt: 'Crie uma nova planilha de DRE (Demonstrativo do Resultado do Exercício) completa para 2026 com 12 meses, receitas, custos, despesas, impostos, lucro líquido e margem EBITDA com fórmulas.',
    },
    {
      label: 'Criar Fluxo de Caixa Anual',
      icon: <Layers className="size-3 text-blue-600" />,
      prompt: 'Crie uma planilha de Fluxo de Caixa anual detalhada com entradas, saídas fixas/variáveis, saldo inicial, saldo final e saldo acumulado com fórmulas reais.',
    },
    {
      label: 'Adicionar Coluna de Margem %',
      icon: <Calculator className="size-3 text-amber-600" />,
      prompt: 'Adicione uma nova coluna de Margem % calculando a porcentagem de lucro em relação ao faturamento para todas as linhas preenchidas.',
    },
    {
      label: 'Gráfico Comparativo',
      icon: <BarChart2 className="size-3 text-purple-600" />,
      prompt: 'Analise os dados da planilha atual, faça o agrupamento dos principais totais e gere um gráfico comparativo avançado.',
    },
    {
      label: 'Consulta Analítica SQL',
      icon: <Database className="size-3 text-cyan-600" />,
      prompt: 'Gere uma consulta SQL analítica no DuckDB agrupando as métricas principais da planilha atual com soma e média.',
    },
  ];

  return (
    <aside aria-label="Excel AI Copilot" className="fixed top-12 bottom-8 right-0 z-40 flex w-[480px] max-w-[95vw] flex-col border-l border-slate-200 bg-slate-50 shadow-2xl transition-all duration-300">
      {/* Header do Cockpit */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-sm">
            <Sparkles className="size-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-800 text-sm">Autonomous Excel Agent</span>
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800" title="Anonimização de dados pessoais ativa">
                <ShieldCheck className="size-3" /> LGPD Safe
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Cpu className="size-3 text-blue-600" />
                <select
                  value={selectedModel}
                  onChange={e => handleModelChange(e.target.value)}
                  className="bg-transparent text-slate-600 font-medium hover:text-slate-900 border-none p-0 focus:ring-0 cursor-pointer"
                >
                  {STATIC_CANDIDATE_MODELS.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <button
            onClick={onOpenSettings}
            className="rounded p-1.5 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="Configurar chave de API"
          >
            <Key className="size-4" />
          </button>
          <button
            onClick={handleClearHistory}
            className="rounded p-1.5 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="Limpar histórico"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1.5 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="Fechar Copilot"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Barra de Status DuckDB-Wasm */}
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-100/60 px-4 py-1.5 text-[11px] text-slate-600">
        <div className="flex items-center gap-2">
          <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>DuckDB-Wasm Engine: <strong>{indexedRows} linhas</strong> ({indexedCols.length} colunas indexadas)</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">Client-Side WASM</span>
      </div>

      {/* Lista de Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => {
          const isUser = msg.role === 'user';
          const hasActions = msg.actions && msg.actions.length > 0;
          const hasTableAction = msg.actions?.some(a => a.type === 'create_sheet_from_scratch');
          const isApplied = appliedActionIds.has(msg.id);
          const isCopied = copiedMessageId === msg.id;
          const duckResult = duckdbResults[msg.id];

          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[95%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-br-none'
                    : 'bg-white border border-slate-200/80 text-slate-800 rounded-bl-none'
                }`}
              >
                {/* Texto da Mensagem */}
                <div className="whitespace-pre-wrap font-sans markdown-body">
                  {msg.content}
                </div>

                {/* Badge de Ações Prontas para Execução */}
                {hasActions && !isUser && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-900 text-xs">
                        <Zap className="size-4 text-emerald-600" />
                        <span>{msg.actions!.length} Ações Prontas para o Excel</span>
                      </div>
                      <span className="rounded-full bg-emerald-200/70 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {isApplied ? '✅ Executado' : '⚡ Ação Direta'}
                      </span>
                    </div>

                    <ul className="mb-3 space-y-1 text-[11px] text-emerald-800 list-disc list-inside">
                      {msg.actions!.map((act, aIdx) => {
                        if (act.type === 'create_sheet_from_scratch') {
                          return <li key={aIdx}>Criar nova aba <strong>{act.sheetName}</strong> ({act.rows?.length || 0} linhas).</li>;
                        } else if (act.type === 'set_cells') {
                          return <li key={aIdx}>Editar / calcular <strong>{act.cells.length} células</strong> com fórmulas.</li>;
                        } else if (act.type === 'delete_columns') {
                          return <li key={aIdx}>Excluir <strong>{act.colIndices.length} colunas</strong>.</li>;
                        } else if (act.type === 'delete_rows') {
                          return <li key={aIdx}>Excluir <strong>{act.rowIndices.length} linhas</strong>.</li>;
                        } else if (act.type === 'clear_range') {
                          return <li key={aIdx}>Limpar intervalo selecionado.</li>;
                        } else if (act.type === 'format_range') {
                          return <li key={aIdx}>Formatar intervalo de células.</li>;
                        }
                        return null;
                      })}
                    </ul>

                    {!isApplied ? (
                      <button
                        onClick={() => handleApplyActions(msg.id, msg.actions!)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all hover:scale-[1.01] active:scale-[0.99]"
                      >
                        <Zap className="size-3.5" />
                        <span>Aplicar Ações na Planilha Agora</span>
                      </button>
                    ) : (
                      <div className="text-center font-medium text-[11px] text-emerald-700 bg-emerald-100/60 rounded py-1">
                        ✅ Ações aplicadas com sucesso (Pressione Ctrl+Z para desfazer a qualquer momento).
                      </div>
                    )}
                  </div>
                )}

                {/* Tabela de Resultados DuckDB-Wasm */}
                {duckResult && (
                  <CopilotSqlTable
                    queryResult={duckResult}
                    sqlQuery={msg.suggestedSql}
                    onExportToNewSheet={onCreateNewSheet}
                  />
                )}

                {/* Card de Gráfico Interativo */}
                {msg.suggestedChart && (
                  <div className="mt-3">
                    <CopilotChartCard chart={msg.suggestedChart} onOpenPowerBI={onOpenPowerBI} />
                  </div>
                )}

                {/* Card de Sugestão de Fórmula */}
                {msg.suggestedFormula && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1">
                      <span className="flex items-center gap-1">
                        <Calculator className="size-3.5 text-emerald-600" />
                        Fórmula Sugerida
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyFormula(msg.suggestedFormula!)}
                          className="flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-50"
                        >
                          {copiedFormula === msg.suggestedFormula ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                          <span>{copiedFormula === msg.suggestedFormula ? 'Copiado' : 'Copiar'}</span>
                        </button>
                        <button
                          onClick={() => onInsertFormula(msg.suggestedFormula!)}
                          className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm hover:bg-emerald-700"
                        >
                          <ArrowRight className="size-3" />
                          <span>Inserir na Célula</span>
                        </button>
                      </div>
                    </div>
                    <code className="block rounded bg-white p-1.5 font-mono text-[11px] text-emerald-700 border border-slate-200">
                      {msg.suggestedFormula}
                    </code>
                  </div>
                )}

                {/* Rodapé de Ações da Mensagem: Copiar Resposta / Copiar como Tabela */}
                {!isUser && (
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 pt-2 text-[11px]">
                    {(hasTableAction || (duckResult && duckResult.columns.length > 0)) && (
                      <button
                        onClick={() => handleCopyResponse(msg, true)}
                        className="flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        title="Copia os dados formatados em colunas para colar direto no Excel"
                      >
                        {isCopied ? <Check className="size-3 text-emerald-600" /> : <TableProperties className="size-3 text-emerald-700" />}
                        <span>{isCopied ? 'Tabela Copiada!' : 'Copiar como Tabela Excel'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleCopyResponse(msg, false)}
                      className="flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors"
                      title="Copiar texto completo da resposta"
                    >
                      {isCopied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3 text-slate-500" />}
                      <span>{isCopied ? 'Copiado!' : 'Copiar Resposta'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 p-2">
            <RefreshCw className="size-4 animate-spin text-emerald-600" />
            <span>O Gemini está analisando e formulando as ações em Português...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sugestões Rápidas de Prompt */}
      <div className="border-t border-slate-200 bg-slate-100/70 p-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {quickPrompts.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(item.prompt)}
              disabled={isLoading}
              className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-800 transition-all disabled:opacity-50"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input de Mensagem */}
      <div className="border-t border-slate-200 bg-white p-3">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Peça para criar uma planilha, editar células, apagar colunas ou gerar gráficos..."
            disabled={isLoading}
            className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </aside>
  );
};
