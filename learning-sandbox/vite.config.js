import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The reusable components live outside this app, in ../frontend/src/learning.
const learningDir = fileURLToPath(new URL('../frontend/src/learning', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@learning': learningDir },
    // Files under ../frontend have no node_modules of their own: resolve React from here.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: ['..'] },
  },
  preview: { port: 5174, strictPort: true },
});
