import { CellData, CellPosition, CellRange, Sheet, CellFormat, FormulaParamGuide } from '../types/spreadsheet';

export type { FormulaParamGuide };


// Converts 0 -> 'A', 1 -> 'B', 25 -> 'Z', 26 -> 'AA', etc.
export function colIndexToLabel(colIndex: number): string {
  let label = '';
  let temp = colIndex;
  while (temp >= 0) {
    label = String.fromCharCode((temp % 26) + 65) + label;
    temp = Math.floor(temp / 26) - 1;
  }
  return label;
}

// Converts 'A' -> 0, 'B' -> 1, 'AA' -> 26
export function labelToColIndex(label: string): number {
  let col = 0;
  const upper = label.toUpperCase().trim();
  for (let i = 0; i < upper.length; i++) {
    col = col * 26 + (upper.charCodeAt(i) - 64);
  }
  return col - 1;
}

// Parse "A1" -> { row: 0, col: 0 }
export function parseCellAddress(address: string): CellPosition | null {
  const match = address.trim().toUpperCase().match(/^(\$?)([A-Z]+)(\$?)([0-9]+)$/);
  if (!match) return null;
  const col = labelToColIndex(match[2]);
  const row = parseInt(match[4], 10) - 1;
  if (isNaN(row) || col < 0) return null;
  return { row, col };
}

// Parse "A1:B10" or "A:A"
export function parseRangeAddress(rangeStr: string, maxRows = 100): CellRange | null {
  const parts = rangeStr.trim().toUpperCase().split(':');
  if (parts.length === 1) {
    const single = parseCellAddress(parts[0]);
    if (!single) return null;
    return { startRow: single.row, startCol: single.col, endRow: single.row, endCol: single.col };
  }
  if (parts.length === 2) {
    // Check if whole columns like "A:B", "A:A", "$A:$A", "$B:$B"
    const c1Str = parts[0].replace(/\$/g, '');
    const c2Str = parts[1].replace(/\$/g, '');
    const colOnlyMatch1 = c1Str.match(/^[A-Z]+$/);
    const colOnlyMatch2 = c2Str.match(/^[A-Z]+$/);
    if (colOnlyMatch1 && colOnlyMatch2) {
      const c1 = labelToColIndex(c1Str);
      const c2 = labelToColIndex(c2Str);
      return {
        startRow: 0,
        startCol: Math.min(c1, c2),
        endRow: maxRows - 1,
        endCol: Math.max(c1, c2),
      };
    }

    const p1 = parseCellAddress(parts[0]);
    const p2 = parseCellAddress(parts[1]);
    if (!p1 || !p2) return null;
    return {
      startRow: Math.min(p1.row, p2.row),
      startCol: Math.min(p1.col, p2.col),
      endRow: Math.max(p1.row, p2.row),
      endCol: Math.max(p1.col, p2.col),
    };
  }
  return null;
}

export function cellPosToKey(row: number, col: number): string {
  return `R${row}C${col}`;
}

export function keyToCellPos(key: string): CellPosition {
  const match = key.match(/^R(\d+)C(\d+)$/);
  if (match) {
    return { row: parseInt(match[1], 10), col: parseInt(match[2], 10) };
  }
  const addr = parseCellAddress(key);
  return addr || { row: 0, col: 0 };
}

export function cellPosToAddress(pos: CellPosition): string {
  return `${colIndexToLabel(pos.col)}${pos.row + 1}`;
}

export function rangeToAddress(range: CellRange): string {
  const p1 = `${colIndexToLabel(range.startCol)}${range.startRow + 1}`;
  const p2 = `${colIndexToLabel(range.endCol)}${range.endRow + 1}`;
  if (p1 === p2) return p1;
  return `${p1}:${p2}`;
}

/**
 * Accurately shifts relative cell and range references in a formula by deltaRow and deltaCol.
 * Preserves absolute reference anchors ($) on columns and/or rows (e.g. $A$1, $A1, A$1).
 */
export function shiftFormula(formula: string, deltaRow: number, deltaCol: number): string {
  if (!formula || !formula.startsWith('=')) return formula;
  if (deltaRow === 0 && deltaCol === 0) return formula;

  // Match cell coordinates with optional sheet prefix and $ anchors
  const refRegex = /(?:([A-Za-z0-9_ÁÉÍÓÚÂÊÔÃÕÇ]+)!)?(\$?)([A-Za-z]+)(\$?)([0-9]+)/g;

  return formula.replace(refRegex, (match, sheetPrefix, colDollar, colLetters, rowDollar, rowNumber) => {
    let newColLetters = colLetters;
    if (!colDollar && deltaCol !== 0) {
      const curColIdx = labelToColIndex(colLetters);
      const newColIdx = Math.max(0, curColIdx + deltaCol);
      newColLetters = colIndexToLabel(newColIdx);
    }

    let newRowNum = parseInt(rowNumber, 10);
    if (!rowDollar && deltaRow !== 0) {
      newRowNum = Math.max(1, newRowNum + deltaRow);
    }

    const prefix = sheetPrefix ? `${sheetPrefix}!` : '';
    return `${prefix}${colDollar}${newColLetters}${rowDollar}${newRowNum}`;
  });
}

// Get cell value from sheet with automatic formula evaluation resolution
export function getCellValue(
  sheet: Sheet,
  row: number,
  col: number,
  allSheets: Sheet[] = [sheet],
  callStack: Set<string> = new Set()
): any {
  const key = cellPosToKey(row, col);
  const cell = sheet.data[key];
  if (!cell) return null;
  if (cell.value !== undefined && cell.value !== null) return cell.value;
  if (cell.raw && typeof cell.raw === 'string' && cell.raw.startsWith('=')) {
    if (callStack.has(`${sheet.id}:${key}`)) return 0;
    const nextStack = new Set(callStack);
    nextStack.add(`${sheet.id}:${key}`);
    try {
      const val = evaluateFormula(cell.raw, sheet, allSheets, nextStack);
      cell.value = val;
      return val;
    } catch {
      return 0;
    }
  }
  return cell.raw;
}

// Get array of cell values in range
export function getRangeValues(sheet: Sheet, range: CellRange): any[][] {
  const matrix: any[][] = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    const rowVals: any[] = [];
    for (let c = range.startCol; c <= range.endCol; c++) {
      rowVals.push(getCellValue(sheet, r, c));
    }
    matrix.push(rowVals);
  }
  return matrix;
}

// Flatten range values
export function getFlatRangeValues(sheet: Sheet, range: CellRange): any[] {
  const flat: any[] = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startCol; c <= range.endCol; c++) {
      const val = getCellValue(sheet, r, c);
      flat.push(val);
    }
  }
  return flat;
}

