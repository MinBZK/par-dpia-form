import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useSchemaStore } from '@par-assessment/core'

import dpiaJson from '../../../sources/generated/DPIA.json'
import preScanJson from '../../../sources/generated/PreScanDPIA.json'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const schemaStore = useSchemaStore(pinia)
schemaStore.init({ dpia: dpiaJson, preScan: preScanJson })

app.mount('#app')
