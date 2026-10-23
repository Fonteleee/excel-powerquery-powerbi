// src/features/relations/ui/export/FlowExportMenu.test.ts
// Teste de fumaça da UI: renderiza no servidor (sem DOM) e confere textos e ausência de HTML injetado.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lookupFlow, sampleSheets } from '../../testing/fixtures';
import { FlowExportMenu } from './FlowExportMenu';
import { FlowExportPopover } from './FlowExportPopover';

describe('FlowExportMenu', () => {
  it('mostra as três ações e as opções de dialeto', () => {
    const html = renderToStaticMarkup(
      createElement(FlowExportMenu, { graph: lookupFlow(), sheets: sampleSheets(), onImportGraph: () => {} })
    );
    assert.match(html, /Exportar fluxo como SQL/);
    assert.match(html, /Exportar com aba de fluxo/);
    assert.match(html, /Importar fluxo de Excel/);
    assert.match(html, /DuckDB/);
    assert.match(html, /PostgreSQL/);
    assert.match(html, /Gerar SQL/);
    assert.ok(!/<script/i.test(html));
  });

  it('o botão da barra renderiza fechado e acessível', () => {
    const html = renderToStaticMarkup(
      createElement(FlowExportPopover, { graph: lookupFlow(), sheets: sampleSheets(), onImportGraph: () => {} })
    );
    assert.match(html, /aria-haspopup="dialog"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /Exportar/);
    assert.ok(!/Gerar SQL/.test(html));
  });
});
