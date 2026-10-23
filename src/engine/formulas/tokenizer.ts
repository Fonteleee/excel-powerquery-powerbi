// src/engine/formulas/tokenizer.ts
// Divisão de argumentos e operadores de nível superior (respeitando parênteses e aspas).

// Split formula arguments handling nested brackets, quotes and Portuguese semicolon/comma
export function splitFormulaArguments(raw: string): string[] {
  let hasTopLevelSemicolon = false;
  let d = 0;
  let q = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') q = !q;
    if (!q) {
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') d--;
      else if (c === ';' && d === 0) {
        hasTopLevelSemicolon = true;
        break;
      }
    }
  }

  const args: string[] = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes) {
      if (char === '(' || char === '[' || char === '{') depth++;
      else if (char === ')' || char === ']' || char === '}') depth--;
      else if ((hasTopLevelSemicolon ? char === ';' : (char === ',' || char === ';')) && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

// Split by top-level operator (+, -, *, etc.)
export function hasTopLevelOperator(expr: string, op: string): boolean {
  let depth = 0;
  let inQuotes = false;
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes) {
      if (char === '(' || char === '[' || char === '{') depth++;
      else if (char === ')' || char === ']' || char === '}') depth--;
      else if (depth === 0) {
        if (expr.substring(i, i + op.length) === op) return true;
      }
    }
  }
  return false;
}

export function splitByTopLevelOperator(expr: string, op: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes) {
      if (char === '(' || char === '[' || char === '{') depth++;
      else if (char === ')' || char === ']' || char === '}') depth--;
      else if (depth === 0 && expr.substring(i, i + op.length) === op) {
        tokens.push(current.trim());
        current = '';
        i += op.length - 1;
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

export function splitAdditive(expr: string): { expr: string; sign: '+' | '-' }[] {
  const parts: { expr: string; sign: '+' | '-' }[] = [];
  let current = '';
  let currentSign: '+' | '-' = '+';
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes) {
      if (char === '(' || char === '[' || char === '{') depth++;
      else if (char === ')' || char === ']' || char === '}') depth--;
      else if (depth === 0 && (char === '+' || char === '-')) {
        if (i === 0) {
          currentSign = char as '+' | '-';
          continue;
        }
        parts.push({ expr: current.trim(), sign: currentSign });
        current = '';
        currentSign = char as '+' | '-';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) parts.push({ expr: current.trim(), sign: currentSign });
  return parts;
}

export function splitMultiplicative(expr: string): { expr: string; op: '*' | '/' }[] {
  const parts: { expr: string; op: '*' | '/' }[] = [];
  let current = '';
  let currentOp: '*' | '/' = '*';
  let depth = 0;
  let inQuotes = false;

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    if (char === '"') inQuotes = !inQuotes;
    if (!inQuotes) {
      if (char === '(' || char === '[' || char === '{') depth++;
      else if (char === ')' || char === ']' || char === '}') depth--;
      else if (depth === 0 && (char === '*' || char === '/')) {
        parts.push({ expr: current.trim(), op: currentOp });
        current = '';
        currentOp = char as '*' | '/';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) parts.push({ expr: current.trim(), op: currentOp });
  return parts;
}

/** Bits de `scanTopLevelOperators`: operadores presentes fora de parênteses e aspas. */
export const OP = {
  AMP: 1,
  LE: 2,
  GE: 4,
  NE: 8,
  EQ: 16,
  LT: 32,
  GT: 64,
  PLUS: 128,
  MINUS: 256,
  MUL: 512,
  DIV: 1024,
} as const;

/**
 * Uma única passada que diz quais operadores existem no nível superior da expressão. Equivale a chamar
 * `hasTopLevelOperator` para cada operador (inclusive '<' e '=' dentro de '<='), mas lê o texto uma vez.
 */
export function scanTopLevelOperators(expr: string): number {
  let mask = 0;
  let depth = 0;
  let inQuotes = false;
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    if (char === '"') inQuotes = !inQuotes;
    if (inQuotes) continue;
    if (char === '(' || char === '[' || char === '{') depth++;
    else if (char === ')' || char === ']' || char === '}') depth--;
    else if (depth === 0) {
      switch (char) {
        case '&': mask |= OP.AMP; break;
        case '<': {
          mask |= OP.LT;
          const next = expr[i + 1];
          if (next === '=') mask |= OP.LE;
          else if (next === '>') mask |= OP.NE;
          break;
        }
        case '>':
          mask |= OP.GT;
          if (expr[i + 1] === '=') mask |= OP.GE;
          break;
        case '=': mask |= OP.EQ; break;
        case '+': mask |= OP.PLUS; break;
        case '-': mask |= OP.MINUS; break;
        case '*': mask |= OP.MUL; break;
        case '/': mask |= OP.DIV; break;
      }
    }
  }
  return mask;
}