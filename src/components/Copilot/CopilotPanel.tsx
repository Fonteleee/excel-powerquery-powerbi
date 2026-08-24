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
  Lock,
} from 'lucide-react';
import { Sheet, CellPosition } from '../../types/spreadsheet';
import {
  CopilotMessage,
  askGeminiCopilot,
  getStoredApiKey,
  getStoredModel,
} from '../../services/geminiService';

interface CopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sheet: Sheet;
  activeCell: CellPosition;
  onInsertFormula: (formula: string) => void;
  onOpenSettings: () => void;
}

export const CopilotPanel: React.FC<CopilotPanelProps> = ({
  isOpen,
  onClose,
  sheet,
  activeCell,
  onInsertFormula,
  onOpenSettings,
}) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Olá! Sou o seu **Excel Copilot com Google Gemini**.\n\nPosso gerar fórmulas avançadas, criar transformações para o Power Query e analisar seus dados.\n\n🔒 **100% Seguro**: Todos os dados sensíveis são anonimizados no seu navegador antes do processamento.',
      timestamp: new Date(),
    },
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedFormula, setCopiedFormula] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const apiKey = getStoredApiKey();
  const currentModel = getStoredModel();

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
      const assistantMsg: CopilotMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.text,
        timestamp: new Date(),
        suggestedFormula: result.suggestedFormula,
        suggestedMCode: result.suggestedMCode,
        maskedItemsCount: result.maskedCount,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: CopilotMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ **Erro ao consultar Gemini:** ${err?.message || 'Falha desconhecida.'}\n\nVerifique se sua chave de API está correta clicando no ícone de chave acima.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormula(text);
    setTimeout(() => setCopiedFormula(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: 'Histórico limpo. Como posso ajudar com sua planilha agora?',
        timestamp: new Date(),
      },
    ]);
  };

  const quickPrompts = [
    {
      label: 'Sugerir Fórmula para Total',
      icon: <Calculator className="size-3 text-emerald-600" />,
      prompt: `Gere uma fórmula do Excel para somar ou calcular os valores principais da tabela atual.`,
    },
    {
      label: 'Analisar e Gerar Insights',
      icon: <BarChart2 className="size-3 text-blue-600" />,
      prompt: `Analise as colunas da planilha "${sheet.name}" e aponte os 3 principais destaques e conclusões.`,
    },
    {
      label: 'Transformação Power Query',
      icon: <Database className="size-3 text-purple-600" />,
      prompt: `Como criar uma etapa no Power Query para limpar nulos e padronizar textos nesta planilha?`,
    },
  ];

  return (
    <aside className="w-80 sm:w-92 h-full bg-[#f9f9f9] border-l border-[#e0e0e0] flex flex-col z-30 select-none shadow-lg animate-in slide-in-from-right-2 duration-200 font-sans">
      {/* Header */}
      <div className="h-11 px-3.5 bg-[#f5f5f5] border-b border-[#e0e0e0] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-md bg-linear-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-2xs">
            <Sparkles className="size-3.5" />
          </div>
          <div>
            <h3 className="font-semibold text-xs text-[#242424] flex items-center gap-1.5">
              <span>Copilot</span>
              <span className="text-[10px] bg-purple-100 text-purple-800 font-semibold px-1.5 py-0.2 rounded">Gemini Pro</span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSettings}
            title={`Configurações de IA (${currentModel})`}
            className="p-1 rounded hover:bg-[#ebebeb] text-[#505050] hover:text-[#242424] cursor-pointer transition-colors"
          >
            <Key className="size-3.5" />
          </button>
          <button
            onClick={handleClearHistory}
            title="Limpar conversa"
            className="p-1 rounded hover:bg-[#ebebeb] text-[#505050] hover:text-[#242424] cursor-pointer transition-colors"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Fechar Copilot"
            className="p-1 rounded hover:bg-[#ebebeb] text-[#505050] hover:text-[#242424] cursor-pointer transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Security Status Ribbon */}
      <div className="px-3 py-1.5 bg-[#e8f5e9] border-b border-[#c8e6c9] flex items-center justify-between text-[11px] text-emerald-900">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-emerald-700 shrink-0" />
          <span className="font-medium">Data Masking Ativo</span>
        </div>
        <span className="text-[10px] text-emerald-700 bg-white/70 px-1.5 py-0.2 rounded border border-emerald-300">
          0 dados sensíveis expostos
        </span>
      </div>

      {/* Chat Messages Container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin text-xs">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-lg px-3 py-2 leading-relaxed shadow-2xs ${
                msg.role === 'user'
                  ? 'bg-[#107c41] text-white rounded-br-none'
                  : 'bg-white border border-[#e0e0e0] text-[#242424] rounded-bl-none'
              }`}
            >
              <div className="whitespace-pre-wrap text-xs select-text">
                {msg.content}
              </div>

              {/* Formula Action Card */}
              {msg.suggestedFormula && (
                <div className="mt-2.5 p-2 bg-[#f5f5f5] border border-[#e0e0e0] rounded-md text-xs">
                  <div className="flex items-center justify-between mb-1.5 text-[11px] text-[#707070] font-semibold">
                    <span>Fórmula Sugerida:</span>
                    <button
                      onClick={() => handleCopy(msg.suggestedFormula!)}
                      className="flex items-center gap-1 text-[#107c41] hover:underline cursor-pointer"
                    >
                      {copiedFormula === msg.suggestedFormula ? (
                        <>
                          <Check className="size-3" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                  <code className="block p-1.5 bg-white border border-[#e0e0e0] rounded font-mono text-[11px] text-[#107c41] font-bold select-all mb-2">
                    {msg.suggestedFormula}
                  </code>
                  <button
                    onClick={() => onInsertFormula(msg.suggestedFormula!)}
                    className="w-full py-1 bg-[#107c41] hover:bg-[#0e6b37] text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                  >
                    <span>Inserir na Célula Ativa</span>
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              )}

              {/* Power Query Code Card */}
              {msg.suggestedMCode && (
                <div className="mt-2.5 p-2 bg-purple-50 border border-purple-200 rounded-md text-xs">
                  <div className="flex items-center justify-between mb-1.5 text-[11px] text-purple-900 font-semibold">
                    <span className="flex items-center gap-1">
                      <Database className="size-3 text-purple-700" />
                      <span>Código Power Query (M):</span>
                    </span>
                    <button
                      onClick={() => handleCopy(msg.suggestedMCode!)}
                      className="text-purple-700 hover:underline cursor-pointer"
                    >
                      Copiar Código
                    </button>
                  </div>
                  <pre className="p-1.5 bg-white border border-purple-200 rounded font-mono text-[10px] text-purple-900 overflow-x-auto select-all">
                    {msg.suggestedMCode}
                  </pre>
                </div>
              )}
            </div>

            <span className="text-[10px] text-[#8a8886] mt-0.5 px-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-2 bg-white border border-[#e0e0e0] rounded-lg max-w-[85%] text-xs text-[#505050] shadow-2xs animate-pulse">
            <div className="size-3.5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <span>Processando dados com anonimização...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestion Chips */}
      <div className="p-2 bg-[#f5f5f5] border-t border-[#e0e0e0] flex flex-wrap gap-1">
        {quickPrompts.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q.prompt)}
            disabled={isLoading}
            className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-[#ebebeb] border border-[#e0e0e0] rounded-md text-[11px] text-[#242424] transition-colors cursor-pointer disabled:opacity-40"
          >
            {q.icon}
            <span className="truncate max-w-[130px]">{q.label}</span>
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-[#e0e0e0]">
        {!apiKey ? (
          <div className="p-2 bg-amber-50 border border-amber-200 rounded text-center">
            <p className="text-[11px] text-amber-900 mb-1.5 font-medium">Chave do Google Gemini não configurada</p>
            <button
              onClick={onOpenSettings}
              className="px-3 py-1 bg-[#107c41] text-white rounded text-xs font-semibold hover:bg-[#0e6b37] cursor-pointer"
            >
              Configurar Chave Gemini
            </button>
          </div>
        ) : (
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-1.5"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Peça uma fórmula, análise ou código M..."
              disabled={isLoading}
              className="flex-1 h-8 px-2.5 bg-white border border-[#e0e0e0] focus:border-[#107c41] focus:outline-hidden rounded text-xs text-[#242424] placeholder:text-[#8a8886]"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="size-8 bg-[#107c41] hover:bg-[#0e6b37] disabled:opacity-30 text-white rounded flex items-center justify-center shrink-0 shadow-2xs cursor-pointer transition-colors"
            >
              <Send className="size-3.5" />
            </button>
          </form>
        )}
      </div>
    </aside>
  );
};
