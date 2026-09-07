<script setup lang="ts">
import { computed, onMounted, ref, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { projects as projectsApi, assessments as assessmentsApi, type Project, type AssessmentInstance } from '../api'
import { useAnchorNav } from '../composables/useAnchorNav'
import { usePaginatedList } from '../composables/usePaginatedList'
import { FormType, type AssessmentState, parseAndValidateImport, importFromPdf, detectImportType } from '@overheid-assessment/core'
import KebabMenu from '../components/KebabMenu.vue'
import { useBackLink } from '../composables/useBackLink'
import '@nldd/design-system/button'
import '@nldd/design-system/radio-button'
import '@nldd/design-system/simple-section'
import '@nldd/design-system/menu'
import '@nldd/design-system/banner'
import '@nldd/design-system/card'
import '@nldd/design-system/collection'
import '@nldd/design-system/container'
import '@nldd/design-system/modal-dialog'
import '@nldd/design-system/text'
import '@nldd/design-system/text-field'
import '@nldd/design-system/multi-line-text-field'
import '@nldd/design-system/file-field'

const props = defineProps<{ projectId: string }>()
const router = useRouter()
const onCardNav = useAnchorNav()

useBackLink().set({ text: 'Projecten', to: '/projecten' })

const project = ref<Project | null>(null)
const {
  items: assessmentList, total, loadingMore, loadError: moreLoadError, loadStatus, statusRef,
  hasMore, nextBatchSize, loadFirst, loadMore,
} = usePaginatedList<AssessmentInstance>((page, pageSize) => assessmentsApi.list(props.projectId, page, pageSize), (a) => a.id)
const loading = ref(true)

// show/hide and the shadow input only exist once the custom elements are
// upgraded (not in jsdom unit tests).
type ModalDialogElement = HTMLElement & { show?: () => void; hide?: () => void }

const editingName = ref(false)
const editingDescription = ref(false)
const editName = ref('')
const editDescription = ref('')
const nameInput = ref<HTMLElement | null>(null)
const descriptionInput = ref<HTMLElement | null>(null)

// Start-form dialog state
const startDialogRef = ref<ModalDialogElement | null>(null)
const dialogOpen = ref(false)
const dialogAssessmentType = ref<'dpia' | 'prescan' | 'iama'>('dpia')
const dialogOption = ref<'empty' | 'prescan-project' | 'import' | 'prescan-json-upload'>('empty')
const selectedPrescanId = ref<string | null>(null)

// The bare radio reports its own state; only the newly checked one matters.
const isChecked = (event: Event) =>
  (event as CustomEvent<{ checked?: boolean }>).detail?.checked === true

const onStartOption = (event: Event, value: typeof dialogOption.value) => {
  if (isChecked(event)) dialogOption.value = value
}

const onPrescanChoice = (event: Event, id: string) => {
  if (isChecked(event)) selectedPrescanId.value = id
}
const uploadFile = ref<File | null>(null)
const dialogError = ref<string | null>(null)
const dialogSubmitting = ref(false)

// Delete-project dialog state
const deleteProjectDialogRef = ref<ModalDialogElement | null>(null)
const deleteProjectModalOpen = ref(false)
const deleteConfirmInput = ref('')

const syncDialog = (dialog: ModalDialogElement | null, open: boolean) => {
  if (!dialog) return
  if (open) dialog.show?.()
  else dialog.hide?.()
}

watch(dialogOpen, (open) => syncDialog(startDialogRef.value, open))
watch(deleteProjectModalOpen, (open) => syncDialog(deleteProjectDialogRef.value, open))

// NLDD fields deliver the value in event.detail; fall back to target.value
// for native inputs.
const eventValue = (event: Event): string =>
  (event as CustomEvent<{ value?: string }>).detail?.value ?? (event.target as HTMLInputElement).value

const isOwner = computed(() => project.value?.role === 'owner')

const existingPrescans = computed(() =>
  assessmentList.value.filter(a => a.assessmentType === 'prescan')
)

const loadError = ref<string | null>(null)

onMounted(async () => {
  try {
    const [p] = await Promise.all([
      projectsApi.get(props.projectId),
      loadFirst(),
    ])
    project.value = p
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
  nameInput.value?.shadowRoot?.querySelector('input')?.select()
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

const startEditDescription = async () => {
  if (!isEditable()) return
  editDescription.value = project.value!.description || ''
  editingDescription.value = true
  await nextTick()
  descriptionInput.value?.focus()
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
  const files = (event as CustomEvent<{ files?: File[] }>).detail?.files ?? []
  uploadFile.value = files[0] ?? null
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
  <nldd-simple-section padding-top="24">
    <div v-if="loading"><p>Laden...</p></div>

    <nldd-banner v-else-if="loadError" variant="warning" :text="loadError"></nldd-banner>

    <template v-else-if="project">
      <div class="project-detail-header">
        <h1 v-if="!editingName" :class="{ 'editable-field': isEditable() }" role="button" :tabindex="isEditable() ? 0 : undefined" :aria-label="isEditable() ? 'Klik om projectnaam te bewerken' : undefined" @click="startEditName" @keydown.enter="startEditName">{{ project.name }}</h1>
        <div v-else class="editable-field-group">
          <nldd-text-field
            ref="nameInput"
            class="editable-field-input editable-field-input--title"
            :value="editName"
            accessible-label="Projectnaam"
            @input="editName = eventValue($event)"
            @keydown.enter="saveName"
            @keydown.escape="cancelName"
          ></nldd-text-field>
          <nldd-container layout="row" gap="8" padding-top="8">
            <nldd-button variant="primary" size="xs" text="Opslaan" @click="saveName"></nldd-button>
            <nldd-button variant="accent-transparent" size="xs" text="Annuleer" @click="cancelName"></nldd-button>
          </nldd-container>
        </div>
        <div class="project-actions">
          <KebabMenu v-if="isOwner" label="Projectacties">
            <nldd-menu-item
              text="Leden beheren"
              icon="users"
              @click="router.push(`/project/${projectId}/leden`)"
            ></nldd-menu-item>
            <nldd-menu-item text="Project verwijderen" icon="trash" destructive @click="deleteProjectModalOpen = true"></nldd-menu-item>
          </KebabMenu>
        </div>
      </div>

      <p v-if="!editingDescription && project.description" class="preserve-whitespace project-detail-description" :class="{ 'editable-field': isEditable() }" role="button" :tabindex="isEditable() ? 0 : undefined" :aria-label="isEditable() ? 'Klik om beschrijving te bewerken' : undefined" @click="startEditDescription" @keydown.enter="startEditDescription">{{ project.description }}</p>
      <!-- A real button: the label used to be hidden until hover, so the option
           was invisible on first look and unreachable on touch. -->
      <nldd-button v-if="!editingDescription && !project.description && isEditable()"
        class="description-add" variant="accent-transparent" size="xs"
        start-icon="plus" text="Beschrijving toevoegen"
        @click="startEditDescription"></nldd-button>
      <div v-if="editingDescription" class="editable-field-group">
        <nldd-multi-line-text-field
          ref="descriptionInput"
          class="editable-field-input"
          :value="editDescription"
          rows="1"
          resize="auto"
          accessible-label="Projectbeschrijving"
          @input="editDescription = eventValue($event)"
          @keydown.escape="cancelDescription"
        ></nldd-multi-line-text-field>
        <nldd-container layout="row" gap="8" padding-top="8">
          <nldd-button variant="primary" size="xs" text="Opslaan" @click="saveDescription"></nldd-button>
          <nldd-button variant="accent-transparent" size="xs" text="Annuleer" @click="cancelDescription"></nldd-button>
        </nldd-container>
      </div>

      <div v-if="assessmentList.length > 0">
        <h2>Ga verder met een bestaande assessment</h2>
        <!-- max-items: the collection hides items past its own cap (24) even
             without a load-more button. The server pages the list, so the cap
             is the server total and nothing loaded is ever hidden. -->
        <nldd-collection layout="grid" item-width="320px" gap="16px" :max-items="total"
          @click="onCardNav">
          <nldd-card
            v-for="item in assessmentList"
            :key="item.id"
            :href="`/assessment/${item.id}`"
            :accessible-label="`Open assessment ${item.name}`"
          >
            <nldd-container padding="16">
              <h3 class="text-clamp-2">{{ item.name }}</h3>
              <nldd-text size="xs" color="secondary">Laatst bewerkt: {{ formatDate(item.updatedAt) }}</nldd-text>
            </nldd-container>
          </nldd-card>

          <nldd-button
            v-if="hasMore"
            slot="footer"
            variant="neutral-tinted"
            width="full"
            :disabled="loadingMore || undefined"
            :text="`Laad de volgende ${nextBatchSize} assessments`"
            @click="loadMore"
          ></nldd-button>
        </nldd-collection>
      </div>

      <p v-if="moreLoadError" class="version-list__error" role="alert">{{ moreLoadError }}</p>
      <p ref="statusRef" tabindex="-1" role="status" aria-live="polite" class="sr-only">{{ loadStatus }}</p>

      <div v-if="project.role === 'owner' || project.role === 'editor'">
        <h2>Start een nieuwe assessment</h2>
        <nldd-collection layout="grid" item-width="320px" gap="16px">
          <nldd-card>
            <nldd-container padding="16" gap="8">
              <h3>Pre-scan</h3>
              <p>Toets of een DPIA, DTIA, IAMA of KIA nodig is.</p>
            </nldd-container>
            <nldd-container slot="footer" padding="16" padding-top="0">
              <nldd-button variant="primary" size="md" text="Start pre-scan" @click="openStartDialog('prescan')"></nldd-button>
            </nldd-container>
          </nldd-card>
          <nldd-card>
            <nldd-container padding="16" gap="8">
              <h3>DPIA</h3>
              <p>Vul stap voor stap het rijksmodel DPIA in.</p>
            </nldd-container>
            <nldd-container slot="footer" padding="16" padding-top="0">
              <nldd-button variant="primary" size="md" text="Start DPIA" @click="openStartDialog('dpia')"></nldd-button>
            </nldd-container>
          </nldd-card>
          <nldd-card>
            <nldd-container padding="16" gap="8">
              <h3>IAMA</h3>
              <p>Breng de impact op mensenrechten van een algoritme in kaart.</p>
            </nldd-container>
            <nldd-container slot="footer" padding="16" padding-top="0">
              <nldd-button variant="primary" size="md" text="Start IAMA" @click="openStartDialog('iama')"></nldd-button>
            </nldd-container>
          </nldd-card>
        </nldd-collection>
      </div>
    </template>
  </nldd-simple-section>

  <!-- Start form dialog -->
  <nldd-modal-dialog
    ref="startDialogRef"
    data-test="start-dialog"
    :text="dialogAssessmentType === 'dpia' ? 'Hoe wil je de DPIA starten?' : dialogAssessmentType === 'iama' ? 'Hoe wil je de IAMA starten?' : 'Hoe wil je de pre-scan starten?'"
    @close="closeDialog"
  >
      <!-- DPIA options -->
      <template v-if="dialogAssessmentType === 'dpia'">
        <fieldset class="start-dialog__fieldset">
          <legend class="sr-only">Kies een startoptie</legend>

          <label class="start-dialog__option">
            <nldd-radio-button name="startOption" value="empty"
              :checked="dialogOption === 'empty' || undefined"
              @change="onStartOption($event, 'empty')"></nldd-radio-button>
            <span class="start-dialog__option-label">Start een nieuwe DPIA</span>
          </label>

          <label v-if="existingPrescans.length > 0" class="start-dialog__option">
            <nldd-radio-button name="startOption" value="prescan-project"
              :checked="dialogOption === 'prescan-project' || undefined"
              @change="onStartOption($event, 'prescan-project')"></nldd-radio-button>
            <span class="start-dialog__option-label">Neem antwoorden over uit een pre-scan</span>
          </label>

          <div v-if="dialogOption === 'prescan-project' && existingPrescans.length > 0" class="start-dialog__sub-options">
            <label
              v-for="ps in existingPrescans"
              :key="ps.id"
              class="start-dialog__option"
            >
              <nldd-radio-button name="prescanChoice" :value="String(ps.id)"
                :accessible-label="ps.name"
                :checked="selectedPrescanId === ps.id || undefined"
                @change="onPrescanChoice($event, ps.id)"></nldd-radio-button>
              <span class="start-dialog__option-label">{{ ps.name }} <span>({{ formatDate(ps.updatedAt) }})</span></span>
            </label>
          </div>

          <label class="start-dialog__option">
            <nldd-radio-button name="startOption" value="import"
              :checked="dialogOption === 'import' || undefined"
              @change="onStartOption($event, 'import')"></nldd-radio-button>
            <span class="start-dialog__option-label">
              Importeer een bestaande DPIA of pre-scan
              <span class="start-dialog__option-hint">Upload een JSON- of PDF-bestand en werk verder. Pre-scan antwoorden worden automatisch overgenomen naar de DPIA.</span>
            </span>
          </label>

          <div v-if="dialogOption === 'import'" class="start-dialog__sub-options">
            <nldd-file-field accept=".json,.pdf"
              accessible-label="Selecteer een JSON- of PDF-bestand"
              @change="onFileChange"></nldd-file-field>
          </div>
        </fieldset>
      </template>

      <!-- IAMA options -->
      <template v-else-if="dialogAssessmentType === 'iama'">
        <fieldset class="start-dialog__fieldset">
          <legend class="sr-only">Kies een startoptie</legend>

          <label class="start-dialog__option">
            <nldd-radio-button name="startOption" value="empty"
              :checked="dialogOption === 'empty' || undefined"
              @change="onStartOption($event, 'empty')"></nldd-radio-button>
            <span class="start-dialog__option-label">Start een nieuwe IAMA</span>
          </label>

          <label class="start-dialog__option">
            <nldd-radio-button name="startOption" value="import"
              :checked="dialogOption === 'import' || undefined"
              @change="onStartOption($event, 'import')"></nldd-radio-button>
            <span class="start-dialog__option-label">
              Importeer een bestaande IAMA
              <span class="start-dialog__option-hint">Upload een JSON- of PDF-bestand en werk verder.</span>
            </span>
          </label>

          <div v-if="dialogOption === 'import'" class="start-dialog__sub-options">
            <nldd-file-field accept=".json,.pdf"
              accessible-label="Selecteer een JSON- of PDF-bestand"
              @change="onFileChange"></nldd-file-field>
          </div>
        </fieldset>
      </template>

      <!-- Pre-scan options -->
      <template v-else>
        <fieldset class="start-dialog__fieldset">
          <legend class="sr-only">Kies een startoptie</legend>

          <label class="start-dialog__option">
            <nldd-radio-button name="startOption" value="empty"
              :checked="dialogOption === 'empty' || undefined"
              @change="onStartOption($event, 'empty')"></nldd-radio-button>
            <span class="start-dialog__option-label">Start een nieuwe pre-scan</span>
          </label>

          <label class="start-dialog__option">
            <nldd-radio-button name="startOption" value="prescan-json-upload"
              :checked="dialogOption === 'prescan-json-upload' || undefined"
              @change="onStartOption($event, 'prescan-json-upload')"></nldd-radio-button>
            <span class="start-dialog__option-label">Importeer een bestaande pre-scan (JSON- of PDF-bestand)</span>
          </label>

          <div v-if="dialogOption === 'prescan-json-upload'" class="start-dialog__sub-options">
            <nldd-file-field accept=".json,.pdf"
              accessible-label="Selecteer een JSON- of PDF-bestand"
              @change="onFileChange"></nldd-file-field>
          </div>
        </fieldset>
      </template>

      <nldd-banner v-if="dialogError" variant="critical" :text="dialogError"></nldd-banner>

      <nldd-button
        slot="actions"
        variant="primary"
        size="md"
        :disabled="dialogSubmitting || undefined"
        :text="dialogSubmitting ? 'Bezig...' : (dialogAssessmentType === 'dpia' ? 'Start DPIA' : dialogAssessmentType === 'iama' ? 'Start IAMA' : 'Start pre-scan')"
        @click="submitDialog"
      ></nldd-button>
      <nldd-button
        slot="actions"
        variant="secondary"
        size="md"
        :disabled="dialogSubmitting || undefined"
        text="Annuleer"
        @click="closeDialog"
      ></nldd-button>
  </nldd-modal-dialog>

  <!-- Delete project confirmation modal -->
  <nldd-modal-dialog
    ref="deleteProjectDialogRef"
    data-test="delete-project-dialog"
    variant="alert"
    text="Weet je zeker dat je dit project wilt verwijderen?"
    @close="deleteProjectModalOpen = false; deleteConfirmInput = ''"
  >
      <p>Het project <strong>{{ project?.name }}</strong> wordt permanent verwijderd. Alle assessments, antwoorden en versiegeschiedenis gaan verloren. Deze actie kan niet ongedaan worden gemaakt.</p>
      <p class="confirm-dialog__label">Typ <strong>VERWIJDEREN</strong> om te bevestigen</p>
      <nldd-text-field
        class="confirm-dialog__input"
        :value="deleteConfirmInput"
        accessible-label="Typ VERWIJDEREN om te bevestigen"
        @input="deleteConfirmInput = eventValue($event)"
      ></nldd-text-field>

      <!-- The safe way out is the primary action; the destructive action is the
           secondary one (NLDD design guideline). -->
      <nldd-button
        slot="actions"
        variant="primary"
        size="md"
        text="Annuleer"
        @click="deleteProjectModalOpen = false; deleteConfirmInput = ''"
      ></nldd-button>
      <nldd-button
        slot="actions"
        variant="destructive"
        size="md"
        :disabled="deleteConfirmInput !== 'VERWIJDEREN' || undefined"
        text="Project verwijderen"
        @click="confirmDeleteProject"
      ></nldd-button>
  </nldd-modal-dialog>
  </div>
</template>
