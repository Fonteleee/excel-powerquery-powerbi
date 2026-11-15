// src/features/formulaWizard/recipes.ts
// Assistente de fórmulas para quem não conhece fórmulas: o usuário escolhe O QUE quer fazer ("somar", "trazer um
// dado de outra tabela"), responde perguntas em português e o assistente monta a fórmula. Lógica pura, sem tela.

import { Sheet } from '../../types/spreadsheet';
import { cellPosToKey, colIndexToLabel } from '../../engine/formulaParser';
import { dataColumns } from '../../engine/sheetColumns';

// ---------- colunas disponíveis ----------

export interface ColumnOption {
  /** Identificador estável: `${sheetId}:${col}`. */
  id: string;
  sheetId: string;
  sheetName: string;
  col: number;
  letter: string;
  /** Nome do cabeçalho (linha 1) ou "Coluna B". */
  header: string;
  /** Última linha com dados da aba (base 0). */
  lastRow: number;
  isActiveSheet: boolean;
  /** A maioria dos valores da coluna é número? (para sugerir colunas em somas e médias) */
  numeric: boolean;
}

/** Última linha (base 0) com algum conteúdo; no mínimo 1 (a primeira linha de dados). */
export function lastDataRow(sheet: Pick<Sheet, 'data'>): number {
  let last = 1;
  for (const key in sheet.data) {
    const cell = sheet.data[key];
    if (cell.raw === '' && (cell.value === '' || cell.value === null || cell.value === undefined)) continue;
    const row = Number(key.slice(1, key.indexOf('C', 1)));
    if (row > last) last = row;
  }
  return last;
}

function isMostlyNumeric(sheet: Sheet, col: number, lastRow: number): boolean {
  let numbers = 0;
  let filled = 0;
  for (let r = 1; r <= Math.min(lastRow, 60); r++) {
    const v = sheet.data[cellPosToKey(r, col)]?.value;
    if (v === null || v === undefined || v === '') continue;
    filled++;
    if (typeof v === 'number') numbers++;
  }
  return filled > 0 && numbers / filled >= 0.6;
}

/** Colunas com dados da aba ativa primeiro, depois as das outras abas visíveis. */
export function listColumnOptions(sheets: readonly Sheet[], activeSheetId: string): ColumnOption[] {
  const ordered = [...sheets.filter(s => s.id === activeSheetId), ...sheets.filter(s => s.id !== activeSheetId && !s.hidden)];
  const out: ColumnOption[] = [];
  for (const sheet of ordered) {
    const lastRow = lastDataRow(sheet);
    for (const col of dataColumns(sheet).slice(0, 200)) {
      const head = sheet.data[cellPosToKey(0, col)]?.value;
      const letter = colIndexToLabel(col);
      out.push({
        id: `${sheet.id}:${col}`,
        sheetId: sheet.id,
        sheetName: sheet.name,
        col,
        letter,
        header: head !== null && head !== undefined && String(head).trim() !== '' ? String(head).trim() : `Coluna ${letter}`,
        lastRow,
        isActiveSheet: sheet.id === activeSheetId,
        numeric: isMostlyNumeric(sheet, col, lastRow),
      });
    }
  }
  return out;
}

const sheetPrefix = (option: ColumnOption): string => {
  if (option.isActiveSheet) return '';
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(option.sheetName) ? `${option.sheetName}!` : `'${option.sheetName.replace(/'/g, "''")}'!`;
};

/** A coluna inteira de dados, travada com $ (não muda ao copiar a fórmula para as outras linhas). */
export const columnRange = (option: ColumnOption): string => `${sheetPrefix(option)}$${option.letter}$2:$${option.letter}$${option.lastRow + 1}`;

/** A célula da coluna na linha da fórmula (relativa: acompanha a linha ao copiar). */
export const rowCell = (option: ColumnOption, row: number): string => `${sheetPrefix(option)}${option.letter}${row + 1}`;

// ---------- valores digitados ----------

