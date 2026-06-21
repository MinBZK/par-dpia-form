<script setup lang="ts">
import { computed, onMounted, ref, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { projects as projectsApi, assessments as assessmentsApi, type Project, type AssessmentInstance } from '../api'
import { FormType, type AssessmentState, parseAndValidateImport, importFromPdf, detectImportType, MarkdownEditor, renderMarkdownToHtml } from '@overheid-assessment/core'
import { IconUsers, IconDotsVertical } from '@tabler/icons-vue'
import AppHeader from '../components/AppHeader.vue'

const props = defineProps<{ projectId: string }>()
const router = useRouter()

const project = ref<Project | null>(null)
const assessmentList = ref<AssessmentInstance[]>([])
const loading = ref(true)

const editingName = ref(false)
const editingDescription = ref(false)
const editName = ref('')
const editDescription = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

// Start-form dialog state
const startDialogRef = ref<HTMLDialogElement | null>(null)
const dialogOpen = ref(false)
const dialogAssessmentType = ref<'dpia' | 'prescan' | 'iama'>('dpia')
const dialogOption = ref<'empty' | 'prescan-project' | 'import' | 'prescan-json-upload'>('empty')
const selectedPrescanId = ref<string | null>(null)
const uploadFile = ref<File | null>(null)
const dialogError = ref<string | null>(null)
const dialogSubmitting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

// Project kebab menu
const projectMenuOpen = ref(false)
const deleteProjectDialogRef = ref<HTMLDialogElement | null>(null)
const deleteProjectModalOpen = ref(false)
const deleteConfirmInput = ref('')

watch(dialogOpen, (open) => {
  if (open) {
    startDialogRef.value?.showModal()
  } else {
    startDialogRef.value?.close()
  }
})

watch(deleteProjectModalOpen, (open) => {
  if (open) {
    deleteProjectDialogRef.value?.showModal()
  } else {
    deleteProjectDialogRef.value?.close()
  }
})

const isOwner = computed(() => project.value?.role === 'owner')

const existingPrescans = computed(() =>
  assessmentList.value.filter(a => a.assessmentType === 'prescan')
)

const loadError = ref<string | null>(null)

onMounted(async () => {
  try {
    const [p, a] = await Promise.all([
      projectsApi.get(props.projectId),
      assessmentsApi.list(props.projectId),
    ])
    project.value = p
    assessmentList.value = a
  } catch {
    loadError.value = 'Kan project niet laden. Probeer het later opnieuw.'
  } finally {
    loading.value = false
  }
})

const isEditable = () => project.value?.role === 'owner' || project.value?.role === 'editor'

const startEditName = async () => {
  if (!isEditable()) return
  editName.value = project.value!.name
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

const cancelName = () => {
  editingName.value = false
}

const saveName = async () => {
  const trimmed = editName.value.trim()
  if (!trimmed || trimmed === project.value!.name) {
    editingName.value = false
    return
  }
  const updated = await projectsApi.update(props.projectId, { name: trimmed })
  project.value = { ...project.value!, ...updated }
  editingName.value = false
}

// Only reachable from controls already gated by v-if="isEditable()".
const startEditDescription = () => {
  editDescription.value = project.value!.description || ''
  editingDescription.value = true
}

const cancelDescription = () => {
  editingDescription.value = false
}

const saveDescription = async () => {
  const trimmed = editDescription.value.trim()
  if (trimmed === (project.value!.description || '')) {
    editingDescription.value = false
    return
  }
  const updated = await projectsApi.update(props.projectId, { description: trimmed })
  project.value = { ...project.value!, ...updated }
  editingDescription.value = false
}

// Dialog handling
const openStartDialog = (assessmentType: 'dpia' | 'prescan' | 'iama') => {
  dialogAssessmentType.value = assessmentType
  dialogOption.value = 'empty'
  selectedPrescanId.value = null
  uploadFile.value = null
  dialogError.value = null
  dialogSubmitting.value = false
  dialogOpen.value = true
}

const closeDialog = () => {
  dialogOpen.value = false
}

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  uploadFile.value = input.files?.[0] ?? null
  dialogError.value = null
}

const typeLabels: Record<'dpia' | 'prescan' | 'iama', string> = {
  dpia: 'DPIA',
  prescan: 'pre-scan',
  iama: 'IAMA',
}

/** Parse an uploaded file (PDF or JSON) into an AssessmentState.
 *  PDF goes through importFromPdf; everything else is treated as JSON.
 *  Both throw descriptive Dutch errors on invalid input. */
const parseUploadedFile = async (file: File): Promise<AssessmentState> => {
  const isPdf = file.name.toLowerCase().endsWith('.pdf')
  return isPdf ? await importFromPdf(file) : parseAndValidateImport(await file.text())
}

/** Verify the uploaded file matches the chosen assessment type. Throws a Dutch
 *  error on mismatch. `allowed` lists the types accepted for this start option
 *  (DPIA additionally accepts pre-scan files to take over their answers). */
const assertImportTypeMatches = (
  state: AssessmentState,
  allowed: ('dpia' | 'prescan' | 'iama')[],
) => {
  const detected = detectImportType(state as unknown as Record<string, unknown>)
  if (!detected || !allowed.includes(detected)) {
    const detectedLabel = detected ? typeLabels[detected] : 'onbekend'
    const expectedLabel = allowed.map((t) => typeLabels[t]).join(' of ')
    throw new Error(
      `Het bestand bevat een ${detectedLabel}-assessment, maar er werd een ${expectedLabel}-bestand verwacht.`,
    )
  }
}

/** Build a DPIA initial state that embeds pre-scan answers for cross-referencing.
 *  Pre-scan answers go in a separate `_prescanAnswers` field (not inside `answers`)
 *  so they don't collide with DPIA flat-format answers and usePreScanReferences
 *  can load them into the PRE_SCAN namespace. The DPIA starts with empty answers. */
const buildPrescanState = (prescanAnswers: Record<string, unknown>): Record<string, unknown> => ({
  metadata: { createdAt: new Date().toISOString() },
  answers: {},
  _prescanAnswers: prescanAnswers,
})

const submitDialog = async () => {
  dialogError.value = null
  dialogSubmitting.value = true

  try {
    if (dialogAssessmentType.value === 'dpia') {
      await submitDpiaDialog()
    } else if (dialogAssessmentType.value === 'iama') {
      await submitIamaDialog()
    } else {
      await submitPrescanDialog()
    }
  } catch (e: any) {
    dialogError.value = e.message || 'Er is iets misgegaan'
  } finally {
    dialogSubmitting.value = false
  }
}

const submitDpiaDialog = async () => {
  if (dialogOption.value === 'empty') {
    // Option 1: Start with empty DPIA
    const form = await assessmentsApi.create(props.projectId, 'dpia')
    router.push(`/assessment/${form.id}`)
    return
  }

  if (dialogOption.value === 'prescan-project') {
    // Option 2a: Take over answers from a project pre-scan
    if (!selectedPrescanId.value) {
      dialogError.value = 'Selecteer een pre-scan'
      return
    }
    const prescanForm = await assessmentsApi.get(selectedPrescanId.value)
    const prescanState = prescanForm.state as Record<string, unknown> | undefined
    let prescanAnswers = prescanState?.answers as Record<string, unknown> | undefined
    // Unwrap old namespace-wrapped format: { prescan: { "0.1": ... } } → { "0.1": ... }
    if (prescanAnswers?.[FormType.PRE_SCAN] && typeof prescanAnswers[FormType.PRE_SCAN] === 'object') {
      prescanAnswers = prescanAnswers[FormType.PRE_SCAN] as Record<string, unknown>
    }
    if (!prescanAnswers || Object.keys(prescanAnswers).length === 0) {
      dialogError.value = 'De geselecteerde pre-scan bevat geen ingevulde gegevens'
      return
    }
    const initialState = buildPrescanState(prescanAnswers)
    const form = await assessmentsApi.create(props.projectId, 'dpia', undefined, initialState)
    router.push(`/assessment/${form.id}`)
    return
  }

  if (dialogOption.value === 'import') {
    if (!uploadFile.value) {
      dialogError.value = 'Selecteer een JSON- of PDF-bestand'
      return
    }
    const state = await parseUploadedFile(uploadFile.value)
    // A DPIA may be started from either a DPIA or a pre-scan file.
    assertImportTypeMatches(state, ['dpia', 'prescan'])
    const importType = detectImportType(state as unknown as Record<string, unknown>)

    // Pre-scan file imported to start a DPIA: wrap answers under prescan
    // namespace so usePreScanReferences can find them; DPIA starts empty.
    const initialState = importType === 'prescan'
      ? buildPrescanState(state.answers as Record<string, unknown>)
      : state

    const form = await assessmentsApi.create(props.projectId, 'dpia', undefined, initialState)
    router.push(`/assessment/${form.id}`)
    return
  }
}

const submitIamaDialog = async () => {
  if (dialogOption.value === 'empty') {
    // Option 1: Start with empty IAMA
    const form = await assessmentsApi.create(props.projectId, 'iama')
    router.push(`/assessment/${form.id}`)
    return
  }

  if (dialogOption.value === 'import') {
    if (!uploadFile.value) {
      dialogError.value = 'Selecteer een JSON- of PDF-bestand'
      return
    }
    const state = await parseUploadedFile(uploadFile.value)
    assertImportTypeMatches(state, ['iama'])

    const form = await assessmentsApi.create(props.projectId, 'iama', undefined, state)
    router.push(`/assessment/${form.id}`)
    return
  }
}

const submitPrescanDialog = async () => {
  if (dialogOption.value === 'empty') {
    const form = await assessmentsApi.create(props.projectId, 'prescan')
    router.push(`/assessment/${form.id}`)
    return
  }

  if (dialogOption.value === 'prescan-json-upload') {
    if (!uploadFile.value) {
      dialogError.value = 'Selecteer een JSON- of PDF-bestand'
      return
    }
    const state = await parseUploadedFile(uploadFile.value)
    assertImportTypeMatches(state, ['prescan'])

    if (!state.answers || Object.keys(state.answers).length === 0) {
      dialogError.value = 'Het bestand bevat geen pre-scan antwoorden'
      return
    }

    const form = await assessmentsApi.create(props.projectId, 'prescan', undefined, state)
    router.push(`/assessment/${form.id}`)
    return
  }
}

const confirmDeleteProject = async () => {
  await projectsApi.delete(props.projectId)
  deleteProjectModalOpen.value = false
  router.push('/projecten')
}

const formTypeLabel = (type: string) => type === 'dpia' ? 'DPIA' : type === 'iama' ? 'IAMA' : 'Pre-scan'

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

</script>

<template>
  <div>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <div v-if="loading"><p>Laden...</p></div>

    <div v-else-if="loadError" class="rvo-alert rvo-alert--warning rvo-margin-block-end--lg">
      <p>{{ loadError }}</p>
    </div>

    <template v-else-if="project">
      <AppHeader backLabel="Terug naar projecten" backRoute="/projecten" />

      <div class="rvo-layout-row rvo-layout-gap--md rvo-margin-block-end--lg project-detail-header">
        <h1 v-if="!editingName" class="utrecht-heading-1 rvo-heading--no-margins" :class="{ 'editable-field': isEditable() }" role="button" :tabindex="isEditable() ? 0 : undefined" :aria-label="isEditable() ? 'Klik om projectnaam te bewerken' : undefined" @click="startEditName" @keydown.enter="startEditName">{{ project.name }}</h1>
        <div v-else class="editable-field-group">
          <input
            ref="nameInput"
            v-model="editName"
            class="utrecht-textbox utrecht-textbox--html-input editable-field-input editable-field-input--title"
            aria-label="Projectnaam"
            @keydown.enter="saveName"
            @keydown.escape="cancelName"
          />
          <div class="editable-field-actions">
            <button class="rvo-button rvo-button--primary rvo-button--size-xs" @click="saveName">Opslaan</button>
            <button class="rvo-button rvo-button--tertiary rvo-button--size-xs" @click="cancelName">Annuleer</button>
          </div>
        </div>
        <div class="project-actions">
          <button
            v-if="isOwner"
            class="rvo-button rvo-button--tertiary rvo-button--size-xs rvo-button--icon-before"
            @click="router.push(`/project/${projectId}/leden`)"
          >
            <IconUsers :size="16" /> Leden beheren
          </button>
          <div v-if="isOwner" class="kebab-menu" @focusout="projectMenuOpen = false">
            <button
              class="kebab-menu__trigger"
              aria-haspopup="true"
              :aria-expanded="projectMenuOpen"
              aria-label="Projectacties"
              @click="projectMenuOpen = !projectMenuOpen"
            >
              <IconDotsVertical :size="20" />
            </button>
            <div v-if="projectMenuOpen" class="kebab-menu__dropdown" role="menu">
              <button class="kebab-menu__item kebab-menu__item--danger" role="menuitem" @mousedown="projectMenuOpen = false; deleteProjectModalOpen = true">Project verwijderen</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!editingDescription && project.description" class="rvo-margin-block-end--md project-detail-description">
        <div class="markdown-content" v-html="renderMarkdownToHtml(project.description)"></div>
        <button v-if="isEditable()" type="button" class="rvo-button rvo-button--tertiary rvo-button--size-xs description-edit-button" @click="startEditDescription">Beschrijving bewerken</button>
      </div>
      <div v-if="!editingDescription && !project.description && isEditable()" class="description-add rvo-margin-block-end--md" role="button" tabindex="0" aria-label="Klik om een beschrijving toe te voegen" @click="startEditDescription" @keydown.enter="startEditDescription">
        <span class="description-add__label">Beschrijving toevoegen</span>
      </div>
      <div v-if="editingDescription" class="editable-field-group rvo-margin-block-end--md">
        <MarkdownEditor
          :model-value="editDescription"
          aria-label="Projectbeschrijving"
          @update:model-value="(value) => editDescription = value"
        />
        <div class="editable-field-actions">
          <button class="rvo-button rvo-button--primary rvo-button--size-xs" @click="saveDescription">Opslaan</button>
          <button class="rvo-button rvo-button--tertiary rvo-button--size-xs" @click="cancelDescription">Annuleer</button>
        </div>
      </div>

      <div v-if="assessmentList.length > 0">
        <h2 class="utrecht-heading-2">Ga verder met een bestaande assessment</h2>
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two rvo-margin-block-end--lg">
          <router-link
            v-for="item in assessmentList"
            :key="item.id"
            :to="`/assessment/${item.id}`"
            class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card--full-colour--grijs-100 card-link"
          >
            <div class="rvo-card__content">
              <h3 class="utrecht-heading-3 rvo-margin--none text-clamp-2">{{ item.name }}</h3>
              <p class="rvo-text--sm rvo-text--subtle">Laatst bewerkt: {{ formatDate(item.updatedAt) }}</p>
            </div>
          </router-link>
        </div>
      </div>

      <div v-if="project.role === 'owner' || project.role === 'editor'">
        <h2 class="utrecht-heading-2">Start een nieuwe assessment</h2>
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two rvo-margin-block-end--lg">
        <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card--full-colour--grijs-100">
          <div class="rvo-card__content card-content-flex">
            <h3 class="utrecht-heading-3 rvo-margin--none">Pre-scan</h3>
            <p>Toets of een DPIA, DTIA, IAMA of KIA nodig is.</p>
            <div class="card-button">
              <button class="rvo-button rvo-button--primary rvo-button--size-md" @click="openStartDialog('prescan')">
                Start pre-scan
              </button>
            </div>
          </div>
        </div>
        <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card--full-colour--grijs-100">
          <div class="rvo-card__content card-content-flex">
            <h3 class="utrecht-heading-3 rvo-margin--none">DPIA</h3>
            <p>Vul stap voor stap het rijksmodel DPIA in.</p>
            <div class="card-button">
              <button class="rvo-button rvo-button--primary rvo-button--size-md" @click="openStartDialog('dpia')">
                Start DPIA
              </button>
            </div>
          </div>
        </div>
        <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card--full-colour--grijs-100">
          <div class="rvo-card__content card-content-flex">
            <h3 class="utrecht-heading-3 rvo-margin--none">IAMA</h3>
            <p>Breng de impact op mensenrechten van een algoritme in kaart.</p>
            <div class="card-button">
              <button class="rvo-button rvo-button--primary rvo-button--size-md" @click="openStartDialog('iama')">
                Start IAMA
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </template>
  </div>

  <!-- Start form dialog -->
  <dialog
    ref="startDialogRef"
    class="start-dialog"
    @close="closeDialog"
  >
    <div class="start-dialog__content">
      <h2 class="utrecht-heading-2">
        {{ dialogAssessmentType === 'dpia' ? 'Hoe wil je de DPIA starten?' : dialogAssessmentType === 'iama' ? 'Hoe wil je de IAMA starten?' : 'Hoe wil je de pre-scan starten?' }}
      </h2>

      <!-- DPIA options -->
      <template v-if="dialogAssessmentType === 'dpia'">
        <fieldset class="start-dialog__fieldset">
          <legend class="rvo-visually-hidden">Kies een startoptie</legend>

          <label class="start-dialog__option">
            <input type="radio" v-model="dialogOption" value="empty" name="startOption" />
            <span class="start-dialog__option-label">Start een nieuwe DPIA</span>
          </label>

          <label v-if="existingPrescans.length > 0" class="start-dialog__option">
            <input type="radio" v-model="dialogOption" value="prescan-project" name="startOption" />
            <span class="start-dialog__option-label">Neem antwoorden over uit een pre-scan</span>
          </label>

          <div v-if="dialogOption === 'prescan-project' && existingPrescans.length > 0" class="start-dialog__sub-options">
            <label
              v-for="ps in existingPrescans"
              :key="ps.id"
              class="start-dialog__option"
            >
              <input type="radio" v-model="selectedPrescanId" :value="ps.id" name="prescanChoice" />
              <span class="start-dialog__option-label">{{ ps.name }} <span class="rvo-text--sm rvo-text--subtle">({{ formatDate(ps.updatedAt) }})</span></span>
            </label>
          </div>

          <label class="start-dialog__option">
            <input type="radio" v-model="dialogOption" value="import" name="startOption" />
            <span class="start-dialog__option-label">
              Importeer een bestaande DPIA of pre-scan
              <span class="start-dialog__option-hint">Upload een JSON- of PDF-bestand en werk verder. Pre-scan antwoorden worden automatisch overgenomen naar de DPIA.</span>
            </span>
          </label>

          <div v-if="dialogOption === 'import'" class="start-dialog__sub-options">
            <label>
              <span class="rvo-visually-hidden">Selecteer een JSON- of PDF-bestand</span>
              <input ref="fileInput" type="file" accept=".json,.pdf" @change="onFileChange" />
            </label>
          </div>
        </fieldset>
      </template>

      <!-- IAMA options -->
      <template v-else-if="dialogAssessmentType === 'iama'">
        <fieldset class="start-dialog__fieldset">
          <legend class="rvo-visually-hidden">Kies een startoptie</legend>

          <label class="start-dialog__option">
            <input type="radio" v-model="dialogOption" value="empty" name="startOption" />
            <span class="start-dialog__option-label">Start een nieuwe IAMA</span>
          </label>

          <label class="start-dialog__option">
            <input type="radio" v-model="dialogOption" value="import" name="startOption" />
            <span class="start-dialog__option-label">
              Importeer een bestaande IAMA
              <span class="start-dialog__option-hint">Upload een JSON- of PDF-bestand en werk verder.</span>
            </span>
          </label>

          <div v-if="dialogOption === 'import'" class="start-dialog__sub-options">
            <label>
              <span class="rvo-visually-hidden">Selecteer een JSON- of PDF-bestand</span>
              <input ref="fileInput" type="file" accept=".json,.pdf" @change="onFileChange" />
            </label>
          </div>
        </fieldset>
      </template>

      <!-- Pre-scan options -->
      <template v-else>
        <fieldset class="start-dialog__fieldset">
          <legend class="rvo-visually-hidden">Kies een startoptie</legend>

          <label class="start-dialog__option">
            <input type="radio" v-model="dialogOption" value="empty" name="startOption" />
            <span class="start-dialog__option-label">Start een nieuwe pre-scan</span>
          </label>

          <label class="start-dialog__option">
            <input type="radio" v-model="dialogOption" value="prescan-json-upload" name="startOption" />
            <span class="start-dialog__option-label">Importeer een bestaande pre-scan (JSON- of PDF-bestand)</span>
          </label>

          <div v-if="dialogOption === 'prescan-json-upload'" class="start-dialog__sub-options">
            <label>
              <span class="rvo-visually-hidden">Selecteer een JSON- of PDF-bestand</span>
              <input ref="fileInput" type="file" accept=".json,.pdf" @change="onFileChange" />
            </label>
          </div>
        </fieldset>
      </template>

      <div v-if="dialogError" class="rvo-alert rvo-alert--error rvo-alert--padding-sm rvo-margin-block-end--md" role="alert">
        {{ dialogError }}
      </div>

      <div class="start-dialog__actions">
        <button
          class="rvo-button rvo-button--primary rvo-button--size-md"
          :disabled="dialogSubmitting"
          @click="submitDialog"
        >
          {{ dialogSubmitting ? 'Bezig...' : (dialogAssessmentType === 'dpia' ? 'Start DPIA' : dialogAssessmentType === 'iama' ? 'Start IAMA' : 'Start pre-scan') }}
        </button>
        <button
          class="rvo-button rvo-button--secondary rvo-button--size-md"
          :disabled="dialogSubmitting"
          @click="closeDialog"
        >
          Annuleer
        </button>
      </div>
    </div>
  </dialog>

  <!-- Delete project confirmation modal -->
  <dialog ref="deleteProjectDialogRef" class="confirm-dialog" @close="deleteProjectModalOpen = false; deleteConfirmInput = ''">
    <div class="confirm-dialog__content">
      <h2 class="utrecht-heading-2">Weet je zeker dat je dit project wilt verwijderen?</h2>
      <p>Het project <strong>{{ project?.name }}</strong> wordt permanent verwijderd. Alle assessments, antwoorden en versiegeschiedenis gaan verloren. Deze actie kan niet ongedaan worden gemaakt.</p>
      <label class="confirm-dialog__label">
        Typ <strong>VERWIJDEREN</strong> om te bevestigen
        <input
          v-model="deleteConfirmInput"
          class="utrecht-textbox utrecht-textbox--html-input confirm-dialog__input"
        />
      </label>
      <div class="confirm-dialog__actions">
        <button
          class="rvo-button rvo-button--size-md confirm-dialog__delete"
          :class="deleteConfirmInput === 'VERWIJDEREN' ? 'rvo-button--primary' : 'confirm-dialog__delete--disabled'"
          :disabled="deleteConfirmInput !== 'VERWIJDEREN'"
          @click="confirmDeleteProject"
        >
          Project verwijderen
        </button>
        <button class="rvo-button rvo-button--secondary rvo-button--size-md" @click="deleteProjectModalOpen = false; deleteConfirmInput = ''">
          Annuleer
        </button>
      </div>
    </div>
  </dialog>
  </div>
</template>
