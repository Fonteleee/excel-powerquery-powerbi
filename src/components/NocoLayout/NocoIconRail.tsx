import React from 'react';
import {
  Table,
  GitBranch,
  LayoutDashboard,
  Settings,
  HelpCircle,
  Plus,
  Bookmark,
  Clock,
  Sparkles,
} from 'lucide-react';

export type NocoNavView = 'data' | 'workflows' | 'interfaces' | 'settings' | 'help' | 'activity';

interface NocoIconRailProps {
  activeNav: NocoNavView;
  onSelectNav: (nav: NocoNavView) => void;
  onNewSheet: () => void;
  onToggleCopilot: () => void;
  isCopilotOpen?: boolean;
  onOpenUserProfile?: () => void;
  onOpenHistory?: () => void;
  onToggleFavorites?: () => void;
  isStarred?: boolean;
}

export const NocoIconRail: React.FC<NocoIconRailProps> = ({
  activeNav,
  onSelectNav,
  onNewSheet,
  onToggleCopilot,
  isCopilotOpen = false,
  onOpenUserProfile,
  onOpenHistory,
  onToggleFavorites,
  isStarred = false,
}) => {
  const topNavItems: { id: NocoNavView; label: string; icon: React.ReactNode }[] = [
    { id: 'data', label: 'Dados', icon: <Table className="size-4.5" /> },
    { id: 'workflows', label: 'Fluxos', icon: <GitBranch className="size-4.5" /> },
    { id: 'interfaces', label: 'Painéis', icon: <LayoutDashboard className="size-4.5" /> },
    { id: 'settings', label: 'Ajustes', icon: <Settings className="size-4.5" /> },
    { id: 'help', label: 'Ajuda', icon: <HelpCircle className="size-4.5" /> },
  ];

  return (
    <aside className="w-14 shrink-0 bg-[#f8fafc] border-r border-[#e2e8f0] flex flex-col items-center py-2.5 select-none z-30 justify-between">
      {/* Top Logo & Primary Nav Items */}
      <div className="flex flex-col items-center w-full gap-1">
        {/* NocoDB Logo Badge */}
        <div
          onClick={onOpenUserProfile}
          title="Estúdio de Dados • Clique para ver Perfil"
          className="size-8 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center text-white font-bold text-sm shadow-sm cursor-pointer mb-2 hover:opacity-90 transition-opacity"
        >
          <span className="tracking-tighter">N</span>
        </div>

        {/* Navigation Items */}
        {topNavItems.map(item => {
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectNav(item.id)}
              title={item.label}
              className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer relative group ${
                isActive
                  ? 'bg-[#e0e7ff] text-[#4338ca] shadow-xs'
                  : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e293b]'
              }`}
            >
              {item.icon}
              <span className="text-[9px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}

        {/* Create Table / Sheet Action */}
        <button
          onClick={onNewSheet}
          title="Adicionar Nova Tabela"
          className="size-9 mt-1 rounded-lg flex items-center justify-center text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e293b] transition-colors cursor-pointer"
        >
          <Plus className="size-4.5" />
        </button>

        {/* Bookmarks */}
        <button
          onClick={onToggleFavorites}
          title={isStarred ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
          className={`size-9 rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer ${
            isStarred
              ? 'text-amber-500 bg-amber-50 shadow-xs'
              : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e293b]'
          }`}
        >
          <Bookmark className="size-4 fill-current" />
          <span className="text-[8px] font-medium leading-none">Favoritos</span>
        </button>
      </div>

      {/* Bottom Nav Items & User Avatar */}
      <div className="flex flex-col items-center w-full gap-2">
        {/* NocoAI Trigger Icon */}
        <button
          onClick={onToggleCopilot}
          title="NocoAI Copilot"
          className={`size-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
            isCopilotOpen
              ? 'bg-rose-500 text-white shadow-xs'
              : 'text-rose-500 hover:bg-rose-50'
          }`}
        >
          <Sparkles className="size-4.5" />
        </button>

        {/* Histórico Trigger */}
        <button
          onClick={onOpenHistory}
          title="Histórico de Auditoria & Alterações"
          className="size-9 rounded-lg flex flex-col items-center justify-center text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e293b] transition-colors cursor-pointer"
        >
          <Clock className="size-4.5" />
          <span className="text-[8px] font-medium leading-none">Histórico</span>
        </button>

        {/* User Avatar */}
        <div
          onClick={onOpenUserProfile}
          title="João Fontele (VF) • Ver Status da Sessão"
          className="size-8 rounded-full bg-[#1e293b] text-white flex items-center justify-center text-xs font-semibold shadow-xs cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all relative"
        >
          <span>VF</span>
          <span className="absolute bottom-0 right-0 size-2 bg-emerald-500 rounded-full border-2 border-white" />
        </div>
      </div>
    </aside>
  );
};
