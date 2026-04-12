<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Form,
  FormType,
  useSchemaStore,
  useTaskStore,
  useAnswerStore,
  useCalculationStore,
  exportToJson,
  exportToMarkdown,
  exportToPdf,
  PERSISTENCE_KEY,
  type NavigationFunctions,
} from '@overheid-assessment/core'
import { assessments as assessmentsApi, type AssessmentInstance } from '../api'
import { createApiPersistence } from '../ApiPersistence'
import { IconArrowLeft, IconDotsVertical } from '@tabler/icons-vue'
import AppHeader from '../components/AppHeader.vue'
import ConflictResolutionDialog from '../components/ConflictResolutionDialog.vue'
import CommentBadge from '../components/CommentBadge.vue'
import CommentPanel from '../components/CommentPanel.vue'
import { useCollaborationStore } from '../stores/collaboration'
import { useFieldCommentIndicators } from '../composables/useFieldCommentIndicators'

const props = defineProps<{
  assessmentId: string
}>()

const router = useRouter()
const schemaStore = useSchemaStore()
const taskStore = useTaskStore()
const answerStore = useAnswerStore()
const calculationStore = useCalculationStore()

const assessment = ref<(AssessmentInstance & { role?: string }) | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const canEdit = computed(() => assessment.value?.role === 'owner' || assessment.value?.role === 'editor')
const isReadonly = computed(() => !canEdit.value)

// Comment system
const collaborationStore = useCollaborationStore()
const commentPanelOpen = ref(false)
const activeCommentFieldId = ref<string | null>(null)
const formContainerRef = ref<HTMLElement | null>(null)

const canComment = computed(() =>
  assessment.value?.role === 'commenter' || assessment.value?.role === 'editor' || assessment.value?.role === 'owner',
)

useFieldCommentIndicators(formContainerRef, (fieldId) => {
  activeCommentFieldId.value = fieldId
  commentPanelOpen.value = true
}, canComment)

function toggleCommentPanel() {
  commentPanelOpen.value = !commentPanelOpen.value
  if (!commentPanelOpen.value) {
    activeCommentFieldId.value = null
  }
}

// Sync toast state
const syncToast = ref<{ message: string; action?: () => void } | null>(null)
let syncToastTimer: ReturnType<typeof setTimeout> | null = null

function showSyncToast(message: string, action?: () => void) {
  if (syncToastTimer) clearTimeout(syncToastTimer)
  syncToast.value = { message, action }
  if (!action) {
    syncToastTimer = setTimeout(() => { syncToast.value = null }, 3000)
  }
}

function dismissSyncToast() {
  if (syncToastTimer) clearTimeout(syncToastTimer)
  syncToast.value = null
}

function formatActiveSectionMessage(fieldLabels: string[]): string {
  if (fieldLabels.length === 1) {
    return `Een collega heeft een wijziging gemaakt in '${fieldLabels[0]}'`
  }
  return `Een collega heeft ${fieldLabels.length} wijzigingen gemaakt in deze sectie`
}

function formatBackgroundMessage(sectionLabels: string[]): string {
  if (sectionLabels.length === 0) {
    return 'Bijgewerkt door een collega'
  }
  if (sectionLabels.length === 1) {
    return `Sectie '${sectionLabels[0]}' bijgewerkt door een collega`
  }
  if (sectionLabels.length === 2) {
    return `Secties '${sectionLabels[0]}' en '${sectionLabels[1]}' bijgewerkt door een collega`
  }
  return `${sectionLabels.length} secties bijgewerkt door een collega`
}

// Inline name editing
const editingName = ref(false)
const editName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

// Kebab menu
const menuOpen = ref(false)

// Delete confirmation modal
const deleteModalOpen = ref(false)
const deleteConfirmInput = ref('')
const deleteDialogRef = ref<HTMLDialogElement | null>(null)

watch(deleteModalOpen, (open) => {
  if (open) {
    deleteDialogRef.value?.showModal()
  } else {
    deleteDialogRef.value?.close()
  }
})

// Provide API persistence for this assessment
const { conflictState, sync, ...persistence } = createApiPersistence(props.assessmentId)
provide(PERSISTENCE_KEY, persistence)

function handleConflictResolve(resolutions: Map<string, 'mine' | 'theirs'>) {
  conflictState.resolve(resolutions)
}

// Guard against the remote-change watcher firing during initial load, before knownVersion is populated from the
// server. Otherwise the first poll would falsely detect a "remote change" and trigger a merge cycle.
const syncReady = ref(false)

// Dismiss any lingering sync-toast when the conflict dialog opens — prevents showing the [Overnemen] prompt
// alongside the dialog, which is confusing (both ask the user to act on overlapping data).
watch(() => conflictState.active, (active) => {
  if (active) dismissSyncToast()
})

