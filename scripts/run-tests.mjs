// scripts/run-tests.mjs
// Executor de testes sem dependências extras: carrega cada `*.test.ts` pelo Vite (SSR)
// e deixa o `node:test` imprimir e decidir o código de saída.
// Uso: node scripts/run-tests.mjs [filtro]

import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { after } from 'node:test';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const filter = process.argv[2] ?? '';

function collect(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...collect(full));
    else if (name.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

const files = collect(join(root, 'src'))
  .filter(f => f.includes(filter))
  .sort();

if (files.length === 0) {
  console.error(`Nenhum teste encontrado${filter ? ` para "${filter}"` : ''}.`);
  process.exit(1);
}

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

for (const file of files) {
  await server.ssrLoadModule('/' + relative(root, file).split(sep).join('/'));
}

// Registrado só depois de carregar tudo: fecha o Vite quando o último teste terminar.
after(() => server.close());
