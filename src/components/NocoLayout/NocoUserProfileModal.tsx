import React from 'react';
import {
  X,
  User,
  ShieldCheck,
  Cpu,
  Database,
  Key,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';

interface NocoUserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  tableCount: number;
}

export const NocoUserProfileModal: React.FC<NocoUserProfileModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  tableCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
        {/* Header with Avatar & Badge */}
        <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 size-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>

          <div className="flex items-center gap-3.5">
            <div className="size-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-bold text-xl flex items-center justify-center shadow-lg border-2 border-white/20">
              <span>VF</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">João Fontele</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
              </div>
              <p className="text-xs text-slate-300">Workspace Master • Administrador</p>
            </div>
          </div>
        </div>

        {/* Engine Diagnostics */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            {/* DuckDB Engine Status */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1">
                <Database className="size-3.5 text-indigo-600" />
                <span>DuckDB WASM</span>
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold">Motor Ativo (Worker)</div>
            </div>

            {/* Tables count */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1">
                <Layers className="size-3.5 text-purple-600" />
                <span>Tabelas Carregadas</span>
              </div>
              <div className="text-[11px] text-slate-800 font-bold">{tableCount} Planilhas Ativas</div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Key className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Chave API do Gemini Studio</div>
                  <div className="text-[10px] text-slate-500">Configurar IA Generativa</div>
                </div>
              </div>
              <span className="text-xs text-indigo-600 font-semibold group-hover:translate-x-0.5 transition-transform">→</span>
            </button>

            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center gap-2.5">
              <ShieldCheck className="size-5 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs font-bold text-emerald-900">Strix Security Gate: Ativo</div>
                <div className="text-[10px] text-emerald-700">0 vulnerabilidades detectadas • 100% isolado</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-mono">v2.4.0 • Full HD Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
