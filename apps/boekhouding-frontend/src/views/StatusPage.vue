<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useBackLink } from '../composables/useBackLink'
import { previousPage } from '../router'
import { getConfig } from '../config'
import { loadVersion, type VersionInfo } from '../version'
import { probe, TimeoutError } from '../probe'
import '@nldd/design-system/activity-indicator'
import '@nldd/design-system/button'
import '@nldd/design-system/card'
import '@nldd/design-system/collection'
import '@nldd/design-system/container'
import '@nldd/design-system/simple-section'
import '@nldd/design-system/icon'
import '@nldd/design-system/banner'
import '@nldd/design-system/text'
import '@nldd/design-system/title'

const REPO = 'https://github.com/MinBZK/par-dpia-form'

type ProbeState = 'loading' | 'ok' | 'error' | 'timeout'
interface StatusMeta {
  label: string
  variant: 'neutral' | 'success' | 'warning' | 'critical'
}

// Name where the reader goes back to, rather than a bare "Terug".
useBackLink().set(previousPage.value ?? { text: 'Startpagina', to: '/' })

const frontend = ref<VersionInfo>({ version: 'dev', commit: 'dev', channel: 'dev' })

// The git tag carries the v (vYYYY.M.D); the reading version does not.
const displayVersion = computed(() => frontend.value.version.replace(/^v/, ''))
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
  copyState.value === 'done' ? 'check-mark' : copyState.value === 'error' ? 'exclamation-triangle' : 'copy',
)

function statusMeta(state: ProbeState): StatusMeta {
  // The banner picks its own icon per variant; only the checking state needs
  // one of its own (an activity indicator in the icon slot).
  if (state === 'ok') return { label: 'Alles werkt', variant: 'success' }
  if (state === 'timeout') return { label: 'Reageert traag', variant: 'warning' }
  if (state === 'error') return { label: 'Er werkt iets niet', variant: 'critical' }
  return { label: 'Controleren', variant: 'neutral' }
}

function buildVersionText(): string {
  if (frontend.value.version !== 'dev') return `Invulhulpen versie ${displayVersion.value}`
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
  <nldd-simple-section>
    <nldd-container gap="16">
    <nldd-title size="3"><h1>Status van Invulhulpen</h1></nldd-title>
    <p>
      Op deze pagina zie je in één oogopslag of Invulhulpen goed werkt. Werkt er iets niet, dan
      zie je dat hieronder, met een korte uitleg.
    </p>

    <section class="landing-section" aria-labelledby="status-onderdelen">
      <h2 id="status-onderdelen">Onderdelen die Invulhulpen nodig heeft</h2>
      <nldd-collection layout="grid" item-width="380px" gap="16px">

        <nldd-card>
          <nldd-container padding="16" gap="8">
            <h3 class="status-card__title">
              <nldd-icon name="rack-server" size="20"></nldd-icon>
              De achterkant
            </h3>
            <nldd-text size="xs">
              Dit onderdeel bewaart je antwoorden en haalt ze weer op. Is de achterkant niet
              bereikbaar, dan kun je tijdelijk niets openen of opslaan.
            </nldd-text>
          </nldd-container>
          <nldd-container slot="footer" padding="16" padding-top="0">
            <!-- The state is what this card is for, so it fills the footer as a
                 banner instead of hiding in a small tag. -->
            <div role="status" aria-live="polite">
              <span class="sr-only">Status van de achterkant: </span>
              <nldd-banner
                :variant="statusMeta(backendState).variant"
                :text="statusMeta(backendState).label"
                data-test="backend-state"
              >
                <nldd-activity-indicator
                  v-if="backendState === 'loading'"
                  slot="icon"
                  size="20"
                ></nldd-activity-indicator>
              </nldd-banner>
            </div>
          </nldd-container>
        </nldd-card>

        <nldd-card>
          <nldd-container padding="16" gap="8">
            <h3 class="status-card__title">
              <nldd-icon name="key" size="20"></nldd-icon>
              De aanmeldvoorziening
            </h3>
            <nldd-text size="xs">
              Hiermee log je veilig in. Werkt dit onderdeel niet, dan lukt het mogelijk niet om
              in te loggen of ingelogd te blijven.
            </nldd-text>
          </nldd-container>
          <nldd-container slot="footer" padding="16" padding-top="0">
            <!-- The state is what this card is for, so it fills the footer as a
                 banner instead of hiding in a small tag. -->
            <div role="status" aria-live="polite">
              <span class="sr-only">Status van de aanmeldvoorziening: </span>
              <nldd-banner
                :variant="statusMeta(keycloakState).variant"
                :text="statusMeta(keycloakState).label"
                data-test="keycloak-state"
              >
                <nldd-activity-indicator
                  v-if="keycloakState === 'loading'"
                  slot="icon"
                  size="20"
                ></nldd-activity-indicator>
              </nldd-banner>
            </div>
          </nldd-container>
        </nldd-card>

      </nldd-collection>
    </section>

    <section class="landing-section" aria-labelledby="status-versie">
      <h2 id="status-versie">Welke versie draait er?</h2>
      <p>
        Handig om mee te sturen als je een probleem meldt. Je kunt de versie kopiëren of de
        broncode op GitHub bekijken.
      </p>
      <nldd-card>
        <nldd-container padding="16" gap="16">
          <p class="version-card__line"><template v-if="frontend.version === 'dev'">Ontwikkelversie<template v-if="hasCommit"> op commit <span data-test="build">{{ frontend.commit }}</span></template></template><template v-else>Versie <span data-test="version">{{ displayVersion }}</span></template></p>
          <nldd-container layout="wrap" gap="8" class="version-card__actions">
            <nldd-button
              variant="secondary"
              size="md"
              :start-icon="copyIcon"
              :text="copyLabel"
              data-test="copy-version"
              @click="copyVersion"
            ></nldd-button>
            <nldd-button
              variant="secondary"
              size="md"
              :href="githubUrl"
              target="_blank"
              text="Open op GitHub"
              end-icon="external-link"
              data-test="github-link"
            ></nldd-button>
          </nldd-container>
          <span class="sr-only" role="status" aria-live="polite" data-test="copy-feedback">{{ copyFeedback }}</span>
        </nldd-container>
      </nldd-card>
    </section>
    </nldd-container>
  </nldd-simple-section>
</template>
