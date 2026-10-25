// src/features/agent/loop.ts
// Laço do agente: o modelo escolhe ferramentas, o laço valida, pede aprovação quando preciso, executa,
// verifica o resultado e devolve o que aconteceu ao modelo, até ele concluir.

import { buildSystemPrompt, historyToTurns, summarizeWorkspace } from './prompt';
import { ALL_TOOLS, toDeclarations, toolByName, validateArgs } from './tools/registry';
import { clip, MAX_OUTPUT_CHARS, ToolError } from './tools/common';
import { scanFormulaErrors } from './tools/read';
import {
  AgentEvent,
  AgentRunResult,
  ApprovalRequest,
  Artifact,
  AutonomyMode,
  ChatTurn,
  Json,
  ModelClient,
  ModelPart,
  ModelTurn,
  PrivacyFilter,
  ToolDef,
  ToolEnv,
  ToolOutcome,
  Workspace,
} from './types';

export const DEFAULT_MAX_STEPS = 14;
const MAX_CONSECUTIVE_FAILURES = 4;
const MAX_CALLS_PER_STEP = 8;

export interface RunOptions {
  client: ModelClient;
  workspace: Workspace;
  message: string;
  history?: readonly ChatTurn[];
  mode?: AutonomyMode;
  tools?: readonly ToolDef[];
  maxSteps?: number;
  env?: ToolEnv;
  privacy?: PrivacyFilter;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
  /** Sem ela, qualquer ação que precise de aprovação é recusada. */
  requestApproval?: (request: ApprovalRequest) => Promise<boolean>;
}

function mapStrings(value: Json, fn: (s: string) => string): Json {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map(v => mapStrings(v, fn));
  if (value && typeof value === 'object') {
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn);
    return out;
  }
  return value;
}

const needsApproval = (tool: ToolDef, mode: AutonomyMode): boolean =>
  tool.risk === 'destructive' || (tool.risk === 'write' && mode === 'ask');

function responseFor(outcome: ToolOutcome, privacy: PrivacyFilter | undefined, extra?: Record<string, Json>): Record<string, Json> {
  const response: Record<string, Json> = { ok: outcome.ok, mensagem: clip(outcome.message), ...(outcome.data !== undefined ? { dados: outcome.data } : {}), ...extra };
  const masked = privacy ? (mapStrings(response, privacy.mask) as Record<string, Json>) : response;
  const text = JSON.stringify(masked);
  if (text.length <= MAX_OUTPUT_CHARS * 2) return masked;
  return { ok: outcome.ok, mensagem: clip(String(masked.mensagem ?? ''), MAX_OUTPUT_CHARS), aviso: 'Os dados foram cortados por tamanho; peça um recorte menor.' };
}

