import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  Lock,
  ExternalLink,
} from 'lucide-react';
import {
  getStoredApiKey,
  saveStoredApiKey,
  getStoredModel,
  saveStoredModel,
  testGeminiConnection,
} from '../../services/geminiService';

interface GeminiApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const GeminiApiKeyModal: React.FC<GeminiApiKeyModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-2.0-flash');
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredApiKey());
      setModel(getStoredModel());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveStoredApiKey(apiKey);
    saveStoredModel(model);
    onSaved?.();
    onClose();
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    const res = await testGeminiConnection(apiKey, model);
    setTestResult(res);
    setIsTesting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-white rounded-lg shadow-2xl border border-[#e0e0e0] w-full max-w-lg overflow-hidden flex flex-col font-sans">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#f5f5f5] border-b border-[#e0e0e0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-md bg-linear-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[#242424]">Configuração do Gemini AI Pro (Copilot)</h3>
              <p className="text-[11px] text-[#707070]">Inteligência Artificial Segura com Zero Data Retention</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#ebebeb] text-[#707070] hover:text-[#242424] cursor-pointer transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs text-[#242424]">
          {/* Security Banner */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-start gap-2.5">
            <ShieldCheck className="size-4.5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-emerald-900 block text-xs">Proteção de Dados & Privacidade Ativa</span>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Todos os nomes, e-mails, documentos, telefones e valores de planilhas são <strong>anonimizados localmente no seu navegador</strong> antes do envio. Sua chave fica armazenada apenas no seu computador (<code className="bg-emerald-100 px-1 py-0.2 rounded font-mono text-[10px]">localStorage</code>).
              </p>
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-xs font-semibold text-[#242424] mb-1">Modelo de IA:</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full h-8 px-2.5 bg-white border border-[#e0e0e0] rounded text-xs text-[#242424] focus:outline-hidden focus:border-[#107c41] cursor-pointer"
            >
              <option value="gemini-2.0-flash">Google Gemini 2.0 Flash (Ultra Rápido & Inteligente - Recomendado)</option>
              <option value="gemini-1.5-pro">Google Gemini 1.5 Pro (Raciocínio Profundo para Grandes Bases)</option>
              <option value="gemini-1.5-flash">Google Gemini 1.5 Flash (Leve & Econômico)</option>
            </select>
          </div>

          {/* API Key Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-[#242424]">Chave de API do Google Gemini:</label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
              >
                <span>Obter chave no Google AI Studio</span>
                <ExternalLink className="size-3" />
              </a>
            </div>

            <div className="relative flex items-center">
              <div className="absolute left-2.5 text-[#707070]">
                <Key className="size-3.5" />
              </div>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full h-8 pl-8 pr-9 bg-white border border-[#e0e0e0] rounded text-xs font-mono text-[#242424] focus:outline-hidden focus:border-[#107c41]"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 text-[#707070] hover:text-[#242424] cursor-pointer"
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>

          {/* Test Connection Status */}
          {testResult && (
            <div
              className={`p-2.5 rounded-md border flex items-center gap-2 text-xs animate-in fade-in ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="size-4 text-rose-600 shrink-0" />
              )}
              <span className="text-[11px]">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#f5f5f5] border-t border-[#e0e0e0] flex items-center justify-between">
          <button
            onClick={handleTest}
            disabled={isTesting || !apiKey.trim()}
            className="px-3 py-1.5 bg-white border border-[#e0e0e0] hover:bg-[#ebebeb] text-[#242424] rounded text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer transition-colors"
          >
            {isTesting ? (
              <>
                <div className="size-3 border-2 border-[#107c41] border-t-transparent rounded-full animate-spin" />
                <span>Testando...</span>
              </>
            ) : (
              <>
                <Lock className="size-3.5 text-[#707070]" />
                <span>Testar Conexão</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-white border border-[#e0e0e0] hover:bg-[#ebebeb] text-[#242424] rounded text-xs font-medium cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 bg-[#107c41] hover:bg-[#0e6b37] text-white rounded text-xs font-semibold shadow-xs cursor-pointer transition-colors"
            >
              Salvar Configuração
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
