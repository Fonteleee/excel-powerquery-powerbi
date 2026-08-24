import { Sheet } from '../types/spreadsheet';
import { globalMaskingEngine } from '../utils/dataMasking';
import { CopilotChartConfig } from '../components/Copilot/CopilotChartCard';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  suggestedFormula?: string;
  suggestedMCode?: string;
  suggestedChart?: CopilotChartConfig;
  maskedItemsCount?: number;
}

const STORAGE_KEY = 'gemini_api_key';
const MODEL_KEY = 'gemini_model_choice';

export const STATIC_CANDIDATE_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
  'gemini-pro',
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
    return 'gemini-1.5-flash';
  }
  return stored;
}

export function saveStoredModel(model: string): void {
  localStorage.setItem(MODEL_KEY, model);
}

/**
 * Dynamically queries Google ModelService.ListModels to discover all valid models for this API key
 */
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
  const modelsToTry = preferredModel && validModels.includes(preferredModel)
    ? [preferredModel, ...validModels.filter(m => m !== preferredModel)]
    : validModels;

  let lastError = '';

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: 'Responda apenas OK.' }],
            },
          ],
        }),
      });

      if (response.ok) {
        saveStoredModel(model);
        return {
          success: true,
          message: `Conexão estabelecida com sucesso usando o modelo oficial ${model}!`,
          activeModel: model,
        };
      }

      const errData = await response.json().catch(() => ({}));
      lastError = errData?.error?.message || `Erro ${response.status}: ${response.statusText}`;
    } catch (err: any) {
      lastError = err?.message || 'Falha de conexão.';
    }
  }

  return { success: false, message: lastError || 'Nenhum modelo Gemini respondeu com sucesso.' };
}

