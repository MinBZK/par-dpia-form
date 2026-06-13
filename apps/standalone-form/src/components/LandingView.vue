<script setup lang="ts">
import { computed, ref } from 'vue'
import { AppBanner, UiButton, ExportPdfInfo, FormType, type NavigationFunctions } from '@overheid-assessment/core'
import { formatBuildVersion } from '@/version'

const props = defineProps<{
  navigation: NavigationFunctions
  cachedTypes: FormType[]
}>()

const emit = defineEmits<{
  startFresh: [type: FormType]
}>()

const appVersion = formatBuildVersion(__APP_TAG__, __APP_COMMIT__)

interface AssessmentCard {
  type: FormType
  title: string
  description: string
  startLabel: string
  freshLabel: string
  start: () => void
}

const cards: AssessmentCard[] = [
  {
    type: FormType.PRE_SCAN,
    title: 'Pre-scan',
    description: 'Toets of een DPIA, DTIA, IAMA of KIA nodig is.',
    startLabel: 'Start pre-scan',
    freshLabel: 'Start nieuwe pre-scan',
    start: () => props.navigation.goToPreScanDPIA(),
  },
  {
    type: FormType.DPIA,
    title: 'DPIA',
    description: 'Vul stap voor stap het rijksmodel DPIA in.',
    startLabel: 'Start DPIA',
    freshLabel: 'Start nieuwe DPIA',
    start: () => props.navigation.goToDPIA(),
  },
  {
    type: FormType.IAMA,
    title: 'IAMA',
    description: 'Vul stap voor stap het Impact Assessment Mensenrechten en Algoritmes in.',
    startLabel: 'Start IAMA',
    freshLabel: 'Start nieuwe IAMA',
    start: () => props.navigation.goToIAMA?.(),
  },
]

function hasCache(type: FormType): boolean {
  return props.cachedTypes.includes(type)
}

// "Start nieuwe X" confirmation
const freshTarget = ref<FormType | null>(null)
const freshTargetCard = computed(() => cards.find((card) => card.type === freshTarget.value))
function askFresh(type: FormType) {
  freshTarget.value = type
}
function cancelFresh() {
  freshTarget.value = null
}
function confirmFresh() {
  emit('startFresh', freshTarget.value as FormType)
  freshTarget.value = null
}

