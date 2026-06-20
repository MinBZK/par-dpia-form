import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { formatBuildVersion } from './src/version'

// Resolve the full display version at build time so it lands in the single-file
// bundle as one string literal. The production overlay (containers/frontend/
// overlay.Dockerfile) can then sed-replace the baked "ontwikkel (commit …)"
// marker with the CalVer tag, since the tag is unknown when this image is built.
const appVersion = formatBuildVersion(
  process.env.RELEASE_TAG ?? 'dev',
  (process.env.GIT_SHA ?? 'dev').slice(0, 7),
)

/** Inline favicon as data-URI in built HTML so the output is truly a single file. */
function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    enforce: 'post',
    generateBundle(_, bundle) {
      // Find the favicon asset and the HTML entry
      let faviconKey: string | undefined
      let faviconData: Uint8Array | undefined
      for (const [key, chunk] of Object.entries(bundle)) {
        if (key.endsWith('.ico') && chunk.type === 'asset') {
          faviconKey = key
          faviconData = chunk.source as Uint8Array
          break
        }
      }
      if (!faviconKey || !faviconData) return

      const base64 = Buffer.from(faviconData).toString('base64')

      // Replace favicon href in HTML and remove the loose asset
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'asset' && chunk.fileName.endsWith('.html')) {
          chunk.source = (chunk.source as string).replace(
            new RegExp(`<link rel="icon" href="[^"]*${faviconKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`),
            `<link rel="icon" href="data:image/x-icon;base64,${base64}" />`,
          )
        }
      }
      delete bundle[faviconKey]
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    mode === 'development' && vueDevTools(),
    inlineFavicon(),
    viteSingleFile(),
  ],
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@overheid-assessment/core': fileURLToPath(new URL('../../packages/assessment-core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5175,
    host: true,
    allowedHosts: true,
  },
}))