// Catalog of documented formulas for autocomplete and visual helper
export const FORMULA_CATALOG: FormulaParamGuide[] = [
  {
    name: 'PROCX',
    description: 'Procura um valor em um intervalo e retorna um item correspondente de um segundo intervalo (XLOOKUP).',
    syntax: 'PROCX(pesquisa_valor, pesquisa_matriz, matriz_retorno, [se_não_encontrado], [modo_correspondência])',
    example: 'PROCX(A2, B2:B20, C2:C20, "Não Encontrado", 0)',
    category: 'Busca e Referência',
    params: [
      { name: 'pesquisa_valor', description: 'O valor que você deseja procurar' },
      { name: 'pesquisa_matriz', description: 'O intervalo onde procurar o valor (ex: B2:B20)' },
      { name: 'matriz_retorno', description: 'O intervalo com os dados a serem retornados (ex: C2:C20)' },
      { name: 'se_não_encontrado', description: 'Valor retornado caso não haja correspondência (ex: "Não Encontrado")', optional: true, defaultValue: '"#N/D"' },
      { name: 'modo_correspondência', description: '0 para exata (padrão), -1 menor próximo, 1 maior próximo', optional: true, defaultValue: '0' },
    ],
  },
  {
    name: 'SEERRO',
    description: 'Retorna um valor personalizado se uma fórmula resultar em erro; caso contrário, retorna o resultado normal.',
    syntax: 'SEERRO(valor, valor_se_erro)',
    example: 'SEERRO(A2/B2, 0)',
    category: 'Lógica',
    params: [
      { name: 'valor', description: 'A fórmula ou célula a ser verificada quanto a erro' },
      { name: 'valor_se_erro', description: 'O valor retornado caso haja qualquer erro' },
    ],
  },
  {
    name: 'ÍNDICE',
    description: 'Retorna o valor de uma célula dentro de uma tabela com base no número da linha e da coluna.',
    syntax: 'ÍNDICE(matriz, núm_linha, [núm_coluna])',
    example: 'ÍNDICE(A2:D20, 3, 2)',
    category: 'Busca e Referência',
    params: [
      { name: 'matriz', description: 'O intervalo de células da tabela' },
      { name: 'núm_linha', description: 'A posição da linha a retornar (1-based)' },
      { name: 'núm_coluna', description: 'A posição da coluna a retornar (opcional em 1D)', optional: true, defaultValue: '1' },
    ],
  },
  {
    name: 'CORRESP',
    description: 'Procura um item em um intervalo e retorna a posição relativa desse item.',
    syntax: 'CORRESP(pesquisa_valor, pesquisa_matriz, [tipo_correspondência])',
    example: 'CORRESP("Produto A", A2:A20, 0)',
    category: 'Busca e Referência',
    params: [
      { name: 'pesquisa_valor', description: 'O valor a pesquisar' },
      { name: 'pesquisa_matriz', description: 'O intervalo de 1 linha ou 1 coluna onde pesquisar' },
      { name: 'tipo_correspondência', description: '0 para correspondência exata, 1 menor ou igual, -1 maior ou igual', optional: true, defaultValue: '0' },
    ],
  },
  {
    name: 'SOMARPRODUTO',
    description: 'Multiplica os componentes correspondentes em duas ou mais matrizes e retorna a soma desses produtos.',
    syntax: 'SOMARPRODUTO(matriz1, [matriz2], ...)',
    example: 'SOMARPRODUTO(B2:B10, C2:C10)',
    category: 'Matemática e Estatística',
    params: [
      { name: 'matriz1', description: 'Primeiro intervalo ou vetor (ex: Quantidade B2:B10)' },
      { name: 'matriz2', description: 'Segundo intervalo ou vetor (ex: Preço C2:C10)' },
    ],
  },
  {
    name: 'MÉDIA.PONDERADA',
    description: 'Calcula a média ponderada multiplicando os valores pelos seus respectivos pesos e dividindo pela soma dos pesos.',
    syntax: 'MÉDIA.PONDERADA(valores, pesos)',
    example: 'MÉDIA.PONDERADA(C2:C10, D2:D10)',
    category: 'Matemática e Estatística',
    params: [
      { name: 'valores', description: 'Intervalo contendo os valores numéricos' },
      { name: 'pesos', description: 'Intervalo contendo os pesos de cada valor' },
    ],
  },
  {
    name: 'UNIRTEXTO',
    description: 'Concatena uma lista ou intervalo de cadeias de texto usando um delimitador especificado entre cada item.',
    syntax: 'UNIRTEXTO(delimitador, ignorar_vazio, texto1, [texto2], ...)',
    example: 'UNIRTEXTO(", ", VERDADEIRO, A2:A10)',
    category: 'Texto',
    params: [
      { name: 'delimitador', description: 'O caractere separador (ex: ", " ou " - ")' },
      { name: 'ignorar_vazio', description: 'VERDADEIRO para ignorar células vazias, FALSO para incluir' },
      { name: 'texto1', description: 'Primeiro texto ou intervalo a unir' },
    ],
  },
  {
    name: 'SOMA',
    description: 'Soma todos os números em um intervalo de células.',
    syntax: 'SOMA(núm1, [núm2], ...)',
    example: 'SOMA(A1:A10)',
    category: 'Matemática e Estatística',
    params: [{ name: 'intervalo', description: 'Intervalo de células para somar' }],
  },
  {
    name: 'MÉDIA',
    description: 'Retorna a média aritmética dos argumentos.',
    syntax: 'MÉDIA(núm1, [núm2], ...)',
    example: 'MÉDIA(B2:B20)',
    category: 'Matemática e Estatística',
    params: [{ name: 'intervalo', description: 'Intervalo para calcular a média' }],
  },
  {
    name: 'CONT.SE',
    description: 'Calcula o número de células em um intervalo que atendem a um determinado critério.',
    syntax: 'CONT.SE(intervalo, critérios)',
    example: 'CONT.SE(C2:C20, ">100")',
    category: 'Matemática e Estatística',
    params: [
      { name: 'intervalo', description: 'O intervalo no qual contar as células' },
      { name: 'critérios', description: 'A condição (ex: ">100", "Aprovado", ">=50")' },
    ],
  },
  {
    name: 'SE',
    description: 'Verifica se uma condição foi atendida e retorna um valor se for VERDADEIRO e outro se for FALSO.',
    syntax: 'SE(teste_lógico, valor_se_verdadeiro, [valor_se_falso])',
    example: 'SE(A2>=7, "Aprovado", "Reprovado")',
    category: 'Lógica',
    params: [
      { name: 'teste_lógico', description: 'A condição a ser testada' },
      { name: 'valor_se_verdadeiro', description: 'Valor retornado se a condição for atendida' },
      { name: 'valor_se_falso', description: 'Valor retornado se a condição não for atendida', optional: true },
    ],
  },
  {
    name: 'MAIÚSCULA',
    description: 'Converte todas as letras de uma cadeia de texto em maiúsculas.',
    syntax: 'MAIÚSCULA(texto)',
    example: 'MAIÚSCULA(A2)',
    category: 'Texto',
    params: [{ name: 'texto', description: 'O texto a ser convertido' }],
  },
  {
    name: 'MINÚSCULA',
    description: 'Converte todas as letras de uma cadeia de texto em minúsculas.',
    syntax: 'MINÚSCULA(texto)',
    example: 'MINÚSCULA(A2)',
    category: 'Texto',
    params: [{ name: 'texto', description: 'O texto a ser convertido' }],
  },
  {
    name: 'PRI.MAIÚSCULA',
    description: 'Coloca em maiúscula a primeira letra de cada palavra em uma cadeia de texto.',
    syntax: 'PRI.MAIÚSCULA(texto)',
    example: 'PRI.MAIÚSCULA(A2)',
    category: 'Texto',
    params: [{ name: 'texto', description: 'O texto a ser formatado' }],
  },
  {
    name: 'PROCV',
    description: 'Procura um valor na primeira coluna à esquerda de uma tabela e retorna um valor na mesma linha de uma coluna especificada (VLOOKUP).',
    syntax: 'PROCV(valor_procurado, matriz_tabela, núm_índice_coluna, [procurar_intervalo])',
    example: 'PROCV(A2, B2:E20, 3, FALSO)',
    category: 'Busca e Referência',
    params: [
      { name: 'valor_procurado', description: 'O valor a ser pesquisado na primeira coluna' },
      { name: 'matriz_tabela', description: 'O intervalo contendo a tabela de pesquisa' },
      { name: 'núm_índice_coluna', description: 'O número da coluna a retornar (1-based)' },
      { name: 'procurar_intervalo', description: 'FALSO para correspondência exata, VERDADEIRO para aproximada', optional: true, defaultValue: 'FALSO' },
    ],
  },
  {
    name: 'SOMASE',
    description: 'Adiciona as células especificadas por um determinado critério ou condição.',
    syntax: 'SOMASE(intervalo, critérios, [intervalo_soma])',
    example: 'SOMASE(A2:A20, "São Paulo", C2:C20)',
    category: 'Matemática e Estatística',
    params: [
      { name: 'intervalo', description: 'O intervalo a ser avaliado pelo critério' },
      { name: 'critérios', description: 'O critério (ex: ">100", "Aprovado")' },
      { name: 'intervalo_soma', description: 'O intervalo com os valores a somar', optional: true },
    ],
  },
  {
    name: 'CONT.VALORES',
    description: 'Calcula o número de células não vazias em um intervalo.',
    syntax: 'CONT.VALORES(valor1, [valor2], ...)',
    example: 'CONT.VALORES(A2:A50)',
    category: 'Matemática e Estatística',
    params: [{ name: 'intervalo', description: 'O intervalo de células preenchidas a contar' }],
  },
  {
    name: 'MÁXIMO',
    description: 'Retorna o valor máximo em um conjunto de valores.',
    syntax: 'MÁXIMO(núm1, [núm2], ...)',
    example: 'MÁXIMO(C2:C50)',
    category: 'Matemática e Estatística',
    params: [{ name: 'intervalo', description: 'Intervalo contendo os números' }],
  },
  {
    name: 'MÍNIMO',
    description: 'Retorna o valor mínimo em um conjunto de valores.',
    syntax: 'MÍNIMO(núm1, [núm2], ...)',
    example: 'MÍNIMO(C2:C50)',
    category: 'Matemática e Estatística',
    params: [{ name: 'intervalo', description: 'Intervalo contendo os números' }],
  },
  {
    name: 'ARRED',
    description: 'Arredonda um número para um número especificado de dígitos.',
    syntax: 'ARRED(número, núm_dígitos)',
    example: 'ARRED(A2, 2)',
    category: 'Matemática e Estatística',
    params: [
      { name: 'número', description: 'O número a ser arredondado' },
      { name: 'núm_dígitos', description: 'Quantidade de casas decimais' },
    ],
  },
  {
    name: 'HOJE',
    description: 'Retorna a data atual no formato DD/MM/AAAA.',
    syntax: 'HOJE()',
    example: 'HOJE()',
    category: 'Data e Hora',
    params: [],
  },
  {
    name: 'CONCAT',
    description: 'Combina o texto de vários intervalos ou cadeias de caracteres.',
    syntax: 'CONCAT(texto1, [texto2], ...)',
    example: 'CONCAT(A2, " - ", B2)',
    category: 'Texto',
    params: [
      { name: 'texto1', description: 'Primeiro texto ou célula a concatenar' },
      { name: 'texto2', description: 'Segundo texto ou célula', optional: true },
    ],
  },
];


