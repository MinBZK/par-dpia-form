import './assets/main.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useSchemaStore } from './stores/schemas'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const schemaStore = useSchemaStore(pinia)
schemaStore.init()

app.mount('#app')
