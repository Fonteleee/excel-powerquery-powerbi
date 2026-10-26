// src/features/agent/tools/tools.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellPosToKey } from '../../../engine/formulaParser';
import { createEmptyGraph } from '../../relations/model/graph';
import { makeSheet, sampleSheets } from '../../relations/testing/fixtures';
import { ToolDef, ToolOutcome, Workspace } from '../types';
import { ToolError } from './common';
import { ALL_TOOLS, toolByName, validateArgs } from './registry';

const workspace = (): Workspace => ({ sheets: sampleSheets(), activeSheetId: 'agentes', graph: createEmptyGraph() });

function run(ws: Workspace, name: string, args: Record<string, unknown>): ToolOutcome {
  const tool = toolByName(name) as ToolDef;
  assert.ok(tool, `ferramenta ${name} não existe`);
  assert.deepEqual(validateArgs(tool, args), [], `argumentos de ${name} inválidos`);
  return tool.run(ws, args, {});
}

const valueAt = (ws: Workspace, sheetId: string, row: number, col: number) => ws.sheets.find(s => s.id === sheetId)!.data[cellPosToKey(row, col)]?.value;

describe('registro', () => {
  it('nomes únicos e descrições preenchidas', () => {
    const names = ALL_TOOLS.map(t => t.name);
    assert.equal(new Set(names).size, names.length);
    for (const tool of ALL_TOOLS) assert.ok(tool.description.length > 20, tool.name);
  });

  it('ferramentas que apagam são classificadas como destrutivas', () => {
    for (const name of ['excluir_planilha', 'excluir_linhas', 'excluir_colunas', 'limpar_intervalo', 'fluxo_remover_no']) {
      assert.equal(toolByName(name)!.risk, 'destructive', name);
    }
    assert.equal(toolByName('listar_planilhas')!.risk, 'read');
  });

  it('validateArgs aponta obrigatórios, tipos e enums; aceita número em texto', () => {
    const tool = toolByName('ordenar')!;
    assert.match(validateArgs(tool, {}).join(' '), /planilha/);
    assert.match(validateArgs(tool, { planilha: 'A', coluna: 'B', ordem: 'cima' }).join(' '), /ordem/);
    assert.deepEqual(validateArgs(toolByName('consultar')!, { planilha: 'A', limite: '10' }), []);
  });
});

describe('leitura', () => {
  const ws = workspace();

  it('listar_planilhas descreve cada planilha', () => {
    const r = run(ws, 'listar_planilhas', {});
    const items = r.data as { nome: string; linhas_de_dados: number; cabecalhos: string[] }[];
    assert.equal(items.length, 2);
    assert.equal(items.find(i => i.nome === 'Agentes')!.linhas_de_dados, 4);
    assert.deepEqual(items.find(i => i.nome === 'Pausas')!.cabecalhos, ['Agente ID', 'Motivo', 'Minutos']);
  });

  it('descrever_planilha traz tipos e estatísticas exatas', () => {
    const r = run(ws, 'descrever_planilha', { planilha: 'pausas' });
    const data = r.data as { colunas: { coluna: string; tipo: string; soma?: number; media?: number }[] };
    const minutos = data.colunas.find(c => c.coluna === 'Minutos')!;
    assert.equal(minutos.soma, 145);
    assert.equal(minutos.media, 36.25);
    assert.equal(minutos.tipo, 'Número');
  });

  it('ler_intervalo mostra valores e recusa intervalos enormes', () => {
    const r = run(ws, 'ler_intervalo', { planilha: 'Agentes', intervalo: 'A1:C2' });
    assert.match(r.message, /Id \| Nome \| Equipe|1 \| Id \| Nome \| Equipe/);
    assert.match(r.message, /Ana/);
    assert.equal(run(ws, 'ler_intervalo', { planilha: 'Agentes', intervalo: 'A1:Z1000' }).ok, false);
  });

  it('consultar filtra, agrupa, agrega e ordena', () => {
    const r = run(ws, 'consultar', {
      planilha: 'Pausas',
      agrupar_por: ['Agente ID'],
      agregacoes: [{ coluna: 'Minutos', agregacao: 'SUM' }],
      ordenar_por: 'SUM_Minutos',
      ordem: 'desc',
      limite: 2,
    });
    const data = r.data as { colunas: string[]; linhas: (string | number)[][] };
    assert.equal(data.linhas.length, 2);
    // "a01" e "A02" são grupos distintos (agrupar diferencia maiúsculas): 60 > 55.
    assert.deepEqual(data.linhas[0], ['a01', 60]);
    assert.deepEqual(data.linhas[1], ['A02', 55]);
  });

  it('consultar explica coluna inexistente', () => {
    assert.throws(() => toolByName('consultar')!.run(ws, { planilha: 'Pausas', filtros: [{ coluna: 'Nada', operador: '=', valor: '1' }] }, {}), ToolError);
  });

  it('verificar_chave mede correspondência e cardinalidade', () => {
    const r = run(ws, 'verificar_chave', { planilha_origem: 'Agentes', coluna_origem: 'Id', planilha_busca: 'Pausas', coluna_busca: 'Agente ID' });
    assert.equal(r.ok, true);
    const s = r.data as { matchRate: number; orphans: number; cardinality: string };
    assert.equal(s.matchRate, 50);
    assert.equal(s.orphans, 2);
    assert.equal(s.cardinality, '1:N');
  });

  it('buscar_valores acha ocorrências com endereço', () => {
    const r = run(ws, 'buscar_valores', { planilha: 'Agentes', texto: 'carla' });
    assert.match(r.message, /B4: Carla/);
  });
});

