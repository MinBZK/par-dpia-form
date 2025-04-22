<script setup lang="ts">
import { ref } from 'vue'
import LandingView from '@/components/LandingView.vue'
import Form from '@/components/Form.vue'
import { useTaskStore } from '@/stores/tasks'
import { useAnswerStore } from '@/stores/answers'
import { ViewState, type NavigationFunctions } from '@/models/navigation'

import dpia_json from '@/assets/DPIA.json'
import pre_dpia_json from '@/assets/PreScanDPIA.json'

import '@nl-rvo/assets/fonts/index.css'
import '@nl-rvo/assets/icons/index.css'
import '@nl-rvo/assets/images/index.css'
import '@nl-rvo/component-library-css/dist/index.css'
import '@nl-rvo/design-tokens/dist/index.css'

const currentView = ref<ViewState>(ViewState.Landing)
const taskStore = useTaskStore()
const answerStore = useAnswerStore()

const navigateTo = (view: ViewState) => {
  currentView.value = view
}

const navigationFunctions: NavigationFunctions = {
  goToLanding: () => navigateTo(ViewState.Landing),
  goToDPIA: () => {
    taskStore.setActiveNamespace('dpia')
    answerStore.setActiveNamespace('dpia')
    taskStore.isInitialized['dpia'] = false
    navigateTo(ViewState.DPIA)
  },
  goToPreScanDPIA: () => {
    taskStore.setActiveNamespace('prescan')
    answerStore.setActiveNamespace('prescan')
    taskStore.isInitialized['prescan'] = false
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
    namespace="dpia"
    :formData="dpia_json"
  />

  <!-- Pre Scan DPIA Form -->
  <Form
    v-if="currentView === ViewState.PreScanDPIA"
    :navigation="navigationFunctions"
    namespace="prescan"
    :formData="pre_dpia_json"
  />
</template>
