<script setup lang="ts">
import { ref } from 'vue'
import LandingView from '@/components/LandingView.vue'
import DPIAForm from '@/components/DPIAForm.vue'
import PreScanDPIAForm from '@/components/PreScanDPIAForm.vue'
import { ViewState, type NavigationFunctions } from '@/models/navigation'

import '@nl-rvo/assets/fonts/index.css'
import '@nl-rvo/assets/icons/index.css'
import '@nl-rvo/assets/images/index.css'
import '@nl-rvo/component-library-css/dist/index.css'
import '@nl-rvo/design-tokens/dist/index.css'

const currentView = ref<ViewState>(ViewState.Landing)

const navigateTo = (view: ViewState) => {
  currentView.value = view
}

const navigationFunctions: NavigationFunctions = {
  goToLanding: () => navigateTo(ViewState.Landing),
  goToDPIA: () => navigateTo(ViewState.DPIA),
  goToPreScanDPIA: () => navigateTo(ViewState.PreScanDPIA)
}
</script>


<template>
  <LandingView v-if="currentView === ViewState.Landing" :navigation="navigationFunctions" />
  <DPIAForm v-if="currentView === ViewState.DPIA" :navigation="navigationFunctions" />
  <PreScanDPIAForm v-if="currentView === ViewState.PreScanDPIA" :navigation="navigationFunctions" />
</template>
