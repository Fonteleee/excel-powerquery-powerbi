// src/features/agent/suggestions.ts
// Sugestões de pedidos conforme o estado do espaço de trabalho (vazio, com dados, várias planilhas).

import { Sheet } from '../../types/spreadsheet';
import { dataRowCount } from './tools/common';

export interface Suggestion {
  label: string;
  prompt: string;
}

const hasData = (sheet: Sheet): boolean => dataRowCount(sheet) >= 1;

export function suggestionsFor(sheets: readonly Sheet[], selection?: string): Suggestion[] {
  const filled = sheets.filter(hasData);

  if (filled.length === 0) {
    return [
      {
        label: 'Criar controle de despesas',
        prompt: 'Crie uma planilha de controle de despesas mensais com categoria, data, valor e forma de pagamento, 12 linhas de exemplo, e um resumo por categoria com fórmulas.',
      },
      {
        label: 'Criar fluxo de caixa',
        prompt: 'Crie uma planilha de fluxo de caixa mensal para 12 meses com entradas, saídas, saldo do mês e saldo acumulado usando fórmulas.',
      },
      { label: 'Como começar', prompt: 'Como posso trazer meus dados para este sistema e o que você consegue fazer com eles?' },
    ];
  }

  const list: Suggestion[] = [
    { label: 'Analisar meus dados', prompt: 'Analise as planilhas: descreva o conteúdo, os principais números e qualquer ponto de atenção que você encontrar.' },
    { label: 'Limpar e padronizar', prompt: 'Verifique a qualidade dos dados (espaços, duplicados, tipos misturados, datas) e corrija o que for seguro, me dizendo o que mudou.' },
    { label: 'Gerar gráfico', prompt: 'Escolha a métrica mais importante da planilha ativa e gere um gráfico que a explique.' },
    { label: 'Achar erros de fórmula', prompt: 'Procure erros de fórmula em todas as planilhas, explique a causa de cada um e corrija os que puder.' },
  ];
  if (filled.length >= 2) {
    list.splice(1, 0, {
      label: 'Cruzar as planilhas',
      prompt: 'Veja se as planilhas têm uma chave em comum, meça a qualidade do cruzamento e, se for boa, crie o cruzamento no fluxo trazendo as colunas mais úteis.',
    });
  }
  if (selection) {
    list.unshift({ label: `Explicar ${selection}`, prompt: `Explique o que há na seleção ${selection} da planilha ativa e aponte problemas, se houver.` });
  }
  return list.slice(0, 5);
}
