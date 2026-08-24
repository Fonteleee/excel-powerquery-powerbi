import { Sheet } from '../types/spreadsheet';
import { globalMaskingEngine } from '../utils/dataMasking';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  suggestedFormula?: string;
  suggestedMCode?: string;
  maskedItemsCount?: number;
}

const STORAGE_KEY = 'gemini_api_key';
const MODEL_KEY = 'gemini_model_choice';

export function getStoredApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function saveStoredApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function getStoredModel(): string {
  return localStorage.getItem(MODEL_KEY) || 'gemini-2.0-flash';
}

export function saveStoredModel(model: string): void {
  localStorage.setItem(MODEL_KEY, model);
}

export async function testGeminiConnection(apiKey: string, model = 'gemini-2.0-flash'): Promise<{ success: boolean; message: string }> {
  if (!apiKey || apiKey.trim().length < 10) {
    return { success: false, message: 'Chave de API inválida ou vazia.' };
  }

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
            parts: [{ text: 'Responda apenas com a palavra OK.' }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData?.error?.message || `Erro HTTP ${response.status}: ${response.statusText}`;
      return { success: false, message: msg };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (text) {
      return { success: true, message: 'Conexão com Google Gemini Pro estabelecida com sucesso!' };
    }
    return { success: false, message: 'Nenhuma resposta retornada pelo modelo.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Falha de rede ao conectar com a API do Google Gemini.' };
  }
}

export async function askGeminiCopilot(
  userPrompt: string,
  sheet?: Sheet,
  conversationHistory: CopilotMessage[] = []
): Promise<{ text: string; suggestedFormula?: string; suggestedMCode?: string; maskedCount: number }> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não configurada. Clique no ícone de chave no Copilot para configurar.');
  }

  const model = getStoredModel();

  // 1. DATA MASKING: Sanitize all sensitive text locally before transmitting
  const maskedPayload = globalMaskingEngine.sanitizePayload(userPrompt, sheet);

  const systemInstruction = `Você é o Microsoft Excel & Power BI Copilot Enterprise.
Seu objetivo é ajudar o usuário com Fórmulas do Excel, Power Query (Linguagem M), Análise de Dados e Power BI.

DIRETRIZES FUNDAMENTAIS:
1. Ao sugerir uma fórmula do Excel, SEMPRE forneça o código exato em um bloco de código com language "excel" ou "formula", começando com "=" (ex: \`\`\`excel
=SOMA(C2:C10)
\`\`\`).
2. Utilize os nomes de fórmulas em Português do Brasil (SOMA, MÉDIA, PROCX, ÍNDICE, CORRESP, SE, SOMARPRODUTO, UNIRTEXTO, CONT.SE).
3. Ao sugerir código Power Query, coloque no bloco \`\`\`powerquery ... \`\`\`.
4. Os dados do usuário contêm tokens anonimizados (como [VENDEDOR_1], [VALOR_1], etc). Mantenha e use esses mesmos tokens nas fórmulas e explicações, pois o sistema local do usuário irá restaurar os dados originais automaticamente.
5. Seja direto, didático, preciso e profissional.`;

  const contents: any[] = [];

  // Add sheet context if available
  if (maskedPayload.sanitizedContext) {
    contents.push({
      role: 'user',
      parts: [{ text: `[CONTEXTO DA PLANILHA ATIVA]\n${maskedPayload.sanitizedContext}` }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'Entendido. Tenho o contexto da estrutura da planilha e estou pronto para auxiliar com fórmulas, Power Query e análises mantendo os dados protegidos.' }],
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
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const msg = errData?.error?.message || `Erro ${response.status}: ${response.statusText}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const rawResponseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Desculpe, não consegui processar a resposta.';

  // 2. UNMASKING: Restore real values from tokens locally
  const unmaskedText = globalMaskingEngine.unmaskText(rawResponseText);

  // 3. Extract formula if present
  let suggestedFormula: string | undefined = undefined;
  const formulaMatch = unmaskedText.match(/```(?:excel|formula|)\s*\n?(=[^\n`]+)\n?```/i) ||
                       unmaskedText.match(/`(=[A-ZÀ-Ú_0-9\(\);,"'\s*+\-\/:]+)`/i);
  if (formulaMatch) {
    suggestedFormula = formulaMatch[1].trim();
  }

  // 4. Extract Power Query M code if present
  let suggestedMCode: string | undefined = undefined;
  const mMatch = unmaskedText.match(/```(?:powerquery|m|pq)\s*\n?([\s\S]+?)\n?```/i);
  if (mMatch) {
    suggestedMCode = mMatch[1].trim();
  }

  return {
    text: unmaskedText,
    suggestedFormula,
    suggestedMCode,
    maskedCount: maskedPayload.tokenCount,
  };
}
