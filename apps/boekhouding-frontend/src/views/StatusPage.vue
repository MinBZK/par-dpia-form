<script setup lang="ts">
import { ref, computed, onMounted, type Component } from 'vue'
import {
  IconServer,
  IconKey,
  IconCircleCheck,
  IconCircleX,
  IconAlertTriangle,
  IconLoader2,
  IconCopy,
  IconCheck,
  IconBrandGithub,
  IconExternalLink,
} from '@tabler/icons-vue'
import AppHeader from '../components/AppHeader.vue'
import { getConfig } from '../config'
import { loadVersion, type VersionInfo } from '../version'
import { probe, TimeoutError } from '../probe'

const REPO = 'https://github.com/MinBZK/par-dpia-form'

type ProbeState = 'loading' | 'ok' | 'error' | 'timeout'
interface StatusMeta {
  label: string
  tagClass: string
  icon: Component
}

const hasHistory = computed(() => !!window.history.state?.back)

const frontend = ref<VersionInfo>({ version: 'dev', commit: 'dev', channel: 'dev' })
const backendState = ref<ProbeState>('loading')
const keycloakState = ref<ProbeState>('loading')
const copyState = ref<'idle' | 'done' | 'error'>('idle')

const hasCommit = computed(() => frontend.value.commit !== 'dev')
const githubUrl = computed(() =>
  hasCommit.value ? `${REPO}/commit/${frontend.value.commit}` : REPO,
)

const copyFeedback = computed(() =>
  copyState.value === 'done'
    ? 'Gekopieerd naar het klembord.'
    : copyState.value === 'error'
      ? 'Kopiëren naar het klembord lukte niet. Selecteer de tekst hierboven.'
      : '',
)
const copyLabel = computed(() =>
  copyState.value === 'done'
    ? 'Gekopieerd'
    : copyState.value === 'error'
      ? 'Kopiëren mislukt'
      : 'Kopieer versie-informatie',
)
const copyIcon = computed(() =>
  copyState.value === 'done' ? IconCheck : copyState.value === 'error' ? IconAlertTriangle : IconCopy,
)

function statusMeta(state: ProbeState): StatusMeta {
  if (state === 'ok') return { label: 'Alles werkt', tagClass: 'rvo-tag--success', icon: IconCircleCheck }
  if (state === 'timeout') return { label: 'Reageert traag', tagClass: 'rvo-tag--warning', icon: IconAlertTriangle }
  if (state === 'error') return { label: 'Er werkt iets niet', tagClass: 'rvo-tag--error', icon: IconCircleX }
  return { label: 'Controleren', tagClass: 'rvo-tag--default', icon: IconLoader2 }
}

function buildVersionText(): string {
  if (frontend.value.version !== 'dev') return `Invulhulpen versie ${frontend.value.version}`
  const commit = hasCommit.value ? ` op commit ${frontend.value.commit}` : ''
  return `Invulhulpen ontwikkelversie${commit}`
}

let revertTimer: ReturnType<typeof setTimeout> | undefined
async function copyVersion(): Promise<void> {
  clearTimeout(revertTimer)
  try {
    await navigator.clipboard.writeText(buildVersionText())
    copyState.value = 'done'
  } catch {
    copyState.value = 'error'
  }
  revertTimer = setTimeout(() => {
    copyState.value = 'idle'
  }, 2500)
}

function toState(e: unknown): ProbeState {
  return e instanceof TimeoutError ? 'timeout' : 'error'
}

async function checkBackend(): Promise<void> {
  try {
    await probe('/api/health')
    backendState.value = 'ok'
  } catch (e) {
    backendState.value = toState(e)
  }
}

async function checkKeycloak(): Promise<void> {
  try {
    const { keycloakUrl, keycloakRealm } = getConfig()
    await probe(`${keycloakUrl}/realms/${keycloakRealm}/.well-known/openid-configuration`)
    keycloakState.value = 'ok'
  } catch (e) {
    keycloakState.value = toState(e)
  }
}

onMounted(async () => {
  frontend.value = await loadVersion()
  await Promise.all([checkBackend(), checkKeycloak()])
})
</script>

