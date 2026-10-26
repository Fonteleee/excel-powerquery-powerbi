// src/engine/xl/lib/index.ts
// Carrega todas as categorias (cada arquivo se registra em NATIVE_FUNCTIONS ao ser importado).

import './logic';
import './math';
import './stats';
import './text';
import './date';
import './refs';
import './aggregates';

export { NATIVE_FUNCTIONS } from './registry';
export type { NativeEntry, NativeFn } from './registry';
