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
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      // Report on every source file, not only the ones a test imports, so
      // 100% genuinely means 100% of the codebase.
      include: ['src/**'],
      exclude: [
        'src/**/*.d.ts',
        // Static assets (CSS, fonts) carry no executable code.
        'src/assets/**',
        // Only resolves the gitignored generated manifest.json (a build artefact absent
        // during tests); the page test mocks it. Nothing else to cover.
        'src/sourceManifest.ts',
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
