import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    coverage: {
      // istanbul instruments via the Vite transform pipeline, so Vue SFCs are
      // already plain JS by the time they're measured (v8 chokes on raw SFCs).
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      // Report on every source file, not only the ones a test imports, so
      // 100% genuinely means 100% of the codebase.
      include: ['src/**'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
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
