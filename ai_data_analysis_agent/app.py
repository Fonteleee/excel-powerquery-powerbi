import os
import ssl
import time
import json
import re
import tempfile
import csv
from pathlib import Path
import streamlit as st
import pandas as pd
import duckdb
from dotenv import load_dotenv

# Injetar suporte a certificados do sistema operacional Windows (Corporate Proxy / Zscaler / Fortinet)
try:
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass

# Forçar bypass SSL para ambiente corporativo
try:
    ssl._create_default_https_context = ssl._create_unverified_context
    import urllib3
    urllib3.disable_warnings()
except Exception:
    pass

# Carregar variáveis de ambiente locais
env_file_agent = Path(__file__).parent / ".env"
if env_file_agent.exists():
    load_dotenv(dotenv_path=env_file_agent)
else:
    load_dotenv()

st.set_page_config(
    page_title="AI Data Analyst - Gemini & DuckDB",
    page_icon="📊",
    layout="wide"
)

st.title("📊 AI Data Analyst Agent")
st.caption("Análise conversacional de planilhas e dados com Google Gemini e DuckDB (Motor Otimizado)")

# Sidebar - Configurações
with st.sidebar:
    st.header("⚙️ Configurações")
    provider = st.selectbox("Provedor de IA:", ["Google Gemini", "OpenAI"], index=0)
    
    if provider == "Google Gemini":
        saved_gemini_key = os.getenv("GEMINI_API_KEY", "")
        
        if "gemini_key" not in st.session_state:
            st.session_state.gemini_key = saved_gemini_key
            
        api_key = st.text_input(
            "Google Gemini API Key:", 
            value=st.session_state.gemini_key, 
            type="password", 
            help="Sua chave de API do Google AI Studio."
        )
        
        salvar_chave = st.checkbox("💾 Manter chave salva permanentemente", value=True)
        if api_key and salvar_chave and api_key != saved_gemini_key:
            st.session_state.gemini_key = api_key
            os.environ["GEMINI_API_KEY"] = api_key
            try:
                with open(env_file_agent, "w", encoding="utf-8") as f:
                    f.write(f"GEMINI_API_KEY={api_key}\n")
                st.success("✅ Chave salva com sucesso!")
            except Exception as e:
                st.warning(f"Não foi possível salvar no .env: {e}")
        elif api_key:
            st.session_state.gemini_key = api_key

        gemini_model_options = [
            "gemini-3-flash-preview (Testado & Altamente Estável)",
            "gemini-3.6-flash (Geração 3.6 - Validado)",
            "gemini-3.5-flash (Geração 3.5 - Validado)",
            "gemini-3.1-flash-lite (Geração 3.1 - Leve)",
            "gemini-3.7-flash (Geração 3.7)",
            "Outro (Inserir manualmente)"
        ]
        
        selected_option = st.selectbox("Modelo Gemini:", gemini_model_options, index=0)
        
        if "Outro" in selected_option:
            model_id = st.text_input("Nome exato do modelo Gemini:", value="gemini-3-flash-preview")
        else:
            model_id = selected_option.split(" ")[0]
            
    else:
        saved_openai_key = os.getenv("OPENAI_API_KEY", "")
        api_key = st.text_input("OpenAI API Key:", value=saved_openai_key, type="password")
        model_id = st.selectbox("Modelo OpenAI:", ["gpt-4o", "gpt-4o-mini", "o3-mini"], index=0)

    st.divider()
    st.subheader("🛡️ Conectividade")
    ignore_ssl = st.checkbox(
        "Ignorar Verificação SSL (Rede Corporativa / Proxy)", 
        value=True,
        help="Mantém a conexão estável mesmo em redes corporativas com inspeção SSL / Zscaler / Fortinet."
    )

    st.divider()
    st.markdown("**Sobre a Arquitetura:**")
    st.markdown("- **Single-Turn Engine**: O schema é passado diretamente ao Gemini em 1 única chamada, economizando 75% de cotas e evitando erros de rate limit (429).")
    st.markdown("- **DuckDB Local**: Execução analítica 100% na sua máquina.")

def preprocess_and_load_duckdb(file_or_path):
    try:
        if isinstance(file_or_path, (str, Path)):
            path_str = str(file_or_path)
            if path_str.endswith(".csv"):
                df = pd.read_csv(path_str, na_values=["NA", "N/A", "missing"])
            else:
                df = pd.read_excel(path_str, na_values=["NA", "N/A", "missing"])
        else:
            if file_or_path.name.endswith(".csv"):
                df = pd.read_csv(file_or_path, na_values=["NA", "N/A", "missing"])
            elif file_or_path.name.endswith((".xlsx", ".xls")):
                df = pd.read_excel(file_or_path, na_values=["NA", "N/A", "missing"])
            else:
                st.error("Formato não suportado. Utilize CSV ou Excel (.xlsx, .xls).")
                return None, None, None

        for col in df.columns:
            col_str = str(col).lower()
            if "data" in col_str or "date" in col_str:
                df[col] = pd.to_datetime(df[col], errors="coerce")
            elif df[col].dtype == "object":
                try:
                    df[col] = pd.to_numeric(df[col])
                except (ValueError, TypeError):
                    pass

        # Conectar ao DuckDB em memória
        con = duckdb.connect()
        con.register("uploaded_data", df)
        
        # Extrair schema detalhado
        schema_info = con.execute("DESCRIBE uploaded_data").fetchall()
        schema_text = "\n".join([f"- Coluna: `{col[0]}` (Tipo: {col[1]})" for col in schema_info])

        return con, df, schema_text
    except Exception as e:
        st.error(f"Erro ao processar o arquivo: {e}")
        return None, None, None

