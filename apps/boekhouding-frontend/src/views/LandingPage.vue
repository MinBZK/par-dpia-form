<script setup lang="ts">
import { useAuth } from '../composables/useAuth'
import { useRouter } from 'vue-router'
import { getConfig } from '../config'
import AppHeader from '../components/AppHeader.vue'

const { isAuthenticated, login } = useAuth()
const router = useRouter()
const standaloneUrl = getConfig().standaloneUrl

async function goToProjects() {
  if (isAuthenticated.value) {
    router.push('/projecten')
  } else {
    await login()
  }
}
</script>

<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <AppHeader />
    <h1 class="utrecht-heading-1 rvo-margin-block-start--xl">Invulhulpen</h1>

    <div class="rvo-layout-grid-container rvo-margin-block-start--lg">
      <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">
        <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card--full-colour--grijs-100">
          <div class="rvo-card__content card-content-flex">
            <h2 class="utrecht-heading-2 rvo-margin--none">Zelfstandig invullen</h2>
            <p class="rvo-padding-block-end--sm">
              Vul een pre-scan, DPIA of IAMA in zonder account. Alles blijft lokaal in je browser
              en kan als bestand worden opgeslagen.
            </p>
            <a
              :href="standaloneUrl"
              class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md"
            >
              Start zonder account
            </a>
          </div>
        </div>

        <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card--full-colour--grijs-100">
          <div class="rvo-card__content card-content-flex">
            <h2 class="utrecht-heading-2 rvo-margin--none">Samenwerken</h2>
            <p class="rvo-padding-block-end--sm">
              <template v-if="isAuthenticated">
                Ga naar je projecten en werk samen met je collega's aan een pre-scan, DPIA en/of IAMA.
              </template>
              <template v-else>
                Log in om samen met collega's aan een pre-scan, DPIA of IAMA te werken. Beheer projecten,
                nodig leden uit en houd de voortgang bij.
              </template>
            </p>
            <button
              class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-md"
              @click="goToProjects"
            >
              {{ isAuthenticated ? 'Naar projecten' : 'Inloggen' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