// Download the running single-file build as a standalone HTML file.
// Only meaningful on the hosted, built app: not in dev (no single-file bundle
// exists) and not in an already-downloaded offline copy opened from disk.
const canDownloadOfflineCopy = computed(
  () => import.meta.env.PROD && window.location.protocol !== 'file:',
)
const downloading = ref(false)
const downloadFailed = ref(false)
async function downloadOfflineApp() {
  downloading.value = true
  downloadFailed.value = false
  try {
    const response = await fetch(window.location.href, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'invulhulp-pre-scan-dpia-iama.html'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch {
    downloadFailed.value = true
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <AppBanner title="Invulhulpen" />
  <div class="rvo-layout-column rvo-layout-gap--3xl rvo-margin-block-start--xl">
    <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
      <h1 class="utrecht-heading-1">Invulhulpen voor pre-scan, DPIA en IAMA</h1>
      <div class="rvo-layout-grid-container rvo-margin-inline-end--md">
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">
          <div
            v-for="card in cards"
            :key="card.type"
            class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link rvo-card--full-colour--grijs-100"
          >
            <div class="rvo-card__content card-content-flex">
              <h2 class="utrecht-heading-2 rvo-margin--none">{{ card.title }}</h2>
              <p class="rvo-padding-block-end--sm">{{ card.description }}</p>
              <template v-if="hasCache(card.type)">
                <div class="card-actions">
                  <UiButton variant="primary" label="Verder gaan" class="card-button"
                    @click="card.start()" />
                  <UiButton variant="tertiary" :label="card.freshLabel" class="card-button-fresh"
                    @click="askFresh(card.type)" />
                </div>
              </template>
              <UiButton v-else variant="primary" :label="card.startLabel" class="card-button"
                @click="card.start()" />
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
          <li><a href="https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA" target="_blank" rel="noopener noreferrer">Informatiemodellen voor de DPIA en pre-scan DPIA</a></li>
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
        <h3 class="utrecht-heading-3">DPIA versie 3.0</h3>
        <p>
          Deze invulhulp is gebaseerd op het Rapportagemodel DPIA Rijksdienst, versie 3.0. Dit is het actuele rijksbrede rapportagemodel voor de DPIA.
        </p>
        <h3 class="utrecht-heading-3">Bronnen</h3>
        <ul>
          <li><a href="https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx" target="_blank" rel="noopener noreferrer">Rapportagemodel DPIA Rijksdienst</a></li>
          <li><a href="https://www.kcbr.nl/beleid-en-regelgeving-ontwikkelen/beleidskompas/verplichte-kwaliteitseisen/data-protection-impact-assessment" target="_blank" rel="noopener noreferrer">Data Protection Impact Assessment - Kenniscentrum voor beleid en regelgeving</a></li>
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
          <li><a href="https://open.overheid.nl/documenten/d0947c02-81df-4c00-83df-d88b703025f4/file" target="_blank" rel="noopener noreferrer">IAMA v2.0 - Open Overheid</a></li>
          <li><a href="https://www.rijksoverheid.nl/documenten/2026/02/16/toelichtingsdocument-impact-assessment-mensenrechten-en-algoritmes" target="_blank" rel="noopener noreferrer">IAMA-toelichtingsdocument - Rijksoverheid</a></li>
          <li><a href="https://minbzk.github.io/Algoritmekader/voldoen-aan-wetten-en-regels/hulpmiddelen/IAMA/" target="_blank" rel="noopener noreferrer">Algoritmekader - IAMA</a></li>
        </ul>
      </div>

      <div class="rvo-margin-block-end--xl">
        <h2 class="utrecht-heading-2">Over deze tools</h2>
        <p>
          De tools op deze pagina helpen je bij het initieel invullen van de pre-scan, DPIA en het IAMA. Ze sluiten aan op rijksbrede kaders. Het product van deze tools kan je exporteren en omvat alle relevante blokken die in het rapportagemodel moeten staan.
        </p>
        <p>
          Zie ook: <a href="https://rijksportaal.overheid-i.nl/organisaties/bzk/artikelen/dg-digitalisering-en-overheidsorganisatie-dgdoo/cio-rijk/informatiebeveiliging-en-privacy/privacy-adviseurs-rijk-par.html" target="_blank" rel="noopener noreferrer">Privacy Adviseurs Rijk (PAR) - Rijksportaal</a>
        </p>
        <p class="version-info">Versie van de invulhulp: {{ appVersion }}</p>
      </div>

      <div class="rvo-layout-margin-vertical--xl">
        <ExportPdfInfo />
      </div>

      <div v-if="canDownloadOfflineCopy" class="rvo-margin-block-start--xl rvo-margin-block-end--xl">
        <h2 class="utrecht-heading-2">Offline gebruiken</h2>
        <p>
          Je kunt deze invulhulp als één HTML-bestand downloaden en lokaal openen, ook zonder internet.
          Het bestand bevat de volledige invulhulp. Je gegevens blijven op je eigen computer.
        </p>
        <UiButton variant="secondary" label="Download invulhulp als HTML-bestand" :disabled="downloading"
          @click="downloadOfflineApp" />
        <p v-if="downloadFailed" role="alert" class="rvo-margin-block-start--sm">
          Het downloaden is niet gelukt. Probeer het opnieuw.
        </p>
      </div>

    </div>
  </div>

  <!-- "Start nieuwe X" confirmation -->
  <div v-if="freshTarget" class="fresh-confirm-overlay" @click.self="cancelFresh">
    <div class="fresh-confirm" role="dialog" aria-modal="true" aria-labelledby="fresh-confirm-title">
      <h2 id="fresh-confirm-title" class="utrecht-heading-2">Nieuwe {{ freshTargetCard?.title }} starten?</h2>
      <p class="utrecht-paragraph">
        Je hebt een opgeslagen versie van de {{ freshTargetCard?.title }}. Als je een nieuwe start, wordt
        die opgeslagen versie definitief gewist. Dit kan niet ongedaan worden gemaakt.
      </p>
      <div class="fresh-confirm__actions">
        <UiButton variant="tertiary" label="Annuleren" @click="cancelFresh" />
        <UiButton variant="warning" :label="`Ja, start nieuwe ${freshTargetCard?.title}`" @click="confirmFresh" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.fresh-confirm-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 1rem;
  z-index: 1000;
}

.fresh-confirm {
  background: #fff;
  max-width: 32rem;
  width: 100%;
  padding: 1.5rem;
  border-radius: 4px;
}

.fresh-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-block-start: 1rem;
}
</style>
