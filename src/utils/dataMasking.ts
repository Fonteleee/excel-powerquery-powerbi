import { Sheet } from '../types/spreadsheet';
import { cellPosToKey } from '../engine/formulaParser';

export interface MaskedPayload {
  sanitizedPrompt: string;
  sanitizedContext: string;
  tokenCount: number;
  maskedEntities: { token: string; original: string; type: string }[];
}

export class DataMaskingEngine {
  private tokenMap: Map<string, string> = new Map(); // token -> original
  private reverseMap: Map<string, string> = new Map(); // original -> token
  private counters: { [prefix: string]: number } = {
    VENDEDOR: 1,
    CLIENTE: 1,
    EMPRESA: 1,
    EMAIL: 1,
    CPF: 1,
    DOCUMENTO: 1,
    TELEFONE: 1,
    VALOR: 1,
    PRODUTO: 1,
    CIDADE: 1,
  };

  constructor() {
    this.reset();
  }

  public reset() {
    this.tokenMap.clear();
    this.reverseMap.clear();
    this.counters = {
      VENDEDOR: 1,
      CLIENTE: 1,
      EMPRESA: 1,
      EMAIL: 1,
      CPF: 1,
      DOCUMENTO: 1,
      TELEFONE: 1,
      VALOR: 1,
      PRODUTO: 1,
      CIDADE: 1,
    };
  }

  private getOrCreateToken(original: string, prefix: string): string {
    const trimmed = original.trim();
    if (!trimmed) return original;

    if (this.reverseMap.has(trimmed)) {
      return this.reverseMap.get(trimmed)!;
    }

    const token = `[${prefix}_${this.counters[prefix] || 1}]`;
    this.counters[prefix] = (this.counters[prefix] || 1) + 1;
    this.tokenMap.set(token, trimmed);
    this.reverseMap.set(trimmed, token);
    return token;
  }

  /**
   * Identifies and masks sensitive patterns (Emails, CPFs, Phones, Currency, Names)
   */
  public maskText(text: string): string {
    if (!text) return text;
    let masked = text;

    // 1. Email pattern
    masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, match => {
      return this.getOrCreateToken(match, 'EMAIL');
    });

    // 2. CPF / CNPJ pattern
    masked = masked.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, match => {
      return this.getOrCreateToken(match, 'CPF');
    });
    masked = masked.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, match => {
      return this.getOrCreateToken(match, 'DOCUMENTO');
    });

    // 3. Phone pattern
    masked = masked.replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}\b/g, match => {
      if (match.length >= 8) {
        return this.getOrCreateToken(match, 'TELEFONE');
      }
      return match;
    });

    // 4. Currency pattern (e.g. R$ 32.300,00 or $1,250.00)
    masked = masked.replace(/(?:R\$\s*|\$\s*)\d{1,3}(?:\.\d{3})*(?:,\d{2})?/gi, match => {
      return this.getOrCreateToken(match, 'VALOR');
    });

    return masked;
  }

  /**
   * Sanitizes spreadsheet structure and sample rows into a safe schema context
   */
  public prepareSheetContext(sheet: Sheet, maxSampleRows = 35): string {
    const colCount = Math.min(sheet.colCount, 20);
    const rowCount = Math.min(sheet.rowCount, 60);

    // Extract headers (Row 0 or 1)
    const headers: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const colLetter = String.fromCharCode(65 + c);
      const cell = sheet.data[cellPosToKey(0, c)] || sheet.data[cellPosToKey(1, c)];
      const title = cell?.value ? String(cell.value) : `Coluna ${colLetter}`;
      headers.push(`${colLetter}: "${title}"`);
    }

    // Extract sample data rows masked
    const sampleRows: string[] = [];
    for (let r = 1; r <= Math.min(rowCount, maxSampleRows + 1); r++) {
      const rowValues: string[] = [];
      let hasData = false;
      for (let c = 0; c < colCount; c++) {
        const cell = sheet.data[cellPosToKey(r, c)];
        if (cell && cell.value !== null && cell.value !== undefined && cell.value !== '') {
          hasData = true;
          const maskedVal = this.maskText(String(cell.value));
          rowValues.push(maskedVal);
        } else {
          rowValues.push('');
        }
      }
      if (hasData) {
        sampleRows.push(`Linha ${r + 1}: [${rowValues.join(', ')}]`);
      }
    }

    return `ESTRUTURA E DADOS DA PLANILHA ("${sheet.name}"):
- Total de Linhas: ${sheet.rowCount}
- Colunas Disponíveis:
  ${headers.join('\n  ')}

TABELA DE DADOS (DADOS SENSÍVEIS ANONIMIZADOS COM TOKENS):
${sampleRows.join('\n')}`;
  }


  /**
   * Masks both the user question and the spreadsheet context
   */
  public sanitizePayload(userPrompt: string, sheet?: Sheet): MaskedPayload {
    this.reset();

    let sanitizedPrompt = this.maskText(userPrompt);
    let sanitizedContext = '';

    if (sheet) {
      sanitizedContext = this.prepareSheetContext(sheet);
      // Re-mask prompt in case names mentioned in sheet appear in prompt
      for (const [original, token] of this.reverseMap.entries()) {
        const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        sanitizedPrompt = sanitizedPrompt.replace(new RegExp(escaped, 'gi'), token);
      }
    }

    const maskedEntities: { token: string; original: string; type: string }[] = [];
    for (const [token, original] of this.tokenMap.entries()) {
      const type = token.replace(/\[([A-Z]+)_\d+\]/, '$1');
      maskedEntities.push({ token, original, type });
    }

    return {
      sanitizedPrompt,
      sanitizedContext,
      tokenCount: maskedEntities.length,
      maskedEntities,
    };
  }

  /**
   * Reconstructs the AI response by restoring original values from tokens
   */
  public unmaskText(aiResponse: string): string {
    if (!aiResponse) return aiResponse;
    let restored = aiResponse;

    for (const [token, original] of this.tokenMap.entries()) {
      restored = restored.replaceAll(token, original);
    }

    return restored;
  }
}

export const globalMaskingEngine = new DataMaskingEngine();
