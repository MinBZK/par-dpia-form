<script setup lang="ts">
import AppBanner from '@/components/AppBanner.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { type NavigationFunctions } from '@/models/navigation'

defineProps<{
  navigation: NavigationFunctions
}>()
</script>

<template>
  <AppBanner />
  <div class="rvo-layout-column rvo-layout-gap--3xl rvo-margin-block-start--xl">
    <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
      <h1 class="utrecht-heading-1">Invulhulp voor pre-scan, DPIA en IAMA</h1>
      <div class="rvo-layout-grid-container rvo-margin-inline-end--md">
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link rvo-card--full-colour--grijs-100">
            <div class="rvo-card__content card-content-flex">
              <h2 class="utrecht-heading-2 rvo-margin--none">Pre-scan</h2>
              <p class="rvo-padding-block-end--sm">Toets of een DPIA, DTIA, IAMA of KIA nodig is.</p>
              <UiButton variant="primary" label="Start pre-scan" class="card-button"
                @click="navigation.goToPreScanDPIA" />
            </div>
          </div>
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link rvo-card--full-colour--grijs-100">
            <div class="rvo-card__content card-content-flex">
              <h2 class="utrecht-heading-2 rvo-margin--none">DPIA</h2>
              <p class="rvo-padding-block-end--sm">Vul stap voor stap het rijksmodel DPIA in.</p>
              <UiButton variant="primary" label="Start DPIA" class="card-button"
                @click="navigation.goToDPIA" />
            </div>
          </div>
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link rvo-card--full-colour--grijs-100">
            <div class="rvo-card__content card-content-flex">
              <h2 class="utrecht-heading-2 rvo-margin--none">IAMA</h2>
              <p class="rvo-padding-block-end--sm">Vul stap voor stap het Impact Assessment Mensenrechten en Algoritmes in.</p>
              <UiButton variant="primary" label="Start IAMA" class="card-button"
                @click="navigation.goToIAMA" />
            </div>
          </div>
        </div>
      </div>

      <div class="rvo-margin-block-end--xl rvo-margin-block-start--xl">
        <h2 class="utrecht-heading-2">Waarom een DPIA?</h2>
        <p>
          Bij verwerkingen van persoonsgegevens is het belangrijk om vroegtijdig inzicht te krijgen in mogelijke privacyrisico's.
          Een DPIA is het instrument om van projecten waarbij persoonsgegevens worden verwerkt of beleid en regelgeving die kunnen leiden tot verwerking van persoonsgegevens de risico's voor de rechten en vrijheden van betrokkenen in kaart te brengen en te beoordelen in hoeverre de huidige maatregelen voldoen en welke aanvullende maatregelen genomen moeten worden om de risico's zoveel mogelijk te verminderen.
          Hiervoor is een rijksbreed model ontwikkeld.
        </p>
      </div>
      <div class="rvo-margin-block-end--xl">
        <h2 class="utrecht-heading-2">Wanneer voer je een DPIA uit?</h2>
        <p>
          Een DPIA moet in een vroegtijdig stadium van de beleids- of projectontwikkeling worden uitgevoerd. Op dat moment is het namelijk nog mogelijk om met open vizier na te denken over de effecten en bestaat er nog voldoende gelegenheid om de uitgangspunten van het voorstel zonder grote nadelige consequenties te herzien. Dit voorkomt ook latere, kostbare aanpassingen in processen, herontwerp van systemen of zelfs stopzetten van een project.
        </p>
      </div>
      <div class="rvo-margin-block-end--md">
        <h3 class="utrecht-heading-3">Wettelijke verplichting</h3>
        <p>In de volgende gevallen is het verplicht om een DPIA uit te voeren:</p>
        <ol>
          <li>Bij de ontwikkeling van beleid en regelgeving waaruit verwerkingen van persoonsgegevens voortvloeien; of</li>
          <li>wanneer sprake is van een verplichting op basis van departementaal beleid; of</li>
          <li>bij gegevensverwerkingen van persoonsgegevens die waarschijnlijk een hoog risico inhouden voor de rechten en vrijheden van betrokkenen.</li>
        </ol>
      </div>
      <div class="rvo-margin-block-end--xl">
        <h2 class="utrecht-heading-2">Pre-scan als hulpmiddel</h2>
        <p>
          De Prescan DPIA is bedoeld als hulpmiddel om te bepalen of er volgens stap 3 een DPIA moet worden gemaakt.
        </p>
      </div>
      <div class="rvo-margin-block-end--xl">
        <h2 class="utrecht-heading-2">Over deze tools</h2>
        <p>
          De tools zoals die op deze pagina staan helpen je bij het initieel invullen van de DPIA. Ze zijn gebaseerd op het <a href="https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA" target="_blank">Informatiemodellen voor de DPIA en pre-scan DPIA</a> en <a href="https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx" target="_blank">Rapportagemodel DPIA Rijksdienst</a> en sluiten aan op rijksbrede kaders, inclusief AI en kinderrechten. Het is een hulpmiddel, maar omvat niet het hele proces van een DPIA. Het product van deze tools kan je importeren als Word-document en omvat alle relevante blokken die in het rapportagemodel DPIA moeten staan.
        </p>
      </div>

      <p>
        Meer uitleg over de pre-scan kan je vinden in de <a href="#" target="_blank">handreiking pre-scan DPIA</a>.<br>
        Meer uitleg over het rapportagemodel DPIA in dit document: <a href="https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx" target="_blank">Model DPIA Rijksdienst</a>.
      </p>
      <p>
        Zie ook:<br>
        <a href="https://rijksportaal.overheid-i.nl/organisaties/bzk/artikelen/dg-digitalisering-en-overheidsorganisatie-dgdoo/cio-rijk/informatiebeveiliging-en-privacy/privacy-adviseurs-rijk-par.html" target="_blank">Privacy Adviseurs Rijk (PAR) - Rijksportaal</a><br>
        <a href="https://www.kcbr.nl/beleid-en-regelgeving-ontwikkelen/beleidskompas/verplichte-kwaliteitseisen/data-protection-impact-assessment" target="_blank">Data Protection Impact Assessment | Kenniscentrum voor beleid en regelgeving</a>
      </p>

      <div class="rvo-layout-margin-vertical--xl">
        <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link rvo-card--full-colour-wit">
          <div class="rvo-layout-row rvo-layout-gap--xs" style="align-items: center;">
            <span class="utrecht-icon rvo-icon rvo-icon-info rvo-icon--xl rvo-status-icon-info" role="img" aria-label="Info"></span>
            <strong>Opslaan en delen van je DPIA</strong>
          </div>
          <p>
            Tijdens het invullen kun je je voortgang opslaan als een bestand op je eigen computer.
          </p>
          <p>
            Wat kun je <strong> wel </strong> met het opgeslagen bestand? <br />
            ✅ Je kunt dit bestand later opnieuw openen om verder te werken. <br />
            ✅ Je kunt het ook delen met een collega zodat die verder kan gaan. <br />
          </p>
          <p>
            Wat kun je <strong> niet </strong> met het opgeslagen bestand? <br />
            ❌ Je kunt het bestand niet openen in Word. <br />
            ❌ Je kunt het bestand niet direct bewerken buiten deze tool. <br />
          </p>
        </div>
      </div>

    </div>
  </div>
</template>