// Helper to safely parse numbers with Brazilian or US format
export function parseNumberSafely(val: any, allowTimeAsSeconds = false): number | null {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val !== 'string') return null;
  const str = val.trim();
  if (!str) return null;

  // If contains time colon (e.g. "05:27:26", "04:03:02", "12:30")
  if (str.includes(':')) {
    if (allowTimeAsSeconds && /^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
      return valueToSeconds(str);
    }
    return null;
  }



  // If date format (e.g. "10/01/2023", "2023-01-10"), it is DATE, NOT a number!
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(str) || /^\d{4}-\d{2}-\d{2}$/.test(str)) return null;

  // Handle currency prefixes like "R$", "$", "€"
  const cleanStr = str
    .replace(/^[R$€\s]+|[R$€\s]+$/g, '')
    .replace(/%/g, '')
    .trim();

  if (!cleanStr) return null;

  // If Brazilian format: 1.234,56 or 1234,56
  if (cleanStr.includes(',') && !cleanStr.includes('.')) {
    const normalized = cleanStr.replace(',', '.');
    if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) return null;
    const num = parseFloat(normalized);
    if (!isNaN(num)) return str.includes('%') ? num / 100 : num;
  } else if (cleanStr.includes('.') && cleanStr.includes(',')) {
    if (cleanStr.lastIndexOf(',') > cleanStr.lastIndexOf('.')) {
      // 1.234,56 -> 1234.56
      const normalized = cleanStr.replace(/\./g, '').replace(',', '.');
      if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) return null;
      const num = parseFloat(normalized);
      if (!isNaN(num)) return str.includes('%') ? num / 100 : num;
    } else {
      // 1,234.56 -> 1234.56
      const normalized = cleanStr.replace(/,/g, '');
      if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) return null;
      const num = parseFloat(normalized);
      if (!isNaN(num)) return str.includes('%') ? num / 100 : num;
    }
  } else {
    // US or plain integer: e.g. 1234.56 or 1234 or -50
    if (!/^[-+]?\d+(\.\d+)?$/.test(cleanStr)) return null;
    const num = parseFloat(cleanStr);
    if (!isNaN(num)) return str.includes('%') ? num / 100 : num;
  }
  return null;
}

/**
 * Normalizador e comparador universal de valores do Excel.
 * Suporta string vs número ("100,00" == 100), trim de espaços, case-insensitivity e wildcards.
 */