describe('escrita', () => {
  it('adicionar_coluna_formula replica a fórmula e informa os primeiros resultados', () => {
    const r = run(workspace(), 'adicionar_coluna_formula', { planilha: 'Pausas', titulo: 'Horas', formula: '=C2/60' });
    assert.equal(r.ok, true);
    assert.equal(valueAt(r.workspace!, 'pausas', 0, 3), 'Horas');
    assert.equal(valueAt(r.workspace!, 'pausas', 1, 3), 1);
    assert.equal(valueAt(r.workspace!, 'pausas', 4, 3), 0.5);
    assert.match(r.message, /D2 = 1/);
  });

  it('escrever_celulas grava texto, número e fórmula; avisa erro de fórmula', () => {
    const r = run(workspace(), 'escrever_celulas', {
      planilha: 'Pausas',
      celulas: [
        { celula: 'E1', valor: 'Total' },
        { celula: 'E2', valor: '=SOMA(C2:C5)' },
        { celula: 'F2', valor: '=INEXISTENTE(1)' },
      ],
    });
    assert.equal(valueAt(r.workspace!, 'pausas', 1, 4), 145);
    assert.match(r.message, /ATENÇÃO|erro/i);
  });

  it('escrever_bloco grava uma matriz a partir da célula inicial', () => {
    const r = run(workspace(), 'escrever_bloco', { planilha: 'Agentes', inicio: 'E1', valores: [['X', 'Y'], ['1', '2']] });
    assert.equal(valueAt(r.workspace!, 'agentes', 1, 5), 2);
  });

  it('criar_planilha cria, calcula fórmulas e torna ativa', () => {
    const r = run(workspace(), 'criar_planilha', { nome: 'Resumo', colunas: ['Item', 'Valor'], linhas: [['A', '10'], ['B', '5'], ['Total', '=SOMA(B2:B3)']] });
    const ws = r.workspace!;
    assert.equal(ws.sheets.length, 3);
    assert.equal(ws.activeSheetId, ws.sheets[2].id);
    assert.equal(valueAt(ws, ws.sheets[2].id, 3, 1), 15);
  });

  it('criar_planilha evita nome repetido', () => {
    const r = run(workspace(), 'criar_planilha', { nome: 'Agentes', colunas: ['A'], linhas: [] });
    assert.equal(r.workspace!.sheets[2].name, 'Agentes (2)');
  });

  it('ordenar reorganiza as linhas pela coluna', () => {
    const r = run(workspace(), 'ordenar', { planilha: 'Pausas', coluna: 'Minutos', ordem: 'desc' });
    assert.equal(valueAt(r.workspace!, 'pausas', 1, 2), 60);
    assert.equal(valueAt(r.workspace!, 'pausas', 4, 2), 10);
  });

  it('remover_duplicados e corrigir_dados', () => {
    const ws: Workspace = {
      ...workspace(),
      sheets: [makeSheet('s', 'Suja', ['Nome', 'Valor'], [['  Ana ', '10'], ['Bia', '20'], ['Bia', '20']])],
      activeSheetId: 's',
    };
    const trimmed = run(ws, 'corrigir_dados', { planilha: 'Suja', correcao: 'aparar_espacos' });
    assert.equal(valueAt(trimmed.workspace!, 's', 1, 0), 'Ana');
    const dedup = run(trimmed.workspace!, 'remover_duplicados', { planilha: 'Suja' });
    assert.match(dedup.message, /1 linha/);
    assert.equal(dedup.workspace!.sheets[0].data[cellPosToKey(3, 0)], undefined);
  });

  it('formatar aplica negrito, cor e formato numérico', () => {
    const r = run(workspace(), 'formatar', { planilha: 'Pausas', intervalo: 'A1:C1', negrito: true, cor_fundo: '#ffff00', formato: 'moeda' });
    const format = r.workspace!.sheets.find(s => s.id === 'pausas')!.data[cellPosToKey(0, 1)].format!;
    assert.equal(format.bold, true);
    assert.equal(format.bgColor, '#ffff00');
    assert.equal(format.type, 'currency');
    assert.throws(() => run(workspace(), 'formatar', { planilha: 'Pausas', intervalo: 'A1', cor_fundo: 'vermelho' }), ToolError);
  });

  it('criar_grafico devolve o gráfico sem alterar planilhas', () => {
    const r = run(workspace(), 'criar_grafico', { planilha: 'Pausas', titulo: 'Minutos por agente', tipo: 'bar', coluna_x: 'Agente ID', colunas_y: ['Minutos'] });
    assert.equal(r.workspace, undefined);
    const chart = r.artifacts![0];
    assert.equal(chart.kind, 'chart');
    if (chart.kind === 'chart') assert.equal(chart.config.data.find(d => d['Agente ID'] === 'A02')!.Minutos, 55);
  });
});

