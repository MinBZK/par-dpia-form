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

      <div class="rvo-margin-block-start--xl rvo-margin-block-end--xl">
        <h2 class="utrecht-heading-2">Pre-scan</h2>
        <p>
          De pre-scan is een hulpmiddel om te bepalen of een DPIA, IAMA, DTIA of KIA nodig is. Door een aantal gerichte vragen te beantwoorden krijg je inzicht in welke assessments van toepassing zijn op jouw project.
        </p>
        <h3 class="utrecht-heading-3">Bronnen</h3>
        <ul>
          <li><a href="#" target="_blank">Handreiking pre-scan DPIA</a></li>
          <li><a href="https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA" target="_blank">Informatiemodellen voor de DPIA en pre-scan DPIA</a></li>
        </ul>
      </div>

      <div class="rvo-margin-block-end--xl">
        <h2 class="utrecht-heading-2">DPIA</h2>
        <p>
          Bij verwerkingen van persoonsgegevens is het belangrijk om vroegtijdig inzicht te krijgen in mogelijke privacyrisico's.
          Een DPIA is het instrument om van projecten waarbij persoonsgegevens worden verwerkt of beleid en regelgeving die kunnen leiden tot verwerking van persoonsgegevens de risico's voor de rechten en vrijheden van betrokkenen in kaart te brengen en te beoordelen in hoeverre de huidige maatregelen voldoen en welke aanvullende maatregelen genomen moeten worden om de risico's zoveel mogelijk te verminderen.
          Hiervoor is een rijksbreed model ontwikkeld.
        </p>
        <h3 class="utrecht-heading-3">Wanneer voer je een DPIA uit?</h3>
        <p>
          Een DPIA moet in een vroegtijdig stadium van de beleids- of projectontwikkeling worden uitgevoerd. Op dat moment is het namelijk nog mogelijk om met open vizier na te denken over de effecten en bestaat er nog voldoende gelegenheid om de uitgangspunten van het voorstel zonder grote nadelige consequenties te herzien. Dit voorkomt ook latere, kostbare aanpassingen in processen, herontwerp van systemen of zelfs stopzetten van een project.
        </p>
        <h3 class="utrecht-heading-3">Wettelijke verplichting</h3>
        <p>In de volgende gevallen is het verplicht om een DPIA uit te voeren:</p>
        <ol>
          <li>Bij de ontwikkeling van beleid en regelgeving waaruit verwerkingen van persoonsgegevens voortvloeien; of</li>
          <li>wanneer sprake is van een verplichting op basis van departementaal beleid; of</li>
          <li>bij gegevensverwerkingen van persoonsgegevens die waarschijnlijk een hoog risico inhouden voor de rechten en vrijheden van betrokkenen.</li>
        </ol>
        <h3 class="utrecht-heading-3">Bronnen</h3>
        <ul>
          <li><a href="https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx" target="_blank">Rapportagemodel DPIA Rijksdienst</a></li>
          <li><a href="https://www.kcbr.nl/beleid-en-regelgeving-ontwikkelen/beleidskompas/verplichte-kwaliteitseisen/data-protection-impact-assessment" target="_blank">Data Protection Impact Assessment | Kenniscentrum voor beleid en regelgeving</a></li>
        </ul>
      </div>

      <div class="rvo-margin-block-end--xl">
        <h2 class="utrecht-heading-2">IAMA</h2>
        <p>
          Het Impact Assessment Mensenrechten en Algoritmes (IAMA) helpt overheidsorganisaties bij het beoordelen van de impact van algoritmes op mensenrechten en publieke waarden, voorafgaand aan de ontwikkeling of inzet van een algoritme. Het IAMA faciliteert een interdisciplinaire dialoog door degenen die betrokken zijn bij de ontwikkeling en/of inzet van een algoritmisch systeem.
        </p>
        <h3 class="utrecht-heading-3">Wanneer voer je een IAMA uit?</h3>
        <p>
          Het IAMA is een grondrechtenbeoordeling voor impactvolle algoritmes en hoog-risico AI-systemen. De Europese AI-verordening bepaalt welke AI-systemen als hoog-risico moeten worden geclassificeerd. Hiervoor gelden specifieke vereisten, waaronder een beoordeling van de gevolgen voor grondrechten (artikel 27 AI-verordening). Het IAMA is een instrument om invulling te geven aan een dergelijke grondrechtenbeoordeling.
        </p>
        <p>
          Het IAMA is ook geschikt voor impactvolle algoritmes die niet vallen in de categorie hoog-risico AI-systemen of die buiten het bereik van de AI-verordening vallen.
        </p>
        <h3 class="utrecht-heading-3">IAMA versie 2.0</h3>
        <p>
          Deze invulhulp bevat het IAMA v2.0. Dit is een actualisatie van de oorspronkelijke versie. Het is gestroomlijnd op basis van gebruikersfeedback en in lijn gebracht met de vereisten vanuit artikel 27 van de Europese AI-verordening. Eerder ingevulde IAMA's (v1) hoeven niet herzien te worden.
        </p>
        <h3 class="utrecht-heading-3">Bronnen</h3>
        <ul>
          <li><a href="https://open.overheid.nl/documenten/d0947c02-81df-4c00-83df-d88b703025f4/file" target="_blank">IAMA v2.0 - Open Overheid</a></li>
          <li><a href="https://www.rijksoverheid.nl/documenten/rapporten/2026/02/16/toelichtingsdocument-impact-assessment-mensenrechten-en-algoritmes" target="_blank">IAMA-toelichtingsdocument</a></li>
          <li><a href="https://minbzk.github.io/Algoritmekader/soorten-algoritmes-en-ai/definities/" target="_blank">Algoritmekader - Definities</a></li>
        </ul>
      </div>

      <div class="rvo-margin-block-end--xl">
        <h2 class="utrecht-heading-2">Over deze tools</h2>
        <p>
          De tools op deze pagina helpen je bij het initieel invullen van de pre-scan, DPIA en het IAMA. Het product van deze tools kan je exporteren als Word-document.
        </p>
        <p>
          Zie ook: <a href="https://rijksportaal.overheid-i.nl/organisaties/bzk/artikelen/dg-digitalisering-en-overheidsorganisatie-dgdoo/cio-rijk/informatiebeveiliging-en-privacy/privacy-adviseurs-rijk-par.html" target="_blank">Privacy Adviseurs Rijk (PAR) - Rijksportaal</a>
        </p>
      </div>

      <div class="rvo-layout-margin-vertical--xl">
        <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link rvo-card--full-colour-wit">
          <div class="rvo-layout-row rvo-layout-gap--xs" style="align-items: center;">
            <span class="utrecht-icon rvo-icon rvo-icon-info rvo-icon--xl rvo-status-icon-info" role="img" aria-label="Info"></span>
            <strong>Opslaan en delen van je werk</strong>
          </div>
          <p>
            Tijdens het invullen kun je je voortgang exporteren als PDF. Dit PDF-bestand bevat zowel het leesbare rapport als je ingevulde gegevens.
          </p>
          <p>
            Wat kun je <strong> wel </strong> met het geëxporteerde PDF-bestand? <br />
            ✅ Je kunt het PDF-bestand later opnieuw uploaden om verder te werken. <br />
            ✅ Je kunt het ook delen met een collega zodat die verder kan gaan. <br />
          </p>
          <p>
            Wat kun je <strong> niet </strong> met het geëxporteerde PDF-bestand? <br />
            ❌ Je kunt de ingevulde gegevens niet direct bewerken buiten deze tool. <br />
          </p>
        </div>
      </div>

    </div>
  </div>
</template>
