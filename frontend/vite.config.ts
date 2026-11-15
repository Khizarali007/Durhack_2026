import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tradingTarget = env['VITE_API_TARGET'] ?? 'http://localhost:8000'
  const learningTarget = env['VITE_LEARNING_TARGET'] ?? 'http://localhost:8001'
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/market': { target: tradingTarget, changeOrigin: true, ws: true },
        '/trading': { target: tradingTarget, changeOrigin: true, ws: true },
        '/learning': { target: learningTarget, changeOrigin: true, ws: true },
      },
    },
  }
})
