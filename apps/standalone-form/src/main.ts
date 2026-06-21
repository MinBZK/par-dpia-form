import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useSchemaStore, installTrustedTypesPolicy } from '@overheid-assessment/core'

import dpiaJson from '../../../sources/generated/DPIA.json'
import preScanJson from '../../../sources/generated/PreScanDPIA.json'
import iamaJson from '../../../sources/generated/IAMA.json'

// Register the Trusted Types default policy before any v-html reaches a DOM sink.
installTrustedTypesPolicy()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const schemaStore = useSchemaStore(pinia)
schemaStore.init({ preScan: preScanJson, dpia: dpiaJson, iama: iamaJson })

app.mount('#app')
