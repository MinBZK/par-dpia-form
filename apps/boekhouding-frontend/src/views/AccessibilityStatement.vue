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

    <h1 class="utrecht-heading-1">Toegankelijkheidsverklaring</h1>

    <p>
      Het Ministerie van Binnenlandse Zaken en Koninkrijksrelaties streeft ernaar deze applicatie
      toegankelijk te maken voor iedereen, overeenkomstig het
      <a href="https://wetten.overheid.nl/BWBR0040936/2018-07-01" target="_blank" rel="noopener noreferrer">Tijdelijk besluit digitale toegankelijkheid overheid</a>.
    </p>

    <h2 class="utrecht-heading-2">Nalevingsstatus</h2>
    <p>
      De Assessment Boekhouding voldoet <strong>gedeeltelijk</strong> aan de
      <a href="https://www.w3.org/TR/WCAG22/" target="_blank" rel="noopener noreferrer">Web Content Accessibility Guidelines (WCAG) 2.2</a>
      niveau AA. De applicatie is in actieve ontwikkeling en we werken aan volledige naleving.
    </p>

    <h2 class="utrecht-heading-2">Wat we doen</h2>
    <ul>
      <li>We gebruiken het <a href="https://nldesignsystem.nl/" target="_blank" rel="noopener noreferrer">NL Design System</a> (RVO componentbibliotheek) als basis voor onze interface-componenten</li>
      <li>Formulieren zijn voorzien van correcte labels en foutmeldingen</li>
      <li>Interactieve elementen zijn bereikbaar via het toetsenbord</li>
      <li>Foutmeldingen worden aangekondigd aan screenreaders via ARIA-attributen</li>
    </ul>

    <h2 class="utrecht-heading-2">Bekende beperkingen</h2>
    <ul>
      <li>PDF-exports zijn nog niet volledig getagd voor screenreaders. Als alternatief is export naar Markdown en JSON beschikbaar.</li>
      <li>De applicatie is nog niet volledig getest met screenreaders en andere hulptechnologie.</li>
    </ul>

    <h2 class="utrecht-heading-2">Feedback en contact</h2>
    <p>
      Ervaar je problemen met de toegankelijkheid van deze applicatie? Neem contact met ons op:
    </p>
    <ul>
      <li>E-mail: <a href="mailto:RIG@rijksoverheid.nl">RIG@rijksoverheid.nl</a></li>
      <li>GitHub: <a href="https://github.com/MinBZK/par-dpia-form/issues" target="_blank" rel="noopener noreferrer">Issues melden</a></li>
    </ul>

    <h2 class="utrecht-heading-2">Escalatie</h2>
    <p>
      Wordt je melding niet (binnen een redelijke termijn) opgepakt, of ben je niet tevreden met de
      reactie? Neem dan contact op met het team dat de applicatie heeft ontwikkeld via
      <a href="mailto:RIG@rijksoverheid.nl">RIG@rijksoverheid.nl</a>.
    </p>

    <p class="rvo-text--sm rvo-text--subtle rvo-margin-block-start--lg">
      Deze verklaring is opgesteld op 15 maart 2026.
    </p>
  </div>
</template>
