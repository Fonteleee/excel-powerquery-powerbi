// src/features/agent/ui/useAgentSession.ts
// Estado da conversa com a IA: executa o agente, aplica as mudanças ao vivo no app,
// guarda a linha do tempo de cada execução e controla aprovações e interrupção.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from '../../../types/spreadsheet';
import { FlowGraph } from '../../relations/model/graph';
import { FLOW_EXTERNAL_UPDATE_EVENT, loadFlowGraph, saveFlowGraph } from '../../relations/model/persistence';
import { runAgent } from '../loop';
import { createStoredClient, loadMode, loadPrivacy, maskingFilter, saveMode, savePrivacy } from '../storage';
import { AgentEvent, AgentRunResult, ApprovalRequest, Artifact, AutonomyMode, ChatTurn, StopReason, ToolRisk } from '../types';
import { globalMaskingEngine } from '../../../utils/dataMasking';

export interface TimelineItem {
  id: string;
  kind: 'tool' | 'note' | 'verification';
  title: string;
  risk?: ToolRisk;
  status: 'running' | 'ok' | 'error' | 'waiting';
  detail?: string;
}

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timeline: TimelineItem[];
  artifacts: Artifact[];
  /** Esta execução alterou planilhas ou fluxo (habilita "Desfazer"). */
  changed: boolean;
  undone: boolean;
  stopped?: StopReason;
  /** Passos usados (só em respostas finais). */
  steps?: number;
  graphBefore?: FlowGraph;
}

export interface AgentHost {
  sheets: Sheet[];
  activeSheetId: string;
  /** Seleção do usuário em A1 (ex.: "B2:C9"), se houver. */
  selection?: string;
  /** Chamado uma vez, antes da primeira alteração de uma execução (o app guarda o ponto de desfazer). */
  onBeginRun: () => void;
  onWorkspace: (sheets: Sheet[], activeSheetId: string) => void;
  onUndoSheets: () => void;
  onNeedKey: () => void;
}

const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export interface AgentSession {
  messages: UiMessage[];
  running: boolean;
  mode: AutonomyMode;
  privacy: boolean;
  pendingApproval: ApprovalRequest | null;
  send: (text: string) => Promise<void>;
  stop: () => void;
  answerApproval: (approved: boolean) => void;
  setMode: (mode: AutonomyMode) => void;
  setPrivacy: (on: boolean) => void;
  clear: () => void;
  undoLast: (messageId: string) => void;
}