// Watch for remote changes via sync polling
watch(
  [() => collaborationStore.assessmentVersion, () => collaborationStore.assessmentUpdatedAt],
  async ([polledVersion, polledUpdatedAt]) => {
    if (!syncReady.value) return
    if (!polledVersion || !assessment.value) return
    if (polledVersion === sync.knownVersion.value && polledUpdatedAt === sync.knownUpdatedAt.value) return

    // Own change — only bookkeeping needed, no UI
    if (collaborationStore.lastModifiedBySelf) {
      if (sync.knownVersion.value === undefined || polledVersion > sync.knownVersion.value) {
        sync.knownVersion.value = polledVersion
      }
      if (polledUpdatedAt) {
        sync.knownUpdatedAt.value = polledUpdatedAt
      }
      return
    }

    const ns = taskStore.activeNamespace
    const activeSectionId = taskStore.currentRootTaskId[ns]
    const result = await sync.handleRemoteChange(activeSectionId)

    if (result.activeSectionChanges.length > 0) {
      // Capture changeId so this closure ignores stale clicks after newer deferred changes arrive
      const changeId = result.changeId
      const message = formatActiveSectionMessage(result.activeSectionFieldLabels)
      showSyncToast(message, async () => {
        const outcome = await sync.applyDeferredChanges(changeId)
        dismissSyncToast()
        if (outcome === 'merged') {
          showSyncToast('Informatie bijgewerkt')
        }
        // 'conflict' outcome opens ConflictResolutionDialog automatically; 'stale' is silently ignored.
      })
    } else if (result.backgroundMerged > 0) {
      showSyncToast(formatBackgroundMessage(result.backgroundSectionLabels))
    }
  },
)

// Apply deferred changes when navigating away from the active section
watch(
  () => taskStore.currentRootTaskId[taskStore.activeNamespace],
  () => {
    if (sync.hasDeferredChanges()) {
      sync.applyDeferredOnNavigate()
      dismissSyncToast()
    }
  },
)

// Map assessment_type to FormType enum
const assessmentTypeMap: Record<string, FormType> = {
  dpia: FormType.DPIA,
  prescan: FormType.PRE_SCAN,
}

// Navigation: back goes to project detail
const navigationFunctions: NavigationFunctions = {
  goToLanding: () => {
    if (assessment.value) router.push(`/project/${assessment.value.projectId}`)
  },
  goToDPIA: () => {},
  goToPreScanDPIA: () => {},
}

