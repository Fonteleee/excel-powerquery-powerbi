// scripts/run-ssr.mjs
// Executa um módulo TypeScript do projeto pelo loader SSR do Vite (sem dependências novas).
// Uso: node scripts/run-ssr.mjs <arquivo.ts> [argumentos...]
// Os argumentos ficam em process.argv.slice(3) para o módulo executado.

import { resolve, relative, sep } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const entry = process.argv[2];

if (!entry) {
  console.error('Uso: node scripts/run-ssr.mjs <arquivo.ts> [argumentos...]');
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

let exitCode = 0;
try {
  const url = '/' + relative(root, resolve(root, entry)).split(sep).join('/');
  const mod = await server.ssrLoadModule(url);
  // Convenção: se o módulo exporta `main`, ele é executado (pode ser assíncrono).
  if (typeof mod.main === 'function') {
    const result = await mod.main(process.argv.slice(3));
    if (typeof result === 'number') exitCode = result;
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await server.close();
}
process.exit(exitCode);