export function valuesMatch(cellVal: any, criteriaVal: any): boolean {
  if (cellVal === null || cellVal === undefined) return false;
  if (criteriaVal === null || criteriaVal === undefined) return false;
  if (cellVal === criteriaVal) return true;

  // Normalização de string
  const strCell = String(cellVal).trim().toLowerCase();
  const strCriteria = String(criteriaVal).trim().toLowerCase();
  if (strCell === strCriteria) return true;

  // Comparação numérica segura (suporta formato PT-BR e US)
  const numCell = parseNumberSafely(cellVal);
  const numCriteria = parseNumberSafely(criteriaVal);
  if (numCell !== null && numCriteria !== null && Math.abs(numCell - numCriteria) < 1e-9) {
    return true;
  }

  // Suporte a Wildcards (* e ?)
  if (typeof criteriaVal === 'string' && (criteriaVal.includes('*') || criteriaVal.includes('?'))) {
    const regexPattern = '^' + strCriteria.replace(/[-[\]{}()+.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    try {
      return new RegExp(regexPattern, 'i').test(strCell);
    } catch {
      return false;
    }
  }

  return false;
}

// Resolve a range argument which might be local ("A1:B10") or cross-sheet ("'Acompanhamento'!A1:B10", "Acompanhamento!B:B", "'Planilha 2'!C5")
export function resolveRangeAndValues(
  arg: string,
  currentSheet: Sheet,
  allSheets: Sheet[] = [currentSheet]
): { targetSheet: Sheet; range: CellRange; flatValues: any[]; matrixValues: any[][] } | null {
  const trimmed = arg.trim();
  let targetSheet = currentSheet;
  let address = trimmed;

  if (trimmed.includes('!')) {
    const exclamationIdx = trimmed.indexOf('!');
    const rawSheetName = trimmed.substring(0, exclamationIdx).trim().replace(/^'|'$/g, '').replace(/''/g, "'");
    address = trimmed.substring(exclamationIdx + 1).trim();

    const normalize = (s: string) => s.toUpperCase().replace(/[\s\-_]/g, '').replace(/\.+$/, '');
    const cleanRaw = normalize(rawSheetName);

    const found = allSheets.find(s => {
      const sClean = normalize(s.name);
      return sClean === cleanRaw || sClean.startsWith(cleanRaw) || cleanRaw.startsWith(sClean);
    });
    if (found) {
      targetSheet = found;
    }
  }

  const range = parseRangeAddress(address, targetSheet.rowCount);
  if (!range) return null;

  const flatValues = getFlatRangeValues(targetSheet, range);
  const matrixValues = getRangeValues(targetSheet, range);

  return { targetSheet, range, flatValues, matrixValues };
}

// Evaluate formula
export function evaluateFormula(

  formula: string,
  sheet: Sheet,
  allSheets: Sheet[] = [sheet],
  callStack: Set<string> = new Set()
): any {
  if (!formula.startsWith('=')) {
    const num = parseNumberSafely(formula);
    return num !== null ? num : formula;
  }


  const expr = formula.substring(1).trim();

  try {
    return evaluateExpression(expr, sheet, allSheets, callStack);
  } catch (err: any) {
    if (err.message && err.message.startsWith('#')) return err.message;
    return '#VALOR!';
  }
}

// Main Expression Evaluator
function evaluateExpression(
  expr: string,
  sheet: Sheet,
  allSheets: Sheet[],
  callStack: Set<string>
): any {
  expr = expr.trim();
  if (!expr) return '';

  // Handle outer parentheses: (1 - I2) or ((A1+B1)*2)
  if (expr.startsWith('(') && expr.endsWith(')')) {
    let depth = 0;
    let canStrip = true;
    for (let i = 0; i < expr.length - 1; i++) {
      if (expr[i] === '(') depth++;
      else if (expr[i] === ')') depth--;
      if (depth === 0) {
        canStrip = false;
        break;
      }
    }
    if (canStrip) {
      return evaluateExpression(expr.substring(1, expr.length - 1).trim(), sheet, allSheets, callStack);
    }
  }

  // Check function call: FUNC(arg1, arg2, ...)
  const funcMatch = expr.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ\._]+)\s*\((.*)\)$/i);
  if (funcMatch) {
    const funcName = funcMatch[1].toUpperCase();
    const argsRaw = funcMatch[2];
    const args = splitFormulaArguments(argsRaw);

    return executeFunction(funcName, args, sheet, allSheets, callStack);
  }


  // Handle concatenation with & operator
  if (hasTopLevelOperator(expr, '&')) {
    const tokens = splitByTopLevelOperator(expr, '&');
    return tokens
      .map(t => {
        const res = evaluateExpression(t, sheet, allSheets, callStack);
        return res === null || res === undefined ? '' : String(res);
      })
      .join('');
  }

  // Handle comparison operators: =, <>, <=, >=, <, >
  const compOps = ['<=', '>=', '<>', '=', '<', '>'];
  for (const op of compOps) {
    if (hasTopLevelOperator(expr, op)) {
      const parts = splitByTopLevelOperator(expr, op);
      if (parts.length === 2) {
        const left = evaluateExpression(parts[0], sheet, allSheets, callStack);
        const right = evaluateExpression(parts[1], sheet, allSheets, callStack);
        if (op === '=') return left === right;
        if (op === '<>') return left !== right;
        if (op === '<') return Number(left) < Number(right);
        if (op === '>') return Number(left) > Number(right);
        if (op === '<=') return Number(left) <= Number(right);
        if (op === '>=') return Number(left) >= Number(right);
      }
    }
  }

  // Handle arithmetic: +, -
  if (hasTopLevelOperator(expr, '+') || hasTopLevelOperator(expr, '-')) {
    const parts = splitAdditive(expr);
    let total = 0;
    for (const part of parts) {
      const val = evaluateExpression(part.expr, sheet, allSheets, callStack);
      const num = Number(val);
      if (isNaN(num)) throw new Error('#VALOR!');
      if (part.sign === '+') total += num;
      else total -= num;
    }
    return total;
  }

  // Handle arithmetic: *, /
  if (hasTopLevelOperator(expr, '*') || hasTopLevelOperator(expr, '/')) {
    const parts = splitMultiplicative(expr);
    let total = 1;
    for (let i = 0; i < parts.length; i++) {
      const val = evaluateExpression(parts[i].expr, sheet, allSheets, callStack);
      const num = Number(val);
      if (isNaN(num)) throw new Error('#VALOR!');
      if (i === 0) {
        total = num;
      } else {
        if (parts[i].op === '*') {
          total *= num;
        } else {
          if (num === 0) throw new Error('#DIV/0!');
          total /= num;
        }
      }
    }
    return total;
  }

  // Handle string literals "Hello"
  if (expr.startsWith('"') && expr.endsWith('"') && expr.length >= 2) {
    return expr.substring(1, expr.length - 1);
  }

  // Handle boolean literals
  if (expr.toUpperCase() === 'VERDADEIRO' || expr.toUpperCase() === 'TRUE') return true;
  if (expr.toUpperCase() === 'FALSO' || expr.toUpperCase() === 'FALSE') return false;

  // Handle sheet qualified reference "Sheet2!A1" or "'Acompanhamento de Pagamentos'!A1:B10" or "Acompanhamento!B5"

  if (expr.includes('!')) {
    const exclamationIdx = expr.indexOf('!');
    const rawSheetName = expr.substring(0, exclamationIdx).trim().replace(/^'|'$/g, '');
    const cellRef = expr.substring(exclamationIdx + 1).trim();

    const clean = rawSheetName.toUpperCase().replace(/\.+$/, '');
    const targetSheet = allSheets.find(s => {
      const sName = s.name.toUpperCase();
      return sName === rawSheetName.toUpperCase() || sName.startsWith(clean) || clean.startsWith(sName);
    }) || sheet;

    return evaluateExpression(cellRef, targetSheet, allSheets, callStack);
  }


  // Handle cell range "A1:B10"
  const range = parseRangeAddress(expr, sheet.rowCount);
  if (range && (range.startRow !== range.endRow || range.startCol !== range.endCol)) {
    return getRangeValues(sheet, range);
  }

  // Handle single cell "A1"
  const cellPos = parseCellAddress(expr);
  if (cellPos) {
    const cellKey = cellPosToKey(cellPos.row, cellPos.col);
    if (callStack.has(`${sheet.id}:${cellKey}`)) {
      throw new Error('#CIRCULAR!');
    }
    const cell = sheet.data[cellKey];
    if (!cell) return 0;
    if (cell.raw && cell.raw.startsWith('=')) {
      const nextStack = new Set(callStack);
      nextStack.add(`${sheet.id}:${cellKey}`);
      return evaluateFormula(cell.raw, sheet, allSheets, nextStack);
    }
    const num = parseNumberSafely(cell.value ?? cell.raw);
    return num !== null ? num : (cell.value ?? cell.raw ?? 0);
  }

  // Number literal
  const num = parseNumberSafely(expr);
  if (num !== null) return num;

  return expr;
}

