// src/engine/formulas/functions/text.ts
// Texto (UNIRTEXTO, CONCATENAR, MAIÚSCULA, MINÚSCULA, PRI.MAIÚSCULA).

import { FunctionHandler } from './types';

const unirtexto: FunctionHandler = (args, ctx) => {
  if (args.length < 3) throw new Error('#VALOR!');
  const delimiter = String(ctx.evaluate(args[0]));
  const ignoreEmpty = Boolean(ctx.evaluate(args[1]));

  const textItems: string[] = [];
  for (let i = 2; i < args.length; i++) {
    const resolved = ctx.resolve(args[i]);
    if (resolved) {
      const flat = resolved.flatValues;
      for (const f of flat) {
        if (f === null || f === undefined || f === '') {
          if (!ignoreEmpty) textItems.push('');
        } else {
          textItems.push(String(f));
        }
      }
    } else {
      const val = ctx.evaluate(args[i]);
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item === null || item === undefined || item === '') {
            if (!ignoreEmpty) textItems.push('');
          } else {
            textItems.push(String(item));
          }
        }
      } else if (val === null || val === undefined || val === '') {
        if (!ignoreEmpty) textItems.push('');
      } else {
        textItems.push(String(val));
      }
    }
  }
  return textItems.join(delimiter);
};

const concatenar: FunctionHandler = (args, ctx) => {
  const texts: string[] = [];
  for (const arg of args) {
    const resolved = ctx.resolve(arg);
    if (resolved) {
      resolved.flatValues.forEach(v => {
        if (v !== null && v !== undefined) texts.push(String(v));
      });
    } else {
      const v = ctx.evaluate(arg);
      if (v !== null && v !== undefined) texts.push(String(v));
    }
  }
  return texts.join('');
};

const maiuscula: FunctionHandler = (args, ctx) => {
  const val = ctx.evaluate(args[0] || '');
  return String(val ?? '').toUpperCase();
};

const minuscula: FunctionHandler = (args, ctx) => {
  const val = ctx.evaluate(args[0] || '');
  return String(val ?? '').toLowerCase();
};

const priMaiuscula: FunctionHandler = (args, ctx) => {
  const val = String(ctx.evaluate(args[0] || '') ?? '');
  // Como no Excel: tudo minúsculo e a primeira letra de cada palavra maiúscula (aceita acentos).
  return val.toLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_m, sep: string, letter: string) => sep + letter.toUpperCase());
};

export const TEXT_FUNCTIONS: Record<string, FunctionHandler> = {
  'UNIRTEXTO': unirtexto,
  'TEXTJOIN': unirtexto,
  'CONCATENAR': concatenar,
  'CONCAT': concatenar,
  'MAIÚSCULA': maiuscula,
  'MAIUSCULA': maiuscula,
  'UPPER': maiuscula,
  'MINÚSCULA': minuscula,
  'MINUSCULA': minuscula,
  'LOWER': minuscula,
  'PRI.MAIÚSCULA': priMaiuscula,
  'PRI.MAIUSCULA': priMaiuscula,
  'PROPER': priMaiuscula,
};
