// src/engine/formulas/functions/index.ts
// Tabela única de despacho: nome da função (maiúsculo, com todos os apelidos PT/EN) -> implementação.

import { AGGREGATE_FUNCTIONS } from './aggregate';
import { DYNAMIC_ARRAY_FUNCTIONS } from './dynamicArrays';
import { LOGIC_FUNCTIONS } from './logic';
import { LOOKUP_FUNCTIONS } from './lookup';
import { TEXT_FUNCTIONS } from './text';
import { FunctionHandler } from './types';

// Map (e não objeto literal) para que nomes como "CONSTRUCTOR" nunca resolvam para o protótipo.
const REGISTRY: ReadonlyMap<string, FunctionHandler> = new Map<string, FunctionHandler>([
  ...Object.entries(LOOKUP_FUNCTIONS),
  ...Object.entries(AGGREGATE_FUNCTIONS),
  ...Object.entries(DYNAMIC_ARRAY_FUNCTIONS),
  ...Object.entries(TEXT_FUNCTIONS),
  ...Object.entries(LOGIC_FUNCTIONS),
]);

/** Implementação da função pelo nome já em maiúsculas, ou `undefined` se não existir. */
export function findFunction(upperName: string): FunctionHandler | undefined {
  return REGISTRY.get(upperName);
}

/** Nomes de todas as funções suportadas (apelidos incluídos). */
export function supportedFunctionNames(): string[] {
  return [...REGISTRY.keys()];
}
