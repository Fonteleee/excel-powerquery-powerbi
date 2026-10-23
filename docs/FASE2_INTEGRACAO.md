# Fase 2: exportações e análises (integração)

Branch `fase2-exportacoes`. Código em `src/features/relations/{sql,excel,analysis,ui/export}`.

## Plug-in na UI da Fase 1

Um único componente, tudo por props:

```tsx
import { FlowExportMenu } from 'src/features/relations/ui/export/FlowExportMenu';

<FlowExportMenu
  graph={graph}                 // FlowGraph atual (estado da Fase 1)
  sheets={sheets}               // Sheet[] abertas
  onImportGraph={g => setGraph(g)} // grafo validado e religado às planilhas pelo nome
  fileBase="fluxo"              // opcional; é sanitizado
/>
```

Ponto sugerido: o cabeçalho/barra da aba Relacionamentos (ex.: dentro de um popover "Exportar"). Também há `SqlExportPanel` e `FlowExcelActions` separados.

Hoje, sem a Fase 1, o menu aparece no `ImportExportModal.tsx` (uma seção, via `FlowExportSection`, que lê/grava o grafo em `loadFlowGraph/saveFlowGraph`). No merge, troque essa seção por `FlowExportMenu` com o estado da Fase 1 (ou mantenha, pois `saveFlowGraph` persiste o mesmo grafo).

## Contratos

- `exportFlowAsSql(graph, sheets, { dialect: 'duckdb'|'postgres', outputMode: 'select'|'create_table', includeInputs, generatedAt })` devolve `{ ok, sql, setup[], queries[], warnings }` ou `{ ok:false, errors }`. Peças: `compileFlowToSql`, `prepareInputs`, `generateInputTablesSql`.
- `serializeFlowToRows(graph, { sheetNames })` / `parseFlowFromRows(rows)`; `appendFlowSheet(wb, graph, opts)` / `extractFlowFromWorkbook(wb)` (SheetJS); `readFlowFromArrayBuffer`. Aba `_Flow_v1`, `veryHidden`, checksum FNV-1a, textos sanitizados (`'` antes de `=+-@`).
- `exportSheetToExcel(sheets, nome, flowGraph?)` em `utils/excelExporter.ts`: terceiro parâmetro opcional acrescenta a aba. Único ajuste nesse arquivo. A exportação por ExcelJS (`exportPivotReportToExcel`) não leva o fluxo.
- Análises puras: `inspectLookup`, `analyzeSheetHealth` + `applyHealthFix`/`previewHealthFix`, `suggestGhostLinks`.

## Validação (honesta)

- **DuckDB**: o DuckDB-WASM roda em Node (`testing/duckdbNode.ts`). `sql/parity.test.ts` executa o SQL gerado e compara linha a linha com `evaluateGraph` (lookup, agregações, filtros, entrada vazia, controle negativo). `injection.test.ts` roda um fluxo com nomes/valores hostis no DuckDB. Para o navegador, `checkSqlParity(graph, sheets, executor)` aceita qualquer executor de SQL.
- **PostgreSQL**: só testes de texto (golden/estrutura/injeção). O SQL NÃO foi executado em Postgres.
- Aproximações: número lido de texto só nos formatos `1234.5`, `1234,5`, `1.234,5` (sem R$, % nem hh:mm); `ifNotFound` vazio vira NULL; arredondamento em empates de 0,005 pode diferir do JS; o texto literal "(Vazio)" em agrupamento não se funde com nulo como no JS; o script aceita até 8M caracteres.
- Reimportar em outra sessão: os ids de planilha mudam; o fluxo religa pelo nome (se único) e avisa o resto.
