<script setup lang="ts">
import { computed } from 'vue'
import AppHeader from '../components/AppHeader.vue'

const hasHistory = computed(() => !!window.history.state?.back)
</script>

<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <AppHeader
      :backLabel="hasHistory ? 'Terug' : 'Ga naar home'"
      :backRoute="hasHistory ? undefined : '/'"
      :showBack="hasHistory"
    />

    <h1 class="utrecht-heading-1">Contact</h1>

    <p>
      Invulhulpen is een applicatie van het Ministerie van Binnenlandse Zaken en
      Koninkrijksrelaties (BZK), als hulpmiddel bij het uitvoeren van een pre-scan, DPIA of IAMA.
      De applicatie is in ontwikkeling; vragen en feedback zijn welkom.
    </p>

    <h2 class="utrecht-heading-2">Vragen over de applicatie</h2>
    <p>Voor vragen, feedback of meldingen over de applicatie zelf:</p>
    <ul>
      <li>E-mail: <a href="mailto:RIG@rijksoverheid.nl">RIG@rijksoverheid.nl</a></li>
      <li>
        GitHub:
        <a href="https://github.com/MinBZK/par-dpia-form/issues" target="_blank" rel="noopener noreferrer">Issues melden</a>
      </li>
    </ul>

    <h2 class="utrecht-heading-2">Inhoudelijke vragen over pre-scan, DPIA of IAMA</h2>
    <p>
      Voor inhoudelijke vragen over een pre-scan, DPIA of IAMA kun je terecht bij de
      privacyadviseur van je eigen organisatie. Zie ook
      <a href="https://rijksportaal.overheid-i.nl/organisaties/bzk/artikelen/dg-digitalisering-en-overheidsorganisatie-dgdoo/cio-rijk/informatiebeveiliging-en-privacy/privacy-adviseurs-rijk-par.html" target="_blank" rel="noopener noreferrer">Privacy Adviseurs Rijk (PAR)</a>.
    </p>
  </div>
</template>
