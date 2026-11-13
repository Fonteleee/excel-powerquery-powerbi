// src/utils/pivotNotice.test.ts — detecção de tabela dinâmica do Excel na importação.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasPivotTable } from './workbookImport';

const enc = (s: string) => ({ content: new TextEncoder().encode(s) });

describe('tabela dinâmica do Excel', () => {
  const files = {
    'xl/workbook.xml': enc('<workbook><sheets><sheet name="Dados" r:id="rId1"/><sheet name="Resumo" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': enc('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'),
    'xl/worksheets/_rels/sheet2.xml.rels': enc('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable1.xml"/></Relationships>'),
  };

  it('reconhece a aba que tem a dinâmica e só ela', () => {
    assert.equal(hasPivotTable(files, 0), false);
    assert.equal(hasPivotTable(files, 1), true);
  });

  it('arquivo sem dados do zip não quebra', () => {
    assert.equal(hasPivotTable(undefined, 0), false);
  });
});
