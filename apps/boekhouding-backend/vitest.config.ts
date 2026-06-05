import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    // Integration tests share a single Postgres DB; running suites serially
    // avoids cross-file interference from TRUNCATE. Within a file, tests still
    // run sequentially by default.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
        'src/db/migrate.ts',
        'src/db/migrations/**',
      ],
      // Phase 1 floor — set well below the current measured baseline from
      // issue #10 (stmts 13.5% / branches 18.1% / funcs 8.1% / lines 12.6%)
      // so CI catches regressions without breaking on small diffs. Raise
      // these in later phases as coverage grows.
      thresholds: {
        statements: 8,
        branches: 12,
        functions: 5,
        lines: 8,
      },
    },
  },
})
