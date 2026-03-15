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

    <h1 class="utrecht-heading-1">Over de invulhulpen</h1>

    <p>
      De invulhulpen helpen je bij het invullen van een pre-scan DPIA en een volledige DPIA.
      Ze zijn gebaseerd op het
      <a href="https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA" target="_blank" rel="noopener">Informatiemodellen voor de DPIA en pre-scan DPIA</a>
      en het
      <a href="https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx" target="_blank" rel="noopener">Rapportagemodel DPIA Rijksdienst</a>
      en sluiten aan op rijksbrede kaders, inclusief AI en kinderrechten.
    </p>

    <h2 class="utrecht-heading-2">Waarom een DPIA?</h2>
    <p>
      Bij verwerkingen van persoonsgegevens is het belangrijk om vroegtijdig inzicht te krijgen
      in mogelijke privacyrisico's. Een DPIA is het instrument om van projecten waarbij
      persoonsgegevens worden verwerkt of beleid en regelgeving die kunnen leiden tot verwerking
      van persoonsgegevens de risico's voor de rechten en vrijheden van betrokkenen in kaart te
      brengen en te beoordelen in hoeverre de huidige maatregelen voldoen en welke aanvullende
      maatregelen genomen moeten worden om de risico's zoveel mogelijk te verminderen. Hiervoor
      is een rijksbreed model ontwikkeld.
    </p>

    <h2 class="utrecht-heading-2">Wanneer voer je een DPIA uit?</h2>
    <p>
      Een DPIA moet in een vroegtijdig stadium van de beleids- of projectontwikkeling worden
      uitgevoerd. Op dat moment is het namelijk nog mogelijk om met open vizier na te denken over
      de effecten en bestaat er nog voldoende gelegenheid om de uitgangspunten van het voorstel
      zonder grote nadelige consequenties te herzien. Dit voorkomt ook latere, kostbare
      aanpassingen in processen, herontwerp van systemen of zelfs stopzetten van een project.
    </p>

    <h3 class="utrecht-heading-3">Wettelijke verplichting</h3>
    <p>In de volgende gevallen is het verplicht om een DPIA uit te voeren:</p>
    <ol>
      <li>Bij de ontwikkeling van beleid en regelgeving waaruit verwerkingen van persoonsgegevens voortvloeien; of</li>
      <li>wanneer sprake is van een verplichting op basis van departementaal beleid; of</li>
      <li>bij gegevensverwerkingen van persoonsgegevens die waarschijnlijk een hoog risico inhouden voor de rechten en vrijheden van betrokkenen.</li>
    </ol>

    <h2 class="utrecht-heading-2">Pre-scan als hulpmiddel</h2>
    <p>
      De Prescan DPIA is bedoeld als hulpmiddel om te bepalen of er volgens stap 3 een DPIA
      moet worden gemaakt.
    </p>

    <h2 class="utrecht-heading-2">Meer informatie</h2>
    <p>
      Meer uitleg over de pre-scan kan je vinden in de handreiking pre-scan DPIA.<br />
      Meer uitleg over het rapportagemodel DPIA in dit document:
      <a href="https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx" target="_blank" rel="noopener">Model DPIA Rijksdienst</a>.
    </p>
    <p>Zie ook:</p>
    <ul>
      <li><a href="https://rijksportaal.overheid-i.nl/organisaties/bzk/artikelen/dg-digitalisering-en-overheidsorganisatie-dgdoo/cio-rijk/informatiebeveiliging-en-privacy/privacy-adviseurs-rijk-par.html" target="_blank" rel="noopener">Privacy Adviseurs Rijk (PAR) — Rijksportaal</a></li>
      <li><a href="https://www.kcbr.nl/beleid-en-regelgeving-ontwikkelen/beleidskompas/verplichte-kwaliteitseisen/data-protection-impact-assessment" target="_blank" rel="noopener">Data Protection Impact Assessment | Kenniscentrum voor beleid en regelgeving</a></li>
    </ul>
  </div>
</template>
