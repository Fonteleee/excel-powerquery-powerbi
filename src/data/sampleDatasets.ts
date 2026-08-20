import { Sheet, CellData } from '../types/spreadsheet';
import { cellPosToKey } from '../engine/formulaParser';

export function createEmptySheet(id: string, name: string, rows = 100, cols = 26): Sheet {
  const colWidths: { [col: number]: number } = {};
  const rowHeights: { [row: number]: number } = {};

  for (let c = 0; c < cols; c++) {
    colWidths[c] = c === 0 ? 70 : c === 1 ? 120 : c === 2 ? 140 : c === 5 ? 170 : 100;
  }
  for (let r = 0; r < rows; r++) {
    rowHeights[r] = 22;
  }

  return {
    id,
    name,
    data: {},
    rowCount: rows,
    colCount: cols,
    colWidths,
    rowHeights,
    mergedRegions: [],
    conditionalRules: [],
  };
}

export function createSalesSampleSheet(id = 'sheet-sales', name = 'Consolidado contingencias CHAT e VOZ'): Sheet {
  const sheet = createEmptySheet(id, name, 60, 20);

  sheet.colWidths = {
    0: 75,   // A: ID
    1: 110,  // B: Data
    2: 140,  // C: Vendedor
    3: 110,  // D: Região
    4: 120,  // E: Categoria
    5: 160,  // F: Produto
    6: 65,   // G: Qtd
    7: 110,  // H: Preço Unit.
    8: 90,   // I: Desconto %
    9: 130,  // J: Total Líquido
    10: 110, // K: Comissão
    11: 100, // L: Status
  };


  const headers = [
    'ID Venda',
    'Data',
    'Vendedor',
    'Região',
    'Categoria',
    'Produto',
    'Qtd',
    'Preço Unit.',
    'Desconto %',
    'Total Líquido',
    'Comissão',
    'Status',
  ];

  // Set headers (Row 0)
  headers.forEach((h, col) => {
    const key = cellPosToKey(0, col);
    sheet.data[key] = {
      raw: h,
      value: h,
      format: {
        bold: true,
        bgColor: '#107c41', // Classic Microsoft Excel Green
        textColor: '#ffffff',
        align: col >= 6 && col <= 10 ? 'right' : 'left',
        fontSize: 11,
      },
    };
  });

  const rawRows = [
    ['VD-101', '15/01/2026', 'Carlos Eduardo', 'Sudeste', 'Eletrônicos', 'Notebook Dell XPS', 4, 8500.0, 0.05, '=G2*H2*(1-I2)', '=J2*0.04', 'Concluído'],
    ['VD-102', '16/01/2026', 'Mariana Souza', 'Sul', 'Móveis', 'Cadeira Ergonômica', 12, 1250.0, 0.10, '=G3*H3*(1-I3)', '=J3*0.04', 'Concluído'],
    ['VD-103', '18/01/2026', 'Rafael Mendes', 'Sudeste', 'Eletrônicos', 'Monitor 4K 27 pol', 8, 2400.0, 0.00, '=G4*H4*(1-I4)', '=J4*0.04', 'Concluído'],
    ['VD-104', '20/01/2026', 'Juliana Lima', 'Nordeste', 'Acessórios', 'Teclado Mecânico Pro', 25, 450.0, 0.08, '=G5*H5*(1-I5)', '=J5*0.04', 'Concluído'],
    ['VD-105', '22/01/2026', 'Carlos Eduardo', 'Sudeste', 'Eletrônicos', 'Mouse Sem Fio Master', 30, 290.0, 0.05, '=G6*H6*(1-I6)', '=J6*0.04', 'Concluído'],
    ['VD-106', '25/01/2026', 'Mariana Souza', 'Sul', 'Eletrônicos', 'Notebook Dell XPS', 3, 8500.0, 0.05, '=G7*H7*(1-I7)', '=J7*0.04', 'Concluído'],
    ['VD-107', '28/01/2026', 'Lucas Rocha', 'Centro-Oeste', 'Móveis', 'Mesa Ajustável Motorizada', 6, 3200.0, 0.12, '=G8*H8*(1-I8)', '=J8*0.04', 'Pendente'],
    ['VD-108', '02/02/2026', 'Rafael Mendes', 'Sudeste', 'Acessórios', 'Headset Noise Cancelling', 15, 890.0, 0.05, '=G9*H9*(1-I9)', '=J9*0.04', 'Concluído'],
    ['VD-109', '05/02/2026', 'Juliana Lima', 'Nordeste', 'Móveis', 'Cadeira Ergonômica', 10, 1250.0, 0.05, '=G10*H10*(1-I10)', '=J10*0.04', 'Concluído'],
    ['VD-110', '08/02/2026', 'Carlos Eduardo', 'Sudeste', 'Eletrônicos', 'Monitor 4K 27 pol', 5, 2400.0, 0.00, '=G11*H11*(1-I11)', '=J11*0.04', 'Concluído'],
    ['VD-111', '12/02/2026', 'Mariana Souza', 'Sul', 'Acessórios', 'Teclado Mecânico Pro', 18, 450.0, 0.05, '=G12*H12*(1-I12)', '=J12*0.04', 'Concluído'],
    ['VD-112', '15/02/2026', 'Lucas Rocha', 'Centro-Oeste', 'Eletrônicos', 'Notebook Dell XPS', 2, 8500.0, 0.00, '=G13*H13*(1-I13)', '=J13*0.04', 'Concluído'],
  ];

  rawRows.forEach((row, rIndex) => {
    const rowNum = rIndex + 1;
    row.forEach((val, colIndex) => {
      const key = cellPosToKey(rowNum, colIndex);
      let format: CellData['format'] = {
        align: colIndex >= 6 && colIndex <= 10 ? 'right' : 'left',
        textColor: '#1e293b',
      };

      if (colIndex === 7 || colIndex === 9 || colIndex === 10) {
        format.type = 'currency';
        format.decimals = 2;
      } else if (colIndex === 8) {
        format.type = 'percentage';
        format.decimals = 1;
      } else if (colIndex === 6) {
        format.type = 'number';
        format.decimals = 0;
      } else if (colIndex === 11) {
        format.align = 'center';
        format.textColor = val === 'Concluído' ? '#15803d' : '#d97706';
        format.bold = true;
      }

      sheet.data[key] = {
        raw: String(val),
        value: typeof val === 'string' && val.startsWith('=') ? null : (val as any),
        format,
      };
    });
  });

  // Summary row at row 13
  const totalRow = rawRows.length + 1;
  sheet.data[cellPosToKey(totalRow, 4)] = {
    raw: 'TOTAL GERAL',
    value: 'TOTAL GERAL',
    format: { bold: true, align: 'right', textColor: '#0f172a' },
  };
  sheet.data[cellPosToKey(totalRow, 6)] = {
    raw: `=SOMA(G2:G${totalRow})`,
    value: null,
    format: { bold: true, align: 'right', type: 'number', decimals: 0, bgColor: '#f0fdf4', textColor: '#166534' },
  };
  sheet.data[cellPosToKey(totalRow, 9)] = {
    raw: `=SOMA(J2:J${totalRow})`,
    value: null,
    format: { bold: true, align: 'right', type: 'currency', decimals: 2, bgColor: '#f0fdf4', textColor: '#15803d' },
  };
  sheet.data[cellPosToKey(totalRow, 10)] = {
    raw: `=SOMA(K2:K${totalRow})`,
    value: null,
    format: { bold: true, align: 'right', type: 'currency', decimals: 2, bgColor: '#f0fdf4', textColor: '#166534' },
  };

  // Add conditional formatting rule: highlight data bars on Total Líquido
  sheet.conditionalRules.push({
    id: 'rule-total-databar',
    type: 'data_bar',
    range: { startRow: 1, startCol: 9, endRow: rawRows.length, endCol: 9 },
    style: { barColor: '#10b981' },
  });

  return sheet;
}

