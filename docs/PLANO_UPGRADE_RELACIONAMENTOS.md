# Plano de upgrade: aba de Relacionamentos (excel-powerquery-powerbi)

Base analisada: `Fonteleee/excel-powerquery-powerbi`, branch `main`, commit `3df62b7`.
Escopo desta fase: estudo, validação das ideias e plano. Nenhum código do projeto foi alterado.

---

## 1. Como o projeto funciona hoje (o que o código mostra)

- **Stack:** Vite + React 19 + TypeScript + Tailwind 4, DuckDB-WASM, Jotai, TanStack Virtual, `xlsx` + `exceljs`, Gemini via `fetch` direto do navegador. Deploy por GitHub Pages (`deploy.yml`) e também há `vercel.json`.
- **Aba de Relacionamentos:** `RelationsCanvas.tsx` (785 linhas) desenha cards DOM (`TableNodeCard`) e cabos em SVG. Cada coluna tem um pino de saída (direita) e um de entrada (esquerda), então a "conexão campo a campo" **já existe** na interface.
- **O que uma conexão faz:** `RelationEdge` guarda `sourceColIdx`, `targetColIdx`, `returnColIdx` e o tipo de fórmula. Ao salvar, `applyRelationToSpreadsheet` **escreve fórmulas estáticas** (`=PROCX(...)`, `=SOMASE(...)`) numa coluna nova da planilha e recalcula. Depois disso a conexão não controla mais nada.
- **Blocos de ação (Agrupar / Filtrar / Saída):** `ActionBlockCard` guarda o estado em `useState`, não se liga a cabos e não é persistido. Executar um bloco gera uma planilha nova.
- **Persistência:** planilhas em IndexedDB (com snapshot em localStorage); arestas só em localStorage.
- **IA:** `agentActionProtocol.ts` define 8 ações (criar planilha, `set_cells`, formatar, gráfico, SQL...). Todas atuam na planilha ativa. **Nenhuma ação enxerga o grafo.**
- **Export:** `exportSheetToExcel` grava as abas. O grafo não vai junto.
- **Layout da aba Dados:** grade + `CopilotPanel` lado a lado em `App.tsx`, dentro de um flex.

## 2. Problemas encontrados que bloqueiam as melhorias

| # | Achado | Impacto |
|---|---|---|
| 1 | **O grafo não é a fonte da verdade.** Salvar uma aresta injeta fórmulas uma vez. Editar a aresta cria outra coluna; apagar a aresta não remove a coluna. | Impede "tudo reflete em tempo real", exportar o fluxo exato e deixar a IA editar o grafo. É o item mais importante. |
| 2 | **Posição dos pinos é fixa** (`40 + idx*28 + 14`). | Cabos desalinhados com card recolhido, filtro de campos, "Apenas chaves" ou rolagem do card (`max-h-72`). Âncoras campo a campo precisam ser medidas no DOM. |
| 3 | **Tipo da coluna é adivinhado pelo nome do cabeçalho** (`includes('id')`, `'tempo'`...). | A sugestão por tipo de dado só funciona com tipo inferido dos valores (`dataProfiler.ts` e `dataRecognizer.ts` já existem). |
| 4 | **Nós de transformação inexistentes.** A "regra" é um selo no meio do cabo que abre modal. | É exatamente o problema da sua ideia nº 2. |
| 5 | **`applyMultiColumnEnrichment` usa `String.fromCharCode(65 + idx)`.** | Quebra a partir da coluna 27 (AA...). O resto do código usa `colIndexToLabel`. |
| 6 | **Chave da API Gemini no repositório público.** `ai_data_analysis_agent/.env` (69 bytes, variável `GEMINI_API_KEY`) está **versionado**. Além disso a chave vai na URL (`?key=`) e fica em localStorage. | Segurança. Detalhes na seção 6. |
| 7 | **Arquivos acima de 1000 linhas:** `SpreadsheetGrid.tsx` (2097), `formulaParser.ts` (1845), `PowerQueryEditor.tsx` (1608), `RibbonBar.tsx` (1011). | Código novo deve nascer modular, fora desses arquivos. |
| 8 | **Dependências:** `xlsx@0.18.5` tem vulnerabilidades conhecidas (prototype pollution e ReDoS) e `exceljs` faz papel parecido. | Escolher uma biblioteca e atualizar. |
| 9 | **Sem runner de testes** (existem scripts soltos: `validateAll.ts`, `test_cross_sheet.ts`). | Compilador de SQL e motor do grafo precisam de testes de verdade (Vitest). |
| 10 | **Higiene do repo:** `__pycache__` versionado, app Streamlit misturado com o front, scripts de teste na raiz, documentos de processo de IA na raiz. | Organizar antes de crescer. |

