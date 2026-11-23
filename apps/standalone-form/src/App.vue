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
import { buildReformulationMessages } from '@experiment/aiia'

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
const aiiaChatKey = ref('')    // this + send AiiaChat is for testing purposes!!

type ReformulationTask = Parameters<typeof buildReformulationMessages>[0]['task']

async function sendAiiaChat(
  task: ReformulationTask,
  answer: string,
): Promise<string> {
  const key = aiiaChatKey.value.trim()
  if (!key) throw new Error('Vul eerst je chat-sleutel in.')
  const messages = buildReformulationMessages({ task, parents: [] }, answer)

  const response = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  })
  const result: { detail?: unknown; reply?: unknown } | null = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      typeof result?.detail === 'string' ? result.detail : `Chatverzoek mislukt (HTTP ${response.status}).`,
    )
  }
  if (typeof result?.reply !== 'string') throw new Error('Het chat-antwoord bevat geen tekst.')
  return result.reply
}

// Which assessments have saved progress in localStorage. Recomputed whenever
// the landing page is shown, since localStorage is not reactive.
const ALL_TYPES: FormType[] = [FormType.PRE_SCAN, FormType.DPIA, FormType.IAMA, FormType.AIIA]
const cachedTypes = ref<FormType[]>([])
const refreshCachedTypes = () => {
  cachedTypes.value = ALL_TYPES.filter((type) => persistence.hasSavedState(type))
}
refreshCachedTypes()

const navigateTo = (view: ViewState) => {
  if (view === ViewState.Landing) refreshCachedTypes()
  if (view !== ViewState.AIIA) aiiaChatKey.value = ''
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
  goToAIIA: () => {
    taskStore.setActiveNamespace(FormType.AIIA)
    answerStore.setActiveNamespace(FormType.AIIA)
    taskStore.isInitialized[FormType.AIIA] = false
    navigateTo(ViewState.AIIA)
  },
}

// "Nieuwe starten": discard the saved session, then open a fresh form.
const goByType: Record<FormType, () => void> = {
  [FormType.PRE_SCAN]: () => navigationFunctions.goToPreScanDPIA(),
  [FormType.DPIA]: () => navigationFunctions.goToDPIA(),
  [FormType.IAMA]: () => navigationFunctions.goToIAMA!(),
  [FormType.AIIA]: () => navigationFunctions.goToAIIA!(),
}
const startFresh = (type: FormType) => {
  persistence.clearSavedState(type)
  goByType[type]()
}

// Wiping every namespace at once, for someone leaving a shared computer.
const clearAll = () => {
  ;[FormType.PRE_SCAN, FormType.DPIA, FormType.IAMA].forEach((type) => persistence.clearSavedState(type))
  refreshCachedTypes()
}

// Resuming (saved state present) jumps straight into the form; a fresh start
// shows the intro/upload page. clearSavedState() runs before navigation, so
// this reflects the right intent at mount time.

 // AIIA form is for testing- not finished
const isResume = (type: FormType) => persistence.hasSavedState(type)
</script>

<template>
  <!-- Landing page -->
  <LandingView
    v-if="currentView === ViewState.Landing"
    :navigation="navigationFunctions"
    :cached-types="cachedTypes"
    @start-fresh="startFresh"
    @clear-all="clearAll"
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


  <!-- AIIA Form -->
  <div
    v-if="currentView === ViewState.AIIA"
    class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--md"
  >
    <label class="rvo-label" for="aiia-chat-key">Chat-sleutel</label>
    <input
      id="aiia-chat-key"
      v-model="aiiaChatKey"
      type="password"
      autocomplete="off"
      class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--lg" />
    <p class="small-text">
        Maak een tijdelijke chat-sleutel in de ingelogde boekhouding-app via /chat-sleutel. De sleutel blijft alleen in het geheugen van deze pagina.
    </p>
  </div>
  <Form
    v-if="currentView === ViewState.AIIA"
    :navigation="navigationFunctions"
    :namespace="FormType.AIIA"
    :validData="schemaStore.getSchema(FormType.AIIA)"
    :autoStart="isResume(FormType.AIIA)"
    bannerTitle="Invulhulpen"
    :reformulate-text="sendAiiaChat"
  />
</template>
