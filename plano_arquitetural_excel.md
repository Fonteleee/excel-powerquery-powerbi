# Plano de Ação: Arquitetura Avançada e Benchmark do Excel

Com base na sua solicitação, analisei o bug de seleção e projetei o plano arquitetural para resolver os problemas de performance. Além disso, fiz um benchmark direto contra o motor do Microsoft Excel.

## 1. 🐛 Bug Resolvido: Seleção "Solta" (Marching Ants)
**O Problema:** Quando você clicava, arrastava para fora da tabela e soltava o botão, o navegador perdia o evento `onMouseUp` interno da `div`. O React continuava achando que você estava segurando o clique, fazendo a seleção "flutuar" solta.
**A Solução Aplicada:** Já injetei agora mesmo no `SpreadsheetGrid.tsx` um ouvinte global (`window.addEventListener('mouseup')`). Agora, mesmo que você solte o mouse fora do navegador ou em outra tela, a seleção irá travar perfeitamente, igual ao Excel nativo.

---

## 2. 🏗️ Resposta Arquitetural (Como evitar a implosão do Browser)

Conforme a auditoria dos agentes apontou, precisamos mudar o motor do avião em pleno voo. Aqui está o projeto exato para resolver os 3 gargalos:

### A. Web Workers (DuckDB e Fórmulas em Background)
- **O Risco:** Rodar DuckDB-WASM e recálculos na thread principal pausa a renderização do React (Main Thread Block). A tela congela.
- **A Solução:** Isolar o `duckdbEngine.ts` e o `recalculateSheet` em uma Web Worker dedicada. 
- **Tecnologia:** Vamos usar a biblioteca `comlink` do Google. A UI passará a pedir os dados de forma assíncrona (`await db.query()`), mantendo a tela a 60 FPS fluídos mesmo durante agregações de 50MB.

### B. Estado Atômico (Fim do Re-render Global)
- **O Risco:** Atualmente, o estado inteiro (`sheet.data`) vive no topo do React. Digitar "A" na célula A1 obriga o React a reconciliar 10.000 células para verificar o que mudou.
- **A Solução:** Migrar do `useState/Context` para Estado Atômico com **Jotai** ou **Signals**.
- **Como Funciona:** Cada célula será um pequeno átomo de estado (`atom()`). A célula C1 (que tem `=A1+B1`) se inscreve nos átomos A1 e B1 (formando um Grafo de Dependência - DAG). Se você digitar em A1, **APENAS** A1 e C1 re-renderizam. O React ignora as outras 9.998 células.

### C. Virtualização do DOM (Gestão de Memória)
- **O Risco:** O DOM do Chrome explode e trava se tentar injetar 10.000 `<tr>` e `<td>` reais de uma vez.
- **A Solução:** DOM Virtualization via **`@tanstack/react-virtual`**.
- **Como Funciona:** Em vez de renderizar a tabela inteira, o Virtualizer calcula o tamanho total da barra de rolagem (ex: 50.000px), mas injeta fisicamente no DOM apenas as ~100 células visíveis na sua tela naquele milissegundo (usando posições `absolute` no eixo X e Y).

---

## 3. 📊 Benchmark Microsoft Excel: O que nos falta?

Estudando profundamente o motor do Excel da Microsoft, identifiquei **5 melhorias cruciais** de lógica e funcionamento que o nosso React ainda não faz perfeitamente:

1. **Dynamic Arrays & Spill Behavior (Matrizes Dinâmicas):** No Excel, se você faz uma fórmula `=FILTRO()` ou `=ÚNICO()`, o resultado "derrama" (spills) automaticamente para as células vizinhas em branco. Nosso parser atual só entende valores únicos por célula e quebraria ou retornaria `#VALOR!` se tentasse retornar um array.
2. **Séries Inteligentes no Auto-Fill (Alça de Preenchimento):** Nosso sistema copia fórmulas. O Excel entende cronologia e geometria. Se você digitar "Segunda-feira" ou "ID-001" e arrastar a alça, o Excel preenche "Terça-feira" e "ID-002".
3. **Parse de Paste Enriquecido (HTML Table Paste):** Nosso `<SpreadsheetGrid>` só processa colagens de texto simples (`\t` e `\n`) ou do próprio sistema interno. O Excel consegue ler fragmentos de área de transferência ricos (`text/html`), preservando tabelas copiadas de sites, cores de fundo e mesclagens de células nativamente.
4. **Motor de Recálculo em Grafo Direcionado (DAG):** Nosso sistema atual de recálculo (em `formulaParser.ts`) faz varreduras completas 3 vezes para forçar a convergência de fórmulas. O Excel constrói uma "Árvore de Dependência" matemática. Ele sabe exatamente quem depende de quem, e só recalcula o galho que mudou, de forma instantânea.
5. **Navegação de Teclado Edge-Jump (`Ctrl + Setas`):** No Excel, apertar `Ctrl + Seta Direita` pula por todas as células vazias e para na próxima borda de dados. Isso é vital para power-users não precisarem usar o mouse. Nosso grid tem navegação direcional básica, mas não possui a inteligência de limites (boundaries).

### 🚨 As 3 Melhorias URGENTES a serem atacadas
Para deixarmos de ter arquitetura de "projeto estudantil" e virarmos um "SaaS Enterprise", devemos focar em:
1. **Refatoração para Estado Atômico (Jotai) e Virtualização (TanStack)**: Isso garantirá que a UI não quebre quando você tentar abrir planilhas reais de 20MB.
2. **Isolamento de Web Worker para DuckDB**: O coração da IA e análise de dados precisa rodar em background.
3. **Reescrever o Recálculo para DAG**: Para suportar planilhas encadeadas sem fritar a CPU com repetições em loop.
