<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import '@nldd/design-system/button'
import '@nldd/design-system/card'
import '@nldd/design-system/collection'
import '@nldd/design-system/container'
import '@nldd/design-system/modal-dialog'
import '@nldd/design-system/rich-text'
import '@nldd/design-system/simple-section'
import '@nldd/design-system/spacer'
import '@nldd/design-system/title'
import { AppBanner, ExportPdfInfo, FormType, type NavigationFunctions } from '@overheid-assessment/core'

const props = defineProps<{
  navigation: NavigationFunctions
  cachedTypes: FormType[]
}>()

const emit = defineEmits<{
  startFresh: [type: FormType]
  clearAll: []
}>()

const clearAllOpen = ref(false)

// Names the assessments that actually have something saved, so the warning says
// what is at stake instead of "alle gegevens".
const cachedTitles = computed(() =>
  cards.filter((card) => props.cachedTypes.includes(card.type)).map((card) => card.title))

const cachedSummary = computed(() => {
  const titles = cachedTitles.value
  if (titles.length <= 1) return titles.join('')
  return `${titles.slice(0, -1).join(', ')} en ${titles[titles.length - 1]}`
})

function confirmClearAll() {
  clearAllOpen.value = false
  emit('clearAll')
}

// Injected as a <meta> tag at build time (see vite.config.ts injectVersionMeta),
// so the production overlay can sed-patch the version without touching the
// CSP-hashed inline script.
const appVersion = document.querySelector('meta[name="app-version"]')?.getAttribute('content') ?? ''

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

// "Start nieuwe X" confirmation via nldd-modal-dialog. show/hide are optional:
// they only exist once the custom element is upgraded (not in jsdom unit tests).
type ModalDialogElement = HTMLElement & { show?: () => void; hide?: () => void }

const freshDialog = ref<ModalDialogElement | null>(null)
const clearAllDialog = ref<ModalDialogElement | null>(null)

const clearAllSupportingText = computed(() =>
  `Dit wist de opgeslagen antwoorden van je ${cachedSummary.value} uit deze browser. Dit kan niet ongedaan worden gemaakt. Exporteer eerst als je ze wilt bewaren.`,
)

watch(clearAllOpen, (open) => {
  if (open) clearAllDialog.value?.show?.()
  else clearAllDialog.value?.hide?.()
})

const onClearAllClose = () => {
  clearAllOpen.value = false
}
const freshTarget = ref<FormType | null>(null)
const freshTargetCard = computed(() => cards.find((card) => card.type === freshTarget.value))
const freshTitle = computed(() =>
  freshTargetCard.value ? `Nieuwe ${freshTargetCard.value.title} starten?` : '',
)
const freshSupportingText = computed(() =>
  freshTargetCard.value
    ? `Je hebt een opgeslagen versie van de ${freshTargetCard.value.title}. Als je een nieuwe start, wordt die opgeslagen versie definitief gewist. Dit kan niet ongedaan worden gemaakt.`
    : '',
)

function syncFreshDialog() {
  if (!freshDialog.value) return
  if (freshTarget.value) freshDialog.value.show?.()
  else freshDialog.value.hide?.()
}

watch(freshTarget, syncFreshDialog)

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

// The modal closes itself on Esc and fires `close`; route that through the
// shared state so the watch performs the single hide() (no hide loop).
const onFreshClose = () => {
  if (freshTarget.value) cancelFresh()
}

