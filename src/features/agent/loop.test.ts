// src/features/agent/loop.test.ts
// O laço é testado com um modelo roteirizado: o que importa aqui é a lógica do agente, não o Gemini.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellPosToKey } from '../../engine/formulaParser';
import { createEmptyGraph } from '../relations/model/graph';
import { sampleSheets } from '../relations/testing/fixtures';
import { runAgent, RunOptions } from './loop';
import { AgentEvent, ApprovalRequest, ModelClient, ModelPart, ModelRequest, Workspace } from './types';

const workspace = (): Workspace => ({ sheets: sampleSheets(), activeSheetId: 'agentes', graph: createEmptyGraph() });

const call = (name: string, args: Record<string, unknown> = {}): ModelPart => ({ functionCall: { name, args } });
const say = (text: string): ModelPart[] => [{ text }];

/** Cliente que responde na ordem do roteiro e guarda tudo que recebeu. */
function scripted(script: ModelPart[][]): ModelClient & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = [];
  let i = 0;
  return {
    requests,
    async generate(request) {
      requests.push(JSON.parse(JSON.stringify(request)) as ModelRequest);
      const parts = script[Math.min(i++, script.length - 1)];
      return { parts, model: 'fake' };
    },
  };
}

const base = (client: ModelClient, message: string, extra: Partial<RunOptions> = {}): RunOptions => ({
  client,
  workspace: workspace(),
  message,
  ...extra,
});

describe('runAgent: fluxo básico', () => {
  it('responde sem ferramentas quando não há o que fazer', async () => {
    const result = await runAgent(base(scripted([say('Olá!')]), 'oi'));
    assert.equal(result.stopped, 'done');
    assert.equal(result.text, 'Olá!');
    assert.equal(result.changed, false);
  });

  it('investiga, altera, verifica e conclui', async () => {
    const client = scripted([
      [call('descrever_planilha', { planilha: 'Pausas' })],
      [call('adicionar_coluna_formula', { planilha: 'Pausas', titulo: 'Horas', formula: '=C2/60' })],
      say('Adicionei a coluna Horas.'),
    ]);
    const events: AgentEvent[] = [];
    const result = await runAgent(base(client, 'adicione horas', { onEvent: e => events.push(e) }));

    assert.equal(result.stopped, 'done');
    assert.equal(result.changed, true);
    assert.equal(result.steps, 3);
    assert.equal(result.workspace.sheets.find(s => s.id === 'pausas')!.data[cellPosToKey(1, 3)]?.value, 1);
    assert.deepEqual(result.actionLog, ['Adicionar coluna "Horas" em "Pausas"']);
    assert.ok(events.some(e => e.type === 'verification' && e.ok));
    assert.ok(events.some(e => e.type === 'tool_call' && e.tool === 'descrever_planilha'));
  });

  it('o resultado de cada ferramenta volta ao modelo no passo seguinte', async () => {
    const client = scripted([[call('listar_planilhas')], say('ok')]);
    await runAgent(base(client, 'liste'));
    const second = client.requests[1];
    const last = second.turns[second.turns.length - 1];
    assert.equal(last.role, 'user');
    const response = last.parts[0].functionResponse!;
    assert.equal(response.name, 'listar_planilhas');
    assert.match(JSON.stringify(response.response), /Agentes/);
  });

  it('mantém as partes cruas do modelo (assinaturas de raciocínio) ao devolver o histórico', async () => {
    const client = scripted([[{ ...call('listar_planilhas'), thoughtSignature: 'abc' }], say('ok')]);
    await runAgent(base(client, 'liste'));
    const modelTurn = client.requests[1].turns.find(t => t.role === 'model')!;
    assert.equal(modelTurn.parts[0].thoughtSignature, 'abc');
  });

  it('inclui o resumo do espaço de trabalho e o histórico no pedido', async () => {
    const client = scripted([say('ok')]);
    await runAgent(base(client, 'e agora?', { history: [{ role: 'user', text: 'antes' }, { role: 'assistant', text: 'feito' }], env: { selection: { sheetId: 'agentes', address: 'B2' } } }));
    const turns = client.requests[0].turns;
    assert.equal(turns[0].parts[0].text, 'antes');
    assert.match(String(turns[turns.length - 1].parts[0].text), /"Agentes" \[ATIVA\]: 4 linha/);
    assert.match(String(turns[turns.length - 1].parts[0].text), /Seleção do usuário: B2/);
  });
});

