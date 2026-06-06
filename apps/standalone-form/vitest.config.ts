import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Dedicated test config: the production vite.config.ts wires up the
// singlefile/favicon-inlining build plugins which are irrelevant (and
// disruptive) under vitest. Only the Vue plugin and path aliases are needed.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@overheid-assessment/core': fileURLToPath(
        new URL('../../packages/assessment-core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      // Report on every source file, not only the ones a test imports, so
      // 100% genuinely means 100% of the codebase.
      all: true,
      include: ['src/**'],
      exclude: [
        'src/**/*.d.ts',
        // Static assets (CSS, fonts) carry no executable code.
        'src/assets/**',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
