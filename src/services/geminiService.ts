import { Sheet } from '../types/spreadsheet';
import { globalMaskingEngine } from '../utils/dataMasking';
import { CopilotChartConfig } from '../components/Copilot/CopilotChartCard';
import { AgentAction } from '../engine/agentActionProtocol';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  suggestedFormula?: string;
  suggestedMCode?: string;
  suggestedChart?: CopilotChartConfig;
  suggestedSql?: string;
  actions?: AgentAction[];
  maskedItemsCount?: number;
}

const STORAGE_KEY = 'gemini_api_key';
const MODEL_KEY = 'gemini_model_choice';

export const STATIC_CANDIDATE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3-flash-preview',
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

export function getStoredApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function saveStoredApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function getStoredModel(): string {
  const stored = localStorage.getItem(MODEL_KEY);
  if (!stored || stored.includes('2.0') || stored.includes('2.5')) {
    return 'gemini-3.6-flash';
  }
  return stored;
}

export function saveStoredModel(model: string): void {
  localStorage.setItem(MODEL_KEY, model);
}

export async function fetchValidGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const models = (data.models || [])
        .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => m.name.replace(/^models\//, ''));
      if (models.length > 0) {
        return models;
      }
    }
  } catch (e) {
    console.warn('Could not list models dynamically, using static fallback list', e);
  }
  return STATIC_CANDIDATE_MODELS;
}

export async function testGeminiConnection(apiKey: string, preferredModel?: string): Promise<{ success: boolean; message: string; activeModel?: string }> {
  if (!apiKey || apiKey.trim().length < 10) {
    return { success: false, message: 'Chave de API inválida ou vazia.' };
  }

  const validModels = await fetchValidGeminiModels(apiKey);
  const candidateList = preferredModel && validModels.includes(preferredModel)
    ? [preferredModel, ...validModels.filter(m => m !== preferredModel)]
    : ['gemini-3.6-flash', 'gemini-3-flash-preview', ...validModels];

  let lastError = '';

  for (const model of candidateList) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Responda apenas OK em português.' }] }],
        }),
      });

      if (response.ok) {
        saveStoredModel(model);
        return {
          success: true,
          message: `Conexão estabelecida com sucesso usando o modelo: ${model}`,
          activeModel: model,
        };
      } else {
        const errJson = await response.json().catch(() => null);
        lastError = errJson?.error?.message || `HTTP ${response.status}`;
      }
    } catch (e: any) {
      lastError = e?.message || 'Falha de rede ou CORS.';
    }
  }

  return {
    success: false,
    message: `Falha ao conectar com a API do Gemini. Último erro: ${lastError}`,
  };
}

export interface CopilotResult {
  text: string;
  suggestedFormula?: string;
  suggestedMCode?: string;
  suggestedChart?: CopilotChartConfig;
  suggestedSql?: string;
  actions?: AgentAction[];
  maskedCount: number;
  modelUsed: string;
}

function extractMarkdownTableAsSheet(text: string): AgentAction | null {
  const tableMatch = text.match(/(\|.+?\|\n\|[-:| ]+\|\n(?:\|.+?\|\n?)+)/);
  if (!tableMatch) return null;
  const lines = tableMatch[1].trim().split('\n').filter(l => l.includes('|'));
  if (lines.length < 3) return null;

  const headers = lines[0]
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);

  const rows: (string | number)[][] = [];

  for (let i = 2; i < lines.length; i++) {
    const rawCells = lines[i].split('|').map(s => s.trim());
    const cells = rawCells.slice(1, rawCells.length - 1);
    if (cells.length > 0) {
      const rowVals = cells.map(c => {
        if (c.startsWith('=')) return c;
        const clean = c.replace(/R\$\s?|\$\s?|\s/g, '').replace(/\./g, '').replace(',', '.');
        const num = Number(clean);
        return !isNaN(num) && clean !== '' ? num : c;
      });
      rows.push(rowVals);
    }
  }

  if (headers.length > 0 && rows.length > 0) {
    return {
      type: 'create_sheet_from_scratch',
      sheetName: 'Planilha Gerada',
      columns: headers,
      rows,
    };
  }
  return null;
}

