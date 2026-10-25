// src/features/agent/gemini.ts
// Cliente do Gemini com chamada de ferramentas nativa (function calling).
// A chave vai no cabeçalho `x-goog-api-key` (nunca na URL).

import { ModelClient, ModelPart, ModelRequest, ObjectSchema, ToolParamSchema } from './types';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiClientOptions {
  apiKey: string;
  model: string;
  /** Tentados em ordem quando o modelo escolhido não existe para a chave. */
  fallbackModels?: readonly string[];
  temperature?: number;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
  /** Injetável nos testes para não esperar de verdade. */
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

type GeminiSchema = {
  type: string;
  description?: string;
  enum?: string[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
};

export function toGeminiSchema(schema: ToolParamSchema): GeminiSchema {
  const out: GeminiSchema = { type: schema.type.toUpperCase() };
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = [...schema.enum];
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    if (schema.required && schema.required.length > 0) out.required = [...schema.required];
  }
  return out;
}

function parametersOf(schema: ObjectSchema): GeminiSchema | undefined {
  return Object.keys(schema.properties).length === 0 ? undefined : toGeminiSchema(schema);
}

export function buildGeminiBody(request: ModelRequest, options: Pick<GeminiClientOptions, 'temperature' | 'maxOutputTokens'>): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.turns.map(t => ({ role: t.role, parts: t.parts })),
    tools:
      request.tools.length === 0
        ? undefined
        : [{ functionDeclarations: request.tools.map(t => ({ name: t.name, description: t.description, parameters: parametersOf(t.parameters) })) }],
    toolConfig: request.tools.length === 0 ? undefined : { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { temperature: options.temperature ?? 0.2, maxOutputTokens: options.maxOutputTokens ?? 8192 },
  };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: ModelPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** `true` quando vale tentar outro modelo. */
    readonly modelProblem = false
  ) {
    super(message);
  }
}

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export function createGeminiClient(options: GeminiClientOptions): ModelClient {
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? defaultSleep;
  const retries = options.maxRetries ?? 2;
  const models = [options.model, ...(options.fallbackModels ?? []).filter(m => m !== options.model)];

  async function callModel(model: string, request: ModelRequest): Promise<ModelPart[]> {
    const body = JSON.stringify(buildGeminiBody(request, options));
    for (let attempt = 0; ; attempt++) {
      const response = await doFetch(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey.trim() },
        body,
        signal: request.signal,
      });
      const json = (await response.json().catch(() => null)) as GeminiResponse | null;

      if (!response.ok) {
        const detail = json?.error?.message ?? `HTTP ${response.status}`;
        if ((response.status === 429 || response.status === 503) && attempt < retries) {
          await sleep(600 * 2 ** attempt);
          continue;
        }
        const modelProblem = response.status === 404 || (response.status === 400 && /model/i.test(detail));
        throw new GeminiError(
          response.status === 429 ? 'Limite de uso do Gemini atingido. Tente novamente em instantes.' : response.status === 401 || response.status === 403 ? 'Chave de API recusada pelo Gemini. Confira a chave nas configurações.' : detail,
          response.status,
          modelProblem
        );
      }

      if (json?.promptFeedback?.blockReason) throw new GeminiError(`O Gemini bloqueou o pedido (${json.promptFeedback.blockReason}).`, 200);
      const candidate = json?.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      if (parts.length === 0) throw new GeminiError(`O Gemini não devolveu conteúdo${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}.`, 200);
      return parts;
    }
  }

  return {
    async generate(request) {
      let lastError: unknown = null;
      for (const model of models) {
        try {
          return { parts: await callModel(model, request), model };
        } catch (error) {
          lastError = error;
          if (!(error instanceof GeminiError && error.modelProblem)) throw error;
        }
      }
      throw lastError ?? new GeminiError('Nenhum modelo do Gemini está disponível para esta chave.', 404);
    },
  };
}