/** "1.234,5" ou "1234.5" -> número; texto comum -> null. */
export function parseTypedNumber(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const normalized = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Texto digitado vira literal de fórmula: número fica número, o resto vai entre aspas. */
export function literal(text: string): string {
  const n = parseTypedNumber(text);
  if (n !== null) return String(n);
  return `"${text.replace(/"/g, '""')}"`;
}

export type Operator = '=' | '<>' | '>' | '<' | '>=' | '<=' | 'contém';

export const OPERATORS: { value: Operator; label: string }[] = [
  { value: '=', label: 'é igual a' },
  { value: '<>', label: 'é diferente de' },
  { value: '>', label: 'é maior que' },
  { value: '<', label: 'é menor que' },
  { value: '>=', label: 'é maior ou igual a' },
  { value: '<=', label: 'é menor ou igual a' },
  { value: 'contém', label: 'contém o texto' },
];

/** Critério das funções SOMASE/CONT.SE: `">100"`, `"Sul"`, `"*abc*"`. */
export function criterion(op: Operator, value: string): string {
  const n = parseTypedNumber(value);
  const shown = n !== null ? String(n) : value.replace(/"/g, '""');
  if (op === 'contém') return `"*${shown}*"`;
  if (op === '=') return n !== null ? String(n) : `"${shown}"`;
  return `"${op}${shown}"`;
}

/** Teste lógico da função SE: `B2>100`, `B2="Sul"`, ou busca de texto para "contém". */
export function logicalTest(cell: string, op: Operator, value: string): string {
  if (op === 'contém') return `ÉNÚM(LOCALIZAR(${literal(value)};${cell}))`;
  return `${cell}${op}${literal(value)}`;
}

// ---------- receitas ----------

export type ArgKind = 'coluna' | 'celula' | 'texto' | 'numero' | 'operador' | 'opcao' | 'livre';

export interface RecipeArg {
  key: string;
  /** Pergunta em português simples. */
  question: string;
  help?: string;
  kind: ArgKind;
  optional?: boolean;
  placeholder?: string;
  /** Valor inicial (texto digitado, id de opção ou operador). */
  initial?: string;
  options?: { value: string; label: string }[];
  /** Para 'coluna'/'celula': preferir colunas numéricas na sugestão automática. */
  preferNumeric?: boolean;
  /** Para 'coluna': pode ser de outra tabela (aba). */
  anySheet?: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  /** Uma linha: o que o usuário ganha. */
  blurb: string;
  /** Exemplo curto do dia a dia. */
  example: string;
  /** Palavras para a busca (sem acento, minúsculas). */
  keywords: string;
  group: 'Contas' | 'Condições' | 'Buscar' | 'Textos';
  /** Função principal usada (para quem quer aprender o nome). */
  fn: string;
  /** Uma fórmula por linha (coluna nova) ou um único resultado (total)? */
  shape: 'por_linha' | 'total';
  /** Título sugerido da coluna nova. */
  resultHeader?: string;
  args: RecipeArg[];
}

export type ArgValues = Record<string, string>;

export interface BuildContext {
  /** Coluna escolhida por id. */
  column: (id: string | undefined) => ColumnOption | undefined;
  /** Linha (base 0) da primeira fórmula. */
  row: number;
}

const col = (ctx: BuildContext, id: string | undefined): string => {
  const option = ctx.column(id);
  return option ? columnRange(option) : '';
};
const cellOf = (ctx: BuildContext, id: string | undefined): string => {
  const option = ctx.column(id);
  return option ? rowCell(option, ctx.row) : '';
};
const name = (ctx: BuildContext, id: string | undefined): string => {
  const option = ctx.column(id);
  if (!option) return '…';
  return option.isActiveSheet ? `"${option.header}"` : `"${option.header}" da tabela ${option.sheetName}`;
};
const opLabel = (op: string | undefined): string => OPERATORS.find(o => o.value === op)?.label ?? 'é igual a';

const TEXT_FUNCTIONS: Record<string, string> = { maiuscula: 'MAIÚSCULA', minuscula: 'MINÚSCULA', primeira: 'PRI.MAIÚSCULA', arrumar: 'ARRUMAR' };
const MATH_SYMBOL: Record<string, string> = { somar: '+', subtrair: '-', multiplicar: '*', dividir: '/' };

const OPERATOR_OPTIONS = OPERATORS.map(o => ({ value: o.value, label: o.label }));

export const RECIPES: Recipe[] = [
  {
    id: 'somar', title: 'Somar valores', blurb: 'Soma todos os números de uma coluna.', example: 'Total de vendas do mês',
    keywords: 'somar soma total adicionar somatorio', group: 'Contas', fn: 'SOMA', shape: 'total',
    args: [{ key: 'coluna', question: 'Qual coluna você quer somar?', kind: 'coluna', preferNumeric: true, anySheet: true }],
  },
  {
    id: 'media', title: 'Calcular a média', blurb: 'Média dos números de uma coluna.', example: 'Ticket médio, nota média',
    keywords: 'media medio average', group: 'Contas', fn: 'MÉDIA', shape: 'total',
    args: [{ key: 'coluna', question: 'De qual coluna você quer a média?', kind: 'coluna', preferNumeric: true, anySheet: true }],
  },
  {
    id: 'contar', title: 'Contar itens', blurb: 'Conta quantas linhas estão preenchidas.', example: 'Quantos clientes existem na lista',
    keywords: 'contar quantidade quantos numero de itens count', group: 'Contas', fn: 'CONT.VALORES', shape: 'total',
    args: [{ key: 'coluna', question: 'Em qual coluna contar?', kind: 'coluna', anySheet: true }],
  },
  {
    id: 'maior_menor', title: 'Achar o maior ou o menor', blurb: 'O maior ou o menor número de uma coluna.', example: 'Maior venda, menor prazo',
    keywords: 'maior menor maximo minimo max min', group: 'Contas', fn: 'MÁXIMO / MÍNIMO', shape: 'total',
    args: [
      { key: 'qual', question: 'O que você procura?', kind: 'opcao', initial: 'maior', options: [{ value: 'maior', label: 'O maior valor' }, { value: 'menor', label: 'O menor valor' }] },
      { key: 'coluna', question: 'Em qual coluna?', kind: 'coluna', preferNumeric: true, anySheet: true },
    ],
  },
  {
    id: 'conta_colunas', title: 'Fazer conta entre duas colunas', blurb: 'Soma, subtrai, multiplica ou divide linha a linha.', example: 'Quantidade × Preço = Total',
    keywords: 'multiplicar dividir subtrair somar vezes conta entre colunas quantidade preco total diferenca', group: 'Contas', fn: '+ − × ÷', shape: 'por_linha', resultHeader: 'Resultado',
    args: [
      { key: 'a', question: 'Primeira coluna', kind: 'celula', preferNumeric: true },
      { key: 'op', question: 'Qual conta?', kind: 'opcao', initial: 'multiplicar', options: [{ value: 'somar', label: 'Somar (+)' }, { value: 'subtrair', label: 'Subtrair (−)' }, { value: 'multiplicar', label: 'Multiplicar (×)' }, { value: 'dividir', label: 'Dividir (÷)' }] },
      { key: 'b', question: 'Segunda coluna', kind: 'celula', preferNumeric: true },
    ],
  },
  {
    id: 'percentual', title: 'Percentual do total', blurb: 'Quanto cada linha representa do total da coluna.', example: 'Participação de cada produto nas vendas',
    keywords: 'percentual porcentagem participacao por cento do total', group: 'Contas', fn: 'divisão pela SOMA', shape: 'por_linha', resultHeader: '% do total',
    args: [{ key: 'coluna', question: 'Qual coluna tem os valores?', kind: 'celula', preferNumeric: true }],
  },
  {
    id: 'arredondar', title: 'Arredondar números', blurb: 'Deixa o número com as casas decimais que você escolher.', example: '12,3456 vira 12,35',
    keywords: 'arredondar casas decimais arred', group: 'Contas', fn: 'ARRED', shape: 'por_linha', resultHeader: 'Arredondado',
    args: [
      { key: 'coluna', question: 'Qual coluna arredondar?', kind: 'celula', preferNumeric: true },
      { key: 'casas', question: 'Quantas casas depois da vírgula?', kind: 'numero', initial: '2' },
    ],
  },
  {
    id: 'somar_se', title: 'Somar só o que atende a uma condição', blurb: 'Soma os valores das linhas que passam num filtro.', example: 'Total de vendas da região Sul',
    keywords: 'somar se somase condicao filtro total por categoria', group: 'Condições', fn: 'SOMASE', shape: 'total',
    args: [
      { key: 'filtro', question: 'Qual coluna tem a condição?', help: 'Ex.: a coluna "Região".', kind: 'coluna', anySheet: true },
      { key: 'op', question: 'A condição é…', kind: 'operador', initial: '=', options: OPERATOR_OPTIONS },
      { key: 'valor', question: 'Qual valor?', kind: 'texto', placeholder: 'Ex.: Sul ou 100' },
      { key: 'soma', question: 'Qual coluna você quer somar?', kind: 'coluna', preferNumeric: true, anySheet: true },
    ],
  },
  {
    id: 'contar_se', title: 'Contar só o que atende a uma condição', blurb: 'Conta as linhas que passam num filtro.', example: 'Quantos pedidos estão "Atrasados"',
    keywords: 'contar se cont.se condicao quantos filtro', group: 'Condições', fn: 'CONT.SE', shape: 'total',
    args: [
      { key: 'filtro', question: 'Em qual coluna procurar?', kind: 'coluna', anySheet: true },
      { key: 'op', question: 'A condição é…', kind: 'operador', initial: '=', options: OPERATOR_OPTIONS },
      { key: 'valor', question: 'Qual valor?', kind: 'texto', placeholder: 'Ex.: Atrasado ou 100' },
    ],
  },
  {
    id: 'se', title: 'Classificar com uma regra', blurb: 'Se a condição for verdadeira mostra um texto; senão, outro.', example: 'Se a nota ≥ 7, "Aprovado"; senão, "Reprovado"',
    keywords: 'se entao senao condicao classificar regra aprovado reprovado if', group: 'Condições', fn: 'SE', shape: 'por_linha', resultHeader: 'Situação',
    args: [
      { key: 'coluna', question: 'Qual coluna você quer testar?', kind: 'celula' },
      { key: 'op', question: 'A condição é…', kind: 'operador', initial: '>=', options: OPERATOR_OPTIONS },
      { key: 'valor', question: 'Comparar com qual valor?', kind: 'texto', placeholder: 'Ex.: 7 ou Pago' },
      { key: 'sim', question: 'Se for verdade, mostrar…', kind: 'texto', initial: 'Sim', placeholder: 'Ex.: Aprovado' },
      { key: 'nao', question: 'Senão, mostrar…', kind: 'texto', initial: 'Não', placeholder: 'Ex.: Reprovado' },
    ],
  },
  {
    id: 'buscar', title: 'Trazer um dado de outra tabela', blurb: 'Procura um valor e traz a informação que está na mesma linha.', example: 'Trazer o preço do produto pelo código',
    keywords: 'procurar buscar procx procv trazer dado outra tabela cruzar lookup codigo', group: 'Buscar', fn: 'PROCX', shape: 'por_linha', resultHeader: 'Dado trazido',
    args: [
      { key: 'chave', question: 'Qual coluna desta tabela identifica cada linha?', help: 'Ex.: o código do produto, que existe nas duas tabelas.', kind: 'celula' },
      { key: 'onde', question: 'Em qual coluna procurar esse valor?', help: 'A coluna da outra tabela que tem os mesmos códigos.', kind: 'coluna', anySheet: true },
      { key: 'trazer', question: 'Qual coluna você quer trazer?', help: 'A informação que deve aparecer aqui (ex.: Preço).', kind: 'coluna', anySheet: true },
      { key: 'vazio', question: 'Se não encontrar, mostrar…', kind: 'texto', initial: 'Não encontrado', optional: true },
    ],
  },
  {
    id: 'juntar', title: 'Juntar textos', blurb: 'Une o conteúdo de duas colunas numa só.', example: 'Nome + Sobrenome',
    keywords: 'juntar unir concatenar textos nome sobrenome concat', group: 'Textos', fn: 'CONCAT', shape: 'por_linha', resultHeader: 'Texto unido',
    args: [
      { key: 'a', question: 'Primeira coluna', kind: 'celula' },
      { key: 'sep', question: 'O que colocar entre os dois?', kind: 'opcao', initial: 'espaco', options: [{ value: 'espaco', label: 'Um espaço' }, { value: 'nada', label: 'Nada' }, { value: 'traco', label: 'Um traço ( - )' }, { value: 'virgula', label: 'Uma vírgula ( , )' }] },
      { key: 'b', question: 'Segunda coluna', kind: 'celula' },
    ],
  },
  {
    id: 'texto', title: 'Arrumar um texto', blurb: 'Maiúsculas, minúsculas ou tirar espaços sobrando.', example: '"joão silva" vira "João Silva"',
    keywords: 'maiuscula minuscula texto arrumar espacos primeira letra', group: 'Textos', fn: 'MAIÚSCULA / PRI.MAIÚSCULA / ARRUMAR', shape: 'por_linha', resultHeader: 'Texto arrumado',
    args: [
      { key: 'coluna', question: 'Qual coluna tem o texto?', kind: 'celula' },
      { key: 'como', question: 'Como deixar o texto?', kind: 'opcao', initial: 'primeira', options: [{ value: 'primeira', label: 'Primeira Letra Maiúscula' }, { value: 'maiuscula', label: 'TUDO MAIÚSCULO' }, { value: 'minuscula', label: 'tudo minúsculo' }, { value: 'arrumar', label: 'Tirar espaços sobrando' }] },
    ],
  },
];

const SEPARATOR: Record<string, string> = { espaco: '" "', nada: '""', traco: '" - "', virgula: '", "' };

/** Monta a fórmula da receita para a linha `ctx.row`. Devolve '' se ainda falta alguma resposta obrigatória. */
export function buildFormula(recipe: Recipe, values: ArgValues, ctx: BuildContext): string {
  for (const arg of recipe.args) {
    if (arg.optional) continue;
    const v = values[arg.key];
    if (v === undefined || v.trim() === '') return '';
    if ((arg.kind === 'coluna' || arg.kind === 'celula') && !ctx.column(v)) return '';
  }
  const v = values;
  switch (recipe.id) {
    case 'somar': return `=SOMA(${col(ctx, v.coluna)})`;
    case 'media': return `=MÉDIA(${col(ctx, v.coluna)})`;
    case 'contar': return `=CONT.VALORES(${col(ctx, v.coluna)})`;
    case 'maior_menor': return `=${v.qual === 'menor' ? 'MÍNIMO' : 'MÁXIMO'}(${col(ctx, v.coluna)})`;
    case 'conta_colunas': return `=${cellOf(ctx, v.a)}${MATH_SYMBOL[v.op] ?? '*'}${cellOf(ctx, v.b)}`;
    case 'percentual': return `=${cellOf(ctx, v.coluna)}/SOMA(${col(ctx, v.coluna)})`;
    case 'arredondar': return `=ARRED(${cellOf(ctx, v.coluna)};${Math.max(0, Math.min(10, Math.round(parseTypedNumber(v.casas) ?? 2)))})`;
    case 'somar_se': return `=SOMASE(${col(ctx, v.filtro)};${criterion(v.op as Operator, v.valor)};${col(ctx, v.soma)})`;
    case 'contar_se': return `=CONT.SE(${col(ctx, v.filtro)};${criterion(v.op as Operator, v.valor)})`;
    case 'se': return `=SE(${logicalTest(cellOf(ctx, v.coluna), v.op as Operator, v.valor)};${literal(v.sim)};${literal(v.nao)})`;
    case 'buscar': return `=PROCX(${cellOf(ctx, v.chave)};${col(ctx, v.onde)};${col(ctx, v.trazer)};${literal(v.vazio?.trim() ? v.vazio : 'Não encontrado')})`;
    case 'juntar': return `=CONCAT(${cellOf(ctx, v.a)};${SEPARATOR[v.sep] ?? '" "'};${cellOf(ctx, v.b)})`;
    case 'texto': return `=${TEXT_FUNCTIONS[v.como] ?? 'PRI.MAIÚSCULA'}(${cellOf(ctx, v.coluna)})`;
    default: return '';
  }
}

/** A fórmula explicada em uma frase, para quem não lê fórmulas. */
export function explain(recipe: Recipe, values: ArgValues, ctx: BuildContext): string {
  const v = values;
  switch (recipe.id) {
    case 'somar': return `Soma todos os valores da coluna ${name(ctx, v.coluna)}.`;
    case 'media': return `Calcula a média dos valores da coluna ${name(ctx, v.coluna)}.`;
    case 'contar': return `Conta quantas linhas estão preenchidas na coluna ${name(ctx, v.coluna)}.`;
    case 'maior_menor': return `Mostra o ${v.qual === 'menor' ? 'menor' : 'maior'} valor da coluna ${name(ctx, v.coluna)}.`;
    case 'conta_colunas': return `Em cada linha, faz ${name(ctx, v.a)} ${MATH_SYMBOL[v.op] === '*' ? '×' : MATH_SYMBOL[v.op] === '/' ? '÷' : MATH_SYMBOL[v.op] === '-' ? '−' : '+'} ${name(ctx, v.b)}.`;
    case 'percentual': return `Em cada linha, divide o valor de ${name(ctx, v.coluna)} pelo total da coluna.`;
    case 'arredondar': return `Em cada linha, arredonda ${name(ctx, v.coluna)} para ${v.casas || '2'} casa(s) decimal(is).`;
    case 'somar_se': return `Soma ${name(ctx, v.soma)} apenas nas linhas em que ${name(ctx, v.filtro)} ${opLabel(v.op)} "${v.valor ?? ''}".`;
    case 'contar_se': return `Conta as linhas em que ${name(ctx, v.filtro)} ${opLabel(v.op)} "${v.valor ?? ''}".`;
    case 'se': return `Em cada linha: se ${name(ctx, v.coluna)} ${opLabel(v.op)} "${v.valor ?? ''}", mostra "${v.sim ?? ''}"; senão, mostra "${v.nao ?? ''}".`;
    case 'buscar': return `Em cada linha, procura o valor de ${name(ctx, v.chave)} na coluna ${name(ctx, v.onde)} e traz o que estiver em ${name(ctx, v.trazer)}. Se não achar, mostra "${v.vazio?.trim() ? v.vazio : 'Não encontrado'}".`;
    case 'juntar': return `Em cada linha, junta ${name(ctx, v.a)} com ${name(ctx, v.b)}.`;
    case 'texto': return `Em cada linha, reescreve o texto de ${name(ctx, v.coluna)}.`;
    default: return '';
  }
}

const strip = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca por palavras do dia a dia ("somar vendas", "procv"), sem depender de acento. */
export function searchRecipes(term: string): Recipe[] {
  const words = strip(term).split(/\s+/).filter(Boolean);
  if (words.length === 0) return RECIPES;
  return RECIPES.filter(r => {
    const hay = strip(`${r.title} ${r.blurb} ${r.example} ${r.keywords} ${r.fn}`);
    return words.every(w => hay.includes(w));
  });
}

/** Respostas iniciais: sugere colunas a partir da seleção do usuário e do tipo de dado. */
export function initialValues(recipe: Recipe, columns: readonly ColumnOption[], selectedCols: readonly number[]): ArgValues {
  const active = columns.filter(c => c.isActiveSheet);
  const used = new Set<string>();
  const values: ArgValues = {};
  let selectionIndex = 0;
  for (const arg of recipe.args) {
    if (arg.kind !== 'coluna' && arg.kind !== 'celula') {
      values[arg.key] = arg.initial ?? '';
      continue;
    }
    // 1º: colunas que o usuário selecionou na planilha, na ordem; 2º: uma coluna do tipo esperado ainda não usada.
    let pick: ColumnOption | undefined;
    while (selectionIndex < selectedCols.length && !pick) {
      const candidate = active.find(c => c.col === selectedCols[selectionIndex]);
      selectionIndex++;
      if (candidate && !used.has(candidate.id)) pick = candidate;
    }
    // "Buscar em outra tabela": as colunas de procura/retorno costumam estar em outra aba; não chutamos.
    if (!pick && recipe.id !== 'buscar') {
      pick = active.find(c => !used.has(c.id) && (!arg.preferNumeric || c.numeric));
    }
    if (!pick && recipe.id === 'buscar' && arg.key === 'chave') pick = active[0];
    if (pick) {
      used.add(pick.id);
      values[arg.key] = pick.id;
    } else {
      values[arg.key] = '';
    }
  }
  return values;
}

/** Mensagem amigável para os erros mais comuns do resultado. */
export function friendlyError(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('#')) return null;
  const code = value.toUpperCase();
  if (code.startsWith('#N/D') || code.startsWith('#N/A')) return 'Valor não encontrado na coluna de busca.';
  if (code.startsWith('#DIV/0')) return 'Divisão por zero: a coluna usada tem zero ou está vazia nessa linha.';
  if (code.startsWith('#VALOR') || code.startsWith('#VALUE')) return 'Há texto onde a conta espera um número.';
  if (code.startsWith('#NOME') || code.startsWith('#NAME')) return 'O sistema não reconheceu a função.';
  if (code.startsWith('#REF')) return 'A fórmula aponta para uma célula que não existe.';
  return 'Não foi possível calcular com essas escolhas.';
}
