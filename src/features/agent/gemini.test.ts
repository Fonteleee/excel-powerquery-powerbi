// src/features/agent/gemini.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildGeminiBody, createGeminiClient, GeminiError, toGeminiSchema } from './gemini';
import { toDeclarations } from './tools/registry';
import { ModelRequest } from './types';

const request = (): ModelRequest => ({
  system: 'sistema',
  turns: [{ role: 'user', parts: [{ text: 'oi' }] }],
  tools: toDeclarations(),
});

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const okBody = { candidates: [{ content: { parts: [{ text: 'olá' }] } }] };

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeFetch(responses: Response[]): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return responses[Math.min(i++, responses.length - 1)];
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const noSleep = async (): Promise<void> => undefined;

describe('corpo da requisição', () => {
  it('converte o esquema das ferramentas (tipos em maiúsculas, sem parâmetros vazios)', () => {
    const body = buildGeminiBody(request(), {}) as { tools: { functionDeclarations: { name: string; parameters?: { type: string; properties: Record<string, { type: string }> } }[] }[] };
    const decls = body.tools[0].functionDeclarations;
    assert.equal(decls.length, toDeclarations().length);
    const sort = decls.find(d => d.name === 'ordenar')!;
    assert.equal(sort.parameters!.type, 'OBJECT');
    assert.equal(sort.parameters!.properties.planilha.type, 'STRING');
    assert.equal(decls.find(d => d.name === 'listar_planilhas')!.parameters, undefined);
  });

  it('toGeminiSchema preserva enum, itens e obrigatórios', () => {
    const out = toGeminiSchema({ type: 'object', properties: { a: { type: 'array', items: { type: 'string', enum: ['x'] } } }, required: ['a'] });
    assert.deepEqual(out, { type: 'OBJECT', properties: { a: { type: 'ARRAY', items: { type: 'STRING', enum: ['x'] } } }, required: ['a'] });
  });

  it('sem ferramentas não envia bloco de tools', () => {
    const body = buildGeminiBody({ ...request(), tools: [] }, {});
    assert.equal(body.tools, undefined);
    assert.equal(body.toolConfig, undefined);
  });
});

describe('chamada HTTP', () => {
  it('envia a chave no cabeçalho, nunca na URL', async () => {
    const { fetchImpl, calls } = fakeFetch([json(200, okBody)]);
    const client = createGeminiClient({ apiKey: 'SEGREDO-123', model: 'gemini-x', fetchImpl });
    const result = await client.generate(request());
    assert.equal(result.parts[0].text, 'olá');
    assert.ok(!calls[0].url.includes('SEGREDO'));
    assert.equal(calls[0].headers['x-goog-api-key'], 'SEGREDO-123');
    assert.match(calls[0].url, /models\/gemini-x:generateContent$/);
  });

  it('repete em 429 com espera e depois funciona', async () => {
    const { fetchImpl, calls } = fakeFetch([json(429, { error: { message: 'cota' } }), json(200, okBody)]);
    const waits: number[] = [];
    const client = createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl, sleep: async ms => void waits.push(ms) });
    await client.generate(request());
    assert.equal(calls.length, 2);
    assert.equal(waits.length, 1);
  });

  it('desiste do 429 depois das tentativas e explica', async () => {
    const { fetchImpl } = fakeFetch([json(429, { error: { message: 'cota' } })]);
    const client = createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl, sleep: noSleep, maxRetries: 1 });
    await assert.rejects(() => client.generate(request()), /Limite de uso/);
  });

  it('usa o modelo reserva quando o primeiro não existe', async () => {
    const { fetchImpl, calls } = fakeFetch([json(404, { error: { message: 'model not found' } }), json(200, okBody)]);
    const client = createGeminiClient({ apiKey: 'k', model: 'inexistente', fallbackModels: ['gemini-b'], fetchImpl, sleep: noSleep });
    const result = await client.generate(request());
    assert.equal(result.model, 'gemini-b');
    assert.match(calls[1].url, /gemini-b/);
  });

  it('chave recusada não tenta outros modelos', async () => {
    const { fetchImpl, calls } = fakeFetch([json(403, { error: { message: 'bad key' } })]);
    const client = createGeminiClient({ apiKey: 'k', model: 'a', fallbackModels: ['b'], fetchImpl, sleep: noSleep });
    await assert.rejects(() => client.generate(request()), (e: unknown) => e instanceof GeminiError && /Chave de API recusada/.test(e.message));
    assert.equal(calls.length, 1);
  });

  it('pedido bloqueado e resposta vazia viram erros claros', async () => {
    const blocked = createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl: fakeFetch([json(200, { promptFeedback: { blockReason: 'SAFETY' } })]).fetchImpl });
    await assert.rejects(() => blocked.generate(request()), /bloqueou.*SAFETY/);
    const empty = createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl: fakeFetch([json(200, { candidates: [{ finishReason: 'MAX_TOKENS' }] })]).fetchImpl });
    await assert.rejects(() => empty.generate(request()), /MAX_TOKENS/);
  });

  it('devolve chamadas de função com as partes intactas', async () => {
    const part = { functionCall: { name: 'listar_planilhas', args: {} }, thoughtSignature: 'sig' };
    const { fetchImpl } = fakeFetch([json(200, { candidates: [{ content: { parts: [part] } }] })]);
    const result = await createGeminiClient({ apiKey: 'k', model: 'm', fetchImpl }).generate(request());
    assert.deepEqual(result.parts[0], part);
  });
});