export function useAgentSession(host: AgentHost): AgentSession {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [mode, setModeState] = useState<AutonomyMode>(() => loadMode());
  const [privacy, setPrivacyState] = useState<boolean>(() => loadPrivacy());
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);

  const hostRef = useRef(host);
  hostRef.current = host;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const abortRef = useRef<AbortController | null>(null);
  const approvalRef = useRef<((approved: boolean) => void) | null>(null);

  const patchMessage = useCallback((id: string, patch: (m: UiMessage) => UiMessage) => {
    setMessages(prev => prev.map(m => (m.id === id ? patch(m) : m)));
  }, []);

  const answerApproval = useCallback((approved: boolean) => {
    approvalRef.current?.(approved);
    approvalRef.current = null;
    setPendingApproval(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    answerApproval(false);
  }, [answerApproval]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || abortRef.current) return;
      const client = createStoredClient();
      if (!client) {
        hostRef.current.onNeedKey();
        return;
      }

      const assistantId = newId('ia');
      const graphBefore = loadFlowGraph();
      const history: ChatTurn[] = messagesRef.current
        .filter(m => m.text)
        .map(m => ({
          role: m.role,
          text: m.role === 'assistant' && m.timeline.length > 0 ? `${m.text}\n(Ações: ${m.timeline.filter(t => t.kind === 'tool' && t.status === 'ok' && t.risk !== 'read').map(t => t.title).join('; ') || 'nenhuma'})` : m.text,
        }));

      setMessages(prev => [
        ...prev,
        { id: newId('user'), role: 'user', text, timeline: [], artifacts: [], changed: false, undone: false },
        { id: assistantId, role: 'assistant', text: '', timeline: [], artifacts: [], changed: false, undone: false, graphBefore },
      ]);
      setRunning(true);
      const controller = new AbortController();
      abortRef.current = controller;

      let began = false;
      let lastGraph: FlowGraph = graphBefore;
      const add = (item: TimelineItem): void => patchMessage(assistantId, m => ({ ...m, timeline: [...m.timeline, item] }));
      const update = (id: string, patch: Partial<TimelineItem>): void =>
        patchMessage(assistantId, m => ({ ...m, timeline: m.timeline.map(t => (t.id === id ? { ...t, ...patch } : t)) }));

      const onEvent = (event: AgentEvent): void => {
        switch (event.type) {
          case 'thinking':
            add({ id: newId('n'), kind: 'note', title: event.text, status: 'ok' });
            break;
          case 'tool_call':
            add({ id: event.id, kind: 'tool', title: event.summary, risk: event.risk, status: 'running' });
            break;
          case 'approval':
            update(event.request.id, { status: 'waiting' });
            break;
          case 'tool_result':
            update(event.id, { status: event.ok ? 'ok' : 'error', detail: event.message });
            break;
          case 'verification':
            add({ id: newId('v'), kind: 'verification', title: event.message, status: event.ok ? 'ok' : 'error' });
            break;
          case 'artifact':
            patchMessage(assistantId, m => ({ ...m, artifacts: [...m.artifacts, event.artifact] }));
            break;
          case 'workspace': {
            if (!began) {
              began = true;
              hostRef.current.onBeginRun();
            }
            hostRef.current.onWorkspace(event.workspace.sheets, event.workspace.activeSheetId);
            if (event.workspace.graph !== lastGraph) {
              lastGraph = event.workspace.graph;
              saveFlowGraph(lastGraph);
              window.dispatchEvent(new CustomEvent(FLOW_EXTERNAL_UPDATE_EVENT, { detail: lastGraph }));
            }
            patchMessage(assistantId, m => ({ ...m, changed: true }));
            break;
          }
          default:
            break;
        }
      };

      let result: AgentRunResult;
      try {
        result = await runAgent({
          client,
          workspace: { sheets: hostRef.current.sheets, activeSheetId: hostRef.current.activeSheetId, graph: graphBefore },
          message: text,
          history,
          mode,
          privacy: privacy ? maskingFilter : undefined,
          signal: controller.signal,
          env: hostRef.current.selection ? { selection: { sheetId: hostRef.current.activeSheetId, address: hostRef.current.selection } } : undefined,
          onEvent,
          requestApproval: request =>
            new Promise<boolean>(resolve => {
              approvalRef.current = resolve;
              setPendingApproval(request);
            }),
        });
      } catch (error) {
        result = {
          workspace: { sheets: hostRef.current.sheets, activeSheetId: hostRef.current.activeSheetId, graph: graphBefore },
          text: `Não consegui executar: ${error instanceof Error ? error.message : String(error)}`,
          stopped: 'error',
          steps: 0,
          changed: false,
          artifacts: [],
          actionLog: [],
        };
      } finally {
        abortRef.current = null;
        approvalRef.current = null;
        setPendingApproval(null);
        setRunning(false);
      }

      patchMessage(assistantId, m => ({ ...m, text: result.text, stopped: result.stopped, steps: result.steps, changed: m.changed || result.changed }));
    },
    [mode, privacy, patchMessage]
  );

  const undoLast = useCallback(
    (messageId: string) => {
      const target = messagesRef.current.find(m => m.id === messageId);
      if (!target || !target.changed || target.undone) return;
      // O histórico do app guarda um ponto por execução: só a última execução pode ser desfeita por aqui.
      const lastChanged = [...messagesRef.current].reverse().find(m => m.changed && !m.undone);
      if (lastChanged?.id !== messageId) return;
      hostRef.current.onUndoSheets();
      if (target.graphBefore) {
        saveFlowGraph(target.graphBefore);
        window.dispatchEvent(new CustomEvent(FLOW_EXTERNAL_UPDATE_EVENT, { detail: target.graphBefore }));
      }
      patchMessage(messageId, m => ({ ...m, undone: true }));
    },
    [patchMessage]
  );

  const setMode = useCallback((next: AutonomyMode) => {
    setModeState(next);
    saveMode(next);
  }, []);

  const setPrivacy = useCallback((on: boolean) => {
    setPrivacyState(on);
    savePrivacy(on);
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    globalMaskingEngine.reset();
  }, []);

  return { messages, running, mode, privacy, pendingApproval, send, stop, answerApproval, setMode, setPrivacy, clear, undoLast };
}
