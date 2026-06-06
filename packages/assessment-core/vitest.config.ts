import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
        // v8 coverage parses uncovered files with rollup, which can't handle
        // Vue SFCs (<template>/<style>) — excluded to avoid PARSE_ERROR.
        'src/**/*.vue',
      ],
      // Phase 1 floor — set well below the current measured baseline from
      // issue #10 (stmts 27.0% / branches 29.8% / funcs 24.5% / lines 27.1%)
      // so CI catches regressions without breaking on small diffs. Raise
      // these in later phases as coverage grows.
      thresholds: {
        statements: 20,
        branches: 22,
        functions: 18,
        lines: 20,
      },
    },
  },
})
