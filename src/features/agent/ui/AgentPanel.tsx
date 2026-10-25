// src/features/agent/ui/AgentPanel.tsx
// Painel da IA: conversa, linha do tempo das ações, aprovações, resultados (gráfico, SQL, tabela) e desfazer.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Download,
  Key,
  Loader2,
  Send,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Square,
  Table2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { CopilotChartCard } from '../../../components/Copilot/CopilotChartCard';
import { getStoredApiKey, getStoredModel, saveStoredModel, STATIC_CANDIDATE_MODELS } from '../../../services/geminiService';
import { Sheet } from '../../../types/spreadsheet';
import { MODE_LABELS } from '../storage';
import { suggestionsFor } from '../suggestions';
import { Artifact, AutonomyMode } from '../types';
import { RichText } from './richText';
import { AgentSession, TimelineItem, UiMessage } from './useAgentSession';

export interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** A sessão vive no App (useAgentSession), para a conversa sobreviver à troca de aba. */
  session: AgentSession;
  sheets: Sheet[];
  selection?: string;
  onOpenSettings: () => void;
  onOpenPowerBI?: () => void;
  onCreateSheet?: (name: string, columns: string[], rows: (string | number | boolean | null)[][]) => void;
}

const MODES: AutonomyMode[] = ['plan', 'ask', 'auto'];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const StatusIcon: React.FC<{ status: TimelineItem['status'] }> = ({ status }) => {
  if (status === 'running') return <Loader2 className="size-3.5 shrink-0 animate-spin text-emerald-600" aria-label="Em andamento" />;
  if (status === 'waiting') return <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-amber-500" aria-label="Aguardando aprovação" />;
  if (status === 'error') return <X className="size-3.5 shrink-0 text-rose-600" aria-label="Falhou" />;
  return <Check className="size-3.5 shrink-0 text-emerald-600" aria-label="Concluído" />;
};