export async function askGeminiCopilot(
  userPrompt: string,
  sheet: Sheet,
  _history: CopilotMessage[] = []
): Promise<CopilotResult> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada.');
  }

  const preferredModel = getStoredModel();
  const validModels = await fetchValidGeminiModels(apiKey);
  const modelsToTry = [
    preferredModel,
    'gemini-3.6-flash',
    'gemini-3-flash-preview',
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    ...validModels.filter(m => m !== preferredModel),
  ];

  // 1. Anonimizar o Prompt e Contexto com DataMaskingEngine
  const maskedData = globalMaskingEngine.sanitizePayload(userPrompt, sheet);

  const systemInstructions = `
[INSTRUÇÃO CRÍTICA DE IDIOMA]
Você DEVE falar, pensar, raciocinar e responder EXCLUSIVAMENTE em Português do Brasil (pt-BR).
NUNCA use inglês. Qualquer explicação, nome de coluna, nome de aba ou comentário deve ser em Português.

Você é o AUTONOMOUS EXCEL AI AGENT integrado diretamente ao Excel com DuckDB-Wasm.

═══ REGRAS FUNDAMENTAIS ═══
1. SEMPRE responda em Português do Brasil. Nunca em inglês.
2. Seja DIRETO e CONCISO. Máximo 3 parágrafos de texto.
3. Para qualquer ação na planilha (criar, editar, calcular, formatar), inclua o bloco JSON.
4. Ao inserir fórmulas, SEMPRE use sintaxe Portuguesa: SOMA, MÉDIA, PROCX, SE, SEERRO.
5. NUNCA inclua o operador "=" fora de fórmulas de célula.
6. Ao criar gráficos, inclua os dados no próprio bloco JSON.

ESTRUTURA DA PLANILHA ATUAL (ANONIMIZADA):
${maskedData.sanitizedContext}

═══ FORMATO DE AÇÕES DISPONÍVEIS ═══

Para INSERIR FÓRMULAS em células específicas:
\`\`\`json
{
  "actions": [
    {
      "type": "set_cells",
      "cells": [
        { "row": 13, "col": 9, "raw": "=SOMA(J2:J13)" },
        { "row": 14, "col": 9, "raw": "=MÉDIA(J2:J13)" }
      ]
    }
  ]
}
\`\`\`

Para CRIAR UMA NOVA PLANILHA do zero:
\`\`\`json
{
  "actions": [
    {
      "type": "create_sheet_from_scratch",
      "sheetName": "DRE_2026",
      "columns": ["Descrição", "Jan", "Fev", "Mar", "Total"],
      "rows": [
        ["Receita Bruta", 50000, 52000, 55000, "=SOMA(B2:D2)"],
        ["Deduções", 5000, 5200, 5500, "=SOMA(B3:D3)"],
        ["Receita Líquida", "=B2-B3", "=C2-C3", "=D2-D3", "=SOMA(B4:D4)"]
      ]
    }
  ]
}
\`\`\`

Para GERAR UM GRÁFICO com os dados da planilha:
\`\`\`json
{
  "actions": [
    {
      "type": "create_chart",
      "config": {
        "title": "Vendas por Vendedor",
        "type": "bar",
        "xAxisKey": "Vendedor",
        "series": [{ "key": "Total", "name": "Total Líquido", "color": "#107c41" }],
        "data": [
          { "Vendedor": "Carlos Eduardo", "Total": 32300 },
          { "Vendedor": "Mariana Souza", "Total": 46620 }
        ]
      }
    }
  ]
}
\`\`\`

Para FORMATAR um intervalo:
\`\`\`json
{
  "actions": [
    {
      "type": "format_range",
      "range": { "startRow": 1, "startCol": 9, "endRow": 13, "endCol": 9 },
      "format": { "numberFormat": "currency", "bold": false }
    }
  ]
}
\`\`\`

ATENÇÃO: Rows e Cols são baseados em índice 0. Linha 1 = row:0, Coluna A = col:0.
`.trim();

  let rawResponseText = '';
  let modelUsed = preferredModel;
  let lastError = '';

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${systemInstructions}\n\n[ATENÇÃO: RESPONDA 100% EM PORTUGUÊS DO BRASIL]\nPERGUNTA DO USUÁRIO:\n${maskedData.sanitizedPrompt}` }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        
        // Extrair texto real (descartando thoughts de modelos de raciocínio se marcados)
        const nonThoughtParts = parts.filter((p: any) => !p.thought);
        if (nonThoughtParts.length > 0) {
          rawResponseText = nonThoughtParts.map((p: any) => p.text || '').join('\n');
        } else {
          rawResponseText = parts.map((p: any) => p.text || '').join('\n');
        }

        if (rawResponseText.trim()) {
          modelUsed = model;
          saveStoredModel(model);
          break;
        }
      } else {
        const errData = await response.json().catch(() => null);
        lastError = errData?.error?.message || `HTTP ${response.status}`;
      }
    } catch (e: any) {
      lastError = e?.message || 'Falha de conexão.';
    }
  }

  if (!rawResponseText) {
    throw new Error(`Não foi possível obter resposta do Gemini. Último erro: ${lastError}`);
  }

  // 2. Fazer Unmasking das entidades anonimizadas de volta para os dados reais
  const unmaskedText = globalMaskingEngine.unmaskText(rawResponseText);

  // 3. Extrair Fórmulas, Código M, SQL e Ações JSON
  let suggestedFormula: string | undefined;
  let suggestedMCode: string | undefined;
  let suggestedChart: CopilotChartConfig | undefined;
  let suggestedSql: string | undefined;
  let actions: AgentAction[] | undefined;

  // Extrair Bloco de Ações JSON
  const jsonMatch = unmaskedText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.actions)) {
        actions = parsed.actions;
        
        const chartAction = actions?.find(a => a.type === 'create_chart') as any;
        if (chartAction && chartAction.config) {
          suggestedChart = chartAction.config;
        }

        const sqlAction = actions?.find(a => a.type === 'run_duckdb_sql') as any;
        if (sqlAction && sqlAction.query) {
          suggestedSql = sqlAction.query;
        }
      }
    } catch (e) {
      console.warn('Erro ao parsear ações JSON do Copilot:', e);
    }
  }

  // Fallback 1: Se não veio JSON de ações, mas veio uma tabela Markdown
  if (!actions || actions.length === 0) {
    const tableAction = extractMarkdownTableAsSheet(unmaskedText);
    if (tableAction) {
      actions = [tableAction];
    }
  }

  // Extrair SQL se fornecido em bloco ```sql
  const sqlBlockMatch = unmaskedText.match(/```sql\s*([\s\S]*?)\s*```/);
  if (sqlBlockMatch && !suggestedSql) {
    suggestedSql = sqlBlockMatch[1].trim();
    if (!actions) actions = [];
    if (!actions.some(a => a.type === 'run_duckdb_sql')) {
      actions.push({ type: 'run_duckdb_sql', query: suggestedSql });
    }
  }

  // Extrair Fórmula se fornecido em bloco ```excel ou ```formula
  const formulaMatch = unmaskedText.match(/```(?:excel|formula)\s*(=[\s\S]*?)\s*```/);
  if (formulaMatch) {
    suggestedFormula = formulaMatch[1].trim();
  }

  // Extrair Código M
  const mCodeMatch = unmaskedText.match(/```(?:powerquery|m)\s*([\s\S]*?)\s*```/);
  if (mCodeMatch) {
    suggestedMCode = mCodeMatch[1].trim();
  }

  // Limpar texto removendo o bloco de ações JSON bruto para visualização limpa
  const cleanDisplayText = unmaskedText.replace(/```json\s*\{[\s\S]*?\}\s*```/g, '').trim();

  return {
    text: cleanDisplayText,
    suggestedFormula,
    suggestedMCode,
    suggestedChart,
    suggestedSql,
    actions,
    maskedCount: maskedData.tokenCount,
    modelUsed,
  };
}
