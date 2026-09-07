<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { getConfig } from '../config'
import '@nldd/design-system/button'
import '@nldd/design-system/simple-section'
import '@nldd/design-system/card'
import '@nldd/design-system/collection'
import '@nldd/design-system/container'
import '@nldd/design-system/icon'
import '@nldd/design-system/text'
import '@nldd/design-system/title'

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

const pillars: { icon: string; title: string; body: string }[] = [
  {
    icon: 'foundation',
    title: 'Gebaseerd op rijksbrede kaders',
    body: 'De pre-scan en DPIA volgen het Rapportagemodel DPIA Rijksdienst (versie 3.0) en de Informatiemodellen voor de DPIA en pre-scan DPIA. Het IAMA is gebaseerd op het instrument van de Universiteit Utrecht (versie 2.0).',
  },
  {
    icon: 'square-grid-2x2',
    title: 'Alles op één plek',
    body: 'Organiseer je assessments in projecten en houd verschillende versies van een DPIA of IAMA door de jaren heen bij elkaar. Zo vind je alles terug op één plek.',
  },
  {
    icon: 'seal-check-mark',
    title: 'Standaardisatie',
    body: 'De pre-scan, DPIA en IAMA volgen een gestandaardiseerd model. Dat maakt samenwerken, beoordelen en hergebruiken eenvoudiger.',
  },
  {
    icon: 'numbered-list',
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
  <nldd-simple-section width="60rem" padding-top="24">
    <nldd-container gap="48">
    <section aria-labelledby="landing-hero-title">
      <h1 id="landing-hero-title">
        Krijg grip op pre-scans, DPIA's en IAMA's
      </h1>
      <nldd-container max-width="42rem">
        <nldd-text>
          Begin met de pre-scan en vul daarna, afhankelijk van de uitkomst, een DPIA en/of IAMA in.
          Werk zonder account in je browser, ook offline, of log in om samen te werken.
        </nldd-text>
      </nldd-container>
    </section>

    <section aria-labelledby="landing-paths-title">
      <h2 id="landing-paths-title">Kies hoe je werkt</h2>
      <nldd-collection layout="grid" item-width="380px" gap="16px">
        <nldd-card>
          <nldd-container padding="16" gap="8">
            <h3>Zelfstandig invullen</h3>
            <p>
              Vul een pre-scan, DPIA of IAMA in zonder account of inloggen. Je antwoorden blijven
              lokaal in je browser. Je slaat je werk op als bestand, laadt het later weer in, of
              downloadt de invulhulp om offline te gebruiken.
            </p>
          </nldd-container>
          <nldd-container slot="footer" padding="16" padding-top="0">
            <nldd-button
              variant="primary"
              size="md"
              :href="standaloneUrl"
              text="Start zonder account"
            ></nldd-button>
          </nldd-container>
        </nldd-card>

        <nldd-card>
          <nldd-container padding="16" gap="8">
            <h3>Samenwerken</h3>
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
          </nldd-container>
          <nldd-container slot="footer" padding="16" padding-top="0">
            <nldd-button
              variant="primary"
              size="md"
              :text="isAuthenticated ? 'Naar projecten' : 'Inloggen'"
              @click="goToProjects"
            ></nldd-button>
          </nldd-container>
        </nldd-card>
      </nldd-collection>
    </section>

    <section aria-labelledby="landing-pillars-title">
      <h2 id="landing-pillars-title">Voor de overheid, door de overheid</h2>
      <nldd-collection layout="grid" item-width="20rem" gap="24px">
        <nldd-container
          v-for="pillar in pillars"
          :key="pillar.title"
          layout="row"
          gap="16"
          vertical-alignment="top"
        >
          <nldd-icon :name="pillar.icon" size="24" color="donkerblauw"></nldd-icon>
          <nldd-container gap="8">
            <nldd-title size="5"><h3>{{ pillar.title }}</h3></nldd-title>
            <nldd-text>{{ pillar.body }}</nldd-text>
          </nldd-container>
        </nldd-container>
      </nldd-collection>
    </section>

    <section id="assessments" aria-labelledby="landing-assessments-title">
      <h2 id="landing-assessments-title">De drie assessments</h2>
      <nldd-collection layout="grid" item-width="290px" gap="16px">
        <nldd-card v-for="assessment in assessments" :key="assessment.title">
          <nldd-container padding="16" gap="8">
            <h3>{{ assessment.title }}</h3>
            <p>{{ assessment.oneLiner }}</p>
          </nldd-container>
        </nldd-card>
      </nldd-collection>
      <p>
        <router-link to="/over" class="content-link">Lees meer over de invulhulpen</router-link>
      </p>
    </section>
    </nldd-container>
  </nldd-simple-section>
</template>