export async function runAgent(options: RunOptions): Promise<AgentRunResult> {
  const mode = options.mode ?? 'auto';
  const tools = options.tools ?? ALL_TOOLS;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const emit = options.onEvent ?? (() => undefined);
  const privacy = options.privacy;
  const env: ToolEnv = options.env ?? {};

  let workspace = options.workspace;
  let changed = false;
  let steps = 0;
  let consecutiveFailures = 0;
  const failedCalls = new Map<string, number>();
  const artifacts: Artifact[] = [];
  const actionLog: string[] = [];

  const context = `${summarizeWorkspace(workspace, env.selection ? `${env.selection.address}` : undefined)}`;
  const userText = `${options.message}\n\n[Estado atual]\n${context}`;
  const turns: ModelTurn[] = [
    ...historyToTurns(options.history ?? []).map(t => ({ role: t.role, parts: [{ text: privacy ? privacy.mask(t.text) : t.text }] })),
    { role: 'user' as const, parts: [{ text: privacy ? privacy.mask(userText) : userText }] },
  ];
  const system = buildSystemPrompt(mode);
  const declarations = toDeclarations(mode === 'plan' ? tools.filter(t => t.risk === 'read') : tools);

  const finish = (stopped: AgentRunResult['stopped'], text: string, error?: string): AgentRunResult => ({
    workspace,
    text: privacy ? privacy.unmask(text) : text,
    stopped,
    error,
    steps,
    changed,
    artifacts,
    actionLog,
  });

  try {
    for (let step = 1; step <= maxSteps; step++) {
      if (options.signal?.aborted) return finish('aborted', 'Execução interrompida.');
      steps = step;
      emit({ type: 'step', index: step });

      const reply = await options.client.generate({ system, turns, tools: declarations, signal: options.signal });
      const parts: ModelPart[] = reply.parts;
      const text = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text as string).join('').trim();
      const calls = parts.filter(p => p.functionCall);

      // Guarda a resposta crua (inclui assinaturas de raciocínio que o modelo exige de volta).
      turns.push({ role: 'model', parts });

      if (calls.length === 0) {
        if (!text) return finish('error', 'O modelo não devolveu resposta.', 'Resposta vazia do modelo.');
        return finish('done', text);
      }
      if (text) emit({ type: 'thinking', text: privacy ? privacy.unmask(text) : text });

      const responses: ModelPart[] = [];
      const touched = new Set<string>();
      let lastWriteIndex = -1;

      for (const part of calls) {
        const call = part.functionCall!;
        const id = `${step}-${responses.length + 1}`;
        const tool = toolByName(call.name, tools);
        const rawArgs = (privacy ? mapStrings((call.args ?? {}) as Json, privacy.unmask) : call.args ?? {}) as Record<string, unknown>;

        // Toda chamada precisa de uma resposta; as que passam do limite por passo recebem um aviso.
        if (responses.length >= MAX_CALLS_PER_STEP) {
          responses.push({ functionResponse: { name: call.name, response: { ok: false, mensagem: `Chamadas demais num passo (máximo ${MAX_CALLS_PER_STEP}). Repita esta em um passo seguinte.` } } });
          continue;
        }

        if (!tool || (mode === 'plan' && tool.risk !== 'read')) {
          const message = !tool
            ? `A ferramenta "${call.name}" não existe. Use apenas: ${tools.map(t => t.name).join(', ')}.`
            : 'Modo plano: nada é executado. Inclua esta ação no plano final.';
          if (tool) actionLog.push(`(plano) ${tool.summarize(rawArgs)}`);
          responses.push({ functionResponse: { name: call.name, response: { ok: false, mensagem: message } } });
          continue;
        }

        const summary = tool.summarize(rawArgs);
        emit({ type: 'tool_call', id, tool: tool.name, risk: tool.risk, summary });

        const invalid = validateArgs(tool, rawArgs);
        if (invalid.length > 0) {
          const message = `Argumentos inválidos: ${invalid.join(' ')}`;
          emit({ type: 'tool_result', id, tool: tool.name, ok: false, message });
          responses.push({ functionResponse: { name: tool.name, response: { ok: false, mensagem: message } } });
          consecutiveFailures++;
          continue;
        }

        if (needsApproval(tool, mode)) {
          const request: ApprovalRequest = { id, tool: tool.name, risk: tool.risk, summary };
          emit({ type: 'approval', request });
          const approved = options.requestApproval ? await options.requestApproval(request) : false;
          if (!approved) {
            const message = 'O usuário NÃO aprovou esta ação. Não tente de novo; explique o que faltou ou proponha outra abordagem.';
            emit({ type: 'tool_result', id, tool: tool.name, ok: false, message });
            actionLog.push(`(recusado) ${summary}`);
            responses.push({ functionResponse: { name: tool.name, response: { ok: false, mensagem: message } } });
            continue;
          }
        }

        const signature = `${tool.name}:${JSON.stringify(rawArgs)}`;
        if ((failedCalls.get(signature) ?? 0) >= 2) {
          const message = 'Esta mesma chamada já falhou duas vezes. Mude a abordagem em vez de repetir.';
          emit({ type: 'tool_result', id, tool: tool.name, ok: false, message });
          responses.push({ functionResponse: { name: tool.name, response: { ok: false, mensagem: message } } });
          consecutiveFailures++;
          continue;
        }

        let outcome: ToolOutcome;
        try {
          outcome = tool.run(workspace, rawArgs, env);
        } catch (error) {
          const message = error instanceof ToolError ? error.message : `Falha inesperada em ${tool.name}: ${error instanceof Error ? error.message : String(error)}`;
          outcome = { ok: false, message };
        }

        if (outcome.ok) {
          consecutiveFailures = 0;
          if (outcome.workspace) {
            workspace = outcome.workspace;
            changed = true;
            lastWriteIndex = responses.length;
            for (const sheetId of outcome.touchedSheetIds ?? []) touched.add(sheetId);
            emit({ type: 'workspace', workspace });
          }
          if (tool.risk !== 'read') actionLog.push(summary);
          for (const artifact of outcome.artifacts ?? []) {
            artifacts.push(artifact);
            emit({ type: 'artifact', artifact });
          }
        } else {
          consecutiveFailures++;
          failedCalls.set(signature, (failedCalls.get(signature) ?? 0) + 1);
        }
        emit({ type: 'tool_result', id, tool: tool.name, ok: outcome.ok, message: outcome.message });
        responses.push({ functionResponse: { name: tool.name, response: responseFor(outcome, privacy) } });
      }

      // Verificação automática: depois de alterar, procura erros de fórmula nas planilhas tocadas.
      if (lastWriteIndex >= 0 && touched.size > 0) {
        const { count, sample } = scanFormulaErrors(workspace.sheets, [...touched]);
        const message = count === 0 ? 'Verificação automática: nenhum erro de fórmula.' : `Verificação automática: ${count} erro(s) de fórmula (${sample.slice(0, 5).join('; ')}). Corrija antes de concluir.`;
        emit({ type: 'verification', ok: count === 0, message });
        const target = responses[lastWriteIndex].functionResponse;
        if (target) target.response = { ...target.response, verificacao: message };
      }

      turns.push({ role: 'user', parts: responses });

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        return finish('error', 'Parei porque várias ferramentas falharam em sequência. Reformule o pedido ou me diga mais detalhes.', 'Muitas falhas seguidas.');
      }
    }
    return finish('max_steps', `Cheguei ao limite de ${maxSteps} passos. O que já foi feito está aplicado; peça para eu continuar se quiser.`);
  } catch (error) {
    if (options.signal?.aborted) return finish('aborted', 'Execução interrompida.');
    const message = error instanceof Error ? error.message : String(error);
    return finish('error', `Não consegui continuar: ${message}`, message);
  }
}
