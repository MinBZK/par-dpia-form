<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { assessments as assessmentsApi, type AssessmentInstance, type AssessmentLink } from '../api'

// Choose which assessments of the project this one is linked to. A linked form
// shows its answers next to this one where their questions overlap. Only other
// form types are offered: a link to the same type is never used as a source.
const props = defineProps<{
  open: boolean
  assessment: Pick<AssessmentInstance, 'id' | 'projectId' | 'assessmentType'>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const TYPE_LABELS: Record<AssessmentInstance['assessmentType'], string> = {
  prescan: 'Pre-scan',
  dpia: 'DPIA',
  iama: 'IAMA',
}

const dialogRef = ref<HTMLDialogElement | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const candidates = ref<AssessmentInstance[]>([])
const incoming = ref<AssessmentLink[]>([])
const selected = ref<string[]>([])

const incomingIds = computed(() => new Set(incoming.value.map((link) => link.assessmentId)))

const load = async () => {
  loading.value = true
  error.value = null
  try {
    const [{ items }, { links }] = await Promise.all([
      assessmentsApi.list(props.assessment.projectId, 1, 500),
      assessmentsApi.links(props.assessment.id),
    ])
    candidates.value = items.filter((item) => item.id !== props.assessment.id && item.assessmentType !== props.assessment.assessmentType)
    incoming.value = links.filter((link) => link.direction === 'incoming')
    selected.value = links.filter((link) => link.direction === 'outgoing').map((link) => link.assessmentId)
  } catch {
    error.value = 'De assessments van dit project konden niet worden geladen. Probeer het later opnieuw.'
  } finally {
    loading.value = false
  }
}

watch(() => props.open, (open) => {
  if (open) {
    dialogRef.value?.showModal()
    load()
  } else {
    dialogRef.value?.close()
  }
})

const toggle = (id: string) => {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((selectedId) => selectedId !== id)
    : [...selected.value, id]
}

const save = async () => {
  saving.value = true
  error.value = null
  try {
    await assessmentsApi.setLinks(props.assessment.id, selected.value)
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Koppelen is niet gelukt.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog ref="dialogRef" class="confirm-dialog" aria-labelledby="link-assessments-title" @close="emit('close')">
    <div class="confirm-dialog__content">
      <h2 id="link-assessments-title" class="utrecht-heading-2">Koppelen aan andere assessments</h2>
      <p>
        Waar de vragen overlappen, zie je de antwoorden uit een gekoppelde assessment naast je eigen
        vragen. Per soort telt de laatst bijgewerkte.
      </p>

      <p v-if="loading">Laden...</p>
      <template v-else>
        <p v-if="candidates.length === 0">Dit project heeft geen andere soort assessment om aan te koppelen.</p>
        <fieldset v-else class="start-dialog__fieldset">
          <legend class="rvo-visually-hidden">Assessments in dit project</legend>
          <label v-for="candidate in candidates" :key="candidate.id" class="start-dialog__option">
            <input
              type="checkbox"
              :value="candidate.id"
              :checked="selected.includes(candidate.id) || incomingIds.has(candidate.id)"
              :disabled="incomingIds.has(candidate.id)"
              @change="toggle(candidate.id)"
            />
            <span class="start-dialog__option-label">
              {{ TYPE_LABELS[candidate.assessmentType] }}: {{ candidate.name }}
              <span v-if="incomingIds.has(candidate.id)" class="start-dialog__option-hint">
                Deze is vanuit {{ candidate.name }} aan deze assessment gekoppeld. Ontkoppelen kan daar.
              </span>
            </span>
          </label>
        </fieldset>
      </template>

      <div v-if="error" class="rvo-alert rvo-alert--error rvo-alert--padding-sm rvo-margin-block-end--md" role="alert">
        {{ error }}
      </div>

      <div class="confirm-dialog__actions">
        <button
          class="rvo-button rvo-button--primary rvo-button--size-md"
          :disabled="loading || saving"
          @click="save"
        >
          {{ saving ? 'Bezig...' : 'Opslaan' }}
        </button>
        <button class="rvo-button rvo-button--secondary rvo-button--size-md" @click="emit('close')">
          Annuleer
        </button>
      </div>
    </div>
  </dialog>
</template>