const Timeline: React.FC<{ items: TimelineItem[]; live: boolean }> = ({ items, live }) => {
  if (items.length === 0) return null;
  const steps = items.filter(i => i.kind === 'tool');
  return (
    <details open={live} className="mb-2 rounded-lg border border-slate-200 bg-slate-50/80 text-[11px]">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2.5 py-1.5 font-semibold text-slate-600">
        <ChevronDown className="size-3" />
        {live ? 'Trabalhando…' : `${steps.length} ação(ões) executada(s)`}
      </summary>
      <ul className="space-y-1 border-t border-slate-200 px-2.5 py-2">
        {items.map(item => (
          <li key={item.id} className="flex items-start gap-1.5">
            <span className="mt-0.5">{item.kind === 'note' ? <Sparkles className="size-3.5 text-violet-500" /> : <StatusIcon status={item.status} />}</span>
            <span className="min-w-0 flex-1">
              <span className={item.kind === 'note' ? 'italic text-slate-500' : item.risk === 'destructive' ? 'font-semibold text-rose-700' : 'text-slate-700'}>{item.title}</span>
              {item.detail && item.status === 'error' && <span className="block text-rose-600">{item.detail.slice(0, 220)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
};

const ArtifactView: React.FC<{ artifact: Artifact; onOpenPowerBI?: () => void; onCreateSheet?: AgentPanelProps['onCreateSheet'] }> = ({ artifact, onOpenPowerBI, onCreateSheet }) => {
  const [copied, setCopied] = useState(false);
  const flash = (): void => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  if (artifact.kind === 'chart') return <div className="mt-2"><CopilotChartCard chart={artifact.config} onOpenPowerBI={onOpenPowerBI} /></div>;
  if (artifact.kind === 'sql') {
    return (
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-900 p-2 text-[11px]">
        <div className="mb-1 flex items-center justify-between text-slate-300">
          <span className="font-semibold">SQL ({artifact.dialect})</span>
          <span className="flex gap-1">
            <button type="button" onClick={async () => (await copyText(artifact.sql)) && flash()} className="flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 hover:bg-slate-600">
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button type="button" onClick={() => download('fluxo.sql', artifact.sql)} className="flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 hover:bg-slate-600">
              <Download className="size-3" /> Baixar
            </button>
          </span>
        </div>
        <pre className="max-h-48 overflow-auto whitespace-pre font-mono text-emerald-200">{artifact.sql.slice(0, 4000)}</pre>
      </div>
    );
  }
  const tsv = [artifact.headers.join('\t'), ...artifact.rows.map(r => r.map(c => (c === null ? '' : String(c))).join('\t'))].join('\n');
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white text-[11px]">
      <div className="flex items-center justify-between bg-slate-50 px-2 py-1 font-semibold text-slate-700">
        <span className="flex items-center gap-1"><Table2 className="size-3.5 text-emerald-600" /> {artifact.title}</span>
        <span className="flex gap-1">
          <button type="button" onClick={async () => (await copyText(tsv)) && flash()} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 hover:bg-slate-100">
            {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />} {copied ? 'Copiado' : 'Copiar'}
          </button>
          {onCreateSheet && (
            <button type="button" onClick={() => onCreateSheet(artifact.title, artifact.headers, artifact.rows)} className="rounded bg-emerald-600 px-2 py-0.5 text-white hover:bg-emerald-700">
              Virar planilha
            </button>
          )}
        </span>
      </div>
      <div className="max-h-48 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>{artifact.headers.map(h => <th key={h} className="sticky top-0 border-b border-slate-200 bg-slate-100 px-2 py-1 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {artifact.rows.slice(0, 50).map((row, i) => (
              <tr key={i} className="odd:bg-white even:bg-slate-50/60">
                {row.map((cell, c) => <td key={c} className="border-b border-slate-100 px-2 py-0.5">{cell === null ? '' : String(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Bubble: React.FC<{
  message: UiMessage;
  live: boolean;
  isLastChange: boolean;
  onUndo: () => void;
  onOpenPowerBI?: () => void;
  onCreateSheet?: AgentPanelProps['onCreateSheet'];
}> = ({ message, live, isLastChange, onUndo, onOpenPowerBI, onCreateSheet }) => {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-gradient-to-br from-emerald-600 to-teal-700 px-3.5 py-2 text-xs text-white shadow-sm">{message.text}</div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[96%] rounded-2xl rounded-bl-sm border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-slate-800 shadow-sm">
        <Timeline items={message.timeline} live={live} />
        {live && message.timeline.length === 0 && (
          <div className="flex items-center gap-2 text-slate-500"><Loader2 className="size-3.5 animate-spin text-emerald-600" /> Pensando…</div>
        )}
        {message.text && <RichText text={message.text} />}
        {message.artifacts.map((artifact, i) => <ArtifactView key={i} artifact={artifact} onOpenPowerBI={onOpenPowerBI} onCreateSheet={onCreateSheet} />)}
        {!live && message.changed && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
            <span>{message.undone ? 'Alterações desfeitas.' : 'Alterações aplicadas na planilha e no fluxo.'}</span>
            {!message.undone && isLastChange && (
              <button type="button" onClick={onUndo} className="flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-0.5 font-semibold hover:bg-emerald-100">
                <Undo2 className="size-3" /> Desfazer tudo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const AgentPanel: React.FC<AgentPanelProps> = ({ isOpen, onClose, session, sheets, selection, onOpenSettings, onOpenPowerBI, onCreateSheet }) => {
  const [input, setInput] = useState('');
  const [model, setModel] = useState(() => getStoredModel());
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasKey = Boolean(getStoredApiKey());

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session.messages, session.pendingApproval]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 80);
  }, [isOpen]);

  const suggestions = useMemo(() => suggestionsFor(sheets, selection), [sheets, selection]);
  const lastChangedId = useMemo(() => [...session.messages].reverse().find(m => m.changed && !m.undone)?.id, [session.messages]);

  if (!isOpen) return null;

  const submit = (text: string): void => {
    if (!text.trim() || session.running) return;
    setInput('');
    void session.send(text);
  };

  return (
    <aside aria-label="Assistente de IA" className="flex h-full w-full max-w-none flex-col border-l border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-sm"><Sparkles className="size-4" /></div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">IA</div>
            <label className="flex items-center gap-1 text-[11px] text-slate-500">
              <Cpu className="size-3 text-blue-600" />
              <select
                value={model}
                onChange={e => {
                  setModel(e.target.value);
                  saveStoredModel(e.target.value);
                }}
                aria-label="Modelo"
                className="max-w-[150px] cursor-pointer truncate border-none bg-transparent p-0 font-medium text-slate-600 focus:ring-0"
              >
                {[model, ...STATIC_CANDIDATE_MODELS.filter(m => m !== model)].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-0.5 text-slate-400">
          <button
            type="button"
            onClick={() => session.setPrivacy(!session.privacy)}
            title={session.privacy ? 'Dados pessoais (CPF, e-mail, telefone, valores em R$) são trocados por marcadores antes de ir ao modelo. Clique para desligar.' : 'Privacidade desligada: os dados vão como estão. Clique para ligar.'}
            aria-pressed={session.privacy}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-bold ${session.privacy ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
          >
            {session.privacy ? <ShieldCheck className="size-3.5" /> : <ShieldOff className="size-3.5" />}
            {session.privacy ? 'Privado' : 'Aberto'}
          </button>
          <button type="button" onClick={onOpenSettings} className="rounded p-1.5 hover:bg-slate-100 hover:text-slate-700" title="Chave de API" aria-label="Configurar chave de API"><Key className="size-4" /></button>
          <button type="button" onClick={session.clear} className="rounded p-1.5 hover:bg-slate-100 hover:text-slate-700" title="Limpar conversa" aria-label="Limpar conversa"><Trash2 className="size-4" /></button>
          <button type="button" onClick={onClose} className="rounded p-1.5 hover:bg-slate-100 hover:text-slate-700" title="Fechar" aria-label="Fechar assistente"><X className="size-4" /></button>
        </div>
      </div>

      <div role="radiogroup" aria-label="Autonomia" className="flex items-center gap-1 border-b border-slate-200 bg-slate-100/70 px-3 py-1.5 text-[11px]">
        <span className="mr-1 text-slate-500">Autonomia:</span>
        {MODES.map(m => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={session.mode === m}
            title={MODE_LABELS[m].hint}
            onClick={() => session.setMode(m)}
            className={`rounded-full px-2.5 py-0.5 font-semibold transition-colors ${session.mode === m ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-200'}`}
          >
            {MODE_LABELS[m].label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {session.messages.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm">
            <p className="mb-1 font-semibold">Olá! Eu trabalho direto nas suas planilhas.</p>
            <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
              <li>Leio e analiso os dados com números exatos.</li>
              <li>Crio planilhas, colunas calculadas, gráficos e limpezas.</li>
              <li>Cruzo tabelas no fluxo e meço a qualidade da chave antes.</li>
              <li>Confiro o resultado e posso desfazer tudo de uma vez.</li>
            </ul>
            {!hasKey && (
              <button type="button" onClick={onOpenSettings} className="mt-2 flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700">
                <Key className="size-3.5" /> Configurar chave do Gemini
              </button>
            )}
          </div>
        )}
        {session.messages.map((m, i) => (
          <Bubble
            key={m.id}
            message={m}
            live={session.running && i === session.messages.length - 1}
            isLastChange={m.id === lastChangedId}
            onUndo={() => session.undoLast(m.id)}
            onOpenPowerBI={onOpenPowerBI}
            onCreateSheet={onCreateSheet}
          />
        ))}
        <div ref={endRef} />
      </div>

      {session.pendingApproval && (
        <div role="alertdialog" aria-label="Aprovação necessária" className={`border-t px-3 py-2 text-xs ${session.pendingApproval.risk === 'destructive' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="mb-1.5 font-semibold text-slate-800">{session.pendingApproval.risk === 'destructive' ? 'Confirmar ação que apaga dados' : 'Aprovar esta alteração?'}</div>
          <div className="mb-2 text-slate-700">{session.pendingApproval.summary}</div>
          <div className="flex gap-2">
            <button type="button" onClick={() => session.answerApproval(true)} className={`rounded-lg px-3 py-1.5 font-semibold text-white ${session.pendingApproval.risk === 'destructive' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>Aprovar</button>
            <button type="button" onClick={() => session.answerApproval(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100">Recusar</button>
          </div>
        </div>
      )}

      {!session.running && (
        <div className="border-t border-slate-200 bg-slate-100/70 p-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {suggestions.map(s => (
              <button key={s.label} type="button" onClick={() => submit(s.prompt)} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-800">
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-end gap-2 border-t border-slate-200 bg-white p-3"
      >
        <textarea
          ref={inputRef}
          value={input}
          rows={2}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          placeholder="Peça uma análise, uma correção, um cruzamento, um gráfico… (Shift+Enter quebra a linha)"
          disabled={session.running}
          className="max-h-32 min-h-[38px] flex-1 resize-none rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
        />
        {session.running ? (
          <button type="button" onClick={session.stop} aria-label="Parar" title="Parar" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm hover:bg-rose-700">
            <Square className="size-4" />
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} aria-label="Enviar" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
            <Send className="size-4" />
          </button>
        )}
      </form>
    </aside>
  );
};
