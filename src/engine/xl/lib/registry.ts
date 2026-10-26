// src/engine/xl/lib/registry.ts
// Tabela de funções nativas. Cada função pode ter vários nomes (português e inglês).

import { Call } from '../call';
import { Value } from '../values';

export type NativeFn = (call: Call) => Value;

export interface NativeEntry {
  fn: NativeFn;
  /** `true`: vale mesmo que o motor antigo tenha uma função de mesmo nome (corrige comportamento). */
  override: boolean | ((call: Call) => boolean);
}

export const NATIVE_FUNCTIONS = new Map<string, NativeEntry>();

/** Registra `fn` sob todos os `names`. */
export function def(names: string | string[], fn: NativeFn, override: boolean | ((call: Call) => boolean) = false): void {
  for (const name of Array.isArray(names) ? names : [names]) NATIVE_FUNCTIONS.set(name.toUpperCase(), { fn, override });
}