onBeforeUnmount(() => {
  freshDialog.value?.hide?.()
  clearAllDialog.value?.hide?.()
})

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
  <nldd-simple-section class="landing-view" width="60rem" padding-bottom="0">
    <h1>Invulhulpen voor pre-scan, DPIA en IAMA</h1>

    <nldd-collection layout="grid" item-width="380px" gap="16px">
      <nldd-card v-for="card in cards" :key="card.type">
        <nldd-container padding="16" gap="8">
          <nldd-title size="4"><h2>{{ card.title }}</h2></nldd-title>
          <p>{{ card.description }}</p>
        </nldd-container>
        <nldd-container slot="footer" padding="16" padding-top="0" layout="wrap" gap="16">
          <template v-if="hasCache(card.type)">
            <nldd-button variant="primary" text="Verder gaan" class="card-button"
              @click="card.start()"></nldd-button>
            <nldd-button variant="accent-transparent" :text="card.freshLabel" class="card-button-fresh"
              @click="askFresh(card.type)"></nldd-button>
          </template>
          <nldd-button v-else variant="primary" :text="card.startLabel" class="card-button"
            @click="card.start()"></nldd-button>
        </nldd-container>
      </nldd-card>
    </nldd-collection>
  </nldd-simple-section>

  <nldd-simple-section class="landing-view" width="60rem">
    <nldd-rich-text>
      <h2>Pre-scan</h2>
      <p>
        De pre-scan is een hulpmiddel om te bepalen of een DPIA, IAMA, DTIA of KIA nodig is. Door een aantal gerichte vragen te beantwoorden krijg je inzicht in welke assessments van toepassing zijn op jouw project.
      </p>
      <h3>Bronnen</h3>
      <ul>
        <li><a href="https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA" target="_blank" rel="noopener noreferrer">Informatiemodellen voor de DPIA en pre-scan DPIA</a></li>
      </ul>
    </nldd-rich-text>

    <nldd-rich-text>
      <h2>DPIA</h2>
      <p>
        Bij verwerkingen van persoonsgegevens is het belangrijk om vroegtijdig inzicht te krijgen in mogelijke privacyrisico's.
        Een DPIA is het instrument om van projecten waarbij persoonsgegevens worden verwerkt of beleid en regelgeving die kunnen leiden tot verwerking van persoonsgegevens de risico's voor de rechten en vrijheden van betrokkenen in kaart te brengen en te beoordelen in hoeverre de huidige maatregelen voldoen en welke aanvullende maatregelen genomen moeten worden om de risico's zoveel mogelijk te verminderen.
        Hiervoor is een rijksbreed model ontwikkeld.
      </p>
      <h3>Wanneer voer je een DPIA uit?</h3>
      <p>
        Een DPIA moet in een vroegtijdig stadium van de beleids- of projectontwikkeling worden uitgevoerd. Op dat moment is het namelijk nog mogelijk om met open vizier na te denken over de effecten en bestaat er nog voldoende gelegenheid om de uitgangspunten van het voorstel zonder grote nadelige consequenties te herzien. Dit voorkomt ook latere, kostbare aanpassingen in processen, herontwerp van systemen of zelfs stopzetten van een project.
      </p>
      <h3>Wettelijke verplichting</h3>
      <p>In de volgende gevallen is het verplicht om een DPIA uit te voeren:</p>
      <ol>
        <li>Bij de ontwikkeling van beleid en regelgeving waaruit verwerkingen van persoonsgegevens voortvloeien; of</li>
        <li>wanneer sprake is van een verplichting op basis van departementaal beleid; of</li>
        <li>bij gegevensverwerkingen van persoonsgegevens die waarschijnlijk een hoog risico inhouden voor de rechten en vrijheden van betrokkenen.</li>
      </ol>
      <h3>DPIA versie 3.0</h3>
      <p>
        Deze invulhulp is gebaseerd op het Rapportagemodel DPIA Rijksdienst, versie 3.0. Dit is het actuele rijksbrede rapportagemodel voor de DPIA.
      </p>
      <h3>Bronnen</h3>
      <ul>
        <li><a href="https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx" target="_blank" rel="noopener noreferrer">Rapportagemodel DPIA Rijksdienst</a></li>
        <li><a href="https://www.kcbr.nl/ontwikkelen-beleid-en-regelgeving/beleidskompas/verplichte-kwaliteitseisen/data-protection-impact-assessment" target="_blank" rel="noopener noreferrer">Data Protection Impact Assessment - Kenniscentrum voor beleid en regelgeving</a></li>
      </ul>
    </nldd-rich-text>

    <nldd-rich-text>
      <h2>IAMA</h2>
      <p>
        Het Impact Assessment Mensenrechten en Algoritmes (IAMA) helpt overheidsorganisaties bij het beoordelen van de impact van algoritmes op mensenrechten en publieke waarden, voorafgaand aan de ontwikkeling of inzet van een algoritme. Het IAMA faciliteert een interdisciplinaire dialoog door degenen die betrokken zijn bij de ontwikkeling en/of inzet van een algoritmisch systeem.
      </p>
      <h3>Wanneer voer je een IAMA uit?</h3>
      <p>
        Het IAMA is een grondrechtenbeoordeling voor impactvolle algoritmes en hoog-risico AI-systemen. De Europese AI-verordening bepaalt welke AI-systemen als hoog-risico moeten worden geclassificeerd. Hiervoor gelden specifieke vereisten, waaronder een beoordeling van de gevolgen voor grondrechten (artikel 27 AI-verordening). Het IAMA is een instrument om invulling te geven aan een dergelijke grondrechtenbeoordeling.
      </p>
      <p>
        Het IAMA is ook geschikt voor impactvolle algoritmes die niet vallen in de categorie hoog-risico AI-systemen of die buiten het bereik van de AI-verordening vallen.
      </p>
      <h3>IAMA versie 2.0</h3>
      <p>
        Deze invulhulp bevat het IAMA v2.0. Dit is een actualisatie van de oorspronkelijke versie. Het is gestroomlijnd op basis van gebruikersfeedback en in lijn gebracht met de vereisten vanuit artikel 27 van de Europese AI-verordening. Eerder ingevulde IAMA's (v1) hoeven niet herzien te worden.
      </p>
      <h3>Bronnen</h3>
      <ul>
        <li><a href="https://open.overheid.nl/documenten/d0947c02-81df-4c00-83df-d88b703025f4/file" target="_blank" rel="noopener noreferrer">IAMA v2.0 - Open Overheid</a></li>
        <li><a href="https://www.rijksoverheid.nl/documenten/2026/02/16/toelichtingsdocument-impact-assessment-mensenrechten-en-algoritmes" target="_blank" rel="noopener noreferrer">IAMA-toelichtingsdocument - Rijksoverheid</a></li>
        <li><a href="https://minbzk.github.io/Algoritmekader/voldoen-aan-wetten-en-regels/hulpmiddelen/IAMA/" target="_blank" rel="noopener noreferrer">Algoritmekader - IAMA</a></li>
      </ul>
    </nldd-rich-text>

    <nldd-rich-text>
      <h2>Over deze tools</h2>
      <p>
        De tools op deze pagina helpen je bij het initieel invullen van de pre-scan, DPIA en het IAMA. Ze sluiten aan op rijksbrede kaders. Het product van deze tools kan je exporteren en omvat alle relevante blokken die in het rapportagemodel moeten staan.
      </p>
      <p>
        Zie ook: <a href="https://rijksportaal.overheid-i.nl/organisaties/bzk/artikelen/dg-digitalisering-en-overheidsorganisatie-dgdoo/cio-rijk/informatiebeveiliging-en-privacy/privacy-adviseurs-rijk-par.html" target="_blank" rel="noopener noreferrer">Privacy Adviseurs Rijk (PAR) - Rijksportaal</a>
      </p>
      <p class="version-info">Versie van de invulhulp: {{ appVersion }}</p>
    </nldd-rich-text>

    <nldd-spacer size="16"></nldd-spacer>
    <!-- The card follows the reading measure of the prose above it instead of
         the full section width. -->
    <div class="landing-view__prose-width">
      <ExportPdfInfo />
    </div>

    <!-- Only when there is something to wipe: on an empty browser the button
         would just raise a question it cannot answer. -->
    <nldd-rich-text v-if="cachedTitles.length > 0">
      <h2>Opgeslagen gegevens wissen</h2>
      <p>
        In deze browser staan antwoorden van je {{ cachedSummary }} opgeslagen. Werk je op een
        gedeelde of openbare computer, wis ze dan voordat je weggaat.
      </p>
      <nldd-button variant="secondary" text="Wis alle opgeslagen gegevens" start-icon="trash"
        @click="clearAllOpen = true"></nldd-button>
    </nldd-rich-text>

    <nldd-rich-text v-if="canDownloadOfflineCopy">
      <h2>Offline gebruiken</h2>
      <p>
        Je kunt deze invulhulp als één HTML-bestand downloaden en lokaal openen, ook zonder internet.
        Het bestand bevat de volledige invulhulp. Je gegevens blijven op je eigen computer.
      </p>
      <nldd-button variant="secondary" text="Download invulhulp als HTML-bestand" :disabled="downloading || undefined"
        @click="downloadOfflineApp"></nldd-button>
      <p v-if="downloadFailed" role="alert" class="download-error">
        Het downloaden is niet gelukt. Probeer het opnieuw.
      </p>
    </nldd-rich-text>
  </nldd-simple-section>

  <!-- "Start nieuwe X" confirmation -->
  <nldd-modal-dialog
    ref="freshDialog"
    variant="alert"
    :text="freshTitle"
    :supporting-text="freshSupportingText"
    @close="onFreshClose"
  >
    <template v-if="freshTargetCard">
      <!-- The safe way out is the primary action; the destructive action is the
           secondary one (NLDD design guideline). -->
      <nldd-button slot="actions" variant="primary" text="Annuleren" @click="cancelFresh"></nldd-button>
      <nldd-button slot="actions" variant="destructive" :text="`Ja, start nieuwe ${freshTargetCard.title}`"
        @click="confirmFresh"></nldd-button>
    </template>
  </nldd-modal-dialog>

  <!-- "Wis alles" confirmation -->
  <nldd-modal-dialog
    ref="clearAllDialog"
    variant="alert"
    text="Alle opgeslagen gegevens wissen?"
    :supporting-text="clearAllSupportingText"
    @close="onClearAllClose"
  >
    <nldd-button slot="actions" variant="primary" text="Annuleren"
      @click="clearAllOpen = false"></nldd-button>
    <nldd-button slot="actions" variant="destructive" text="Ja, wis alles"
      @click="confirmClearAll"></nldd-button>
  </nldd-modal-dialog>
</template>
