import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useSchemaStore, installTrustedTypesPolicy } from '@overheid-assessment/core'
import { loadConfig } from './config'
import { useAuth } from './composables/useAuth'

import '@nl-rvo/assets/fonts/index.css'
import '@nl-rvo/assets/icons/index.css'
import '@nl-rvo/assets/images/index.css'
import '@nl-rvo/component-library-css/dist/index.css'
import '@nl-rvo/design-tokens/dist/index.css'
import './assets/app.css'

// Register the Trusted Types default policy before anything (Keycloak, Vue
// v-html) touches a DOM sink. No-op where Trusted Types is unsupported.
installTrustedTypesPolicy()

await loadConfig()
const { init, user } = useAuth()

// Keycloak redirects to login page before the app mounts.
// Clean up the OAuth hash fragment BEFORE importing the router — createWebHistory()
// reads window.location at module evaluation time and captures the hash as initial state.
await init()
if (window.location.hash.includes('state=')) {
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
}

const reloginRaw = sessionStorage.getItem('auth:relogin')
if (reloginRaw) {
  sessionStorage.removeItem('auth:relogin')
  try {
    const { userId: previousUserId } = JSON.parse(reloginRaw)
    if (user.value && previousUserId && user.value.id !== previousUserId) {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i)
        if (key?.startsWith('pending:')) sessionStorage.removeItem(key)
      }
      window.location.href = '/projecten'
    }
  } catch { /* ignore parse errors */ }
}

// Dynamic import: router must be created AFTER the URL is clean
const { router } = await import('./router')

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const schemaStore = useSchemaStore(pinia)

app.mount('#app')
