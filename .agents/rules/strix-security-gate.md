# STRIX MANDATORY SECURITY GATE RULE

> [!IMPORTANT]
> **MANDATORY SECURITY PROTOCOL**:
> Todo e qualquer código desenvolvido, adicionado, refatorado ou modificado neste projeto DEVE passar pela auditoria de segurança Strix antes da conclusão de qualquer tarefa.

## Regras de Execução de Segurança:

1. **Gate Obrigatório de Pré-Conclusão**:
   - Nenhuma tarefa que envolva criação ou edição de código pode ser dada como concluída sem a execução da verificação de segurança:
     \\powershell
     python .agents/scripts/strix_audit.py --diff
     \   - Para alterações amplas, novos módulos ou releases:
     \\powershell
     python .agents/scripts/strix_audit.py --full
     \
2. **Diretrizes de Segurança Inegociáveis**:
   - **Zero Hardcoded Secrets**: Jamais inserir chaves, tokens, senhas ou strings sensíveis no código.
   - **Formula & Data Injection**: Fórmulas e dados de planilha importados/exportados devem ser sanitizados e analisados de forma estrita contra injeção de fórmulas CSV/Excel.
   - **XSS & DOM Safety**: Proibido uso de \dangerouslySetInnerHTML\ ou injeções de HTML sem sanitização rigorosa via DOMPurify.
   - **No Dynamic Code Execution**: Proibido o uso de \eval()\ ou construtores dinâmicos de funções (ew Function\).
   - **Prototype Pollution Defense**: Bloquear chaves como \__proto__\, \constructor\ e \prototype\ em merges/clones de objetos.

3. **Fluxo de Remediação**:
   - Se a auditoria acusar vulnerabilidades de severidade CRITICAL, HIGH ou MEDIUM, o agente DEVE priorizar a correção imediata no código antes de qualquer outra ação.
   - A tarefa só é finalizada quando a auditoria reportar 0 vulnerabilidades bloqueantes.
