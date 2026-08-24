import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // @nldd/design-system web components; keep in sync with the app vite configs.
          isCustomElement: (tag) => tag.startsWith('nldd-'),
        },
      },
    }),
  ],
  resolve: {
    alias: [
      // Keep NLDD custom elements unregistered in unit tests (jsdom): every
      // @nldd/design-system import resolves to an empty stub.
      {
        find: /^@nldd\/design-system(\/.*)?$/,
        replacement: fileURLToPath(new URL('./test/stubs/nldd-stub.ts', import.meta.url)),
      },
    ],
  },
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
