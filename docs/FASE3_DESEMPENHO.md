# Fase 3: motor de cálculo, desempenho e paridade com o Excel

## 1. Como medir

`npm run bench -- [--profile=quick|full] [--runs=3] [--only=nome] [--engines=legacy,graph]`
(harness em `src/engine/__bench__/`, sem dependências novas). Planilhas sintéticas determinísticas; o harness
imprime um resumo (fórmulas, soma, erros) e avisa se dois motores divergem. `npm test` roda a bateria legada
(`src/tests/validateAll.ts`) e os testes de regressão das fórmulas em `src/engine/formulaParser.regression.test.ts`.

Condições: Node v24.22.1, Windows 10, máquina sem outras cargas durante a rodada. Mediana de 3 execuções; os cenários
com mais de 100 mil células rodam 1 vez só.

## 2. Resultados (ms)

ANTES = código original (commit e2e932e extraído com `git archive`, varredura de até 3 passagens).
DEPOIS = motor por grafo atual. Em todos os cenários comparados o resumo (soma e contagem de erros) é idêntico.

| Cenário | Antes | Depois | Ganho |
|---|---:|---:|---:|
| 10 mil linhas independentes (20 mil fórmulas) | 1118 | 558 | 2,0x |
| 100 mil linhas independentes (200 mil fórmulas) | 12701 | 6444 | 2,0x |
| Cadeia de 500 fórmulas | 2352 | 15 | 154x |
| Cadeia de 2000 fórmulas | 138948 | 33 | ~4200x |
| PROCX+PROCV+SOMASE entre abas, 1000 linhas x cadastro 1000 | 10724 | 146 | 74x |
| Mesmo, 10 mil linhas x cadastro 1000 | 97339 | 1394 | 70x |
| 2000 totais acumulados `SOMA($B$2:Bn)` | 1789 | 661 | 2,7x |

Só no motor novo (o antigo leva minutos): cadeia de 20 mil = 410 ms; 10 mil acumulados = 20,9 s (ver limitações).

Edição de UMA célula depois de tudo calculado (o App hoje recalcula a aba inteira a cada edição):

| Cenário | Recálculo da aba inteira (antes) | `RecalcEngine.apply` | apply in-place |
|---|---:|---:|---:|
| 10 mil linhas (4 fórmulas afetadas) | ~560 a 1100 | 62 | 19 |
| 100 mil linhas (4 afetadas) | ~8600 a 12700 | 1244 | 256 |
| Cadeia de 2000 | 138948 | 22 | 29 |
| Lookups 10000x1000 (20 mil afetadas) | 97339 | 631 | 570 |

O "recálculo da aba inteira" nesta tabela é o tempo do recálculo completo do ANTES (ou do motor legado medido na
mesma máquina: 577 ms em 10 mil e 8583 ms em 100 mil, rodada anterior, menos limpa). A diferença entre `apply` e
`in-place` em 100 mil linhas é a cópia do mapa de células (o App é imutável); o worker usa in-place.

Observação honesta: o motor `legacy` (mantido atrás da flag) também ficou mais rápido que o código original, porque o
avaliador é compartilhado (atalhos para referência simples/número e varredura única de operadores).

## 3. O que mudou

- `src/engine/formulaParser.ts` (1845 linhas) virou fachada de reexports. Código em `formulas/*` (endereços,
  números, formatação, catálogo, tokenizador, avaliador, funções por categoria) e `recalc/*`. Todos abaixo de 1000
  linhas. As assinaturas públicas não mudaram.
- `recalc/`: extração de referências (`references.ts`), grafo com nós virtuais de intervalo indexados por coluna
  (`dependencyGraph.ts`), ordenação topológica com detecção de ciclo (Tarjan), matrizes dinâmicas (`spill.ts`) e o
  motor (`engine.ts`). Dentro de um recálculo há cache de intervalos e índices de busca exata
  (`functions/valueIndex.ts`) usados por PROCX, PROCV, CORRESP, CONT.SE, SOMASE e MÉDIASE; os testes comparam o
  índice com a varredura por `valuesMatch`.
- Flag: `setRecalcEngine('graph' | 'legacy')` ou `recalculateSheet(sheet, all, { engine })`. Padrão: `graph`.
  Os testes diferenciais (12 planilhas aleatórias + a planilha de vendas) exigem valores iguais nos dois.
