import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Content-Security-Policy só no build/preview: o dev server do Vite injeta script inline (React Refresh) e websocket.
// 'wasm-unsafe-eval' = DuckDB-WASM; worker blob: = worker do DuckDB; fontes do Google Fonts; IA do Gemini.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' blob: data: https://generativelanguage.googleapis.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'verxel-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './', // Allows seamless deployment to GitHub Pages subpaths, Vercel, and custom domains
  plugins: [
    react(),
    tailwindcss(),
    cspMeta(),
  ],
  worker: {
    format: 'es',
  },
});
