// src/engine/xl/parser.ts
// Analisador de fórmulas no estilo do Excel: texto -> árvore (AST). Precedência igual à do Excel:
//   referência (:)  >  negativo (-x)  >  %  >  ^  >  * /  >  + -  >  &  >  comparações
// Aceita separador ";" (pt-BR, com vírgula decimal) e "," (inglês). Os nós guardam a posição no texto
// para que funções antigas, que trabalham com o texto dos argumentos, continuem funcionando.

export type CompareOp = '=' | '<>' | '<' | '>' | '<=' | '>=';
export type BinOp = '+' | '-' | '*' | '/' | '^' | '&' | CompareOp;

interface Span {
  /** Posição inicial e final (exclusiva) do nó no texto original. */
  s: number;
  e: number;
}

export type RefNode = Span & {
  t: 'ref';
  /** Nome da aba citada (sem aspas), se houver. */
  sheet: string | null;
  /** Texto do endereço sem a aba, ex.: "$A$1", "A1:B5", "A:A". */
  address: string;
  kind: 'cell' | 'range';
};

export type Node =
  | (Span & { t: 'num'; v: number })
  | (Span & { t: 'str'; v: string })
  | (Span & { t: 'bool'; v: boolean })
  | (Span & { t: 'err'; code: string })
  | (Span & { t: 'empty' })
  | RefNode
  | (Span & { t: 'call'; name: string; args: Node[] })
  | (Span & { t: 'bin'; op: BinOp; l: Node; r: Node })
  | (Span & { t: 'neg'; x: Node })
  | (Span & { t: 'pos'; x: Node })
  | (Span & { t: 'pct'; x: Node })
  | (Span & { t: 'arr'; rows: Node[][] });

export class ParseError extends Error {}

type Tok =
  | (Span & { k: 'num'; v: number })
  | (Span & { k: 'str'; v: string })
  | (Span & { k: 'ref'; sheet: string | null; address: string; kind: 'cell' | 'range' })
  | (Span & { k: 'id'; v: string })
  | (Span & { k: 'err'; v: string })
  | (Span & { k: 'op'; v: string });

const ERROR_LITERALS = ['#N/D', '#VALOR!', '#REF!', '#DIV/0!', '#NOME?', '#NÚM!', '#NULO!', '#N/A', '#VALUE!', '#NAME?', '#NUM!', '#NULL!'];

const SHEET_PREFIX = String.raw`(?:'(?:[^']|'')+'|[\p{L}\p{N}_.]+)!`;
const CELL = String.raw`\$?[A-Za-z]{1,3}\$?\d+`;
const COL = String.raw`\$?[A-Za-z]{1,3}`;
const ROW = String.raw`\$?\d+`;
const TAIL = String.raw`(?![\p{L}\p{N}_(])`;
const RE_CELL_RANGE = new RegExp(String.raw`^(${SHEET_PREFIX})?(${CELL}(?::${CELL})?)${TAIL}`, 'u');
const RE_COL_RANGE = new RegExp(String.raw`^(${SHEET_PREFIX})?(${COL}:${COL})${TAIL}`, 'u');
const RE_ROW_RANGE = new RegExp(String.raw`^(${SHEET_PREFIX})?(${ROW}:${ROW})${TAIL}`, 'u');
const RE_IDENT = /^[\p{L}_][\p{L}\p{N}_.]*/u;

function sheetName(prefix: string | undefined): string | null {
  if (!prefix) return null;
  const raw = prefix.slice(0, -1);
  return raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw;
}

/** Há ";" fora de aspas? Então a vírgula é decimal (pt-BR). */
function usesSemicolon(text: string): boolean {
  let quote = false;
  for (const ch of text) {
    if (ch === '"') quote = !quote;
    else if (ch === ';' && !quote) return true;
  }
  return false;
}