export function createHRStaffSampleSheet(id = 'sheet-hr', name = 'RH & Folha de Pagamento'): Sheet {
  const sheet = createEmptySheet(id, name, 50, 18);

  sheet.colWidths = {
    0: 80,   // Matrícula
    1: 200,  // Nome Completo
    2: 170,  // Cargo
    3: 140,  // Departamento
    4: 130,  // Salário Base
    5: 110,  // Horas Extras
    6: 120,  // Valor H.E.
    7: 140,  // Salário Bruto
    8: 120,  // INSS (11%)
    9: 140,  // Salário Líquido
    10: 220, // E-mail Corporativo
  };

  const headers = [
    'Matrícula',
    'Nome Completo',
    'Cargo',
    'Departamento',
    'Salário Base',
    'Horas Extras',
    'Valor H.E.',
    'Salário Bruto',
    'INSS',
    'Salário Líquido',
    'E-mail Corporativo',
  ];

  headers.forEach((h, col) => {
    const key = cellPosToKey(0, col);
    sheet.data[key] = {
      raw: h,
      value: h,
      format: {
        bold: true,
        bgColor: '#1e40af', // Deep blue
        textColor: '#ffffff',
        align: col >= 4 && col <= 9 ? 'right' : 'left',
        fontSize: 11,
      },
    };
  });

  const staff = [
    ['MAT-001', 'Ana Beatriz Fonseca', 'Engenheira de Software', 'Tecnologia', 12500, 8, '=(E2/220)*1.5*F2', '=E2+G2', '=H2*0.11', '=H2-I2', 'ana.fonseca@empresa.com'],
    ['MAT-002', 'Bruno Henrique Costa', 'Designer de Produto', 'Design', 9200, 4, '=(E3/220)*1.5*F3', '=E3+G3', '=H3*0.11', '=H3-I3', 'bruno.costa@empresa.com'],
    ['MAT-003', 'Carla Dias Moreira', 'Gerente de Contas', 'Comercial', 11000, 12, '=(E4/220)*1.5*F4', '=E4+G4', '=H4*0.11', '=H4-I4', 'carla.moreira@empresa.com'],
    ['MAT-004', 'Diego Alcantara Prado', 'Analista de Dados', 'BI & Analytics', 8500, 6, '=(E5/220)*1.5*F5', '=E5+G5', '=H5*0.11', '=H5-I5', 'diego.prado@empresa.com'],
    ['MAT-005', 'Fernanda Lima Rocha', 'Coordenadora de RH', 'Recursos Humanos', 10500, 0, '=(E6/220)*1.5*F6', '=E6+G6', '=H6*0.11', '=H6-I6', 'fernanda.rocha@empresa.com'],
    ['MAT-006', 'Gabriel Antunes Silva', 'DevOps Specialist', 'Tecnologia', 13800, 10, '=(E7/220)*1.5*F7', '=E7+G7', '=H7*0.11', '=H7-I7', 'gabriel.silva@empresa.com'],
    ['MAT-007', 'Helena Martins Vieira', 'Analista Financeiro', 'Financeiro', 7800, 5, '=(E8/220)*1.5*F8', '=E8+G8', '=H8*0.11', '=H8-I8', 'helena.vieira@empresa.com'],
    ['MAT-008', 'Igor Nascimento Lopes', 'Product Manager', 'Produto', 14500, 2, '=(E9/220)*1.5*F9', '=E9+G9', '=H9*0.11', '=H9-I9', 'igor.lopes@empresa.com'],
  ];

  staff.forEach((row, rIndex) => {
    const rowNum = rIndex + 1;
    row.forEach((val, colIndex) => {
      const key = cellPosToKey(rowNum, colIndex);
      let format: CellData['format'] = {
        align: colIndex >= 4 && colIndex <= 9 ? 'right' : 'left',
        textColor: '#1e293b',
      };

      if (colIndex === 4 || colIndex === 6 || colIndex === 7 || colIndex === 8 || colIndex === 9) {
        format.type = 'currency';
        format.decimals = 2;
      } else if (colIndex === 5) {
        format.type = 'number';
        format.decimals = 0;
      }

      sheet.data[key] = {
        raw: String(val),
        value: typeof val === 'string' && val.startsWith('=') ? null : (val as any),
        format,
      };
    });
  });

  return sheet;
}

