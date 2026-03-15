import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useSchemaStore } from '@overheid-assessment/core'
import { useAuth } from './composables/useAuth'

import '@nl-rvo/assets/fonts/index.css'
import '@nl-rvo/assets/icons/index.css'
import '@nl-rvo/assets/images/index.css'
import '@nl-rvo/component-library-css/dist/index.css'
import '@nl-rvo/design-tokens/dist/index.css'
import './assets/app.css'

const { init } = useAuth()

// Keycloak redirects to login page before the app mounts.
// Clean up the OAuth hash fragment BEFORE importing the router — createWebHistory()
// reads window.location at module evaluation time and captures the hash as initial state.
await init()
if (window.location.hash.includes('state=')) {
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
}

// Dynamic import: router must be created AFTER the URL is clean
const { router } = await import('./router')

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const schemaStore = useSchemaStore(pinia)

app.mount('#app')