<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <AppHeader
      :backLabel="hasHistory ? 'Terug' : 'Ga naar home'"
      :backRoute="hasHistory ? undefined : '/'"
      :showBack="hasHistory"
    />

    <h1 class="utrecht-heading-1">Status van Invulhulpen</h1>
    <p>
      Op deze pagina zie je in één oogopslag of Invulhulpen goed werkt. Werkt er iets niet, dan
      zie je dat hieronder, met een korte uitleg.
    </p>

    <section class="landing-section" aria-labelledby="status-onderdelen">
      <h2 id="status-onderdelen" class="utrecht-heading-2">Onderdelen die Invulhulpen nodig heeft</h2>
      <div class="rvo-layout-grid-container">
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">

          <div class="rvo-card rvo-card--outline rvo-card--padding-md">
            <div class="rvo-card__content card-content-flex">
              <h3 class="utrecht-heading-3 rvo-margin--none status-card__title">
                <IconServer :size="22" aria-hidden="true" focusable="false" />
                De achterkant
              </h3>
              <p class="rvo-text--sm">
                Dit onderdeel bewaart je antwoorden en haalt ze weer op. Is de achterkant niet
                bereikbaar, dan kun je tijdelijk niets openen of opslaan.
              </p>
              <p class="rvo-margin--none" role="status" aria-live="polite">
                <span class="sr-only">Status van de achterkant: </span>
                <span
                  class="rvo-tag rvo-tag--with-icon status-card__tag"
                  :class="statusMeta(backendState).tagClass"
                  data-test="backend-state"
                >
                  <component
                    :is="statusMeta(backendState).icon"
                    :size="16"
                    :class="{ 'status-spin': backendState === 'loading' }"
                    aria-hidden="true"
                    focusable="false"
                  />
                  {{ statusMeta(backendState).label }}
                </span>
              </p>
            </div>
          </div>

          <div class="rvo-card rvo-card--outline rvo-card--padding-md">
            <div class="rvo-card__content card-content-flex">
              <h3 class="utrecht-heading-3 rvo-margin--none status-card__title">
                <IconKey :size="22" aria-hidden="true" focusable="false" />
                De aanmeldvoorziening
              </h3>
              <p class="rvo-text--sm">
                Hiermee log je veilig in. Werkt dit onderdeel niet, dan lukt het mogelijk niet om
                in te loggen of ingelogd te blijven.
              </p>
              <p class="rvo-margin--none" role="status" aria-live="polite">
                <span class="sr-only">Status van de aanmeldvoorziening: </span>
                <span
                  class="rvo-tag rvo-tag--with-icon status-card__tag"
                  :class="statusMeta(keycloakState).tagClass"
                  data-test="keycloak-state"
                >
                  <component
                    :is="statusMeta(keycloakState).icon"
                    :size="16"
                    :class="{ 'status-spin': keycloakState === 'loading' }"
                    aria-hidden="true"
                    focusable="false"
                  />
                  {{ statusMeta(keycloakState).label }}
                </span>
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>

    <section class="landing-section" aria-labelledby="status-versie">
      <h2 id="status-versie" class="utrecht-heading-2">Welke versie draait er?</h2>
      <p>
        Handig om mee te sturen als je een probleem meldt. Je kunt de versie kopiëren of de
        broncode op GitHub bekijken.
      </p>
      <div class="rvo-layout-grid-container">
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--one">
          <div class="rvo-card rvo-card--outline rvo-card--padding-md">
            <div class="rvo-card__content version-card">
              <p class="rvo-margin--none version-card__line"><template v-if="frontend.version === 'dev'">Ontwikkelversie<template v-if="hasCommit"> op commit <span data-test="build">{{ frontend.commit }}</span></template></template><template v-else>Versie <span data-test="version">{{ frontend.version }}</span></template></p>
              <div class="rvo-action-group version-card__actions">
                <button
                  type="button"
                  class="rvo-button rvo-button--secondary rvo-button--size-md rvo-button--icon-before"
                  data-test="copy-version"
                  @click="copyVersion"
                >
                  <component :is="copyIcon" :size="20" aria-hidden="true" focusable="false" /> {{ copyLabel }}
                </button>
                <a
                  class="rvo-button rvo-button--secondary rvo-button--size-md rvo-button--icon-before"
                  :href="githubUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-test="github-link"
                >
                  <IconBrandGithub :size="20" aria-hidden="true" focusable="false" /> Open op GitHub
                  <IconExternalLink :size="16" aria-hidden="true" focusable="false" data-test="external-icon" />
                  <span class="sr-only">(opent in een nieuw tabblad)</span>
                </a>
              </div>
              <span class="sr-only" role="status" aria-live="polite" data-test="copy-feedback">{{ copyFeedback }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