export async function askGeminiCopilot(
  userPrompt: string,
  sheet?: Sheet,
  conversationHistory: CopilotMessage[] = []
): Promise<{ text: string; suggestedFormula?: string; suggestedMCode?: string; suggestedChart?: CopilotChartConfig; maskedCount: number }> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Clique no ícone de chave no Copilot para configurar.');
  }

  const validModels = await fetchValidGeminiModels(apiKey);
  const preferredModel = getStoredModel();
  const modelsToTry = validModels.includes(preferredModel)
    ? [preferredModel, ...validModels.filter(m => m !== preferredModel)]
    : validModels;

  // 1. DATA MASKING: Sanitize all sensitive text locally before transmitting
  const maskedPayload = globalMaskingEngine.sanitizePayload(userPrompt, sheet);

  const systemInstruction = `Você é o Microsoft Excel & Power BI Copilot Enterprise.
Seu objetivo é ajudar o usuário com Fórmulas do Excel, Gráficos Interativos Avançados, Power Query (Linguagem M) e Power BI.

DIRETRIZES FUNDAMENTAIS:
1. GERAÇÃO DE GRÁFICOS & ANÁLISE VISUAL:
   - VOCÊ PODE E DEVE GERAR GRÁFICOS DIRETAMENTE!
   - NUNCA diga que não pode criar gráficos ou que é um modelo de texto limitado.
   - NUNCA inclua pensamentos internos ou auto-correções como "*(Auto-correção durante o rascunho)*".
   - Quando o usuário pedir um gráfico ou análise visual, calcule os dados agregados da tabela e GERE OBRIGATORIAMENTE um bloco de código com a tag "chart" contendo um JSON válido no formato:
\`\`\`chart
{
  "title": "Desempenho de Vendas por Vendedor",
  "description": "Total Líquido vs Comissão gerada",
  "type": "composed", // opções: "bar", "line", "area", "pie", "composed"
  "xAxisKey": "vendedor",
  "data": [
    { "vendedor": "[VENDEDOR_1]", "total": 32300, "comissao": 1615 },
    { "vendedor": "[VENDEDOR_2]", "total": 28400, "comissao": 1420 }
  ],
  "series": [
    { "key": "total", "name": "Total Líquido (R$)", "color": "#107c41", "type": "bar" },
    { "key": "comissao", "name": "Comissão (R$)", "color": "#f59e0b", "type": "line" }
  ]
}
\`\`\`

2. GERAÇÃO DE FÓRMULAS:
   - Ao sugerir uma fórmula, forneça o código em bloco com tag "excel", começando com "=" (ex: \`\`\`excel
=SOMA(C2:C10)
\`\`\`).
   - Use nomes de fórmulas em Português (SOMA, MÉDIA, PROCX, ÍNDICE, CORRESP, SE, SOMARPRODUTO, UNIRTEXTO).

3. GERAÇÃO POWER QUERY:
   - Use bloco com tag "powerquery" para código M.

4. TOKENS DE PRIVACIDADE:
   - Mantenha os tokens [VENDEDOR_X], [VALOR_X] nos JSONs e fórmulas, pois nosso sistema local restaura os dados reais automaticamente.`;

  const contents: any[] = [];

  // Add sheet context if available
  if (maskedPayload.sanitizedContext) {
    contents.push({
      role: 'user',
      parts: [{ text: `[CONTEXTO DA PLANILHA ATIVA]\n${maskedPayload.sanitizedContext}` }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'Entendido. Tenho o contexto da planilha e estou pronto para gerar fórmulas, gráficos interativos, Power Query e análises com dados protegidos.' }],
    });
  }

  // Add conversation history
  for (const msg of conversationHistory.slice(-4)) {
    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: globalMaskingEngine.maskText(msg.content) }],
      });
    } else if (msg.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: msg.content }],
      });
    }
  }

  // Add current sanitized prompt
  contents.push({
    role: 'user',
    parts: [{ text: maskedPayload.sanitizedPrompt }],
  });

  let rawResponseText = '';
  let successfulModel = preferredModel;
  let lastError = '';

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2500,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        rawResponseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (rawResponseText) {
          successfulModel = model;
          saveStoredModel(model);
          break;
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        lastError = errData?.error?.message || `Erro ${response.status}: ${response.statusText}`;
      }
    } catch (err: any) {
      lastError = err?.message || 'Falha na requisição.';
    }
  }

  if (!rawResponseText) {
    throw new Error(lastError || 'Não foi possível obter resposta dos modelos Gemini disponíveis.');
  }

  // 2. UNMASKING: Restore real values from tokens locally
  let unmaskedText = globalMaskingEngine.unmaskText(rawResponseText);

  // Clean any internal monologue tags if present
  unmaskedText = unmaskedText.replace(/\*\(Auto-correção[^\)]*\)\*:\s*/gi, '');

  // 3. Extract Chart JSON if present
  let suggestedChart: CopilotChartConfig | undefined = undefined;
  const chartMatch = unmaskedText.match(/```chart\s*\n?([\s\S]+?)\n?```/i);
  if (chartMatch) {
    try {
      const chartJsonText = chartMatch[1].trim();
      const parsed = JSON.parse(chartJsonText);
      if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
        // Unmask inside chart data items
        const sanitizedData = parsed.data.map((item: any) => {
          const newItem: any = {};
          for (const key in item) {
            if (typeof item[key] === 'string') {
              newItem[key] = globalMaskingEngine.unmaskText(item[key]);
            } else {
              newItem[key] = item[key];
            }
          }
          return newItem;
        });

        suggestedChart = {
          title: globalMaskingEngine.unmaskText(parsed.title || 'Gráfico Interativo'),
          description: parsed.description ? globalMaskingEngine.unmaskText(parsed.description) : undefined,
          type: parsed.type || 'bar',
          xAxisKey: parsed.xAxisKey || Object.keys(sanitizedData[0])[0],
          yAxisLabel: parsed.yAxisLabel,
          data: sanitizedData,
          series: Array.isArray(parsed.series) ? parsed.series : [],
        };
      }
    } catch (e) {
      console.warn('Could not parse chart JSON from Copilot response', e);
    }
  }

  // 4. Extract formula if present
  let suggestedFormula: string | undefined = undefined;
  const formulaMatch = unmaskedText.match(/```(?:excel|formula|)\s*\n?(=[^\n`]+)\n?```/i) ||
                       unmaskedText.match(/`(=[A-ZÀ-Ú_0-9\(\);,"'\s*+\-\/:]+)`/i);
  if (formulaMatch) {
    suggestedFormula = formulaMatch[1].trim();
  }

  // 5. Extract Power Query M code if present
  let suggestedMCode: string | undefined = undefined;
  const mMatch = unmaskedText.match(/```(?:powerquery|m|pq)\s*\n?([\s\S]+?)\n?```/i);
  if (mMatch) {
    suggestedMCode = mMatch[1].trim();
  }

  return {
    text: unmaskedText,
    suggestedFormula,
    suggestedMCode,
    suggestedChart,
    maskedCount: maskedPayload.tokenCount,
  };
}
