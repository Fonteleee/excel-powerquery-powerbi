export type TokenType = 
  | 'NUMBER' | 'STRING' | 'CELL' | 'RANGE' | 'FUNCTION' 
  | 'OPERATOR' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
}

export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  
  while (i < expr.length) {
    let char = expr[i];
    
    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    
    // String literal
    if (char === '"') {
      let str = '';
      i++;
      while (i < expr.length && expr[i] !== '"') {
        str += expr[i];
        i++;
      }
      i++; // Skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }
    
    // Numbers
    if (/[0-9.]/.test(char)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }
    
    // Operators
    if (/[+\-*/<>=&]/.test(char)) {
      let op = char;
      // Handle <=, >=, <>
      if (i + 1 < expr.length) {
        const next = expr[i + 1];
        if ((char === '<' && (next === '=' || next === '>')) || (char === '>' && next === '=')) {
          op += next;
          i++;
        }
      }
      tokens.push({ type: 'OPERATOR', value: op });
      i++;
      continue;
    }
    
    // Parentheses & Commas
    if (char === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
    if (char === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }
    if (char === ',' || char === ';') { tokens.push({ type: 'COMMA', value: char }); i++; continue; }
    
    // Text: Functions, Cells, Ranges
    if (/[A-Za-z$]/.test(char)) {
      let text = '';
      while (i < expr.length && /[A-Za-z0-9.$_:]/.test(expr[i])) {
        text += expr[i];
        i++;
      }
      
      const upperText = text.toUpperCase();
      
      if (text.includes(':')) {
        tokens.push({ type: 'RANGE', value: upperText });
      } else if (expr[i] === '(') {
        tokens.push({ type: 'FUNCTION', value: upperText });
      } else if (/^\$?[A-Z]+\$?[0-9]+$/.test(upperText)) {
        tokens.push({ type: 'CELL', value: upperText });
      } else {
        // Unrecognized string without quotes (e.g. true/false)
        tokens.push({ type: 'STRING', value: text });
      }
      continue;
    }
    
    throw new Error(`Unexpected character: ${char} at index ${i}`);
  }
  
  tokens.push({ type: 'EOF', value: 'EOF' });
  return tokens;
}

// AST Nodes
export type ASTNode = 
  | { type: 'Number'; value: number }
  | { type: 'String'; value: string }
  | { type: 'Cell'; ref: string }
  | { type: 'Range'; ref: string }
  | { type: 'BinaryOp'; operator: string; left: ASTNode; right: ASTNode }
  | { type: 'FunctionCall'; name: string; args: ASTNode[] };

export function parse(tokens: Token[]): ASTNode {
  let current = 0;
  
  function match(type: TokenType): Token | null {
    if (tokens[current].type === type) {
      return tokens[current++];
    }
    return null;
  }
  
  function expect(type: TokenType): Token {
    const token = match(type);
    if (!token) throw new Error(`Expected ${type} but found ${tokens[current].type}`);
    return token;
  }
  
  function parseExpression(): ASTNode {
    return parseComparison();
  }
  
  function parseComparison(): ASTNode {
    let left = parseConcatenation();
    while (true) {
      const op = tokens[current];
      if (op.type === 'OPERATOR' && ['=', '<>', '<', '>', '<=', '>='].includes(op.value)) {
        current++;
        const right = parseConcatenation();
        left = { type: 'BinaryOp', operator: op.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  function parseConcatenation(): ASTNode {
    let left = parseTerm();
    while (true) {
      const op = tokens[current];
      if (op.type === 'OPERATOR' && ['+', '-'].includes(op.value)) {
        current++;
        const right = parseTerm();
        left = { type: 'BinaryOp', operator: op.value, left, right };
      } else if (op.type === 'OPERATOR' && op.value === '&') {
        current++;
        const right = parseTerm();
        left = { type: 'BinaryOp', operator: '&', left, right };
      } else {
        break;
      }
    }
    return left;
  }
  
  function parseTerm(): ASTNode {
    let left = parseFactor();
    while (true) {
      const op = tokens[current];
      if (op.type === 'OPERATOR' && ['*', '/'].includes(op.value)) {
        current++;
        const right = parseFactor();
        left = { type: 'BinaryOp', operator: op.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }
  
  function parseFactor(): ASTNode {
    if (match('LPAREN')) {
      const node = parseExpression();
      expect('RPAREN');
      return node;
    }
    
    const num = match('NUMBER');
    if (num) return { type: 'Number', value: parseFloat(num.value) };
    
    const str = match('STRING');
    if (str) return { type: 'String', value: str.value };
    
    const cell = match('CELL');
    if (cell) return { type: 'Cell', ref: cell.value };
    
    const range = match('RANGE');
    if (range) return { type: 'Range', ref: range.value };
    
    const func = match('FUNCTION');
    if (func) {
      expect('LPAREN');
      const args: ASTNode[] = [];
      if (tokens[current].type !== 'RPAREN') {
        args.push(parseExpression());
        while (match('COMMA')) {
          args.push(parseExpression());
        }
      }
      expect('RPAREN');
      return { type: 'FunctionCall', name: func.value, args };
    }
    
    throw new Error(`Unexpected token at factor: ${tokens[current].type} (${tokens[current].value})`);
  }
  
  const ast = parseExpression();
  if (tokens[current].type !== 'EOF') {
    throw new Error(`Unexpected trailing tokens starting at: ${tokens[current].value}`);
  }
  return ast;
}

// Dependency Extraction (for DAG)
export function extractDependencies(ast: ASTNode): Set<string> {
  const deps = new Set<string>();
  
  function walk(node: ASTNode) {
    if (node.type === 'Cell') {
      deps.add(node.ref.replace(/\$/g, ''));
    } else if (node.type === 'Range') {
      deps.add(node.ref.replace(/\$/g, '')); 
    } else if (node.type === 'BinaryOp') {
      walk(node.left);
      walk(node.right);
    } else if (node.type === 'FunctionCall') {
      node.args.forEach(walk);
    }
  }
  
  walk(ast);
  return deps;
}

// AST Evaluation
export function evaluateAST(
  node: ASTNode,
  getCellValue: (ref: string) => any,
  callFunction: (name: string, args: any[]) => any
): any {
  if (node.type === 'Number') return node.value;
  if (node.type === 'String') return node.value;
  if (node.type === 'Cell') {
    return getCellValue(node.ref);
  }
  if (node.type === 'Range') {
    return getCellValue(node.ref);
  }
  if (node.type === 'BinaryOp') {
    const left = evaluateAST(node.left, getCellValue, callFunction);
    const right = evaluateAST(node.right, getCellValue, callFunction);
    
    if (node.operator === '&') {
      return String(left) + String(right);
    }
    
    const numL = Number(left);
    const numR = Number(right);
    
    switch (node.operator) {
      case '+': return numL + numR;
      case '-': return numL - numR;
      case '*': return numL * numR;
      case '/': 
        if (numR === 0) throw new Error('#DIV/0!');
        return numL / numR;
      case '=': return left === right;
      case '<>': return left !== right;
      case '>': return numL > numR;
      case '<': return numL < numR;
      case '>=': return numL >= numR;
      case '<=': return numL <= numR;
    }
  }
  if (node.type === 'FunctionCall') {
    const evaluatedArgs = node.args.map(arg => evaluateAST(arg, getCellValue, callFunction));
    return callFunction(node.name, evaluatedArgs);
  }
  
  throw new Error(`Unknown AST node type`);
}
