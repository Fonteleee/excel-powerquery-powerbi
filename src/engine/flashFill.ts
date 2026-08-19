import { Sheet } from '../types/spreadsheet';
import { getCellValue, cellPosToKey } from './formulaParser';


export interface FlashFillPrediction {
  targetCol: number;
  startRow: number;
  endRow: number;
  patternDescription: string;
  predictedValues: { row: number; value: string }[];
}

export function detectFlashFill(
  sheet: Sheet,
  targetCol: number,
  targetRow: number
): FlashFillPrediction | null {
  // Check adjacent left columns (targetCol - 1, targetCol - 2) for source data
  const sourceCol = targetCol - 1;
  if (sourceCol < 0) return null;

  const targetKey = cellPosToKey(targetRow, targetCol);
  const targetCell = sheet.data[targetKey];
  const userExample = targetCell ? String(targetCell.raw || targetCell.value || '').trim() : '';
  if (!userExample) return null;

  const sourceKey = cellPosToKey(targetRow, sourceCol);
  const sourceCell = sheet.data[sourceKey];
  const sourceVal = sourceCell ? String(sourceCell.raw || sourceCell.value || '').trim() : '';
  if (!sourceVal) return null;

  // Find pattern
  const pattern = inferPattern(sourceVal, userExample);
  if (!pattern) return null;

  // Predict values for all subsequent non-empty rows in source column
  const predictions: { row: number; value: string }[] = [];
  let r = targetRow + 1;
  while (r < sheet.rowCount) {
    const sVal = getCellValue(sheet, r, sourceCol);
    if (sVal === null || sVal === undefined || sVal === '') break;
    const transformed = applyPattern(String(sVal), pattern);
    predictions.push({ row: r, value: transformed });
    r++;
  }

  if (predictions.length === 0) return null;

  return {
    targetCol,
    startRow: targetRow + 1,
    endRow: r - 1,
    patternDescription: pattern.description,
    predictedValues: predictions,
  };
}

interface PatternRule {
  type:
    | 'first_word'
    | 'last_word'
    | 'email_username'
    | 'email_domain'
    | 'mask_cpf'
    | 'mask_phone'
    | 'mask_date_iso_to_br'
    | 'uppercase'
    | 'lowercase'
    | 'capitalize'
    | 'split_delimiter'
    | 'prefix_suffix'
    | 'custom_regex';
  delimiter?: string;
  splitIndex?: number;
  prefix?: string;
  suffix?: string;
  description: string;
}

function inferPattern(source: string, target: string): PatternRule | null {
  const s = source.trim();
  const t = target.trim();

  // 1. First word (e.g. "João Carlos" -> "João")
  const words = s.split(/\s+/);
  if (words.length > 1 && words[0] === t) {
    return { type: 'first_word', description: 'Extrair primeiro nome / primeira palavra' };
  }

  // 2. Last word (e.g. "João Carlos Silva" -> "Silva")
  if (words.length > 1 && words[words.length - 1] === t) {
    return { type: 'last_word', description: 'Extrair sobrenome / última palavra' };
  }

  // 3. Email username (e.g. "joao.silva@empresa.com" -> "joao.silva")
  if (s.includes('@') && s.split('@')[0] === t) {
    return { type: 'email_username', description: 'Extrair usuário de e-mail (antes do @)' };
  }

  // 4. Email domain (e.g. "joao.silva@empresa.com" -> "empresa.com")
  if (s.includes('@') && s.split('@')[1] === t) {
    return { type: 'email_domain', description: 'Extrair provedor/domínio de e-mail' };
  }

  // 5. Uppercase / Lowercase / Capitalize
  if (s.toUpperCase() === t && s !== t) {
    return { type: 'uppercase', description: 'Converter tudo em MAIÚSCULAS' };
  }
  if (s.toLowerCase() === t && s !== t) {
    return { type: 'lowercase', description: 'Converter tudo em minúsculas' };
  }
  if (s.replace(/\b\w/g, c => c.toUpperCase()) === t) {
    return { type: 'capitalize', description: 'Primeira Letra Em Maiúscula' };
  }

  // 6. Split by delimiter like hyphen or slash (e.g. "PROD-001-SP" -> "PROD" or "001" or "SP")
  const delimiters = ['-', '/', ';', ',', '|', '_', ':'];
  for (const d of delimiters) {
    if (s.includes(d)) {
      const parts = s.split(d).map(p => p.trim());
      const idx = parts.indexOf(t);
      if (idx !== -1) {
        return {
          type: 'split_delimiter',
          delimiter: d,
          splitIndex: idx,
          description: `Extrair segmento ${idx + 1} separado por "${d}"`,
        };
      }
    }
  }

  // 7. Date ISO YYYY-MM-DD -> DD/MM/YYYY
  const isoDateMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch && t === `${isoDateMatch[3]}/${isoDateMatch[2]}/${isoDateMatch[1]}`) {
    return { type: 'mask_date_iso_to_br', description: 'Formatar data AAAA-MM-DD para DD/MM/AAAA' };
  }

  // 8. CPF formatting "12345678900" -> "123.456.789-00"
  const digitsOnly = s.replace(/\D/g, '');
  if (digitsOnly.length === 11) {
    const formattedCpf = `${digitsOnly.slice(0, 3)}.${digitsOnly.slice(3, 6)}.${digitsOnly.slice(6, 9)}-${digitsOnly.slice(9)}`;
    if (t === formattedCpf) {
      return { type: 'mask_cpf', description: 'Aplicar máscara de CPF (000.000.000-00)' };
    }
  }

  // 9. Phone formatting "11987654321" -> "(11) 98765-4321"
  if (digitsOnly.length === 11 && (t.startsWith('(') || t.includes('-'))) {
    return { type: 'mask_phone', description: 'Aplicar máscara de Telefone ((00) 00000-0000)' };
  }

  // 10. Prefix / Suffix detection
  if (t.endsWith(s) && t.length > s.length) {
    const prefix = t.substring(0, t.length - s.length);
    return { type: 'prefix_suffix', prefix, description: `Adicionar prefixo "${prefix}"` };
  }
  if (t.startsWith(s) && t.length > s.length) {
    const suffix = t.substring(s.length);
    return { type: 'prefix_suffix', suffix, description: `Adicionar sufixo "${suffix}"` };
  }

  return null;
}

function applyPattern(source: string, rule: PatternRule): string {
  const s = source.trim();

  switch (rule.type) {
    case 'first_word':
      return s.split(/\s+/)[0] || '';
    case 'last_word': {
      const parts = s.split(/\s+/);
      return parts[parts.length - 1] || '';
    }
    case 'email_username':
      return s.split('@')[0] || '';
    case 'email_domain':
      return s.split('@')[1] || '';
    case 'uppercase':
      return s.toUpperCase();
    case 'lowercase':
      return s.toLowerCase();
    case 'capitalize':
      return s.replace(/\b\w/g, c => c.toUpperCase());
    case 'split_delimiter': {
      if (!rule.delimiter || rule.splitIndex === undefined) return s;
      const parts = s.split(rule.delimiter).map(p => p.trim());
      return parts[rule.splitIndex] || '';
    }
    case 'mask_date_iso_to_br': {
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
      return s;
    }
    case 'mask_cpf': {
      const d = s.replace(/\D/g, '');
      if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
      return s;
    }
    case 'mask_phone': {
      const d = s.replace(/\D/g, '');
      if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
      if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return s;
    }
    case 'prefix_suffix':
      return `${rule.prefix || ''}${s}${rule.suffix || ''}`;
    default:
      return s;
  }
}