col1, col2 = st.columns([3, 1])
with col1:
    uploaded_file = st.file_uploader("Faça o upload do seu arquivo (CSV ou Excel):", type=["csv", "xlsx", "xls"])
with col2:
    st.write("")
    st.write("")
    use_sample = st.button("📂 Usar Planilha de Exemplo", use_container_width=True)

target_data_source = None
if uploaded_file is not None:
    target_data_source = uploaded_file
elif use_sample or st.session_state.get("use_sample_active", False):
    st.session_state["use_sample_active"] = True
    sample_file_path = Path(__file__).parent / "sample_vendas.csv"
    if sample_file_path.exists():
        target_data_source = str(sample_file_path)
    else:
        st.error("Arquivo de exemplo não encontrado.")

def execute_analysis_gemini(model_name, current_api_key, schema_text, user_query, con):
    from google import genai
    client = genai.Client(api_key=current_api_key)

    prompt = f"""Você é um analista de dados sênior especialista em SQL e estatística.
Você tem acesso a uma tabela no banco DuckDB chamada 'uploaded_data'.

ESTRUTURA DAS COLUNAS DA TABELA 'uploaded_data':
{schema_text}

PERGUNTA DO USUÁRIO:
"{user_query}"

INSTRUÇÕES:
1. Formule uma consulta SQL válida para DuckDB para responder exatamente à pergunta.
2. IMPORTANTE: Escreva a consulta SQL dentro de um bloco de código markdown:
```sql
SELECT ... FROM uploaded_data ...
```
3. Abaixo do bloco SQL, forneça uma explicação clara, didática e estruturada em Português do Brasil com insights analíticos, métricas calculadas e conclusões de negócio.
"""

    for attempt in range(1, 4):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt
            )
            return response.text
        except Exception as e:
            err_msg = str(e)
            if "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg:
                wait_match = re.search(r"retry in ([\d\.]+)s", err_msg)
                wait_seconds = float(wait_match.group(1)) + 1.0 if wait_match else (attempt * 4.0)
                if attempt < 3:
                    ph = st.empty()
                    for s in range(int(wait_seconds), 0, -1):
                        ph.info(f"⏳ Cota momentânea por minuto atingida. Aguardando {s}s para retentar automaticamente ({attempt}/3)...")
                        time.sleep(1)
                    ph.empty()
                    continue
            raise e

if target_data_source is not None:
    con, df, schema_text = preprocess_and_load_duckdb(target_data_source)

    if con is not None and df is not None:
        st.success("✅ Planilha carregada e indexada no DuckDB com sucesso!")
        
        m1, m2, m3 = st.columns(3)
        with m1:
            st.metric("Total de Linhas", f"{len(df):,}")
        with m2:
            st.metric("Total de Colunas", len(df.columns))
        with m3:
            mem_kb = df.memory_usage(deep=True).sum() / 1024
            st.metric("Memória Ocupada", f"{mem_kb:.1f} KB")

        with st.expander("🔍 Visualizar Dados da Planilha (Primeiras 15 linhas)", expanded=True):
            st.dataframe(df.head(15), use_container_width=True)

        st.markdown("### 💬 Converse com os Dados")

        current_key = st.session_state.get("gemini_key", "") if provider == "Google Gemini" else api_key

        if not current_key:
            st.warning("⚠️ Por favor, informe sua chave de API na barra lateral para habilitar as consultas.")
        else:
            st.markdown("**Sugestões de perguntas:**")
            sug_cols = st.columns(3)
            perguntas_sugeridas = [
                "Qual o faturamento total e ticket médio por região?",
                "Quem foi o melhor vendedor e qual produto mais vendeu?",
                "Mostre um resumo consolidado por categoria de produto."
            ]
            
            selected_query = None
            for idx, (col_sug, perg) in enumerate(zip(sug_cols, perguntas_sugeridas)):
                with col_sug:
                    if st.button(f"💡 {perg}", key=f"sug_{idx}", use_container_width=True):
                        selected_query = perg

            user_query = st.text_area(
                "Digite sua pergunta em linguagem natural:",
                value=selected_query if selected_query else "",
                placeholder="Ex: Qual região teve o maior faturamento e qual a margem média?",
                height=100
            )

            if st.button("🚀 Executar Análise", type="primary"):
                if not user_query.strip():
                    st.warning("Por favor, digite uma pergunta para analisar.")
                else:
                    with st.spinner(f"Processando consulta com {model_id} no DuckDB..."):
                        try:
                            # 1. Obter resposta e SQL da IA
                            ai_output = execute_analysis_gemini(model_id, current_key, schema_text, user_query, con)
                            
                            # 2. Extrair SQL
                            sql_match = re.search(r"```sql(.*?)```", ai_output, re.DOTALL)
                            
                            st.markdown("### 📈 Resultado da Análise")
                            
                            if sql_match:
                                query = sql_match.group(1).strip()
                                try:
                                    # Executar no DuckDB local
                                    result_df = con.execute(query).df()
                                    
                                    # Exibir tabela de dados calculados pelo DuckDB
                                    st.subheader("📊 Dados Consolidados pelo DuckDB:")
                                    st.dataframe(result_df, use_container_width=True)
                                except Exception as sql_err:
                                    st.warning(f"Aviso na execução direta do SQL: {sql_err}")
                            
                            # Exibir a análise explicativa completa
                            st.markdown(ai_output)
                            
                        except Exception as run_err:
                            st.error(f"Erro ao executar análise: {run_err}")
                            st.info("Dica: Se o modelo retornar cota esgotada, experimente selecionar 'gemini-3-flash-preview' ou 'gemini-3.5-flash' na barra lateral.")
else:
    st.info("👆 Faça o upload de um arquivo CSV/Excel ou clique no botão 'Usar Planilha de Exemplo' para começar.")