## 3. Validação das ideias (manter / adaptar / adiar / cortar)

### Primeira lista

| Ideia | Veredito | Comentário |
|---|---|---|
| 1. Âncoras campo a campo | **Adaptar** | Os pinos existem. Falta: (a) âncoras medidas no DOM, (b) inferir quem é a **chave** e quem é o **retorno** (hoje `returnColIdx = targetColIdx`), (c) escolher várias colunas de retorno. |
| 2. Nós de transformação persistentes + drawer | **Manter (prioridade máxima)** | Vira o modelo central: Tabela → Transformação → Saída. Unifica as arestas e os blocos Agrupar/Filtrar de hoje. |
| 3. Sugestão por tipo de dado | **Manter, com ajuste** | **Ordenar** as sugestões em vez de esconder as demais: ID/texto → PROCX/PROCV; numérico → SOMASE/MÉDIASE/SOMARPRODUTO. Esconder opções válidas frustra quem sabe o que quer. |
| 4. Preview ao vivo (5–10 linhas) | **Manter** | Exige separar "calcular" de "gravar na planilha" (função pura que devolve uma tabela). Mesma base serve para o SQL e para a IA. |

### Segunda lista

| Ideia | Veredito | Comentário |
|---|---|---|
| Aba de Relacionamentos como principal, visual "4K" | **Manter** | "4K" aqui significa vetor nítido em qualquer DPI (SVG/CSS, sem bitmaps), escala tipográfica e tokens de design. Não é renderizar em 3840 px. |
| Conexão em tempo real com o Excel do usuário | **Manter, com ressalva importante** | Ver seção 5. Navegador **não observa** um Excel aberto. Tempo real de verdade exige um suplemento do Office. |
| IA cria/edita na aba de relacionamento | **Manter** | Depende do grafo declarativo (JSON validado). Ver seção 4.4. |
| Exportar como script SQL | **Manter** | Natural quando as transformações são declarativas. Dá para **validar o SQL gerado rodando no DuckDB-WASM**, que o projeto já tem. |
| Exportar o fluxo numa aba do Excel e reimportar | **Manter** | Aba oculta `_Flow_v1` com versão. Ver seção 4.5. |
| Aba Dados com 75% tabela / 25% resto | **Manter (fácil)** | Mudança de layout em `App.tsx` + divisor redimensionável e recolher a barra lateral automaticamente. |

### Ideias de "Depuração Visual e Qualidade de Dados"

