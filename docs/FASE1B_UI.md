# Fase 1b: integração de UI (Relacionamentos)

Branch `fase1b-ui-integracao`. Código em `src/features/relations/ui/` e `model/history.ts`.

## O que foi ligado

1. **Exportação na tela do fluxo**: `ui/export/FlowExportPopover.tsx` (botão "Exportar" na barra) abre o `FlowExportMenu` com o grafo e as planilhas reais do `FlowCanvas`. Importar um fluxo passa por `parseFlowGraph` (mesmo validador da carga), `syncTableNodes` (religa às planilhas abertas) e `updateGraph` (persistência por debounce), atualizando a tela na hora. `FlowExportSection` foi removido: o modal Importar/Exportar manteria uma segunda cópia do grafo (localStorage) que o canvas aberto sobrescreveria. O modal agora tem um aviso e o botão "Excel (.XLSX)" diz "sem o fluxo".
2. **Inspetor de falhas**: o selo do cabo de lookup é focável (`role=button`); hover ou foco abre `CableInspector` (usa `inspectLookup`, amostra de 5). Texto em `inspectorModel.ts` (testado). Esc ou saída do foco fecha.
3. **Data Health HUD**: botão "Saúde" abre `DataHealthPanel` (tabela selecionada ou a primeira do fluxo). Prévia por correção (`previewHealthFix`) e Aplicar via `applyFixToSheets` -> `onUpdateSheets` do App (que faz `pushHistory`). Desfazer: botão no painel chama `onUndoSheets` (= `handleUndo` do App, nova prop). Correções que não mudam nada são recusadas (não poluem o histórico).
4. **Conexões fantasma**: passar o mouse num campo (após 220 ms) calcula `suggestGhostLinks` e destaca campos compatíveis (contorno tracejado, selo `~%`, tooltip com razão). Cache por coluna (`ghostCache.ts`, limite 64, invalidado quando o array de planilhas muda). Só visual: sem snap. Não há linhas semitransparentes, só realce dos campos.
5. **Desfazer/refazer do grafo**: `model/history.ts` (pilha pura, limite 100, agrupamento por chave para arrastar nó e digitar parâmetros). `useFlowDocument` expõe `undoGraph/redoGraph/canUndo/canRedo`. Atalhos Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y quando o foco está na aba (campos de texto mantêm o desfazer nativo) e botões na barra. A grade de planilhas não fica montada nessa aba, então não há conflito com o desfazer das planilhas. Sincronização automática com novas planilhas não entra no histórico.

## Arquivos compartilhados tocados

`src/App.tsx` (uma prop `onUndoSheets`), `src/components/Relations/RelationsCanvas.tsx`, `src/components/Modals/ImportExportModal.tsx`, `FlowCanvas.tsx`, `CanvasToolbar.tsx`, `CableLayer.tsx`, `TableCard.tsx`, `relations.css`, `useFlowDocument.ts`.

## Validação

- Unitário: `inspectorModel`, `healthModel`, `ghostCache`, `history`, `FlowExportMenu` (render estático).
- Navegador (dev server, janela estreita): a aba carrega sem erros no console; os botões Desfazer/Refazer, Saúde e Exportar aparecem; o painel de Saúde abre e analisa a planilha de exemplo (100%, sem correções); o menu Exportar abriu, mas cortado à esquerda numa janela de 800 px, corrigido depois (alinhamento pela borda esquerda) e não revisto no navegador.
- NÃO verificado no navegador: inspetor no selo (precisa de fluxo com lookup), aplicar correção e desfazer pelo App, destaque de conexões fantasma, Ctrl+Z/Y do grafo, importar um .xlsx com `_Flow_v1`. Foco por teclado (Tab até o selo) só por leitura de código.
- Limitações: fantasmas não aparecem por foco de teclado (os campos não são focáveis); correção de saúde não recalcula fórmulas (o `applyHealthFix` recusa planilhas com fórmulas apenas no caso de duplicatas).
