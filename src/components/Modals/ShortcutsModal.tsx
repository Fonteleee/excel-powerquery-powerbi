import React from 'react';
import { Keyboard, X, Sparkles, Command, Check } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      group: 'Copiar, Colar & Edição',
      items: [
        { key: 'Ctrl + C', desc: 'Copiar célula(s) selecionada(s) para a área de transferência' },
        { key: 'Ctrl + V', desc: 'Colar conteúdo e fórmulas ajustando referências relativas' },
        { key: 'Ctrl + X', desc: 'Recortar célula(s) selecionada(s)' },
        { key: 'Ctrl + Z', desc: 'Desfazer última alteração' },
        { key: 'Ctrl + Y', desc: 'Refazer alteração desfeita' },
        { key: 'Delete / Backspace', desc: 'Limpar conteúdo das células selecionadas' },
        { key: 'F2', desc: 'Entrar no modo de edição da célula ativa' },
        { key: 'Enter / Tab', desc: 'Confirmar edição e mover para próxima célula' },
        { key: 'Esc', desc: 'Cancelar edição ou desmarcar área copiada' },
      ],
    },
    {
      group: 'Inteligência & Análise Rápida',
      items: [
        { key: 'Ctrl + Q', desc: 'Abrir Lente de Análise Rápida (Totais, Gráficos, Formatação, Tabelas)' },
        { key: 'Ctrl + E', desc: 'Preenchimento Relâmpago (Flash Fill com IA de padrões)' },
        { key: 'Ctrl + S', desc: 'Exportação Rápida / Salvar direto para Excel (.XLSX)' },
        { key: 'Ctrl + A', desc: 'Selecionar todas as células da planilha' },
      ],
    },
    {
      group: 'Formatação de Texto & Célula',
      items: [
        { key: 'Ctrl + B', desc: 'Alternar Negrito (Bold)' },
        { key: 'Ctrl + I', desc: 'Alternar Itálico (Italic)' },
        { key: 'Ctrl + U', desc: 'Alternar Sublinhado (Underline)' },
      ],
    },
    {
      group: 'Navegação & Seleção',
      items: [
        { key: 'Setas direcionais', desc: 'Mover seleção entre células' },
        { key: 'Shift + Setas', desc: 'Expandir seleção de intervalo contíguo' },
        { key: 'Duplo clique no cabeçalho', desc: 'Auto-ajustar largura da coluna ao maior conteúdo' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200">
              <Keyboard className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Guia Completo de Atalhos de Teclado</h3>
              <p className="text-xs text-slate-500">Acelere seu fluxo de trabalho com os atalhos padrão do Excel</p>
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
        <div className="p-6 overflow-y-auto space-y-6 bg-white">
          {shortcutGroups.map(grp => (
            <div key={grp.group} className="space-y-2.5">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                {grp.group}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {grp.items.map(item => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100/80 transition-colors"
                  >
                    <span className="text-xs text-slate-700 font-medium">{item.desc}</span>
                    <kbd className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-mono text-xs font-bold text-slate-900 shadow-2xs">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3.5 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
