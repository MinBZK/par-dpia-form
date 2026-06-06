import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@overheid-assessment/core': fileURLToPath(
        new URL('../../packages/assessment-core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.ts',
        'src/router.ts',
        'src/router/**',
        // v8 coverage parses uncovered files with rollup, which can't handle
        // Vue SFCs (<template>/<style>) — excluded to avoid PARSE_ERROR.
        'src/**/*.vue',
      ],
      // Phase 1 floor — set well below the current measured baseline from
      // issue #10 (stmts 8.7% / branches 4.7% / funcs 7.3% / lines 9.3%)
      // so CI catches regressions without breaking on small diffs. Raise
      // these in later phases as coverage grows.
      thresholds: {
        statements: 4,
        branches: 2,
        functions: 4,
        lines: 4,
      },
    },
  },
})
