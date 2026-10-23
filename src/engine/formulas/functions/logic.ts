// src/engine/formulas/functions/logic.ts
// Lógica, arredondamento e data (SE, SEERRO, ARRED, HOJE).

import { FunctionHandler } from './types';

const seerro: FunctionHandler = (args, ctx) => {
  if (args.length < 2) throw new Error('#VALOR!');
  try {
    const val = ctx.evaluate(args[0]);
    if (typeof val === 'string' && val.startsWith('#')) {
      return ctx.evaluate(args[1]);
    }
    if (typeof val === 'number' && isNaN(val)) {
      return ctx.evaluate(args[1]);
    }
    return val;
  } catch {
    return ctx.evaluate(args[1]);
  }
};

const se: FunctionHandler = (args, ctx) => {
  if (args.length < 2) throw new Error('#VALOR!');
  const cond = ctx.evaluate(args[0]);
  if (cond) {
    return ctx.evaluate(args[1]);
  } else {
    return args[2] ? ctx.evaluate(args[2]) : false;
  }
};

const arred: FunctionHandler = (args, ctx) => {
  const val = Number(ctx.evaluate(args[0]));
  const decimals = args[1] ? Number(ctx.evaluate(args[1])) : 0;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
};

const hoje: FunctionHandler = () => {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
};

export const LOGIC_FUNCTIONS: Record<string, FunctionHandler> = {
  'SEERRO': seerro,
  'IFERROR': seerro,
  'SE': se,
  'IF': se,
  'ARRED': arred,
  'ROUND': arred,
  'HOJE': hoje,
  'TODAY': hoje,
};
