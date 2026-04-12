import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiTarget = process.env.API_URL || 'http://localhost:3000'

// VITE_ALLOWED_HOSTS: comma-separated list of hostnames the dev server accepts.
// Vite 5+ blocks non-localhost hosts by default as DNS rebinding protection.
// For dev on a shared server (e.g. reaching http://myserver:5174), set
// VITE_ALLOWED_HOSTS=myserver,localhost or VITE_ALLOWED_HOSTS=all to permit all.
const allowedHostsEnv = process.env.VITE_ALLOWED_HOSTS
const allowedHosts: true | string[] | undefined = allowedHostsEnv === 'all'
  ? true
  : allowedHostsEnv
    ? allowedHostsEnv.split(',').map(h => h.trim()).filter(Boolean)
    : undefined

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@overheid-assessment/core': fileURLToPath(new URL('../../packages/assessment-core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    host: true,
    allowedHosts,
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