function tokenize(text: string, decimalComma: boolean): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let value = '';
      for (;;) {
        if (j >= text.length) throw new ParseError('texto sem aspas de fechamento');
        if (text[j] === '"') {
          if (text[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          break;
        }
        value += text[j++];
      }
      tokens.push({ k: 'str', v: value, s: i, e: j + 1 });
      i = j + 1;
      continue;
    }
    if (ch === '#') {
      const upper = text.slice(i).toUpperCase();
      const lit = ERROR_LITERALS.find(l => upper.startsWith(l));
      if (!lit) throw new ParseError(`símbolo inesperado "#"`);
      tokens.push({ k: 'err', v: lit, s: i, e: i + lit.length });
      i += lit.length;
      continue;
    }

    // Referências (com ou sem aba) antes de números e nomes, para "A1" não virar nome e "Aba!A1" ficar inteiro.
    if (/[\p{L}\p{N}_'$]/u.test(ch)) {
      const rest = text.slice(i);
      const m = RE_CELL_RANGE.exec(rest) ?? RE_COL_RANGE.exec(rest) ?? RE_ROW_RANGE.exec(rest);
      if (m) {
        tokens.push({ k: 'ref', sheet: sheetName(m[1]), address: m[2], kind: m[2].includes(':') ? 'range' : 'cell', s: i, e: i + m[0].length });
        i += m[0].length;
        continue;
      }
    }

    if (/\d/.test(ch) || (ch === '.' && /\d/.test(text[i + 1] ?? ''))) {
      const numRe = decimalComma ? /^(?:\d+(?:[.,]\d+)?|\.\d+)(?:[eE][+-]?\d+)?/ : /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;
      const m = numRe.exec(text.slice(i));
      if (!m) throw new ParseError('número inválido');
      tokens.push({ k: 'num', v: Number(m[0].replace(',', '.')), s: i, e: i + m[0].length });
      i += m[0].length;
      continue;
    }

    const id = RE_IDENT.exec(text.slice(i));
    if (id) {
      tokens.push({ k: 'id', v: id[0], s: i, e: i + id[0].length });
      i += id[0].length;
      continue;
    }

    const two = text.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      tokens.push({ k: 'op', v: two, s: i, e: i + 2 });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>(),;{}%:'.includes(ch)) {
      tokens.push({ k: 'op', v: ch, s: i, e: i + 1 });
      i++;
      continue;
    }
    throw new ParseError(`caractere inesperado "${ch}"`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Tok[],
    private readonly text: string,
    private readonly decimalComma: boolean
  ) {}

  private peek(): Tok | undefined {
    return this.tokens[this.pos];
  }

  private isOp(v: string): boolean {
    const t = this.peek();
    return t?.k === 'op' && t.v === v;
  }

  private take(): Tok {
    const t = this.tokens[this.pos++];
    if (!t) throw new ParseError('fórmula incompleta');
    return t;
  }

  private expectOp(v: string): Tok {
    const t = this.take();
    if (t.k !== 'op' || t.v !== v) throw new ParseError(`esperado "${v}"`);
    return t;
  }

  parseAll(): Node {
    const node = this.comparison();
    if (this.pos < this.tokens.length) throw new ParseError('sobrou texto no fim da fórmula');
    return node;
  }

  private comparison(): Node {
    let left = this.concat();
    for (;;) {
      const t = this.peek();
      if (t?.k === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.v)) {
        this.pos++;
        const right = this.concat();
        left = { t: 'bin', op: t.v as CompareOp, l: left, r: right, s: left.s, e: right.e };
      } else return left;
    }
  }

  private concat(): Node {
    let left = this.additive();
    while (this.isOp('&')) {
      this.pos++;
      const right = this.additive();
      left = { t: 'bin', op: '&', l: left, r: right, s: left.s, e: right.e };
    }
    return left;
  }

  private additive(): Node {
    let left = this.multiplicative();
    for (;;) {
      const t = this.peek();
      if (t?.k === 'op' && (t.v === '+' || t.v === '-')) {
        this.pos++;
        const right = this.multiplicative();
        left = { t: 'bin', op: t.v, l: left, r: right, s: left.s, e: right.e };
      } else return left;
    }
  }

  private multiplicative(): Node {
    let left = this.power();
    for (;;) {
      const t = this.peek();
      if (t?.k === 'op' && (t.v === '*' || t.v === '/')) {
        this.pos++;
        const right = this.power();
        left = { t: 'bin', op: t.v, l: left, r: right, s: left.s, e: right.e };
      } else return left;
    }
  }

  private power(): Node {
    let left = this.unary();
    while (this.isOp('^')) {
      this.pos++;
      const right = this.unary();
      left = { t: 'bin', op: '^', l: left, r: right, s: left.s, e: right.e };
    }
    return left;
  }

  /** Como no Excel, o sinal negativo vale antes do "^": -2^2 = 4. */
  private unary(): Node {
    const t = this.peek();
    if (t?.k === 'op' && (t.v === '-' || t.v === '+')) {
      this.pos++;
      const inner = this.unary();
      return t.v === '-' ? { t: 'neg', x: inner, s: t.s, e: inner.e } : { t: 'pos', x: inner, s: t.s, e: inner.e };
    }
    return this.percent();
  }

  private percent(): Node {
    let node = this.primary();
    while (this.isOp('%')) {
      const t = this.take();
      node = { t: 'pct', x: node, s: node.s, e: t.e };
    }
    return node;
  }

  private primary(): Node {
    const t = this.take();
    switch (t.k) {
      case 'num':
        return { t: 'num', v: t.v, s: t.s, e: t.e };
      case 'str':
        return { t: 'str', v: t.v, s: t.s, e: t.e };
      case 'err':
        return { t: 'err', code: t.v, s: t.s, e: t.e };
      case 'ref':
        return { t: 'ref', sheet: t.sheet, address: t.address, kind: t.kind, s: t.s, e: t.e };
      case 'id': {
        if (this.isOp('(')) return this.call(t);
        const upper = t.v.toUpperCase();
        if (upper === 'VERDADEIRO' || upper === 'TRUE') return { t: 'bool', v: true, s: t.s, e: t.e };
        if (upper === 'FALSO' || upper === 'FALSE') return { t: 'bool', v: false, s: t.s, e: t.e };
        throw new ParseError(`nome desconhecido "${t.v}"`);
      }
      case 'op': {
        if (t.v === '(') {
          const inner = this.comparison();
          const close = this.expectOp(')');
          return { ...inner, s: t.s, e: close.e };
        }
        if (t.v === '{') return this.arrayLiteral(t);
        throw new ParseError(`símbolo inesperado "${t.v}"`);
      }
    }
  }

  private call(nameTok: Tok & { k: 'id' }): Node {
    this.expectOp('(');
    const args: Node[] = [];
    if (this.isOp(')')) {
      const close = this.take();
      return { t: 'call', name: nameTok.v, args, s: nameTok.s, e: close.e };
    }
    for (;;) {
      const t = this.peek();
      // Argumento omitido: PROCX(a; b; ; "x")
      if (t?.k === 'op' && (t.v === ';' || t.v === ',' || t.v === ')')) args.push({ t: 'empty', s: t.s, e: t.s });
      else args.push(this.comparison());
      const sep = this.take();
      if (sep.k !== 'op') throw new ParseError('esperado separador ou ")"');
      if (sep.v === ')') return { t: 'call', name: nameTok.v, args, s: nameTok.s, e: sep.e };
      const isSep = this.decimalComma ? sep.v === ';' : sep.v === ',' || sep.v === ';';
      if (!isSep) throw new ParseError(`esperado separador, recebi "${sep.v}"`);
    }
  }

  private arrayLiteral(open: Tok): Node {
    const rows: Node[][] = [[]];
    for (;;) {
      rows[rows.length - 1].push(this.comparison());
      const sep = this.take();
      if (sep.k !== 'op') throw new ParseError('matriz inválida');
      if (sep.v === '}') return { t: 'arr', rows, s: open.s, e: sep.e };
      // Em pt-BR: "," separa colunas e ";" separa linhas dentro de {...}; em inglês é o contrário.
      const newRow = this.decimalComma ? sep.v === ';' : sep.v === ';';
      if (newRow) rows.push([]);
      else if (sep.v !== ',') throw new ParseError('matriz inválida');
    }
  }
}