describe('destrutivas', () => {
  it('excluir_linhas sobe as linhas de baixo', () => {
    // Linhas 2 e 3 da planilha (Ana e Bruno) saem; Carla sobe para a linha 2.
    const r = run(workspace(), 'excluir_linhas', { planilha: 'Agentes', linhas: '2:3' });
    assert.equal(valueAt(r.workspace!, 'agentes', 1, 1), 'Carla');
    assert.equal(valueAt(r.workspace!, 'agentes', 2, 1), 'Diego');
    assert.equal(valueAt(r.workspace!, 'agentes', 3, 1) ?? '', '');
  });

  it('excluir_colunas desloca as colunas à direita', () => {
    const r = run(workspace(), 'excluir_colunas', { planilha: 'Agentes', colunas: ['Nome'] });
    assert.equal(valueAt(r.workspace!, 'agentes', 0, 1), 'Equipe');
  });

  it('limpar_intervalo esvazia só o intervalo', () => {
    const r = run(workspace(), 'limpar_intervalo', { planilha: 'Agentes', intervalo: 'B2:B3' });
    assert.equal(valueAt(r.workspace!, 'agentes', 1, 1) ?? '', '');
    assert.equal(valueAt(r.workspace!, 'agentes', 3, 1), 'Carla');
  });

  it('excluir_planilha protege a última planilha e limpa o grafo', () => {
    const ws = workspace();
    const r = run(ws, 'excluir_planilha', { planilha: 'Pausas' });
    assert.equal(r.workspace!.sheets.length, 1);
    assert.throws(() => toolByName('excluir_planilha')!.run(r.workspace!, { planilha: 'Agentes' }, {}), ToolError);
  });
});