- Referência circular: `#CIRCULAR!` na célula e `errorDetail` com o caminho ("Referência circular: Plan1!A1 → B1 →
  A1"). No motor antigo uma auto-referência dava `#VALOR!`. `RecalcResult.cycles` lista os ciclos.
- Corrigido: `PRI.MAIÚSCULA` com acentos ("João Da Silva").

## 4. Recálculo fora da thread principal

```ts
import { createRecalcClient } from './engine/recalc/client';
import { applyPatches } from './engine/recalc/protocol';

const client = createRecalcClient();            // worker se existir, senão síncrono (client.mode)
const init = await client.init(sheets);         // clona as abas, monta o grafo, calcula tudo
sheets = sheets.map(s => applyPatches(s, init.patches));

const delta = await client.applyEdits([{ sheetId, row, col, raw: '=A1*2' }]); // só o ramo afetado
sheets = sheets.map(s => applyPatches(s, delta.patches)); // patches: { sheetId, key, cell | null }
// delta.cycles, delta.recalculated, delta.elapsedMs

const flow = await client.evaluateFlow(graph, { rowLimit: 200 }); // Relacionamentos, incremental
// flow.nodes[id] = { error, headers, totalRows, rows }, flow.evaluated = nós reavaliados
await client.replaceSheet(sheet);               // mudança estrutural (linhas/colunas): recalcula tudo
client.dispose();
```

Decisões: o worker é dono do estado e usa `apply({ inPlace: true })`; a thread principal manda só edições e recebe
só células alteradas. Se não há `Worker` ou ele não responde ao ping em 3 s, cai para o serviço síncrono (mesmo
código, `RecalcService`). `App.tsx` não foi alterado: a integração fica para depois.

## 5. Paridade com o Excel

- Séries do preenchimento (`autoFillEngine.ts`): progressões numéricas (vírgula decimal), datas BR e ISO (passo em
  dias ou meses, sem erro de fuso), dias da semana e meses em pt-BR (completos, curtos, com ou sem acento, com
  passo, preservando a caixa), `ID-001`, `Item 1`, `1º`. Corrigido o bug em que datas eram lidas como número.
- Colar HTML (`utils/htmlTablePaste.ts`): tabelas com mesclagens, cor de fundo, cor do texto e negrito. NÃO usa
  `DOMParser`: tokenizador próprio, o HTML nunca vira DOM (scripts, estilos, eventos, tabelas aninhadas descartados;
  cores só `#hex`/`rgb()`; texto iniciado em `=` vira texto). Ligado em `useGridClipboard` (`navigator.clipboard.read`).
- Ctrl+setas e Ctrl+Shift+setas (`utils/edgeJump.ts`): regra do Excel (fim do bloco, próximo bloco, borda). Corrige o
  bug antigo de `endCol` no Ctrl+↑.
- Matrizes dinâmicas: `FILTRO`, `ÚNICO`, `CLASSIFICAR`, `SEQUÊNCIA`, `DIVIDIRTEXTO` já existiam e agora funcionam no
  motor por grafo: derramam, cobertura por testes de crescer/encolher, limpeza ao trocar a fórmula, bloqueio quando
  alguém digita na área. O erro é `#DESPEJAR!` (nome do `#SPILL!` no Excel pt-BR).
- `SpreadsheetGrid.tsx` foi de 2097 para 981 linhas: `hooks/useGridKeyboard`, `hooks/useGridClipboard`,
  `fillOps`, `gridOps`, `columnMeta`, `GridHeaderRow`, `GridBodyRows`, `GridContextMenu`, `GridOverlays`,
  `GridStatusBar`.

## 6. Cenários "e se" e viagem no tempo (`features/relations/runtime/scenarios.ts`)

- `stepThrough(graph, sheets)`: um estado por nó em ordem topológica (reaproveita `evaluateGraph`).
- `forkScenario(graph, sheets, overrides)`: `scaleColumn`, `filterRows`, `nodeParams`; copy-on-write (abas e células
  sem sobreposição mantêm a referência; as originais nunca são mutadas).
- `compareScenarios(a, b)`: por saída, soma/delta/percentual por coluna numérica e delta linha a linha (por posição).

## 7. Limitações conhecidas

- Totais acumulados `SOMA($B$2:Bn)` com n intervalos distintos são O(n²) (10 mil = ~21 s), como no Excel. A cadeia é
  linear.
- 100 mil linhas: a construção do grafo custa ~1,9 s e o recálculo completo ainda é dominado pela avaliação textual
  das fórmulas (a árvore é re-interpretada a cada fórmula). Um compilador de fórmulas em cache é o próximo passo.
- O grafo extrai referências por varredura textual conservadora; referências não previstas (ex.: funções
  indiretas, que não existem hoje) cairiam no caminho recursivo antigo (correto, mais lento) dentro de uma rodada
  completa, mas num `apply` incremental poderiam deixar valores desatualizados.
- `apply` depende de o chamador informar todas as células alteradas; mudanças estruturais exigem `replaceSheet`.
- Não verificado no navegador: worker real, teclado, colagem HTML da área de transferência e alça de preenchimento
  (só testes em Node). Falha antiga fora de escopo: o importador CSV não gera a linha "Total Geral"
  (`todo` em `validateAll.test.ts`).
- `RibbonBar.tsx` e `PowerQueryEditor.tsx` continuam acima de 1000 linhas (não eram escopo).
