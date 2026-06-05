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
  },
})
