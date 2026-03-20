<script setup lang="ts">
import { provide, ref } from 'vue'
import {
  FormType,
  ViewState,
  Form,
  useTaskStore,
  useAnswerStore,
  useSchemaStore,
  PERSISTENCE_KEY,
  type NavigationFunctions,
} from '@overheid-assessment/core'
import LandingView from './components/LandingView.vue'
import { createLocalPersistence } from './LocalPersistence'

import '@nl-rvo/assets/fonts/index.css'
import '@nl-rvo/assets/icons/index.css'
import '@nl-rvo/assets/images/index.css'
import '@nl-rvo/component-library-css/dist/index.css'
import '@nl-rvo/design-tokens/dist/index.css'

// Provide persistence (localStorage) to Form.vue
const persistence = createLocalPersistence()
provide(PERSISTENCE_KEY, persistence)

const taskStore = useTaskStore()
const answerStore = useAnswerStore()
const schemaStore = useSchemaStore()

const currentView = ref<ViewState>(ViewState.Landing)

const navigateTo = (view: ViewState) => {
  currentView.value = view
}

const navigationFunctions: NavigationFunctions = {
  goToLanding: () => navigateTo(ViewState.Landing),
  goToDPIA: () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    taskStore.isInitialized[FormType.DPIA] = false
    navigateTo(ViewState.DPIA)
  },
  goToPreScanDPIA: () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    taskStore.isInitialized[FormType.PRE_SCAN] = false
    navigateTo(ViewState.PreScanDPIA)
  },
}
</script>

<template>
  <!-- Landing page -->
  <LandingView v-if="currentView === ViewState.Landing" :navigation="navigationFunctions" />

  <!-- DPIA Form -->
  <Form
    v-if="currentView === ViewState.DPIA"
    :navigation="navigationFunctions"
    :namespace="FormType.DPIA"
     :validData="schemaStore.getSchema(FormType.DPIA)"
  />

  <!-- Pre Scan DPIA Form -->
  <Form
    v-if="currentView === ViewState.PreScanDPIA"
    :navigation="navigationFunctions"
    :namespace="FormType.PRE_SCAN"
    :validData="schemaStore.getSchema(FormType.PRE_SCAN)"
  />
</template>
