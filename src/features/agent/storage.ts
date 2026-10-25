// src/features/agent/storage.ts
// Preferências do assistente (modo, privacidade) e criação do cliente a partir da chave guardada.

import { getStoredApiKey, getStoredModel, STATIC_CANDIDATE_MODELS } from '../../services/geminiService';
import { globalMaskingEngine } from '../../utils/dataMasking';
import { createGeminiClient } from './gemini';
import { AutonomyMode, ModelClient, PrivacyFilter } from './types';

const MODE_KEY = 'ia_modo_autonomia';
const PRIVACY_KEY = 'ia_privacidade';

export const MODE_LABELS: Record<AutonomyMode, { label: string; hint: string }> = {
  plan: { label: 'Plano', hint: 'Só analisa e propõe um plano. Não altera nada.' },
  ask: { label: 'Cauteloso', hint: 'Pede sua aprovação antes de cada alteração.' },
  auto: { label: 'Autônomo', hint: 'Executa sozinho. Só pede confirmação para apagar dados.' },
};

export function loadMode(): AutonomyMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === 'plan' || stored === 'ask' || stored === 'auto' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveMode(mode: AutonomyMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // preferência opcional
  }
}

export function loadPrivacy(): boolean {
  try {
    return localStorage.getItem(PRIVACY_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function savePrivacy(on: boolean): void {
  try {
    localStorage.setItem(PRIVACY_KEY, on ? 'on' : 'off');
  } catch {
    // preferência opcional
  }
}

/** Cliente do Gemini com a chave e o modelo salvos; `null` quando não há chave. */
export function createStoredClient(): ModelClient | null {
  const apiKey = getStoredApiKey();
  if (!apiKey) return null;
  const model = getStoredModel();
  return createGeminiClient({ apiKey, model, fallbackModels: STATIC_CANDIDATE_MODELS });
}

/** Troca CPF, e-mail, telefone e valores em moeda por marcadores antes de enviar ao modelo. */
export const maskingFilter: PrivacyFilter = {
  mask: text => globalMaskingEngine.maskText(text),
  unmask: text => globalMaskingEngine.unmaskText(text),
};