export function createFinancialBudgetSheet(id = 'sheet-finance', name = 'Orçamento & DRE'): Sheet {
  const sheet = createEmptySheet(id, name, 40, 16);

  sheet.colWidths = {
    0: 160, // Categoria
    1: 220, // Conta Contábil
    2: 130, // Tipo
    3: 140, // Orçado
    4: 140, // Realizado
    5: 140, // Variação R$
    6: 120, // Variação %
    7: 140, // Desempenho
  };

  const headers = [
    'Categoria',
    'Conta Contábil',
    'Tipo',
    'Orçado (Planejado)',
    'Realizado (Executado)',
    'Variação (R$)',
    'Variação (%)',
    'Desempenho',
  ];

  headers.forEach((h, col) => {
    const key = cellPosToKey(0, col);
    sheet.data[key] = {
      raw: h,
      value: h,
      format: {
        bold: true,
        bgColor: '#7c3aed', // Purple
        textColor: '#ffffff',
        align: col >= 3 && col <= 6 ? 'right' : col === 7 ? 'center' : 'left',
        fontSize: 11,
      },
    };
  });

  const finRows = [
    ['Receitas Operacionais', 'Venda de Software SaaS', 'Receita', 250000, 285000, '=E2-D2', '=(E2-D2)/D2', 'Superou Meta'],
    ['Receitas Operacionais', 'Consultoria e Treinamento', 'Receita', 80000, 74000, '=E3-D3', '=(E3-D3)/D3', 'Abaixo Meta'],
    ['Despesas Pessoal', 'Salários e Encargos', 'Despesa', 140000, 138500, '=D4-E4', '=(D4-E4)/D4', 'Dentro Orçamento'],
    ['Despesas Pessoal', 'Benefícios e VR/VT', 'Despesa', 22000, 21800, '=D5-E5', '=(D5-E5)/D5', 'Dentro Orçamento'],
    ['Infraestrutura', 'Cloud AWS & Servidores', 'Despesa', 35000, 41200, '=D6-E6', '=(D6-E6)/D6', 'Excedido'],
    ['Marketing & Vendas', 'Anúncios Google & Meta Ads', 'Despesa', 28000, 27500, '=D7-E7', '=(D7-E7)/D7', 'Dentro Orçamento'],
    ['Operacional', 'Ferramentas de Software (SaaS)', 'Despesa', 12000, 11900, '=D8-E8', '=(D8-E8)/D8', 'Dentro Orçamento'],
  ];

  finRows.forEach((row, rIndex) => {
    const rowNum = rIndex + 1;
    row.forEach((val, colIndex) => {
      const key = cellPosToKey(rowNum, colIndex);
      let format: CellData['format'] = {
        align: colIndex >= 3 && colIndex <= 6 ? 'right' : colIndex === 7 ? 'center' : 'left',
        textColor: '#1e293b',
      };

      if (colIndex === 3 || colIndex === 4 || colIndex === 5) {
        format.type = 'currency';
        format.decimals = 2;
      } else if (colIndex === 6) {
        format.type = 'percentage';
        format.decimals = 1;
      } else if (colIndex === 7) {
        format.bold = true;
        format.textColor = val === 'Superou Meta' || val === 'Dentro Orçamento' ? '#15803d' : '#dc2626';
      }

      sheet.data[key] = {
        raw: String(val),
        value: typeof val === 'string' && val.startsWith('=') ? null : (val as any),
        format,
      };
    });
  });

  return sheet;
}
