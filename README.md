# 📊 Excel Pro Studio & NocoDB Master Cockpit

> **Ambiente Unificado de Engenharia de Dados, Planilhas Relacionais, ETL Power Query com DuckDB WASM e Dashboard Power BI In-Browser.**

[![Live Demo](https://img.shields.io/badge/Demo-GitHub_Pages-2563eb?style=for-the-badge&logo=github)](https://fonteleee.github.io/excel-powerquery-powerbi/)
[![React 19](https://img.shields.io/badge/React-19.2.8-61dafb?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.3-38bdf8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![DuckDB WASM](https://img.shields.io/badge/DuckDB_WASM-v1.33-fff000?style=for-the-badge&logo=duckdb)](https://duckdb.org/)
[![Strix Security](https://img.shields.io/badge/Strix_Security-Passed_100%25-10b981?style=for-the-badge&logo=shield)](https://owasp.org/)
[![Accessibility](https://img.shields.io/badge/WCAG-2.2_Level_AA-8b5cf6?style=for-the-badge)](https://www.w3.org/WAI/standards-guidelines/wcag/)

---

## 🌐 Acesso Rápido & Live Demo

Acesse a aplicação em produção diretamente pelo seu navegador:
👉 **[https://fonteleee.github.io/excel-powerquery-powerbi/](https://fonteleee.github.io/excel-powerquery-powerbi/)**

---

## 📑 Visão Geral

O **Excel Pro Studio & NocoDB Master Cockpit** é uma plataforma moderna desenvolvida para preencher a lacuna entre a agilidade das planilhas eletrônicas convencionais, o poder dos bancos de dados relacionais (NocoDB / Airtable) e o processamento analítico massivo (Power Query / Power BI).

Toda a arquitetura é executada **100% no navegador (Client-Side)** com latência zero, tirando proveito de **WebAssembly (DuckDB WASM)** para consultas analíticas SQL em alta velocidade e renderização virtualizada para suporte a milhares de linhas e colunas simultâneas.

---

## 🚀 Módulos & Funcionalidades Principais

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                      EXCEL PRO STUDIO & NOCODB MASTER COCKPIT                     │
├─────────────────┬───────────────────┬───────────────────┬────────────────────────┤
│  📊 PLANILHA    │  🔗 RELAÇÕES n8n  │  ⚡ POWER QUERY   │  📈 POWER BI STUDIO    │
│  Grade NocoDB   │  Canvas Visual    │  DuckDB WASM      │  KPIs Executivos       │
│  50+ Fórmulas   │  Wizard 4 Passos  │  Applied Steps    │  Gráficos Spline       │
│  Flash Fill     │  Cruzamento PROCX │  Perfil Colunar   │  Pivot Table Dinâmica  │
│  Formatação Cond│  Intra-Tabela     │  SQL Analítico    │  Relatórios XLSX       │
└─────────────────┴───────────────────┴───────────────────┴────────────────────────┘
```

---

### 1. 📊 Grade de Dados NocoDB Super HD & Motor Excel Nativo

- **Virtualização Ultra-Rápida**: Construída com `@tanstack/react-virtual`, suportando rolagem fluida em 60 FPS sem gargalos de DOM.
- **Tipagem Visual Vetorial (Badges NocoDB)**: Identificação instantânea e tipada de colunas com ícones Lucide vetoriais:
  - 🔑 **ID / Chave Primária**: `<Key />` Âmbar
  - 📅 **Data & Criação**: `<Calendar />` Esmeralda
  - ⏱ **Hora / Duração**: `<Clock />` Azul-Celeste (formatado em `HH:MM:SS`)
  - 💲 **Moeda / Faturamento**: `<DollarSign />` Esmeralda (`R$ 0,00`)
  - `#` **Número / Quantidade**: `<Hash />` Roxo
  - 🏷 **Status & Categoria**: `<Tag />` Índigo
  - 👤 **Usuário & Agente**: `<User />` Ciano
  - **T** **Texto Geral**: `<Type />` Ardósia
- **Preenchimento Relâmpago Inteligente (`Ctrl+E` / Flash Fill)**: Detecção autônoma de padrões de texto (extração de nomes, domínios, códigos, formatações de telefone e CPF) com sugestão instantânea.
- **Lente de Análise Rápida (`Ctrl+Q` / Quick Analysis)**: Totais rápidos (Soma, Média, Contagem), formatação condicional instantânea, mini-gráficos e exportação rápida de seleções.
- **Formatação de Células (`Ctrl+1`)**: Configuração completa de tipografia (Plus Jakarta Sans, JetBrains Mono, Inter), cores de fundo, bordas, casas decimais e alinhamento.
- **Motor de Fórmulas Avançado**: Avaliação matemática e de texto com suporte a referências absolutas (`$A$1`), intervalos matriciais (`A1:B10`) e mais de 50 fórmulas clássicas:
  - *Lookup & Referência*: `PROCX`, `PROCV`, `ÍNDICE`, `CORRESP`, `FILTRO`, `ESCOLHER`
  - *Matemática & Estatística*: `SOMA`, `MÉDIA`, `SOMASE`, `SOMASES`, `CONT.SE`, `CONT.VALORES`, `MÁXIMO`, `MÍNIMO`, `ARRED`
  - *Lógica*: `SE`, `E`, `OU`, `NÃO`, `SEERRO`
  - *Texto*: `CONCATENAR`, `UNIRTEXTO`, `MAIÚSCULA`, `MINÚSCULA`, `ESQUERDA`, `DIREITA`, `NÚM.CARACT`, `SUBSTITUIR`
  - *Data & Hora*: `HOJE`, `AGORA`, `ANO`, `MÊS`, `DIA`, `HORA`, `MINUTO`, `SEGUNDO`
- **Importação & Exportação `.XLSX` Completa**: Leitura e escrita fiel de pastas de trabalho Excel com fórmulas, estilos e cores preservadas.

---

### 2. 🔗 Canvas Visual de Relacionamentos (Estilo n8n & Node-Based)

- **Interface de Nós Interativos**: Arraste visual de nós de tabelas com conexões de curvas Bézier animadas e portas de conexão magnéticas (hitboxes acessíveis de 28px).
- **Operações Intra-Tabela (Mesma Tabela)**:
  - *Soma de Colunas*: `Col_A + Col_B`
  - *Subtração / Diferença*: `Col_A - Col_B`
  - *Multiplicação*: `Col_A * Col_B`
  - *Divisão*: `Col_A / Col_B`
  - *Delta Percentual*: `(Col_B - Col_A) / Col_A`
  - *Concatenação*: `Col_A & " - " & Col_B`
  - *Regra Condicional*: `SE(Col_A >= 1000; "Meta Atingida"; "Pendente")`
  - *Soma Acumulada & Lag Temporal*: `SOMA($A$2:A2)` e `A2 - A1`
- **Operações Inter-Tabelas (Cruzamentos / Lookups)**:
  - Cruzamento visual gerando automaticamente fórmulas `PROCX`, `PROCV`, `SOMASE`, `MEDIASE`, `CONT.SE` ou `FILTRO`.
- **Wizard de Cruzamento em 4 Passos**:
  1. *Seleção de Ação*: Escolha intuitiva com cards explicativos.
  2. *Pareamento de Chaves*: Conexão de campos identificadores.
  3. *Coluna de Retorno & Destino*: Escolha da coluna de saída (próxima coluna vazia, final da tabela ou nova planilha).
  4. *Simulador em Tempo Real (3 Linhas de Teste)*: Prévia instantânea dos cálculos e terminal com a fórmula gerada antes da gravação.
- **Sincronização Bidirecional**: A criação do relacionamento injeta imediatamente a nova coluna calculada na grade de dados e ativa o recálculo reativo de todas as linhas.
- **Onboarding Inteligente**: Dica visual flutuante exibida no máximo 3 vezes para novos usuários com opção de dispensar a qualquer momento.

---

### 3. ⚡ Power Query ETL Studio (DuckDB WASM)

- **Processamento Analítico em Memória**: DuckDB WASM integrado rodando diretamente no browser através de Web Workers e Comlink.
- **Pipeline de Etapas Aplicadas (Applied Steps)**: Histórico sequencial de transformações com capacidade de voltar e inspecionar estados intermediários.
- **Perfilamento Estatístico de Colunas**: Distribuição de dados em tempo real, cardinalidade, detecção de valores nulos e histogramas de frequência.
- **Transformações Pré-Configuradas**:
  - Dividir coluna por delimitador (vírgula, ponto-e-vírgula, espaço, hífen).
  - Conversão e coerção estrita de tipos de dados.
  - Filtros avançados com sintaxe SQL.
  - Mesclagem (Merge/Join) e Agrupamento (Group By) colunar.

---

### 4. 📈 Power BI Dashboard Studio

- **Micro-KPI Cards Executivos**:
  - Ícone dinâmico inteligente: `<Clock />` para métricas temporais (`HH:MM:SS`), `<DollarSign />` para moedas e `<Activity />` para volumes.
  - Tipografia monoespaçada tabular de alto contraste (`font-mono tabular-nums text-slate-900 font-bold`).
- **Gráficos Analíticos com Recharts**:
  - Gráficos de barras com largura máxima calibrada (`maxBarSize={48}`) e cantos arredondados.
  - Gráficos de rosca (Donut) com distribuição percentual automática e paleta categórica de alta legibilidade.
  - Formatação inteligente nos eixos X/Y e tooltips flutuantes com sombras suaves.
- **Matriz de Tabela Dinâmica (Pivot Table)**:
  - Agrupamento dimensional cruzado com totais de linhas e colunas calculados em tempo real.
  - Exportação de relatórios gerenciais consolidados diretamente para `.XLSX`.

---

### 5. 🔮 NocoAI Copilot (Tema Obsidian Luxe)

- Assistente de IA acessível na barra superior e no rodapé da aplicação.
- Botão no estilo *Obsidian Luxe AI* (`bg-slate-900`, `border-violet-500/40`, `text-violet-200`).
- Assistência contextual para criação de fórmulas complexas, formatação de planilhas e análise de anomalias em datasets.

---

### 6. 🛡 Segurança & Acessibilidade Strix

- **Zero Hardcoded Secrets**: Nenhuma credencial ou token exposto no código-fonte.
- **Proteção contra Formula & CSV Injection**: Tratamento e escape de fórmulas maliciosas iniciadas por `=`, `+`, `-`, `@`, `DDE` ou comandos shell.
- **XSS & DOM Safety**: Sanitização estrita e ausência de `dangerouslySetInnerHTML` ou `eval()` dinâmico.
- **Defesa contra Prototype Pollution**: Bloqueio de mutações em `__proto__`, `constructor` e `prototype`.
- **Acessibilidade WCAG 2.2 Nível AA**:
  - Contraste de cor mínimo de $4.5:1$ para textos e $3:1$ para elementos visuais.
  - Alturas de toque e hitboxes mínimas de 28px/32px.
  - Indicador de foco duplo `:focus-visible` para navegação completa por teclado.
  - Suporte e preservação de `@media (prefers-reduced-motion: reduce)`.

---

## 🛠 Stack Tecnológico

| Camada | Tecnologia | Descrição |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 + TypeScript | Interface reativa orientada a componentes com tipagem estrita |
| **Estilização & Design** | Tailwind CSS v4 + Plus Jakarta Sans | Sistema de tokens semânticos OKLCH / Obsidian Master Cockpit |
| **Engine SQL In-Browser** | `@duckdb/duckdb-wasm` + Apache Arrow | Processamento colunar analítico com suporte a SQL padrão |
| **Virtualização de Grade** | `@tanstack/react-virtual` | Renderização virtualizada para suporte a grandes volumes |
| **Visualização de Dados** | Recharts 3 | Gráficos responsivos, splines suaves e tabelas dinâmicas |
| **Motor de Planilhas** | SheetJS (`xlsx`) + Parser Proprietário | Leitura/escrita `.xlsx` e avaliador de fórmulas Excel |
| **Iconografia** | Lucide React | Mais de 40 ícones vetoriais padronizados |
| **Build & Bundler** | Vite 8 + Rolldown | HMR ultrarrápido e compilação otimizada para produção |
| **Testes & Auditoria** | Playwright + Chrome DevTools + Strix | Testes E2E visuais e auditoria de segurança contínua |

---

## 📦 Instalação & Execução Local

### Pré-requisitos
- **Node.js**: Versão 18.0.0 ou superior
- **npm**: Versão 9.0.0 ou superior

### Passo a Passo

1. **Clonar o Repositório**:
   ```bash
   git clone https://github.com/Fonteleee/excel-powerquery-powerbi.git
   cd excel-powerquery-powerbi
   ```

2. **Instalar as Dependências**:
   ```bash
   npm install
   ```

3. **Iniciar o Servidor de Desenvolvimento**:
   ```bash
   npm run dev
   ```
   Acesse a aplicação em `http://localhost:5173`.

4. **Compilar o Build de Produção**:
   ```bash
   npm run build
   ```

5. **Visualizar o Build Localmente**:
   ```bash
   npm run preview
   ```

---

## 🔒 Auditoria de Segurança Strix

O projeto conta com o script de auditoria autônoma Strix para verificação contínua de vulnerabilidades de segurança:

```powershell
# Auditoria em arquivos modificados (Modo Diff)
python .agents/scripts/strix_audit.py --diff

# Auditoria completa em todos os arquivos do workspace
python .agents/scripts/strix_audit.py --full
```

---

## 📁 Estrutura do Projeto

```
excel-powerquery-powerbi/
├── .agents/                    # Scripts de auditoria de segurança Strix e regras de IA
├── src/
│   ├── components/
│   │   ├── Grid/               # Grade de dados virtualizada, células e autocomplete
│   │   ├── Header/             # Barra de fórmulas e controles superiores
│   │   ├── Modals/             # Análise Rápida, Formatação Condicional e Atalhos
│   │   ├── NocoLayout/         # Master Cockpit, Sidebar, Toolbar e Modal de Formatação
│   │   ├── PowerBI/            # Dashboard Studio, KPIs, Gráficos e Pivot Tables
│   │   ├── PowerQuery/         # ETL Studio, pipeline de etapas e perfilamento DuckDB
│   │   └── Relations/          # Canvas visual de relacionamentos n8n, Cards e Wizard
│   ├── data/                   # Datasets de exemplo estruturados (Vendas, RH, Financeiro)
│   ├── engine/                 # Motor de fórmulas Excel, Flash Fill e DuckDB WASM
│   ├── types/                  # Definições TypeScript (Planilhas, Relações, Fórmulas)
│   ├── utils/                  # Exportadores XLSX, formatadores de moeda e datas
│   ├── App.tsx                 # Orquestrador de visualizações e estado global
│   ├── index.css               # Tokens de design, fontes e estilos base
│   └── main.tsx                # Ponto de entrada da aplicação React
├── index.html                  # Shell HTML com fontes Plus Jakarta Sans e JetBrains Mono
├── package.json                # Dependências e scripts do projeto
├── vite.config.ts              # Configuração do Vite e Tailwind CSS v4
└── README.md                   # Documentação oficial do projeto
```

---

## 📄 Licença

Este projeto está sob licença MIT / Proprietária. Todos os direitos reservados.

---

<div align="center">
  <sub>Construído com excelência de design, engenharia de alta performance e segurança rigorosa.</sub>
</div>
