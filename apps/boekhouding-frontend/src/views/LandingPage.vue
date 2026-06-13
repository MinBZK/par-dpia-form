<script setup lang="ts">
import type { Component } from 'vue'
import { useRouter } from 'vue-router'
import { IconBuildingBank, IconLayoutGrid, IconCopyCheck, IconListNumbers } from '@tabler/icons-vue'
import { useAuth } from '../composables/useAuth'
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

const pillars: { icon: Component; title: string; body: string }[] = [
  {
    icon: IconBuildingBank,
    title: 'Gebaseerd op rijksbrede kaders',
    body: 'De pre-scan en DPIA volgen het Rapportagemodel DPIA Rijksdienst (versie 3.0) en de Informatiemodellen voor de DPIA en pre-scan DPIA. Het IAMA is gebaseerd op het instrument van de Universiteit Utrecht (versie 2.0).',
  },
  {
    icon: IconLayoutGrid,
    title: 'Alles op één plek',
    body: 'Organiseer je assessments in projecten en houd verschillende versies van een DPIA of IAMA door de jaren heen bij elkaar. Zo vind je alles terug op één plek.',
  },
  {
    icon: IconCopyCheck,
    title: 'Standaardisatie',
    body: 'De pre-scan, DPIA en IAMA volgen een gestandaardiseerd model. Dat maakt samenwerken, beoordelen en hergebruiken eenvoudiger.',
  },
  {
    icon: IconListNumbers,
    title: 'Stapsgewijs',
    body: 'Gerichte vragen met uitleg en bronnen leiden je door het assessment, zodat je weet wat er nodig is en niets vergeet.',
  },
]

const assessments = [
  {
    title: 'Pre-scan',
    oneLiner:
      'Bepaal met gerichte vragen of een DPIA, IAMA, DTIA of KIA nodig is voor jouw project.',
  },
  {
    title: 'Data Protection Impact Assessment (DPIA)',
    oneLiner:
      "Breng bij verwerkingen van persoonsgegevens de privacyrisico's voor betrokkenen in beeld.",
  },
  {
    title: 'Impact Assessment Mensenrechten en Algoritmes (IAMA)',
    oneLiner:
      'Beoordeel de impact van algoritmes op mensenrechten en publieke waarden, voorafgaand aan de ontwikkeling of inzet van een algoritme.',
  },
]
</script>

<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <AppHeader />

    <section class="landing-hero" aria-labelledby="landing-hero-title">
      <h1 id="landing-hero-title" class="utrecht-heading-1 rvo-margin--none">
        Krijg grip op pre-scans, DPIA's en IAMA's
      </h1>
      <p class="landing-hero__lead">
        Begin met de pre-scan en vul daarna, afhankelijk van de uitkomst, een DPIA en/of IAMA in.
        Werk zonder account in je browser, ook offline, of log in om samen te werken.
      </p>
    </section>

    <section class="landing-section" aria-labelledby="landing-paths-title">
      <h2 id="landing-paths-title" class="utrecht-heading-2">Kies hoe je werkt</h2>
      <div class="rvo-layout-grid-container">
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card--full-colour--grijs-100">
            <div class="rvo-card__content card-content-flex">
              <h3 class="utrecht-heading-3 rvo-margin--none">Zelfstandig invullen</h3>
              <p>
                Vul een pre-scan, DPIA of IAMA in zonder account of inloggen. Je antwoorden blijven
                lokaal in je browser. Je slaat je werk op als bestand, laadt het later weer in, of
                downloadt de invulhulp om offline te gebruiken.
              </p>
              <a
                :href="standaloneUrl"
                class="rvo-button rvo-button--primary rvo-button--size-md"
              >
                Start zonder account
              </a>
            </div>
          </div>

          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card--full-colour--grijs-100">
            <div class="rvo-card__content card-content-flex">
              <h3 class="utrecht-heading-3 rvo-margin--none">Samenwerken</h3>
              <p v-if="isAuthenticated">
                Ga naar je projecten om samen met collega's en adviseurs te werken. Groepeer je
                pre-scans, DPIA's en IAMA's in projecten en nodig anderen uit. Inclusief
                versiebeheer en de mogelijkheid om opmerkingen te plaatsen.
              </p>
              <p v-else>
                Log in om samen met collega's en adviseurs te werken. Groepeer je pre-scans, DPIA's
                en IAMA's in projecten en nodig anderen uit. Inclusief versiebeheer en de
                mogelijkheid om opmerkingen te plaatsen.
              </p>
              <button
                class="rvo-button rvo-button--primary rvo-button--size-md"
                @click="goToProjects"
              >
                {{ isAuthenticated ? 'Naar projecten' : 'Inloggen' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="landing-section" aria-labelledby="landing-pillars-title">
      <h2 id="landing-pillars-title" class="utrecht-heading-2">Voor de overheid, door de overheid</h2>
      <ul class="landing-pillars" role="list">
        <li v-for="pillar in pillars" :key="pillar.title" class="landing-pillar">
          <component
            :is="pillar.icon"
            class="landing-pillar__icon"
            :size="32"
            aria-hidden="true"
            focusable="false"
          />
          <div>
            <h3 class="utrecht-heading-3 rvo-margin--none">{{ pillar.title }}</h3>
            <p class="rvo-margin--none">{{ pillar.body }}</p>
          </div>
        </li>
      </ul>
    </section>

    <section id="assessments" class="landing-section" aria-labelledby="landing-assessments-title">
      <h2 id="landing-assessments-title" class="utrecht-heading-2">De drie assessments</h2>
      <div class="rvo-layout-grid-container">
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--three">
          <div
            v-for="assessment in assessments"
            :key="assessment.title"
            class="rvo-card rvo-card--outline rvo-card--padding-md"
          >
            <div class="rvo-card__content">
              <h3 class="utrecht-heading-3 rvo-margin--none">{{ assessment.title }}</h3>
              <p class="rvo-margin--none">{{ assessment.oneLiner }}</p>
            </div>
          </div>
        </div>
      </div>
      <p class="rvo-margin-block-start--md">
        <router-link to="/over" class="rvo-link">Lees meer over de invulhulpen</router-link>
      </p>
    </section>
  </div>
</template>