function parseWith(text: string, decimalComma: boolean): Node {
  return new Parser(tokenize(text, decimalComma), text, decimalComma).parseAll();
}

const cache = new Map<string, Node | ParseError>();
const CACHE_LIMIT = 5000;

/** Analisa uma expressão (sem o "=" inicial). O resultado é guardado: a mesma fórmula nunca é analisada duas vezes. */
export function parseExpression(text: string): Node {
  const hit = cache.get(text);
  if (hit instanceof ParseError) throw hit;
  if (hit) return hit;
  try {
    // pt-BR primeiro: vírgula é decimal e o separador é ";". Sem ";", se isso não fechar (ex.: SUM(1,2,3) ou
    // PROCV("a", A1:B2, 2, 0)), tenta o estilo inglês, em que a vírgula separa argumentos.
    let node: Node;
    if (usesSemicolon(text)) node = parseWith(text, true);
    else {
      try {
        node = parseWith(text, true);
      } catch (first) {
        try {
          node = parseWith(text, false);
        } catch {
          throw first;
        }
      }
    }
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(text, node);
    return node;
  } catch (error) {
    const failure = error instanceof ParseError ? error : new ParseError(String(error));
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(text, failure);
    throw failure;
  }
}

/** Texto original de um nó (usado para entregar argumentos às funções antigas). */
export function nodeText(text: string, node: Node): string {
  return node.t === 'empty' ? '' : text.slice(node.s, node.e);
}
