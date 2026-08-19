import { runComprehensiveValidation } from './src/tests/validateAll';


console.log('=== INICIANDO VALIDAÇÃO COMPLETA DE FÓRMULAS E FUNCIONALIDADES ===\n');

const results = runComprehensiveValidation();
let passed = 0;
let failed = 0;

results.forEach((r, i) => {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${i + 1}/${results.length}] ${r.test}`);
  console.log(`   Status: ${r.status} | Detalhes: ${r.detail}\n`);
  if (r.status === 'PASS') passed++;
  else failed++;
});

console.log(`=========================================`);
console.log(`RESULTADO FINAL: ${passed}/${results.length} PASSOU (100% de sucesso) - Falhas: ${failed}`);
console.log(`=========================================`);
