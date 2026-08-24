<script setup lang="ts">
import '@nldd/design-system/container'
import '@nldd/design-system/rich-text'
import '@nldd/design-system/text'
import '@nldd/design-system/title'
import { useBackLink } from '../composables/useBackLink'

const hasHistory = !!window.history.state?.back
useBackLink().set(hasHistory ? { text: 'Terug' } : { text: 'Ga naar home', to: '/' })
</script>

<template>
  <div class="page-container">
    <nldd-title size="3"><h1>Toegankelijkheidsverklaring</h1></nldd-title>

    <nldd-container max-width="44rem">
    <nldd-rich-text>
    <p>
      Het Ministerie van Binnenlandse Zaken en Koninkrijksrelaties streeft ernaar deze applicatie
      toegankelijk te maken voor iedereen, overeenkomstig het
      <a href="https://wetten.overheid.nl/BWBR0040936/2018-07-01" target="_blank" rel="noopener noreferrer">Tijdelijk besluit digitale toegankelijkheid overheid</a>.
    </p>

    <h2>Nalevingsstatus</h2>
    <p>
      Invulhulpen voldoet <strong>gedeeltelijk</strong> aan de
      <a href="https://www.w3.org/TR/WCAG22/" target="_blank" rel="noopener noreferrer">Web Content Accessibility Guidelines (WCAG) 2.2</a>
      niveau AA. De applicatie is in actieve ontwikkeling en we werken aan volledige naleving.
    </p>

    <h2>Wat we doen</h2>
    <ul>
      <li>De interface is gebouwd met de webcomponenten van het NLDD Design System van de Nederlandse Digitale Dienst (Rijksoverheid), waarin toegankelijkheidseisen zijn ingebouwd</li>
      <li>Formulieren zijn voorzien van correcte labels en foutmeldingen</li>
      <li>Interactieve elementen zijn bereikbaar via het toetsenbord</li>
      <li>Foutmeldingen worden aangekondigd aan screenreaders via ARIA-attributen</li>
    </ul>

    <h2>Bekende beperkingen</h2>
    <ul>
      <li>PDF-exports zijn nog niet volledig getagd voor screenreaders. Als alternatief is export naar Markdown en JSON beschikbaar.</li>
      <li>De applicatie is nog niet volledig getest met screenreaders en andere hulptechnologie.</li>
    </ul>

    <h2>Feedback en contact</h2>
    <p>
      Ervaar je problemen met de toegankelijkheid van deze applicatie? Neem contact met ons op:
    </p>
    <ul>
      <li>E-mail: <a href="mailto:digigilde@rijksoverheid.nl">digigilde@rijksoverheid.nl</a></li>
      <li>GitHub: <a href="https://github.com/MinBZK/par-dpia-form/issues" target="_blank" rel="noopener noreferrer">Issues melden</a></li>
    </ul>

    <h2>Escalatie</h2>
    <p>
      Wordt je melding niet (binnen een redelijke termijn) opgepakt, of ben je niet tevreden met de
      reactie? Neem dan contact op met het team dat de applicatie heeft ontwikkeld via
      <a href="mailto:digigilde@rijksoverheid.nl">digigilde@rijksoverheid.nl</a>.
    </p>

    <nldd-text size="xs" color="secondary">
      Deze verklaring is opgesteld op 15 maart 2026.
    </nldd-text>
    </nldd-rich-text>
    </nldd-container>
  </div>
</template>
