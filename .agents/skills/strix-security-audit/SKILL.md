---
name: strix-security-audit
description: >-
  Auditoria autônoma de segurança e pentest baseada na metodologia Strix. 
  Executa varredura de vulnerabilidades (OWASP Top 10, Formula Injection, XSS, CSRF, Insecure Deserialization, Hardcoded Secrets, Prototype Pollution, Broken Access Control) em todo código novo ou modificado.
---

# Strix Security Audit & Quality Gate

Esta skill implementa o protocolo de segurança **Strix Guardian** no Antigravity.
Toda alteração de código, refatoração, nova funcionalidade ou implementação DEVE ser submetida a esta auditoria antes de ser finalizada.

--------------------------------------------------------------------------------

## 1. Princípios do Strix Security Guardian

1. **Zero Trust em Entrada de Usuário**: Toda entrada externa (inputs de UI, fórmulas de planilha, parâmetros de API, arquivos importados, WebSockets) deve ser estritamente tipada, validada e sanitizada.
2. **Prevenção Ativa de Injeção de Fórmulas (CSV/Excel Formula Injection)**:
   - Strings que começam com \=\, \+\, \-\, \@\, \	\, \\ em planilhas ou exports devem ser sanitizadas/escapadas para evitar execução maliciosa no cliente/Excel.
3. **Eliminação de Código Dinâmico Inseguro**: Proibição de \eval()\, ew Function()\, \setTimeout(string)\, \innerHTML\ sem sanitização DOMPurify, e interpolações inseguras de templates.
4. **Proteção de Segredos e Credenciais**: Nenhuma chave de API, token JWT, senha ou credencial em hardcode. Devem ser sempre carregados via variáveis de ambiente (\process.env\ / \.env\).
5. **Prevenção de Prototype Pollution**: Validação profunda em operações de merge/clone de objetos JSON ou estados reativos.
6. **Defesa em Profundidade de Comunicação**: Validação de origens em mensagens (\window.postMessage\), cabeçalhos de CORS restritivos e Content-Security-Policy (CSP).

--------------------------------------------------------------------------------

## 2. Checklist Obrigatório de Auditoria Pré-Conclusão

Ao auditar código novo ou alterado, o agente deve verificar sistematicamente cada categoria:

| Categoria | Verificação | Ação Corretiva |
| :--- | :--- | :--- |
| **Secrets & Keys** | Chaves privadas, tokens ou senhas no código? | Mover para variáveis de ambiente \.env\ |
| **Formula Injection** | Fórmulas ou dados de células executados sem parsing seguro? | Usar parser AST seguro; sanitizar prefixos perigosos |
| **XSS & DOM Injection** | \dangerouslySetInnerHTML\, \innerHTML\ ou \document.write\? | Substituir por textContent, React sanitizado ou DOMPurify |
| **Prototype Pollution** | \Object.assign\, spread ou loops sobre chaves \__proto__\/\constructor\? | Bloquear chaves reservadas em cópias profundas |
| **Dynamic Execution** | \eval()\, ew Function()\ ou compilação dinâmica? | Substituir por dispatch tables ou analisadores estáticos |
| **ReDoS (Regex)** | Expressões regulares com quantificadores aninhados vulneráveis a catástrofe? | Refatorar regex com limites claros ou usar parsers lineares |
| **State Tampering** | Manipulação de estado sem validação de tipos / schema? | Aplicar validação estrita (ex: Zod, TypeScript interfaces) |

--------------------------------------------------------------------------------

## 3. Execução Automatizada da Auditoria

Para executar a auditoria automatizada nativa no workspace:

### Modo Verificação de Alterações (Diff / Incremental):
\\powershell
python .agents/scripts/strix_audit.py --diff
\
### Modo Verificação Completa do Workspace:
\\powershell
python .agents/scripts/strix_audit.py --full
\
### Critérios de Aprovação:
- **0 Vulnerabilidades Críticas / Altas**
- **0 Segredos em Hardcode**
- **0 Violações de Injeção**

Se qualquer problema for detectado pelo script ou pela revisão manual do agente, a correção DEVE ser aplicada imediatamente e a auditoria reexecutada até o status **CLEAN / PASSED**.
