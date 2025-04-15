import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import path from 'path'
import { viteSingleFile } from 'vite-plugin-singlefile'


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    viteSingleFile(
    ),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
      //'@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    // Ensure large inline limit for embedding all assets
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000000,
    // More detailed build output
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // Ensure no code splitting happens
        manualChunks: undefined,
        inlineDynamicImports: true
      }
    }
  }
})