| Ideia | Veredito | Comentário |
|---|---|---|
| Pulsos de dados com volume e status no cabo | **Manter** | Animação SVG (`stroke-dashoffset`) + contador de linhas. Barato. |
| Inspetor de falhas no cabo (órfãos, nulos, tipos) | **Manter** | Um anti-join dá os órfãos. Reaproveita o preview. Alto valor. |
| Pré-validação de cardinalidade (% de match, 1:1 / 1:N / N:N) | **Manter (prioridade alta)** | Evita o erro clássico de duplicar linhas no PROCX/SOMASE. `applyMultiColumnEnrichment` (em `pipelineEngine.ts`) já calcula a taxa de match. |
| Conexões fantasma (sugestões ao passar o mouse) | **Manter na fase 2** | Pontuar por tipo + sobreposição de valores (amostra de ~1000 valores, em worker). **Adiar o snap magnético ao soltar a tabela**: soltar por engano cria relações erradas. Começar só com a sugestão visual. |
| Data Health HUD + "Corrigir e gerar grafo" | **Manter na fase 2** | `dataProfiler.ts` já existe. A correção precisa de pré-visualização e de desfazer. |
| Micro-planilha dentro do canvas | **Adaptar e fundir com o preview** | A grade atual tem 2097 linhas e não cabe dentro de cada card. Criar uma grade leve virtualizada (TanStack Virtual) somente leitura; edição no canvas fica para a fase 3. |
| Time-travel slider | **Adiar (fase 3)** | Exige guardar a saída de cada nó. Fica viável quando o motor do grafo for por nós com cache. O undo/redo atual cobre o essencial. |
| What-if forks (ramificações) | **Adiar (fase 3)** | Bom valor, mas é a maior peça. Com tabelas imutáveis por nó, o "copy-on-write" sai quase de graça. Começar com parâmetros de cenário (ex.: +15% no tempo de pausa). |
| Cabos com partículas em shaders WebGL | **Cortar a parte WebGL** | Complexidade, bateria, acessibilidade e `prefers-reduced-motion`. SVG com gradiente animado entrega o mesmo efeito visual para dezenas de cabos. Canvas 2D só se houver centenas. |
| Computação reativa de grão fino "< 16 ms em centenas de milhares de linhas" | **Adaptar a meta** | Propagar só para nós afetados (grafo de dependências + dirty flags) é bom e já está no `plano_arquitetural_excel.md`. A meta de 16 ms para centenas de milhares de linhas com fórmulas livres não é realista no JS; mirar colunas tipadas + worker + DuckDB para agregações, com meta de ~100 ms em 100 mil linhas. |
| Cabos cromáticos (azul / roxo / laranja / vermelho) | **Manter** | Acrescentar ícone e rótulo além da cor (daltonismo). |
| Zoom semântico infinito (macro / médio / micro) | **Adaptar** | Aplicar dentro do canvas de relações (3 níveis de detalhe). **Não eliminar a aba Dados**: editar célula com grade completa continua exigindo a `SpreadsheetGrid`. Isso também conflita com o pedido de dar 75% da tela à tabela. |

**Redundâncias a fundir:** preview ao vivo + micro-planilha + inspetor de falhas + pré-validação de cardinalidade são a **mesma peça** (executar o nó em amostra e mostrar resultado e anomalias). Construir uma vez.

## 4. Arquitetura proposta

Código novo em `src/features/relations/` (por domínio, nenhum arquivo acima de 1000 linhas):

```
src/features/relations/
  model/      graph.ts (tipos), schema.ts (validação Zod), migrations.ts (versão do formato)
  runtime/    evaluate.ts (nó -> tabela, função pura), dag.ts (ordem e dirty flags), sample.ts, worker.ts
  analysis/   typeInference.ts, cardinality.ts, health.ts, ghostLinks.ts
  sql/        compile.ts (grafo -> SQL), dialects/ (duckdb, postgres, sqlserver)
  excel/      flowSheet.ts (serializar/ler a aba _Flow_v1), liveLink/ (fase 3)
  ai/         graphActions.ts (ações + validação), prompts.ts
  ui/         RelationsCanvas, nós, cabos, drawer, lens, HUD, controles de zoom
```

### 4.1 Modelo do grafo (a base de tudo)
- **Nós:** `table` (referencia uma aba), `transform` (`lookup`, `aggregate`, `filter`, `join`, `compute`, `union`) e `output` (nova aba, coluna, painel).
- **Arestas:** só fios (`fromNode.port -> toNode.port`), sem fórmula dentro. Cada porta carrega a coluna (`colId`, não o índice, para sobreviver a inserção/remoção de colunas).
- **Materialização idempotente:** cada nó guarda o que produziu (`outputSheetId`, `producedColIds`). Salvar de novo substitui; apagar remove. Resolve o problema nº 1.
- Persistência do grafo **junto com a pasta de trabalho** (IndexedDB), não só em localStorage.

