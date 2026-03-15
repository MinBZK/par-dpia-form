import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { viteSingleFile } from 'vite-plugin-singlefile'


// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    mode === 'development' && vueDevTools(),
    viteSingleFile(),
  ],
  base: '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@overheid-assessment/core': fileURLToPath(new URL('../../packages/assessment-core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5175,
    host: true,
    allowedHosts: true,
  },
}))