describe('runAgent: segurança e autonomia', () => {
  it('ação destrutiva pede aprovação e, se negada, não executa', async () => {
    const client = scripted([[call('excluir_planilha', { planilha: 'Pausas' })], say('Entendido, não apaguei.')]);
    const asked: ApprovalRequest[] = [];
    const result = await runAgent(base(client, 'apague pausas', { requestApproval: async r => (asked.push(r), false) }));
    assert.equal(asked.length, 1);
    assert.equal(asked[0].risk, 'destructive');
    assert.equal(result.workspace.sheets.length, 2);
    assert.equal(result.changed, false);
    assert.match(client.requests[1].turns.at(-1)!.parts[0].functionResponse!.response.mensagem as string, /NÃO aprovou/);
  });

  it('ação destrutiva aprovada executa', async () => {
    const client = scripted([[call('excluir_planilha', { planilha: 'Pausas' })], say('Feito.')]);
    const result = await runAgent(base(client, 'apague pausas', { requestApproval: async () => true }));
    assert.equal(result.workspace.sheets.length, 1);
    assert.equal(result.changed, true);
  });

  it('sem função de aprovação, o destrutivo é recusado', async () => {
    const client = scripted([[call('excluir_planilha', { planilha: 'Pausas' })], say('ok')]);
    const result = await runAgent(base(client, 'apague'));
    assert.equal(result.workspace.sheets.length, 2);
  });

  it('modo cauteloso pede aprovação também para alterações simples', async () => {
    const client = scripted([[call('renomear_planilha', { planilha: 'Pausas', novo_nome: 'P2' })], say('ok')]);
    const asked: string[] = [];
    const result = await runAgent(base(client, 'renomeie', { mode: 'ask', requestApproval: async r => (asked.push(r.tool), true) }));
    assert.deepEqual(asked, ['renomear_planilha']);
    assert.equal(result.workspace.sheets[1].name, 'P2');
  });

  it('modo autônomo não pergunta para alterações simples', async () => {
    const client = scripted([[call('renomear_planilha', { planilha: 'Pausas', novo_nome: 'P2' })], say('ok')]);
    let asked = 0;
    await runAgent(base(client, 'renomeie', { mode: 'auto', requestApproval: async () => (asked++, true) }));
    assert.equal(asked, 0);
  });

  it('modo plano só oferece ferramentas de leitura e não executa alterações', async () => {
    const client = scripted([[call('renomear_planilha', { planilha: 'Pausas', novo_nome: 'P2' })], say('Plano: 1. renomear.')]);
    const result = await runAgent(base(client, 'renomeie', { mode: 'plan' }));
    assert.ok(client.requests[0].tools.length > 0);
    assert.ok(client.requests[0].tools.every(t => !['renomear_planilha', 'excluir_planilha', 'criar_planilha'].includes(t.name)));
    assert.equal(result.changed, false);
    assert.equal(result.workspace.sheets[1].name, 'Pausas');
    assert.ok(result.actionLog.some(l => l.startsWith('(plano)')));
  });

  it('argumentos inválidos voltam como erro para o modelo corrigir', async () => {
    const client = scripted([[call('ordenar', { planilha: 'Pausas' })], say('ok')]);
    await runAgent(base(client, 'ordene'));
    assert.match(String(client.requests[1].turns.at(-1)!.parts[0].functionResponse!.response.mensagem), /Argumentos inválidos/);
  });

  it('ferramenta inexistente é recusada com a lista das válidas', async () => {
    const client = scripted([[call('apagar_tudo')], say('ok')]);
    const result = await runAgent(base(client, 'faça'));
    assert.equal(result.changed, false);
    assert.match(String(client.requests[1].turns.at(-1)!.parts[0].functionResponse!.response.mensagem), /não existe/);
  });

  it('para depois de falhas repetidas em sequência', async () => {
    const bad = [call('ler_intervalo', { planilha: 'Nada', intervalo: 'A1' })];
    const client = scripted([bad]);
    const result = await runAgent(base(client, 'leia', { maxSteps: 20 }));
    assert.equal(result.stopped, 'error');
    assert.ok(result.steps <= 5);
  });

  it('respeita o limite de passos', async () => {
    const client = scripted([[call('listar_planilhas')]]);
    const result = await runAgent(base(client, 'loop', { maxSteps: 3 }));
    assert.equal(result.stopped, 'max_steps');
    assert.equal(result.steps, 3);
  });

  it('interrompe quando o sinal é acionado', async () => {
    const controller = new AbortController();
    const client: ModelClient = {
      async generate() {
        controller.abort();
        return { parts: [call('listar_planilhas')] };
      },
    };
    const result = await runAgent(base(client, 'x', { signal: controller.signal }));
    assert.equal(result.stopped, 'aborted');
  });

  it('erro do modelo vira resultado, não exceção', async () => {
    const client: ModelClient = {
      async generate() {
        throw new Error('rede caiu');
      },
    };
    const result = await runAgent(base(client, 'oi'));
    assert.equal(result.stopped, 'error');
    assert.match(result.text, /rede caiu/);
  });

  it('responde a todas as chamadas, mesmo acima do limite por passo', async () => {
    const many = Array.from({ length: 10 }, () => call('listar_planilhas'));
    const client = scripted([many, say('ok')]);
    await runAgent(base(client, 'muitas'));
    assert.equal(client.requests[1].turns.at(-1)!.parts.length, 10);
  });
});