### 4.2 Interface
- Aba **Relacionamentos** como primeira aba e padrão ao abrir (decisão do produto, ver seção 7).
- Nó de transformação clicável abre **drawer lateral** (critérios, valor se erro, intervalo, colunas de retorno) com **preview** embaixo.
- Âncoras por coluna medidas com `getBoundingClientRect` (ou `ResizeObserver`), recalculadas ao recolher, filtrar, rolar ou dar zoom.
- Tokens de design (cores dos cabos, escala tipográfica, espaçamentos) em um único arquivo; fonte e ícones em vetor.
- Recursos de LOD (nível de detalhe) por zoom: macro (só nomes e cabos), médio (colunas e regras), micro (amostra de linhas).

### 4.3 Motor
- `evaluate(node, inputs, { sample })` é função **pura**: serve ao preview, ao SQL, à IA e à execução real.
- Cálculo fora da thread principal (Web Worker + Comlink, já na dependência) e agregações pesadas via DuckDB.
- Recalcular só o ramo afetado (ordem topológica + marcação de nós sujos).

### 4.4 IA no grafo
Novas ações no protocolo, todas validadas por schema antes de executar: `add_table_node`, `add_transform`, `connect`, `update_transform`, `remove_node`, `run_graph`.
- Cada plano é mostrado como **diff** antes de aplicar; ações destrutivas pedem confirmação; tudo entra no histórico (desfazer).
- O texto da IA continua passando pelo mascaramento (`dataMasking.ts`) e a saída é sanitizada antes de renderizar.

### 4.5 Exportações
- **SQL:** compilar o grafo em CTEs. `PROCX/PROCV` -> `LEFT JOIN`; `SOMASE/MÉDIASE` -> `GROUP BY` + join; `FILTRO` -> `WHERE`; `UNIRTEXTO` -> `STRING_AGG`. Identificadores sempre entre aspas e escapados. Dialetos: DuckDB primeiro, depois PostgreSQL e SQL Server. Fórmulas livres sem equivalente saem comentadas com aviso. Cada teste roda o SQL gerado no DuckDB e compara com o resultado do motor.
- **Aba do fluxo no Excel:** `_Flow_v1` (oculta) com uma linha por nó e por aresta + JSON do nó, com versão do formato. Importação lê essa aba e reconstrói o grafo. Valores de texto que começam com `=`, `+`, `-` ou `@` recebem prefixo na exportação (injeção de fórmula).

## 5. Conexão em tempo real com o Excel: opções reais (DESCARTADA, ver seção 8)

> Mantida só como registro. O objetivo passou a ser deixar de usar o Excel.

| Opção | Tempo real? | Prós | Contras |
|---|---|---|---|
| **A. Suplemento do Office (Office.js)** | **Sim**, nos dois sentidos (eventos `onChanged`) | Funciona no Excel desktop e web; é a única opção realmente "ao vivo" | Projeto extra (manifesto, painel de tarefas, publicação/sideload) |
| **B. File System Access API** (Chrome/Edge) | Não: leitura por *polling* de `lastModified` | Simples, sem servidor | Só Chromium; o Excel trava o arquivo aberto, então gravar de volta falha enquanto ele está aberto |
| **C. Microsoft Graph (OneDrive/SharePoint)** | Quase (sessão de pasta de trabalho) | Funciona com arquivos na nuvem | Exige registro de app no Azure, OAuth e backend para guardar segredos |
| **D. Importar/exportar com a aba `_Flow_v1`** | Não | Já cobre "levar e trazer" | Manual |

**Recomendação:** entregar a **D** junto com o export (fase 2), **B** como atalho opcional de leitura, e **A** como a rota de tempo real (fase 3). Antes de investir, preciso saber se você usa Excel desktop, web ou ambos.

## 6. Segurança (urgente, antes de qualquer feature)

