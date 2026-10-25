// src/features/agent/types.ts
// Contratos do agente de IA: espaço de trabalho, ferramentas, cliente de modelo e eventos.

import { CopilotChartConfig } from '../../components/Copilot/CopilotChartCard';
import { Sheet } from '../../types/spreadsheet';
import { FlowGraph } from '../relations/model/graph';

/** Tudo que o agente enxerga e pode alterar. Sempre tratado como imutável: cada ferramenta devolve um novo. */
export interface Workspace {
  sheets: Sheet[];
  activeSheetId: string;
  graph: FlowGraph;
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface ToolParamSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: readonly string[];
  items?: ToolParamSchema;
  properties?: Record<string, ToolParamSchema>;
  required?: readonly string[];
}

export interface ObjectSchema extends ToolParamSchema {
  type: 'object';
  properties: Record<string, ToolParamSchema>;
}

/** `read` só lê; `write` altera e pode ser desfeito; `destructive` apaga e SEMPRE pede confirmação. */
export type ToolRisk = 'read' | 'write' | 'destructive';

export type Artifact =
  | { kind: 'chart'; config: CopilotChartConfig }
  | { kind: 'sql'; dialect: string; sql: string }
  | { kind: 'table'; title: string; headers: string[]; rows: (string | number | boolean | null)[][] };

/** Contexto de execução (somente leitura) vindo da interface. */
export interface ToolEnv {
  /** Célula/intervalo selecionado pelo usuário, em A1 (ex.: "B2" ou "B2:C9"). */
  selection?: { sheetId: string; address: string };
}

export interface ToolOutcome {
  ok: boolean;
  /** Texto que o modelo lê. Curto, em português, com números exatos. */
  message: string;
  data?: Json;
  /** Novo espaço de trabalho, quando a ferramenta alterou algo. */
  workspace?: Workspace;
  /** Planilhas tocadas (para a verificação automática). */
  touchedSheetIds?: string[];
  artifacts?: Artifact[];
}

export interface ToolDef {
  name: string;
  description: string;
  risk: ToolRisk;
  parameters: ObjectSchema;
  /** Resumo humano da chamada (mostrado na linha do tempo e no pedido de aprovação). */
  summarize: (args: Record<string, unknown>) => string;
  run: (workspace: Workspace, args: Record<string, unknown>, env: ToolEnv) => ToolOutcome;
}

// ---- Modelo ----------------------------------------------------------------------------------

/** Parte de uma mensagem. Campos desconhecidos (ex.: assinaturas de raciocínio) são preservados e devolvidos. */
export interface ModelPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, Json> };
  [extra: string]: unknown;
}

export interface ModelTurn {
  role: 'user' | 'model';
  parts: ModelPart[];
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: ObjectSchema;
}

export interface ModelRequest {
  system: string;
  turns: ModelTurn[];
  tools: ToolDeclaration[];
  signal?: AbortSignal;
}

export interface ModelClient {
  generate(request: ModelRequest): Promise<{ parts: ModelPart[]; model?: string }>;
}

// ---- Conversa e eventos ----------------------------------------------------------------------

/** Histórico enxuto entre execuções: só o que foi dito e o que foi feito (sem os dados lidos). */
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Quão autônomo o agente é. `plan` só planeja; `ask` pede aprovação de toda alteração; `auto` pede só para apagar. */
export type AutonomyMode = 'plan' | 'ask' | 'auto';

export interface ApprovalRequest {
  id: string;
  tool: string;
  risk: ToolRisk;
  summary: string;
}

export type AgentEvent =
  | { type: 'step'; index: number }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; id: string; tool: string; risk: ToolRisk; summary: string }
  | { type: 'approval'; request: ApprovalRequest }
  | { type: 'tool_result'; id: string; tool: string; ok: boolean; message: string }
  | { type: 'workspace'; workspace: Workspace }
  | { type: 'artifact'; artifact: Artifact }
  | { type: 'verification'; ok: boolean; message: string };

export type StopReason = 'done' | 'max_steps' | 'aborted' | 'error';

export interface AgentRunResult {
  workspace: Workspace;
  text: string;
  stopped: StopReason;
  error?: string;
  steps: number;
  changed: boolean;
  artifacts: Artifact[];
  /** Resumo do que foi feito, para entrar no histórico da próxima rodada. */
  actionLog: string[];
}

/** Máscara de privacidade: o modelo só vê dados pessoais trocados por marcadores. */
export interface PrivacyFilter {
  mask: (text: string) => string;
  unmask: (text: string) => string;
}