// Function Execution Handler
function executeFunction(
  name: string,
  args: string[],
  sheet: Sheet,
  allSheets: Sheet[],
  callStack: Set<string>
): any {
  // Alias mapping
  const func = name.toUpperCase();

  // PROCX / XLOOKUP
  if (func === 'PROCX' || func === 'XLOOKUP') {
    if (args.length < 3) throw new Error('#N/D');
    const lookupVal = evaluateExpression(args[0], sheet, allSheets, callStack);
    
    // Evaluate lookup array (supports cross-sheet 'Acompanhamento'!A:A)
    const lookupRes = resolveRangeAndValues(args[1], sheet, allSheets);
    const returnRes = resolveRangeAndValues(args[2], sheet, allSheets);
    const ifNotFound = args[3] !== undefined ? evaluateExpression(args[3], sheet, allSheets, callStack) : '#N/D';

    if (!lookupRes || !returnRes) throw new Error('#VALOR!');

    const lookupItems = lookupRes.flatValues;
    const returnItems = returnRes.flatValues;

    let matchIndex = -1;

    for (let i = 0; i < lookupItems.length; i++) {
      const item = lookupItems[i];
      if (item === null || item === undefined) continue;
      if (valuesMatch(item, lookupVal)) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex >= 0 && matchIndex < returnItems.length) {
      return returnItems[matchIndex];
    }
    return ifNotFound;
  }

  // PROCV / VLOOKUP
  if (func === 'PROCV' || func === 'VLOOKUP') {
    if (args.length < 3) throw new Error('#VALOR!');
    const lookupVal = evaluateExpression(args[0], sheet, allSheets, callStack);
    const tableRes = resolveRangeAndValues(args[1], sheet, allSheets);
    if (!tableRes) throw new Error('#VALOR!');
    const colIdx = Number(evaluateExpression(args[2], sheet, allSheets, callStack));
    if (isNaN(colIdx) || colIdx < 1 || colIdx > (tableRes.range.endCol - tableRes.range.startCol + 1)) {
      throw new Error('#REF!');
    }

    const matrix = tableRes.matrixValues;
    for (let r = 0; r < matrix.length; r++) {
      const firstColVal = matrix[r][0];
      if (firstColVal !== null && firstColVal !== undefined && valuesMatch(firstColVal, lookupVal)) {
        return matrix[r][colIdx - 1];
      }
    }
    throw new Error('#N/D');
  }

  // SEERRO / IFERROR
  if (func === 'SEERRO' || func === 'IFERROR') {
    if (args.length < 2) throw new Error('#VALOR!');
    try {
      const val = evaluateExpression(args[0], sheet, allSheets, callStack);
      if (typeof val === 'string' && val.startsWith('#')) {
        return evaluateExpression(args[1], sheet, allSheets, callStack);
      }
      if (typeof val === 'number' && isNaN(val)) {
        return evaluateExpression(args[1], sheet, allSheets, callStack);
      }
      return val;
    } catch {
      return evaluateExpression(args[1], sheet, allSheets, callStack);
    }
  }

  // ÍNDICE / INDEX
  if (func === 'ÍNDICE' || func === 'INDICE' || func === 'INDEX') {
    if (args.length < 2) throw new Error('#VALOR!');
    const resolved = resolveRangeAndValues(args[0], sheet, allSheets);
    if (!resolved) throw new Error('#REF!');
    const rowNum = Number(evaluateExpression(args[1], sheet, allSheets, callStack));
    const colNum = args[2] ? Number(evaluateExpression(args[2], sheet, allSheets, callStack)) : 1;

    if (isNaN(rowNum) || rowNum < 1) throw new Error('#REF!');
    const targetRow = resolved.range.startRow + (rowNum - 1);
    const targetCol = resolved.range.startCol + (colNum - 1);

    if (targetRow > resolved.range.endRow || targetCol > resolved.range.endCol) throw new Error('#REF!');
    return getCellValue(resolved.targetSheet, targetRow, targetCol);
  }

  // CORRESP / MATCH
  if (func === 'CORRESP' || func === 'MATCH') {
    if (args.length < 2) throw new Error('#VALOR!');
    const lookupVal = evaluateExpression(args[0], sheet, allSheets, callStack);
    const resolved = resolveRangeAndValues(args[1], sheet, allSheets);
    if (!resolved) throw new Error('#VALOR!');

    const items = resolved.flatValues;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item !== null && item !== undefined && valuesMatch(item, lookupVal)) {
        return i + 1; // 1-based index
      }
    }
    throw new Error('#N/D');
  }

  // SOMARPRODUTO / SUMPRODUCT
  if (func === 'SOMARPRODUTO' || func === 'SUMPRODUCT') {
    if (args.length === 0) return 0;
    const arrays: number[][] = [];
    for (const arg of args) {
      const resolved = resolveRangeAndValues(arg, sheet, allSheets);
      if (resolved) {
        const vals = resolved.flatValues.map(v => {
          const n = parseNumberSafely(v);
          return n !== null ? n : 0;
        });
        arrays.push(vals);
      } else {
        const val = evaluateExpression(arg, sheet, allSheets, callStack);
        arrays.push([Number(val) || 0]);
      }
    }

    if (arrays.length === 0) return 0;
    const len = arrays[0].length;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      let prod = 1;
      for (const arr of arrays) {
        prod *= arr[i] !== undefined ? arr[i] : 0;
      }
      sum += prod;
    }
    return sum;
  }

  // MÉDIA.PONDERADA / WEIGHTED.AVERAGE
  if (func === 'MÉDIA.PONDERADA' || func === 'MEDIA.PONDERADA' || func === 'WEIGHTED.AVERAGE') {
    if (args.length < 2) throw new Error('#VALOR!');
    const valRes = resolveRangeAndValues(args[0], sheet, allSheets);
    const weightRes = resolveRangeAndValues(args[1], sheet, allSheets);

    if (!valRes || !weightRes) throw new Error('#VALOR!');
    const vals = valRes.flatValues.map(v => parseNumberSafely(v) ?? 0);
    const weights = weightRes.flatValues.map(w => parseNumberSafely(w) ?? 0);

    let sumProd = 0;
    let sumWeight = 0;
    const minLen = Math.min(vals.length, weights.length);

    for (let i = 0; i < minLen; i++) {
      sumProd += vals[i] * weights[i];
      sumWeight += weights[i];
    }

    if (sumWeight === 0) throw new Error('#DIV/0!');
    return sumProd / sumWeight;
  }

  // MÉDIASE / AVERAGEIF
  if (func === 'MÉDIASE' || func === 'MEDIASE' || func === 'AVERAGEIF') {
    if (args.length < 2) throw new Error('#VALOR!');
    const rangeRes = resolveRangeAndValues(args[0], sheet, allSheets);
    if (!rangeRes) throw new Error('#VALOR!');
    const criteriaRaw = evaluateExpression(args[1], sheet, allSheets, callStack);
    const criteriaStr = String(criteriaRaw).trim();

    const avgRes = args[2] ? resolveRangeAndValues(args[2], sheet, allSheets) : rangeRes;
    const rangeVals = rangeRes.flatValues;
    const avgVals = avgRes ? avgRes.flatValues : rangeVals;

    let total = 0;
    let count = 0;
    for (let i = 0; i < rangeVals.length; i++) {
      const v = rangeVals[i];
      if (v === null || v === undefined) continue;

      let match = false;
      const numV = parseNumberSafely(v);

      if (criteriaStr.startsWith('>=')) {
        const target = parseFloat(criteriaStr.substring(2).replace(',', '.'));
        match = numV !== null && numV >= target;
      } else if (criteriaStr.startsWith('<=')) {
        const target = parseFloat(criteriaStr.substring(2).replace(',', '.'));
        match = numV !== null && numV <= target;
      } else if (criteriaStr.startsWith('<>')) {
        match = !valuesMatch(v, criteriaStr.substring(2));
      } else if (criteriaStr.startsWith('>')) {
        const target = parseFloat(criteriaStr.substring(1).replace(',', '.'));
        match = numV !== null && numV > target;
      } else if (criteriaStr.startsWith('<')) {
        const target = parseFloat(criteriaStr.substring(1).replace(',', '.'));
        match = numV !== null && numV < target;
      } else if (criteriaStr.startsWith('=')) {
        match = valuesMatch(v, criteriaStr.substring(1));
      } else {
        match = valuesMatch(v, criteriaRaw);
      }

      if (match && avgVals[i] !== undefined) {
        const n = parseNumberSafely(avgVals[i], true);
        if (n !== null) {
          total += n;
          count++;
        }
      }
    }
    if (count === 0) throw new Error('#DIV/0!');
    return total / count;
  }

  // FILTRO / FILTER
  if (func === 'FILTRO' || func === 'FILTER') {
    if (args.length < 2) throw new Error('#VALOR!');
    const returnRes = resolveRangeAndValues(args[0], sheet, allSheets);
    if (!returnRes) throw new Error('#VALOR!');

    const ifEmpty = args[2] !== undefined ? evaluateExpression(args[2], sheet, allSheets, callStack) : 'Nenhum';
    const conditionExpr = args[1].trim();

    const compMatch = conditionExpr.match(/^(.*?)(<=|>=|<>|=|<|>)(.*)$/);
    if (!compMatch) throw new Error('#VALOR!');

    const leftRangeStr = compMatch[1].trim();
    const op = compMatch[2];
    const rightValExpr = compMatch[3].trim();

    const condRes = resolveRangeAndValues(leftRangeStr, sheet, allSheets);
    if (!condRes) throw new Error('#VALOR!');

    const targetVal = evaluateExpression(rightValExpr, sheet, allSheets, callStack);
    const condVals = condRes.flatValues;
    const returnVals = returnRes.flatValues;

    const matchedItems: any[] = [];
    for (let i = 0; i < condVals.length; i++) {
      const v = condVals[i];
      if (v === null || v === undefined) continue;

      let match = false;
      const numV = parseNumberSafely(v);

      if (op === '=') match = valuesMatch(v, targetVal);
      else if (op === '<>') match = !valuesMatch(v, targetVal);
      else if (op === '>') {
        const targetNum = typeof targetVal === 'number' ? targetVal : parseNumberSafely(targetVal);
        match = numV !== null && targetNum !== null && numV > targetNum;
      } else if (op === '<') {
        const targetNum = typeof targetVal === 'number' ? targetVal : parseNumberSafely(targetVal);
        match = numV !== null && targetNum !== null && numV < targetNum;
      } else if (op === '>=') {
        const targetNum = typeof targetVal === 'number' ? targetVal : parseNumberSafely(targetVal);
        match = numV !== null && targetNum !== null && numV >= targetNum;
      } else if (op === '<=') {
        const targetNum = typeof targetVal === 'number' ? targetVal : parseNumberSafely(targetVal);
        match = numV !== null && targetNum !== null && numV <= targetNum;
      }

      if (match && returnVals[i] !== undefined) {
        matchedItems.push(returnVals[i]);
      }
    }

    if (matchedItems.length === 0) return ifEmpty;
    return matchedItems.length === 1 ? matchedItems[0] : matchedItems;
  }

  // UNIRTEXTO / TEXTJOIN
  if (func === 'UNIRTEXTO' || func === 'TEXTJOIN') {
    if (args.length < 3) throw new Error('#VALOR!');
    const delimiter = String(evaluateExpression(args[0], sheet, allSheets, callStack));
    const ignoreEmpty = Boolean(evaluateExpression(args[1], sheet, allSheets, callStack));

    const textItems: string[] = [];
    for (let i = 2; i < args.length; i++) {
      const resolved = resolveRangeAndValues(args[i], sheet, allSheets);
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
        const val = evaluateExpression(args[i], sheet, allSheets, callStack);
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
  }

  // CONCATENAR / CONCAT
  if (func === 'CONCATENAR' || func === 'CONCAT') {
    const texts: string[] = [];
    for (const arg of args) {
      const resolved = resolveRangeAndValues(arg, sheet, allSheets);
      if (resolved) {
        resolved.flatValues.forEach(v => {
          if (v !== null && v !== undefined) texts.push(String(v));
        });
      } else {
        const v = evaluateExpression(arg, sheet, allSheets, callStack);
        if (v !== null && v !== undefined) texts.push(String(v));
      }
    }
    return texts.join('');
  }

  // SOMA / SUM
  if (func === 'SOMA' || func === 'SUM') {
    let sum = 0;
    for (const arg of args) {
      const resolved = resolveRangeAndValues(arg, sheet, allSheets);
      if (resolved) {
        resolved.flatValues.forEach(v => {
          const n = parseNumberSafely(v, true);
          if (n !== null) sum += n;
        });
      } else {
        const v = evaluateExpression(arg, sheet, allSheets, callStack);
        const n = parseNumberSafely(v, true);
        if (n !== null) sum += n;
      }
    }
    return sum;
  }

  // MÉDIA / AVERAGE
  if (func === 'MÉDIA' || func === 'MEDIA' || func === 'AVERAGE') {
    let sum = 0;
    let count = 0;
    for (const arg of args) {
      const resolved = resolveRangeAndValues(arg, sheet, allSheets);
      if (resolved) {
        resolved.flatValues.forEach(v => {
          const n = parseNumberSafely(v, true);
          if (n !== null) {
            sum += n;
            count++;
          }
        });
      } else {
        const v = evaluateExpression(arg, sheet, allSheets, callStack);
        const n = parseNumberSafely(v, true);
        if (n !== null) {
          sum += n;
          count++;
        }
      }
    }
    if (count === 0) throw new Error('#DIV/0!');
    return sum / count;
  }

  // CONT.SE / COUNTIF
  if (func === 'CONT.SE' || func === 'CONTAR.SE' || func === 'COUNTIF') {
    if (args.length < 2) throw new Error('#VALOR!');
    const resolved = resolveRangeAndValues(args[0], sheet, allSheets);
    if (!resolved) throw new Error('#VALOR!');
    const criteriaRaw = evaluateExpression(args[1], sheet, allSheets, callStack);
    const criteriaStr = String(criteriaRaw).trim();

    const vals = resolved.flatValues;
    let count = 0;

    for (const v of vals) {
      if (v === null || v === undefined) continue;
      const numV = parseNumberSafely(v);

      if (criteriaStr.startsWith('>=')) {
        const num = parseFloat(criteriaStr.substring(2).replace(',', '.'));
        if (numV !== null && numV >= num) count++;
      } else if (criteriaStr.startsWith('<=')) {
        const num = parseFloat(criteriaStr.substring(2).replace(',', '.'));
        if (numV !== null && numV <= num) count++;
      } else if (criteriaStr.startsWith('<>')) {
        if (!valuesMatch(v, criteriaStr.substring(2))) count++;
      } else if (criteriaStr.startsWith('>')) {
        const num = parseFloat(criteriaStr.substring(1).replace(',', '.'));
        if (numV !== null && numV > num) count++;
      } else if (criteriaStr.startsWith('<')) {
        const num = parseFloat(criteriaStr.substring(1).replace(',', '.'));
        if (numV !== null && numV < num) count++;
      } else if (criteriaStr.startsWith('=')) {
        if (valuesMatch(v, criteriaStr.substring(1))) count++;
      } else {
        if (valuesMatch(v, criteriaRaw)) count++;
      }
    }
    return count;
  }

  // SOMASE / SUMIF
  if (func === 'SOMASE' || func === 'SUMIF') {
    if (args.length < 2) throw new Error('#VALOR!');
    const rangeRes = resolveRangeAndValues(args[0], sheet, allSheets);
    if (!rangeRes) throw new Error('#VALOR!');
    const criteriaRaw = evaluateExpression(args[1], sheet, allSheets, callStack);
    const criteriaStr = String(criteriaRaw).trim();

    const sumRes = args[2] ? resolveRangeAndValues(args[2], sheet, allSheets) : rangeRes;
    const rangeVals = rangeRes.flatValues;
    const sumVals = sumRes ? sumRes.flatValues : rangeVals;

    let total = 0;
    for (let i = 0; i < rangeVals.length; i++) {
      const v = rangeVals[i];
      if (v === null || v === undefined) continue;
      let match = false;
      const numV = parseNumberSafely(v);

      if (criteriaStr.startsWith('>=')) {
        const num = parseFloat(criteriaStr.substring(2).replace(',', '.'));
        match = numV !== null && numV >= num;
      } else if (criteriaStr.startsWith('<=')) {
        const num = parseFloat(criteriaStr.substring(2).replace(',', '.'));
        match = numV !== null && numV <= num;
      } else if (criteriaStr.startsWith('<>')) {
        match = !valuesMatch(v, criteriaStr.substring(2));
      } else if (criteriaStr.startsWith('>')) {
        const num = parseFloat(criteriaStr.substring(1).replace(',', '.'));
        match = numV !== null && numV > num;
      } else if (criteriaStr.startsWith('<')) {
        const num = parseFloat(criteriaStr.substring(1).replace(',', '.'));
        match = numV !== null && numV < num;
      } else if (criteriaStr.startsWith('=')) {
        match = valuesMatch(v, criteriaStr.substring(1));
      } else {
        match = valuesMatch(v, criteriaRaw);
      }

      if (match && sumVals[i] !== undefined) {
        const n = parseNumberSafely(sumVals[i], true);
        if (n !== null) total += n;
      }
    }
    return total;
  }

  // CONT.VALORES / COUNTA
  if (func === 'CONT.VALORES' || func === 'CONTAR.VALORES' || func === 'COUNTA') {
    let count = 0;
    for (const arg of args) {
      const resolved = resolveRangeAndValues(arg, sheet, allSheets);
      if (resolved) {
        resolved.flatValues.forEach(v => {
          if (v !== null && v !== undefined && v !== '') count++;
        });
      } else {
        const v = evaluateExpression(arg, sheet, allSheets, callStack);
        if (v !== null && v !== undefined && v !== '') count++;
      }
    }
    return count;
  }

  // MÁXIMO / MAX
  if (func === 'MÁXIMO' || func === 'MAXIMO' || func === 'MAX') {
    let max = -Infinity;
    for (const arg of args) {
      const resolved = resolveRangeAndValues(arg, sheet, allSheets);
      if (resolved) {
        resolved.flatValues.forEach(v => {
          const n = parseNumberSafely(v);
          if (n !== null && n > max) max = n;
        });
      } else {
        const v = Number(evaluateExpression(arg, sheet, allSheets, callStack));
        if (!isNaN(v) && v > max) max = v;
      }
    }
    return max === -Infinity ? 0 : max;
  }

  // MÍNIMO / MIN
  if (func === 'MÍNIMO' || func === 'MINIMO' || func === 'MIN') {
    let min = Infinity;
    for (const arg of args) {
      const resolved = resolveRangeAndValues(arg, sheet, allSheets);
      if (resolved) {
        resolved.flatValues.forEach(v => {
          const n = parseNumberSafely(v);
          if (n !== null && n < min) min = n;
        });
      } else {
        const v = Number(evaluateExpression(arg, sheet, allSheets, callStack));
        if (!isNaN(v) && v < min) min = v;
      }
    }
    return min === Infinity ? 0 : min;
  }


  // SE / IF
  if (func === 'SE' || func === 'IF') {
    if (args.length < 2) throw new Error('#VALOR!');
    const cond = evaluateExpression(args[0], sheet, allSheets, callStack);
    if (cond) {
      return evaluateExpression(args[1], sheet, allSheets, callStack);
    } else {
      return args[2] ? evaluateExpression(args[2], sheet, allSheets, callStack) : false;
    }
  }

  // MAIÚSCULA / UPPER
  if (func === 'MAIÚSCULA' || func === 'MAIUSCULA' || func === 'UPPER') {
    const val = evaluateExpression(args[0] || '', sheet, allSheets, callStack);
    return String(val ?? '').toUpperCase();
  }

  // MINÚSCULA / LOWER
  if (func === 'MINÚSCULA' || func === 'MINUSCULA' || func === 'LOWER') {
    const val = evaluateExpression(args[0] || '', sheet, allSheets, callStack);
    return String(val ?? '').toLowerCase();
  }

  // PRI.MAIÚSCULA / PROPER
  if (func === 'PRI.MAIÚSCULA' || func === 'PRI.MAIUSCULA' || func === 'PROPER') {
    const val = String(evaluateExpression(args[0] || '', sheet, allSheets, callStack) ?? '');
    return val.replace(/\b\w/g, c => c.toUpperCase());
  }

  // ARRED / ROUND
  if (func === 'ARRED' || func === 'ROUND') {
    const val = Number(evaluateExpression(args[0], sheet, allSheets, callStack));
    const decimals = args[1] ? Number(evaluateExpression(args[1], sheet, allSheets, callStack)) : 0;
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  // HOJE / TODAY
  if (func === 'HOJE' || func === 'TODAY') {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }

  throw new Error('#NOME?');
}

// Split formula arguments handling nested brackets, quotes and Portuguese semicolon/comma
function splitFormulaArguments(raw: string): string[] {
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
function hasTopLevelOperator(expr: string, op: string): boolean {
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

function splitByTopLevelOperator(expr: string, op: string): string[] {
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

function splitAdditive(expr: string): { expr: string; sign: '+' | '-' }[] {
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

function splitMultiplicative(expr: string): { expr: string; op: '*' | '/' }[] {
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

/**
 * Helper to convert any value into total seconds
 * Supports:
 * - Numbers: 60 (as min = 3600s, as hrs = 216000s)
 * - Strings: "60", "60m", "60 min", "1h 30m", "01:00:00", "01:00"
 */
export function valueToSeconds(value: any, specificMode?: 'hours' | 'minutes' | 'seconds' | 'auto'): number {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'string') {
    const trimmed = value.trim();

    // Check HH:MM:SS or HH:MM
    const timeMatch = trimmed.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10) || 0;
      const m = parseInt(timeMatch[2], 10) || 0;
      const s = parseInt(timeMatch[3], 10) || 0;
      return h * 3600 + m * 60 + s;
    }

    // Check Duration strings like "1h 30m", "60min", "60m", "45s", "120 seg"
    const durMatch = trimmed.match(/^(?:(\d+)\s*h(?:oras?)?)?\s*(?:(\d+)\s*m(?:in(?:utos?)?)?)?\s*(?:(\d+)\s*s(?:eg(?:undos?)?)?)?$/i);
    if (durMatch && (durMatch[1] || durMatch[2] || durMatch[3])) {
      const h = parseInt(durMatch[1] || '0', 10);
      const m = parseInt(durMatch[2] || '0', 10);
      const s = parseInt(durMatch[3] || '0', 10);
      return h * 3600 + m * 60 + s;
    }
  }

  const num = parseNumberSafely(value);
  if (num === null) return 0;

  if (specificMode === 'hours') return Math.round(num * 3600);
  if (specificMode === 'minutes') return Math.round(num * 60);
  if (specificMode === 'seconds') return Math.round(num);

  // Auto inference:
  // If Excel fraction of day (e.g. 0.041666 = 1h, 0.5 = 12h, 0.137106 -> 03:17:26)
  if (num > 0 && num < 1) return Math.round(num * 86400);

  // If numbers > 1440 (likely seconds, e.g. 11846 -> 03:17:26, 3600 -> 01:00:00)
  if (num > 1440) return Math.round(num);

  // If 0..24 (e.g. 1 -> 1h = 3600s = 01:00:00, 2 -> 2h = 02:00:00, 3.29 -> 03:17:26)
  if (num >= 0 && num <= 24) return Math.round(num * 3600);

  // If 25..1440 (likely minutes, e.g. 60 -> 60min = 3600s = 01:00:00, 90 -> 01:30:00)
  if (num > 24 && num <= 1440) return Math.round(num * 60);

  return Math.round(num);
}


/**
 * Formats total seconds into desired time string
 */
export function formatSecondsToTime(
  totalSeconds: number,
  formatType: 'time' | 'time_hh_mm' | 'time_hh_mm_ss' | 'time_duration' | 'time_minutes_label'
): string {
  const isNeg = totalSeconds < 0;
  const absSec = Math.abs(totalSeconds);

  const hours = Math.floor(absSec / 3600);
  const minutes = Math.floor((absSec % 3600) / 60);
  const seconds = Math.floor(absSec % 60);

  const pad = (n: number) => String(n).padStart(2, '0');

  if (formatType === 'time_minutes_label') {
    // Total in minutes (e.g. 60m, 15m, 120m, 0m)
    const totalMin = Math.round(absSec / 60);
    return `${isNeg ? '-' : ''}${totalMin}m`;
  }

  if (formatType === 'time_hh_mm') {
    return `${isNeg ? '-' : ''}${pad(hours)}:${pad(minutes)}`;
  }

  if (formatType === 'time_duration') {
    if (hours > 0) {
      return `${isNeg ? '-' : ''}${hours}h ${pad(minutes)}m${seconds > 0 ? ` ${pad(seconds)}s` : ''}`;
    }
    return `${isNeg ? '-' : ''}${minutes}m${seconds > 0 ? ` ${pad(seconds)}s` : ''}`;
  }


  // Default 'time' or 'time_hh_mm_ss' -> HH:MM:SS
  return `${isNeg ? '-' : ''}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Format cell value for display
export function formatCellValue(value: any, format?: CellFormat): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' && value.startsWith('#')) return value; // Error flag

  const type = format?.type || 'general';
  const decimals = format?.decimals !== undefined ? format.decimals : 2;

  // Explicit TEXT format
  if (type === 'text') {
    let text = String(value);
    if (format?.textCase === 'uppercase') text = text.toUpperCase();
    else if (format?.textCase === 'lowercase') text = text.toLowerCase();
    else if (format?.textCase === 'capitalize') text = text.replace(/\b\w/g, c => c.toUpperCase());
    return text;
  }

  // Time & Duration formats
  if (
    type === 'time' ||
    type === 'time_hh_mm' ||
    type === 'time_hh_mm_ss' ||
    type === 'time_duration' ||
    type === 'time_minutes_label'
  ) {
    const totalSec = valueToSeconds(value, 'auto');
    return formatSecondsToTime(totalSec, type);
  }
  if (type === 'time_from_decimal_hours') {
    const totalSec = valueToSeconds(value, 'hours');
    return formatSecondsToTime(totalSec, 'time_hh_mm_ss');
  }
  if (type === 'time_from_minutes') {
    const totalSec = valueToSeconds(value, 'minutes');
    return formatSecondsToTime(totalSec, 'time_hh_mm_ss');
  }

  if (type === 'time_from_seconds') {
    const totalSec = valueToSeconds(value, 'seconds');
    return formatSecondsToTime(totalSec, 'time_hh_mm_ss');
  }

  const numVal = parseNumberSafely(value);


  if (numVal !== null) {
    if (type === 'currency') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(numVal);
    }
    if (type === 'currency_usd') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(numVal);
    }
    if (type === 'currency_eur') {
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(numVal);
    }
    if (type === 'percentage') {
      const pct = numVal > 1 && numVal <= 100 ? numVal : numVal * 100;
      return `${pct.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}%`;
    }
    if (type === 'number') {
      return numVal.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    if (type === 'date') {
      const d = new Date(numVal > 10000000000 ? numVal : (numVal - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('pt-BR');
      }
    }
  }

  let text = String(value);
  if (format?.textCase === 'uppercase') text = text.toUpperCase();
  else if (format?.textCase === 'lowercase') text = text.toLowerCase();
  else if (format?.textCase === 'capitalize') text = text.replace(/\b\w/g, c => c.toUpperCase());

  return text;
}



// Recalculate whole sheet with multi-pass convergence
export function recalculateSheet(sheet: Sheet, allSheets: Sheet[] = [sheet]): Sheet {
  const updatedData = { ...sheet.data };
  const workingSheet: Sheet = { ...sheet, data: updatedData };
  const updatedAllSheets = allSheets.map(s => (s.id === sheet.id ? workingSheet : s));

  // Perform up to 3 passes to resolve dependent formulas (e.g. SOMA of computed columns)
  for (let pass = 0; pass < 3; pass++) {
    let hasChanges = false;
    for (const [key, cell] of Object.entries(updatedData)) {
      if (cell.raw && typeof cell.raw === 'string' && cell.raw.startsWith('=')) {
        try {
          const val = evaluateFormula(cell.raw, workingSheet, updatedAllSheets);
          if (updatedData[key]?.value !== val) {
            hasChanges = true;
            updatedData[key] = {
              ...cell,
              value: val,
              error: typeof val === 'string' && val.startsWith('#') ? val : null,
            };
          }
        } catch (err: any) {
          updatedData[key] = {
            ...cell,
            value: '#ERRO!',
            error: err.message || '#ERRO!',
          };
        }
      }
    }
    if (!hasChanges) break;
  }
  return { ...sheet, data: updatedData };
}