1. **Revogar e trocar a chave Gemini** do `ai_data_analysis_agent/.env` (está no histórico público do GitHub). Remover o arquivo do repositório e do histórico, e preencher o `.gitignore` com `.env*`, `__pycache__/`, `*.pyc`.
2. **Chave no navegador:** hoje fica em localStorage e vai na URL. Qualquer chave no front-end é exposta. Caminho correto: um **proxy server-side** (função serverless; o `vercel.json` já indica essa direção) com a chave em variável de ambiente, rate limit por IP/usuário, limite de tokens e timeout. Até lá, manter o modo "usuário cola a própria chave" com aviso claro e mover o envio da chave para o cabeçalho `x-goog-api-key`.
3. **Atualizar/trocar `xlsx@0.18.5`** e remover duplicidade com `exceljs`.
4. **Grafo e fluxo importados são entrada não confiável:** validar com Zod, bloquear `__proto__`/`constructor`/`prototype`, sem `eval`/`new Function`, limitar tamanho.
5. O projeto tem um gate de segurança em `AGENTS.md` (script `strix_audit.py`). Vou tratá-lo como etapa de saída de cada fase, se você confirmar.

Nota de arquitetura: o projeto hoje é só front-end, sem banco de dados próprio, então as regras de replicação líder-seguidor e RLS não se aplicam ainda. Se entrar um backend (proxy de IA, sincronização, Graph), ele nasce com segredos no servidor, validação estrita de entrada, rate limit, cookies seguros e leitura/escrita separadas.

## 7. Fases e ordem sugerida

**Fase 0: fundação (primeiro)**
- Segurança da seção 6 (itens 1, 3, 4).
- Modelo do grafo + persistência na pasta de trabalho + materialização idempotente.
- Âncoras medidas no DOM; correção do `fromCharCode`.
- Vitest para o motor e o grafo; limpeza do repo.

**Fase 1: a aba principal**
- Redesenho visual (tokens, cabos cromáticos, nós de transformação, drawer, LOD).
- Sugestão por tipo inferido; preview ao vivo; pré-validação de cardinalidade e pulsos no cabo.
- Aba Dados em 75% / 25% com divisor.

**Fase 2: integrações**
- IA com ações no grafo (com diff e confirmação).
- Exportar SQL (DuckDB e PostgreSQL primeiro) + aba `_Flow_v1` (exportar e reimportar).
- Inspetor de falhas, Data Health HUD, conexões fantasma (sugestão visual).

**Fase 3: avançado**
- Motor de fórmulas por grafo de dependências + worker/DuckDB, com metas de desempenho medidas (substitui o Excel).
- Paridade de uso: matrizes dinâmicas, séries no preenchimento, colar HTML, `Ctrl+setas`.
- Lens editável no canvas, time-travel, forks "e se".
- ~~Conexão ao vivo com o Excel~~ (removida: o objetivo é deixar de usar o Excel).

**Fora do plano por enquanto:** shaders WebGL, meta de 16 ms, snap magnético ao soltar, eliminar a aba Dados.

## 8. Decisões tomadas

1. **Excel:** o objetivo é **deixar de usar o Excel**. Portanto a conexão ao vivo com o Excel (suplemento do Office, Graph, File System Access) **sai do plano**. Fica apenas importar e exportar `.xlsx`/CSV como porta de entrada e saída. O esforço vai para tornar o próprio sistema completo, eficiente e inteligente (motor de fórmulas, desempenho, grafo, IA).
2. **Aba padrão:** a aba **Dados continua sendo a que abre por padrão**. A aba Relacionamentos ganha destaque visual e ocupa o primeiro lugar de navegação, mas não abre sozinha.
3. **SQL:** **DuckDB primeiro** (já roda no navegador, então cada SQL gerado pode ser validado contra o motor do grafo), depois **PostgreSQL**. SQL Server e outros ficam para depois.
4. **Pendente:** IA com chave do usuário no navegador ou proxy server-side (função serverless).

### Efeito das decisões no plano
- Fase 3 perde "conexão ao vivo com o Excel" e ganha **motor de fórmulas e desempenho** (grafo de dependências no lugar das 3 varreduras completas, Web Worker, colunas tipadas), porque agora o sistema precisa substituir o Excel.
- A aba `_Flow_v1` no export deixa de ser prioridade de migração e vira recurso de portabilidade do fluxo (continua útil para salvar e reabrir).
- Lacunas de paridade com o Excel (matrizes dinâmicas, séries no preenchimento, colar HTML, `Ctrl+setas`) já listadas em `plano_arquitetural_excel.md` passam a fazer parte do backlog desta fase.