describe('runAgent: privacidade', () => {
  const privacy = {
    mask: (s: string) => s.replace(/Carla/g, '[CLIENTE_1]'),
    unmask: (s: string) => s.replace(/\[CLIENTE_1\]/g, 'Carla'),
  };

  it('o modelo não vê o dado real; os argumentos e a resposta voltam desmascarados', async () => {
    // O modelo só conhece o marcador: ele pede "[CLIENTE_1]" e o laço troca por "Carla" antes de rodar a ferramenta.
    const client = scripted([[call('buscar_valores', { planilha: 'Agentes', texto: '[CLIENTE_1]' })], say('Achei [CLIENTE_1].')]);
    const result = await runAgent(base(client, 'ache Carla', { privacy }));
    const toModel = JSON.stringify(client.requests.map(r => ({ system: r.system, turns: r.turns })));
    assert.ok(!toModel.includes('Carla'), 'dado real vazou para o modelo');
    assert.match(client.requests[1].turns.at(-1)!.parts[0].functionResponse!.response.mensagem as string, /1 ocorrência[\s\S]*\[CLIENTE_1\]/);
    assert.equal(result.text, 'Achei Carla.');
  });
});

describe('runAgent: artefatos', () => {
  it('gráficos e SQL gerados aparecem no resultado', async () => {
    const client = scripted([
      [call('criar_grafico', { planilha: 'Pausas', titulo: 'T', tipo: 'bar', coluna_x: 'Agente ID', colunas_y: ['Minutos'] })],
      say('Gráfico pronto.'),
    ]);
    const result = await runAgent(base(client, 'grafico'));
    assert.equal(result.artifacts[0].kind, 'chart');
    assert.equal(result.changed, false);
  });
});
