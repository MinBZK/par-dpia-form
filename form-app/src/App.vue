<script setup lang="ts">
import { ref } from 'vue'
import { FormType } from '@/models/dpia'
import LandingView from '@/components/LandingView.vue'
import Form from '@/components/Form.vue'
import { useTaskStore } from '@/stores/tasks'
import { useAnswerStore } from '@/stores/answers'
import { useSchemaStore } from '@/stores/schemas'
import { ViewState, type NavigationFunctions } from '@/models/navigation'

import '@nl-rvo/assets/fonts/index.css'
import '@nl-rvo/assets/icons/index.css'
import '@nl-rvo/assets/images/index.css'
import '@nl-rvo/component-library-css/dist/index.css'
import '@nl-rvo/design-tokens/dist/index.css'

const currentView = ref<ViewState>(ViewState.Landing)
const taskStore = useTaskStore()
const answerStore = useAnswerStore()
const schemaStore = useSchemaStore()

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
