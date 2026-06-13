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
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      // Report on every source file, not only the ones a test imports, so
      // 100% genuinely means 100% of the codebase.
      include: ['src/**'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
        'src/db/migrate.ts',
        'src/db/migrations/**',
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