describe('fluxo', () => {
  it('fluxo_adicionar_busca cria nós, mede a chave e gera a aba de saída', () => {
    const r = run(workspace(), 'fluxo_adicionar_busca', {
      planilha_origem: 'Agentes',
      chave_origem: 'Id',
      planilha_busca: 'Pausas',
      chave_busca: 'Agente ID',
      colunas_retorno: ['Motivo', 'Minutos'],
      se_nao_encontrado: '-',
      nome_saida: 'Agentes + Pausas',
    });
    assert.equal(r.ok, true, r.message);
    const ws = r.workspace!;
    assert.equal(ws.graph.nodes.filter(n => n.kind === 'table').length, 2);
    assert.equal(ws.graph.nodes.filter(n => n.kind === 'transform').length, 1);
    assert.match(r.message, /50\.0% de correspondência/);
    const out = ws.sheets.find(s => s.name === 'Agentes + Pausas')!;
    assert.ok(out);
    assert.equal(out.data[cellPosToKey(1, 4)]?.value, 60);
    assert.equal(out.data[cellPosToKey(3, 3)]?.value, '-');
  });

  it('fluxo_adicionar_busca com coluna inexistente falha sem alterar o grafo', () => {
    assert.throws(
      () => toolByName('fluxo_adicionar_busca')!.run(workspace(), { planilha_origem: 'Agentes', chave_origem: 'Id', planilha_busca: 'Pausas', chave_busca: 'Agente ID', colunas_retorno: ['Nada'], nome_saida: 'X' }, {}),
      ToolError
    );
  });

  it('fluxo_adicionar_agregacao e fluxo_adicionar_filtro geram abas', () => {
    const agg = run(workspace(), 'fluxo_adicionar_agregacao', {
      planilha: 'Pausas',
      agrupar_por: ['Agente ID'],
      agregacoes: [{ coluna: 'Minutos', agregacao: 'SUM', nome: 'Total' }],
      nome_saida: 'Totais',
    });
    const totals = agg.workspace!.sheets.find(s => s.name === 'Totais')!;
    assert.equal(totals.data[cellPosToKey(0, 1)]?.value, 'Total');

    const filtro = run(agg.workspace!, 'fluxo_adicionar_filtro', {
      planilha: 'Pausas',
      condicoes: [{ coluna: 'Minutos', operador: '>', valor: '20' }],
      nome_saida: 'Pausas longas',
    });
    const longas = filtro.workspace!.sheets.find(s => s.name === 'Pausas longas')!;
    assert.equal(longas.data[cellPosToKey(3, 2)]?.value, 30);
    // Pausas (1 nó de tabela, reaproveitado) + agregação + saída + filtro + saída = 5 nós.
    assert.equal(filtro.workspace!.graph.nodes.length, 5);
  });

  it('fluxo_ver, fluxo_executar e fluxo_exportar_sql', () => {
    const built = run(workspace(), 'fluxo_adicionar_busca', {
      planilha_origem: 'Agentes', chave_origem: 'Id', planilha_busca: 'Pausas', chave_busca: 'Agente ID', colunas_retorno: ['Minutos'], nome_saida: 'Saida', executar: false,
    });
    assert.equal(built.workspace!.sheets.length, 2, 'executar:false não gera aba');
    const seen = run(built.workspace!, 'fluxo_ver', {});
    assert.match(JSON.stringify(seen.data), /1:N|correspondência/);
    const exec = run(built.workspace!, 'fluxo_executar', {});
    assert.equal(exec.workspace!.sheets.length, 3);
    const sql = run(built.workspace!, 'fluxo_exportar_sql', { dialeto: 'postgres' });
    assert.equal(sql.artifacts![0].kind, 'sql');
    assert.match(JSON.stringify(sql.artifacts![0]), /LEFT JOIN/);
  });

  it('fluxo_remover_no remove o nó e as ligações', () => {
    const built = run(workspace(), 'fluxo_adicionar_filtro', { planilha: 'Pausas', condicoes: [{ coluna: 'Minutos', operador: '>', valor: '1' }], nome_saida: 'F' });
    const trf = built.workspace!.graph.nodes.find(n => n.kind === 'transform')!;
    const r = run(built.workspace!, 'fluxo_remover_no', { id: trf.id });
    assert.equal(r.workspace!.graph.edges.length, 0);
  });
});

describe('gráfico na planilha', () => {
  it('inserir_grafico coloca o gráfico dentro da planilha e ele lê os dados', () => {
    const r = run(workspace(), 'inserir_grafico', { planilha: 'Pausas', tipo: 'bar', titulo: 'Minutos por agente' });
    const sheet = r.workspace!.sheets.find(s => s.id === 'pausas')!;
    assert.equal(sheet.charts?.length, 1);
    assert.equal(sheet.charts![0].range, 'A1:C5');
    assert.equal(sheet.charts![0].title, 'Minutos por agente');
    assert.equal(r.ok, true);
  });

  it('avisa quando os dados não servem para gráfico', () => {
    const r = run(workspace(), 'inserir_grafico', { planilha: 'Agentes', intervalo: 'A1:B3' });
    assert.equal(r.ok, false);
    assert.match(r.message, /números/);
  });
});
