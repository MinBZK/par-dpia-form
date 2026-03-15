import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiTarget = process.env.API_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@par-assessment/core': fileURLToPath(new URL('../../packages/assessment-core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    host: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/.well-known/security.txt': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