onMounted(async () => {
  try {
    // Reset stores to clear state from any previously opened assessment
    taskStore.reset()
    answerStore.reset()
    calculationStore.reset()

    assessment.value = await assessmentsApi.get(props.assessmentId)

    if (!schemaStore.isInitialized) {
      const [dpiaModule, preScanModule] = await Promise.all([
        import('../../../../sources/generated/DPIA.json'),
        import('../../../../sources/generated/PreScanDPIA.json'),
      ])
      schemaStore.init({ dpia: dpiaModule.default, preScan: preScanModule.default })
    }

    const namespace = assessmentTypeMap[assessment.value.assessmentType] || FormType.DPIA
    taskStore.setActiveNamespace(namespace)
    answerStore.setActiveNamespace(namespace)

    // If this is a DPIA with embedded pre-scan answers, initialize the PRE_SCAN
    // task structure and load answers so usePreScanReferences can work.
    if (namespace === FormType.DPIA && assessment.value.state) {
      const loadedState = assessment.value.state as Record<string, unknown>
      // Support both new `_prescanAnswers` field and old `answers.prescan` format
      const prescanAnswers = (loadedState._prescanAnswers
        ?? (loadedState.answers as Record<string, unknown>)?.[FormType.PRE_SCAN]) as Record<string, unknown> | undefined
      if (prescanAnswers && Object.keys(prescanAnswers).length > 0) {
        const preScanSchema = schemaStore.getSchema(FormType.PRE_SCAN)
        if (preScanSchema && !taskStore.isInitialized[FormType.PRE_SCAN]) {
          const prevNamespace = taskStore.activeNamespace
          taskStore.setActiveNamespace(FormType.PRE_SCAN)
          answerStore.setActiveNamespace(FormType.PRE_SCAN)
          taskStore.init(preScanSchema.tasks)
          answerStore.answers[FormType.PRE_SCAN] = prescanAnswers as any
          taskStore.setActiveNamespace(prevNamespace)
          answerStore.setActiveNamespace(prevNamespace)
        }
      }
    }
    // Load comments and sync state
    await collaborationStore.load(props.assessmentId)
    // Now that knownVersion is populated, it's safe to enable the remote-change watcher
    syncReady.value = true
    collaborationStore.startPolling()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  collaborationStore.reset()
})

const namespace = computed(() =>
  assessment.value ? assessmentTypeMap[assessment.value.assessmentType] || FormType.DPIA : FormType.DPIA,
)

const assessmentTypeLabel = computed(() =>
  assessment.value?.assessmentType === 'dpia' ? 'DPIA' : 'Pre-scan DPIA'
)

const displayName = computed(() => {
  if (!assessment.value) return ''
  const name = assessment.value.name
  const label = assessmentTypeLabel.value
  // If name already starts with the type label, show as-is
  if (name.startsWith(label)) return name
  return `${label}: ${name}`
})

// Name editing
// Extract the custom part of the name (without type prefix)
const customNamePart = computed(() => {
  if (!assessment.value) return ''
  const name = assessment.value.name
  const label = assessmentTypeLabel.value
  // Strip the type prefix if present
  if (name.startsWith(label)) {
    const rest = name.slice(label.length).replace(/^[\s:]+/, '')
    return rest
  }
  return name
})

const startEditName = async () => {
  if (!canEdit.value) return
  editName.value = customNamePart.value
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
  // Build full name: type label + optional custom part
  const newName = trimmed ? `${assessmentTypeLabel.value}: ${trimmed}` : assessmentTypeLabel.value
  if (newName === assessment.value!.name) {
    editingName.value = false
    return
  }
  const updated = await assessmentsApi.rename(props.assessmentId, newName)
  assessment.value = { ...assessment.value!, ...updated }
  editingName.value = false
}

// Kebab menu actions
const toggleMenu = () => {
  menuOpen.value = !menuOpen.value
}

const closeMenu = () => {
  menuOpen.value = false
}

const handleVersionHistory = () => {
  menuOpen.value = false
  router.push(`/assessment/${props.assessmentId}/versies`)
}

const handleDownloadPdf = async () => {
  menuOpen.value = false
  await exportToPdf(taskStore, answerStore, calculationStore)
}

const handleDownloadJson = async () => {
  menuOpen.value = false
  await exportToJson(taskStore, answerStore)
}

const handleDownloadMarkdown = async () => {
  menuOpen.value = false
  await exportToMarkdown(taskStore, answerStore)
}

const isOwner = computed(() => assessment.value?.role === 'owner')

const openDeleteModal = () => {
  menuOpen.value = false
  deleteModalOpen.value = true
}

const confirmDelete = async () => {
  if (!assessment.value) return
  await assessmentsApi.delete(props.assessmentId)
  deleteModalOpen.value = false
  router.push(`/project/${assessment.value.projectId}`)
}
</script>

<template>
  <div class="assessment-editor">
  <div v-if="loading" class="rvo-max-width-layout rvo-max-width-layout--md">
    <p>Assessment laden...</p>
  </div>

  <div v-else-if="error" class="rvo-max-width-layout rvo-max-width-layout--md" role="alert">
    <h2 class="utrecht-heading-2">Foutmelding</h2>
    <p>{{ error }}</p>
    <button class="utrecht-button utrecht-button--rvo-tertiary-action utrecht-button--rvo-xs utrecht-button--icon-gap" @click="assessment ? router.push(`/project/${assessment.projectId}`) : router.push('/projecten')">
      <IconArrowLeft :size="16" /> Terug naar project
    </button>
  </div>

  <template v-else-if="assessment">
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--md">
      <!-- Row 1: Back + user/logout -->
      <div class="form-header">
        <AppHeader backLabel="Terug naar project" :backRoute="`/project/${assessment.projectId}`" />
      </div>

      <!-- Row 2: Form name + versiegeschiedenis + download -->
      <div class="form-header form-subheader">
        <div class="form-subheader__left">
          <h1
            v-if="!editingName"
            class="utrecht-heading-1 rvo-heading--no-margins form-name"
            :class="{ 'form-name--editable': canEdit }"
            :role="canEdit ? 'button' : undefined"
            :tabindex="canEdit ? 0 : undefined"
            :aria-label="canEdit ? 'Klik om naam te bewerken' : undefined"
            @click="startEditName"
            @keydown.enter="startEditName"
          >{{ displayName }}</h1>
          <div v-else class="form-name-edit">
            <span class="form-name-prefix">{{ assessmentTypeLabel }}:</span>
            <input
              ref="nameInput"
              v-model="editName"
              class="utrecht-textbox utrecht-textbox--html-input form-name-input"
              aria-label="Naam"
              @keydown.enter="saveName"
              @keydown.escape="cancelName"
            />
            <button class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-xs" @click="saveName">Opslaan</button>
            <button class="utrecht-button utrecht-button--rvo-tertiary-action utrecht-button--rvo-xs" @click="cancelName">Annuleer</button>
          </div>
        </div>
        <div class="form-subheader__right">
          <CommentBadge :open="commentPanelOpen" @toggle="toggleCommentPanel" />
          <div class="kebab-menu" @focusout="closeMenu">
            <button
              class="kebab-menu__trigger"
              aria-haspopup="true"
              :aria-expanded="menuOpen"
              aria-label="Acties"
              @click="toggleMenu"
            >
              <IconDotsVertical :size="20" />
            </button>
            <div v-if="menuOpen" class="kebab-menu__dropdown" role="menu">
              <button class="kebab-menu__item" role="menuitem" @mousedown="handleVersionHistory">Versiegeschiedenis</button>
              <div class="kebab-menu__divider"></div>
              <button class="kebab-menu__item" role="menuitem" @mousedown="handleDownloadPdf">Download als PDF</button>
              <button class="kebab-menu__item" role="menuitem" @mousedown="handleDownloadJson">Download als JSON</button>
              <button class="kebab-menu__item" role="menuitem" @mousedown="handleDownloadMarkdown">Download als Markdown</button>
              <template v-if="isOwner">
                <div class="kebab-menu__divider"></div>
                <button class="kebab-menu__item kebab-menu__item--danger" role="menuitem" @mousedown="openDeleteModal">Assessment verwijderen</button>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div v-if="assessment.role === 'viewer'" class="rvo-alert rvo-alert--info rvo-alert--padding-sm rvo-margin-block-end--md" role="status">
        Je hebt alleen leesrechten op deze assessment.
      </div>
      <div v-else-if="assessment.role === 'commenter'" class="rvo-alert rvo-alert--info rvo-alert--padding-sm rvo-margin-block-end--md" role="status">
        Je kunt opmerkingen plaatsen maar niet het formulier bewerken.
      </div>

    </div>

    <div class="assessment-editor__content" :class="{ 'assessment-editor__content--panel-open': commentPanelOpen }">
      <div ref="formContainerRef" :inert="isReadonly || undefined" class="assessment-editor__form" :class="{ 'form-readonly': isReadonly }">
        <Form
          :navigation="navigationFunctions"
          :namespace="namespace"
          :validData="schemaStore.getSchema(namespace)"
          :showBanner="false"
          :showNavHeader="false"
          :showFileActions="false"
          :autoStart="true"
        />
      </div>

      <CommentPanel
        v-if="commentPanelOpen"
        :role="assessment.role || 'viewer'"
        :activeFieldId="activeCommentFieldId"
        :formContainerRef="formContainerRef"
        @close="commentPanelOpen = false; activeCommentFieldId = null"
        @deactivate-field="activeCommentFieldId = null"
      />
    </div>
  </template>

  <!-- Conflict resolution modal -->
  <ConflictResolutionDialog
    :active="conflictState.active"
    :fields="conflictState.fields"
    @resolve="handleConflictResolve"
  />

  <!-- Delete confirmation modal -->
  <dialog ref="deleteDialogRef" class="confirm-dialog" @close="deleteModalOpen = false; deleteConfirmInput = ''">
    <div class="confirm-dialog__content">
      <h2 class="utrecht-heading-2">Weet je zeker dat je deze assessment wilt verwijderen?</h2>
      <p>De assessment <strong>{{ displayName }}</strong> wordt permanent verwijderd. Alle ingevulde antwoorden en versiegeschiedenis gaan verloren. Deze actie kan niet ongedaan worden gemaakt.</p>
      <label class="confirm-dialog__label">
        Typ <strong>VERWIJDEREN</strong> om te bevestigen
        <input
          v-model="deleteConfirmInput"
          class="utrecht-textbox utrecht-textbox--html-input confirm-dialog__input"
        />
      </label>
      <div class="confirm-dialog__actions">
        <button
          class="utrecht-button utrecht-button--rvo-md confirm-dialog__delete"
          :class="deleteConfirmInput === 'VERWIJDEREN' ? 'utrecht-button--primary-action' : 'confirm-dialog__delete--disabled'"
          :disabled="deleteConfirmInput !== 'VERWIJDEREN'"
          @click="confirmDelete"
        >
          Assessment verwijderen
        </button>
        <button class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-md" @click="deleteModalOpen = false; deleteConfirmInput = ''">
          Annuleer
        </button>
      </div>
    </div>
  </dialog>

  <!-- Sync toast -->
  <Transition name="sync-toast">
    <div v-if="syncToast" class="sync-toast rvo-alert--padding-sm" role="status">
      <span>{{ syncToast.message }}</span>
      <button v-if="syncToast.action" class="sync-toast__action" @click="syncToast.action">Bijwerken</button>
    </div>
  </Transition>
  </div>
</template>
