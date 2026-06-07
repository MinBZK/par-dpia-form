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

// Which assessments have saved progress in localStorage. Recomputed whenever
// the landing page is shown, since localStorage is not reactive.
const cachedTypes = ref<FormType[]>([])
const refreshCachedTypes = () => {
  cachedTypes.value = [FormType.PRE_SCAN, FormType.DPIA, FormType.IAMA].filter((type) =>
    persistence.hasSavedState(type),
  )
}
refreshCachedTypes()

const navigateTo = (view: ViewState) => {
  if (view === ViewState.Landing) refreshCachedTypes()
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
  goToIAMA: () => {
    taskStore.setActiveNamespace(FormType.IAMA)
    answerStore.setActiveNamespace(FormType.IAMA)
    taskStore.isInitialized[FormType.IAMA] = false
    navigateTo(ViewState.IAMA)
  },
}

// "Nieuwe starten": discard the saved session, then open a fresh form.
const goByType: Record<FormType, () => void> = {
  [FormType.PRE_SCAN]: () => navigationFunctions.goToPreScanDPIA(),
  [FormType.DPIA]: () => navigationFunctions.goToDPIA(),
  [FormType.IAMA]: () => navigationFunctions.goToIAMA!(),
}
const startFresh = (type: FormType) => {
  persistence.clearSavedState(type)
  goByType[type]()
}

// Resuming (saved state present) jumps straight into the form; a fresh start
// shows the intro/upload page. clearSavedState() runs before navigation, so
// this reflects the right intent at mount time.
const isResume = (type: FormType) => persistence.hasSavedState(type)
</script>

<template>
  <!-- Landing page -->
  <LandingView
    v-if="currentView === ViewState.Landing"
    :navigation="navigationFunctions"
    :cached-types="cachedTypes"
    @start-fresh="startFresh"
  />

  <!-- DPIA Form -->
  <Form
    v-if="currentView === ViewState.DPIA"
    :navigation="navigationFunctions"
    :namespace="FormType.DPIA"
    :validData="schemaStore.getSchema(FormType.DPIA)"
    :autoStart="isResume(FormType.DPIA)"
    bannerTitle="Invulhulpen"
  />

  <!-- Pre Scan DPIA Form -->
  <Form
    v-if="currentView === ViewState.PreScanDPIA"
    :navigation="navigationFunctions"
    :namespace="FormType.PRE_SCAN"
    :validData="schemaStore.getSchema(FormType.PRE_SCAN)"
    :autoStart="isResume(FormType.PRE_SCAN)"
    bannerTitle="Invulhulpen"
  />

  <!-- IAMA Form -->
  <Form
    v-if="currentView === ViewState.IAMA"
    :navigation="navigationFunctions"
    :namespace="FormType.IAMA"
    :validData="schemaStore.getSchema(FormType.IAMA)"
    :autoStart="isResume(FormType.IAMA)"
    bannerTitle="Invulhulpen"
  />
</template>
