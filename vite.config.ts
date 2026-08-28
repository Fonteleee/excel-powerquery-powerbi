import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  base: './', // Allows seamless deployment to GitHub Pages subpaths, Vercel, and custom domains
  plugins: [
    react(),
    tailwindcss(),
  ],
  worker: {
    format: 'es',
  },
});
