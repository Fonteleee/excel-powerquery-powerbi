// src/features/agent/tools/registry.ts
// Registro das ferramentas e validação dos argumentos contra o esquema declarado.

import { ToolDeclaration, ToolDef, ToolParamSchema } from '../types';
import { destructiveTools } from './destructive';
import { flowTools } from './flow';
import { readTools } from './read';
import { writeTools } from './write';

export const ALL_TOOLS: readonly ToolDef[] = [...readTools, ...writeTools, ...flowTools, ...destructiveTools];

export function toolByName(name: string, tools: readonly ToolDef[] = ALL_TOOLS): ToolDef | undefined {
  return tools.find(t => t.name === name);
}

export function toDeclarations(tools: readonly ToolDef[] = ALL_TOOLS): ToolDeclaration[] {
  return tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
}

function typeOf(value: unknown): string {
  return Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
}

function check(schema: ToolParamSchema, value: unknown, path: string, errors: string[]): void {
  if (value === undefined || value === null) return;
  const t = typeOf(value);
  const expected = schema.type;
  const numeric = expected === 'number' || expected === 'integer';
  // O modelo às vezes manda números como texto ("12"); a ferramenta converte, então aceitamos aqui.
  if (numeric && t === 'string' && value !== '' && Number.isFinite(Number(String(value).replace(',', '.')))) return;
  if (expected === 'string' && (t === 'number' || t === 'boolean')) return; // coerção para texto é segura
  if (numeric ? t !== 'number' : t !== expected) {
    errors.push(`"${path}" deve ser ${expected}, recebi ${t}.`);
    return;
  }
  if (schema.enum && typeof value === 'string' && !schema.enum.includes(value)) {
    errors.push(`"${path}" deve ser um de: ${schema.enum.join(', ')}.`);
  }
  if (expected === 'array' && schema.items && Array.isArray(value)) {
    value.forEach((item, i) => check(schema.items!, item, `${path}[${i}]`, errors));
  }
  if (expected === 'object' && schema.properties && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (obj[key] === undefined || obj[key] === null) errors.push(`Falta "${path}.${key}".`);
    }
    for (const [key, sub] of Object.entries(schema.properties)) check(sub, obj[key], `${path}.${key}`, errors);
  }
}

/** Erros de argumentos (vazio = válido). Campos extras são ignorados. */
export function validateArgs(tool: ToolDef, args: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const key of tool.parameters.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === '') errors.push(`Falta o argumento obrigatório "${key}".`);
  }
  for (const [key, sub] of Object.entries(tool.parameters.properties)) check(sub, args[key], key, errors);
  return errors;
}
