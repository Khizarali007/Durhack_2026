import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The real components live outside this app, in ../frontend/src.
const frontendSrc = fileURLToPath(new URL('../frontend/src', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': frontendSrc },
    // Files under ../frontend have no node_modules of their own: resolve React from here.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: ['..'] },
  },
  preview: { port: 5174, strictPort: true },
})
