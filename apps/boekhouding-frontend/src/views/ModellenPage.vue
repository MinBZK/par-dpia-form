<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppHeader from '../components/AppHeader.vue'
import {
  versionsForType,
  type SourceManifest,
  type ManifestVersion,
} from '@overheid-assessment/core'
import { loadSourceManifest } from '../sourceManifest'

type LoadState = 'loading' | 'ready' | 'error'

// Human-readable names for the known questionnaire types; unknown types fall back to
// their raw key so a newly added type still renders.
const TYPE_LABELS: Record<string, string> = {
  prescan: 'Pre-scan',
  dpia: 'DPIA',
  iama: 'IAMA',
}

const state = ref<LoadState>('loading')
const manifest = ref<SourceManifest | null>(null)

const hasHistory = computed(() => !!window.history.state?.back)

const types = computed(() => {
  const data = manifest.value
  if (!data) return []
  return Object.keys(data.types).map((type) => ({
    type,
    label: TYPE_LABELS[type] ?? type,
    latestOfficial: data.types[type].latestOfficial,
    versions: versionsForType(data, type),
  }))
})

function isConcept(version: ManifestVersion): boolean {
  return version.channel === 'concept'
}

// Format an ISO date as a Dutch long date; fall back to the raw value if unparseable.
function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long' }).format(date)
}

onMounted(async () => {
  try {
    manifest.value = await loadSourceManifest()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <AppHeader
      :backLabel="hasHistory ? 'Terug' : 'Ga naar home'"
      :backRoute="hasHistory ? undefined : '/'"
      :showBack="hasHistory"
    />

    <h1 class="utrecht-heading-1">Modelversies</h1>
    <p>
      Hier zie je welke versies van de vragenlijsten beschikbaar zijn. Een afgeronde versie is
      <strong>officieel vastgesteld</strong>; een conceptversie is nog in ontwikkeling. Een
      assessment blijft op de versie waarop het is ingevuld, ook als er later een nieuwere versie
      bijkomt.
    </p>

    <p v-if="state === 'loading'" role="status" aria-live="polite" data-test="loading">
      Het versie-overzicht wordt geladen…
    </p>

    <div
      v-else-if="state === 'error'"
      role="alert"
      class="rvo-alert rvo-alert--error rvo-alert--padding-md"
      data-test="error"
    >
      Het versie-overzicht kon niet geladen worden. Probeer het later opnieuw.
    </div>

      <section
        v-for="t in types"
        :key="t.type"
        class="landing-section"
        :aria-labelledby="`model-${t.type}`"
        :data-test="`type-${t.type}`"
      >
        <h2 :id="`model-${t.type}`" class="utrecht-heading-2">{{ t.label }}</h2>
        <div class="rvo-layout-grid-container">
          <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--one">
            <div
              v-for="v in t.versions"
              :key="v.version"
              class="rvo-card rvo-card--outline rvo-card--padding-md"
              :class="{ 'model-card--concept': isConcept(v) }"
              :data-test="`version-${t.type}-${v.version}`"
            >
              <div class="rvo-card__content card-content-flex">
                <h3 class="utrecht-heading-3 rvo-margin--none">Versie {{ v.version }}</h3>
                <p class="model-card__tags rvo-margin--none">
                  <span
                    class="rvo-tag"
                    :class="isConcept(v) ? 'rvo-tag--warning' : 'rvo-tag--success'"
                    :data-test="`channel-${t.type}-${v.version}`"
                  >
                    {{ isConcept(v) ? 'Concept - nog niet vastgesteld' : 'Officieel' }}
                  </span>
                  <span
                    v-if="v.version === t.latestOfficial"
                    class="rvo-tag rvo-tag--info"
                    :data-test="`latest-${t.type}`"
                  >
                    Huidige officiële versie
                  </span>
                </p>
                <p v-if="v.releasedAt" class="rvo-text--sm rvo-margin--none" :data-test="`released-${t.type}-${v.version}`">
                  Uitgebracht op <time :datetime="v.releasedAt">{{ formatDate(v.releasedAt) }}</time>
                </p>
                <details
                  v-if="v.changelog && v.changelog.length"
                  :data-test="`changelog-${t.type}-${v.version}`"
                >
                  <summary>Wat is er veranderd</summary>
                  <ul class="rvo-margin--none">
                    <li v-for="(entry, index) in v.changelog" :key="index">{{ entry }}</li>
                  </ul>
                </details>
              </div>
            </div>
          </div>
        </div>
      </section>
  </div>
</template>
