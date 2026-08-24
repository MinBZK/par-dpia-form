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
  sanitizeAnswers,
  type NavigationFunctions,
} from '@overheid-assessment/core'
import { assessments as assessmentsApi, type AssessmentInstance } from '../api'
import { createApiPersistence } from '../ApiPersistence'
import '@nldd/design-system/button'
import '@nldd/design-system/text-field'
import '@nldd/design-system/modal-dialog'
import '@nldd/design-system/banner'
import '@nldd/design-system/spacer'
import '@nldd/design-system/menu'
import '@nldd/design-system/notification'
import KebabMenu from '../components/KebabMenu.vue'
import ConflictResolutionDialog from '../components/ConflictResolutionDialog.vue'
import CommentBadge from '../components/CommentBadge.vue'
import CommentPanel from '../components/CommentPanel.vue'
import { useCollaborationStore } from '../stores/collaboration'
import { useBackLink } from '../composables/useBackLink'
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

// Root task ids that have unresolved comments, so the table of contents can
// flag them. Comment field ids are instance ids ("2.1.3", "2.1.3[0]") or
// section-completion ids ("completed.2"); the root section is the first
// dot-segment.
const commentedRootTaskIds = computed(() => {
  const roots = new Set<string>()
  for (const [fieldId, count] of collaborationStore.unresolvedCountByField) {
    if (count > 0) {
      const base = fieldId.startsWith('completed.') ? fieldId.slice('completed.'.length) : fieldId
      roots.add(base.split('.')[0])
    }
  }
  return [...roots]
})

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

// Sync toast state. A plain notice leaves on the notification's own clock,
// which pauses while it is hovered or focused. A failure describes a state that
// persists, so it stays up until that state clears.
interface SyncToast {
  message: string
  action?: () => void
  actionLabel?: string
  kind?: 'failure'
}
const syncToast = ref<SyncToast | null>(null)

function showSyncToast(message: string, action?: () => void, options: Omit<SyncToast, 'message' | 'action'> = {}) {
  syncToast.value = { message, action, ...options }
}

function dismissSyncToast() {
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
// focus() on the host delegates to the inner input (public NLDD API); select()
// has no host equivalent, so it reaches into the shadow root defensively.
const nameInput = ref<HTMLElement | null>(null)

function onEditNameInput(event: Event) {
  editName.value = (event as CustomEvent).detail?.value ?? (event.target as HTMLInputElement).value
}

// Delete confirmation modal
const deleteModalOpen = ref(false)
const deleteConfirmInput = ref('')

function onDeleteConfirmInput(event: Event) {
  deleteConfirmInput.value = (event as CustomEvent).detail?.value ?? (event.target as HTMLInputElement).value
}

// show/hide are optional: they only exist once the custom element is upgraded
// (not in jsdom unit tests).
type ModalDialogElement = HTMLElement & { show?: () => void; hide?: () => void }
const deleteDialogRef = ref<ModalDialogElement | null>(null)

watch(deleteModalOpen, (open) => {
  if (open) {
    deleteDialogRef.value?.show?.()
  } else {
    deleteDialogRef.value?.hide?.()
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
  prescan: FormType.PRE_SCAN,
  dpia: FormType.DPIA,
  iama: FormType.IAMA,
}

// Navigation: back goes to project detail
const navigationFunctions: NavigationFunctions = {
  goToLanding: () => {
    if (assessment.value) router.push(`/project/${assessment.value.projectId}`)
  },
  goToPreScanDPIA: () => {},
  goToDPIA: () => {},
}

onMounted(async () => {
  try {
    // Reset stores to clear state from any previously opened assessment
    taskStore.reset()
    answerStore.reset()
    calculationStore.reset()

    assessment.value = await assessmentsApi.get(props.assessmentId)
    // The back target is only known once the assessment (and its projectId) loads.
    useBackLink().set({ text: 'Project', to: `/project/${assessment.value.projectId}` })

    if (!schemaStore.isInitialized) {
      const [preScanModule, dpiaModule, iamaModule] = await Promise.all([
        import('../../../../sources/generated/PreScanDPIA.json'),
        import('../../../../sources/generated/DPIA.json'),
        import('../../../../sources/generated/IAMA.json'),
      ])
      schemaStore.init({ preScan: preScanModule.default, dpia: dpiaModule.default, iama: iamaModule.default })
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
          // These bypass applyStateToStores, so they need the same key and
          // image check every other loaded answer gets.
          answerStore.answers[FormType.PRE_SCAN] = sanitizeAnswers(prescanAnswers).answers as any
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

// A failed save and a stalled sync are both states, not events: report them only
// once they persist (the thresholds live in ApiPersistence and the collaboration
// store), and clear the message the moment they resolve. Saving wins, because
// unsaved work outranks missing updates.
watch(
  [
    () => sync.saveFailing.value,
    () => collaborationStore.syncFailing,
    () => collaborationStore.commentActionError,
  ],
  ([saveFailing, syncFailing, commentActionError]) => {
    if (saveFailing) {
      showSyncToast(
        'Geen verbinding met de server. Opslaan lukt even niet, we proberen het opnieuw.',
        () => { sync.retrySaveNow() },
        { actionLabel: 'Opnieuw proberen', kind: 'failure' },
      )
    } else if (commentActionError) {
      // A comment action is something the user just clicked, so it outranks the passive
      // "you may be missing updates" notice below.
      showSyncToast(
        commentActionError.message,
        commentActionError.retryable ? () => { collaborationStore.retryCommentAction() } : undefined,
        { actionLabel: 'Opnieuw proberen', kind: 'failure' },
      )
    } else if (syncFailing) {
      showSyncToast(
        'Geen verbinding met de server. Je ziet mogelijk niet de laatste wijzigingen van anderen.',
        undefined,
        { kind: 'failure' },
      )
    } else if (syncToast.value?.kind === 'failure') {
      dismissSyncToast()
    }
  },
)

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!sync.hasUnsavedChanges.value) return
  event.preventDefault()
  // Some browsers still only honour the legacy returnValue.
  event.returnValue = ''
}
window.addEventListener('beforeunload', handleBeforeUnload)

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  collaborationStore.reset()
})

const namespace = computed(() =>
  assessment.value ? assessmentTypeMap[assessment.value.assessmentType] || FormType.DPIA : FormType.DPIA,
)

const assessmentTypeLabel = computed(() =>
  assessment.value?.assessmentType === 'dpia' ? 'DPIA'
    : assessment.value?.assessmentType === 'iama' ? 'IAMA'
    : 'Pre-scan DPIA'
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
  nameInput.value?.shadowRoot?.querySelector('input')?.select()
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

// Kebab menu actions (the shared KebabMenu closes itself on item activation)
const handleVersionHistory = () => {
  router.push(`/assessment/${props.assessmentId}/versies`)
}

const handleDownloadPdf = async () => {
  await exportToPdf(taskStore, answerStore, calculationStore)
}

const handleDownloadJson = async () => {
  await exportToJson(taskStore, answerStore)
}

const handleDownloadMarkdown = async () => {
  await exportToMarkdown(taskStore, answerStore)
}

const isOwner = computed(() => assessment.value?.role === 'owner')

const openDeleteModal = () => {
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
  <div v-if="loading" class="page-container">
    <p>Assessment laden...</p>
  </div>

  <div v-else-if="error" class="page-container" role="alert">
    <h2>Foutmelding</h2>
    <p>{{ error }}</p>
    <nldd-button
      variant="accent-transparent"
      size="xs"
      start-icon="arrow-left"
      text="Terug naar project"
      @click="assessment ? router.push(`/project/${assessment.projectId}`) : router.push('/projecten')"
    ></nldd-button>
  </div>

  <template v-else-if="assessment">
    <div class="assessment-editor__content" :class="{ 'assessment-editor__content--panel-open': commentPanelOpen }">
      <div ref="formContainerRef" class="assessment-editor__form" :class="{ 'form-readonly': isReadonly }">
        <Form
          :navigation="navigationFunctions"
          :contentInert="isReadonly"
          :namespace="namespace"
          :validData="schemaStore.getSchema(namespace)"
          :showBanner="false"
          :showNavHeader="false"
          :showFileActions="false"
          :autoStart="true"
          :commentedRootTaskIds="commentedRootTaskIds"
        >
          <template #header>
          <!-- Form name + versiegeschiedenis + download -->
          <div class="form-header form-subheader">
            <div class="form-subheader__left">
              <h1
                v-if="!editingName"
                class="form-name"
                :class="{ 'form-name--editable': canEdit }"
                :role="canEdit ? 'button' : undefined"
                :tabindex="canEdit ? 0 : undefined"
                :aria-label="canEdit ? 'Klik om naam te bewerken' : undefined"
                @click="startEditName"
                @keydown.enter="startEditName"
              >{{ displayName }}</h1>
              <div v-else class="form-name-edit">
                <span class="form-name-prefix">{{ assessmentTypeLabel }}:</span>
                <nldd-text-field
                  ref="nameInput"
                  class="form-name-input"
                  accessible-label="Naam"
                  :value="editName"
                  @input="onEditNameInput"
                  @keydown.enter="saveName"
                  @keydown.escape="cancelName"
                ></nldd-text-field>
                <nldd-button variant="primary" size="xs" text="Opslaan" @click="saveName"></nldd-button>
                <nldd-button variant="accent-transparent" size="xs" text="Annuleer" @click="cancelName"></nldd-button>
              </div>
            </div>
            <div class="form-subheader__right">
              <CommentBadge :open="commentPanelOpen" @toggle="toggleCommentPanel" />
              <KebabMenu label="Assessmentacties">
                <nldd-menu-item text="Versiegeschiedenis" @click="handleVersionHistory"></nldd-menu-item>
                <nldd-menu-divider></nldd-menu-divider>
                <nldd-menu-item text="Download als PDF" @click="handleDownloadPdf"></nldd-menu-item>
                <nldd-menu-item text="Download als JSON" @click="handleDownloadJson"></nldd-menu-item>
                <nldd-menu-item text="Download als Markdown" @click="handleDownloadMarkdown"></nldd-menu-item>
                <template v-if="isOwner">
                  <nldd-menu-divider></nldd-menu-divider>
                  <nldd-menu-item text="Assessment verwijderen" destructive @click="openDeleteModal"></nldd-menu-item>
                </template>
              </KebabMenu>
            </div>
          </div>

          <template v-if="assessment.role === 'viewer' || assessment.role === 'commenter'">
            <nldd-banner
              variant="accent"
              :text="assessment.role === 'viewer'
                ? 'Je hebt alleen leesrechten op deze assessment.'
                : 'Je kunt opmerkingen plaatsen maar niet het formulier bewerken.'"
            ></nldd-banner>
            <nldd-spacer size="16"></nldd-spacer>
          </template>

          </template>
        </Form>
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
  <nldd-modal-dialog
    ref="deleteDialogRef"
    variant="alert"
    text="Weet je zeker dat je deze assessment wilt verwijderen?"
    @close="deleteModalOpen = false; deleteConfirmInput = ''"
  >
    <p>De assessment <strong>{{ displayName }}</strong> wordt permanent verwijderd. Alle ingevulde antwoorden en versiegeschiedenis gaan verloren. Deze actie kan niet ongedaan worden gemaakt.</p>
    <p>Typ <strong>VERWIJDEREN</strong> om te bevestigen</p>
    <nldd-text-field
      accessible-label="Typ VERWIJDEREN om te bevestigen"
      :value="deleteConfirmInput"
      @input="onDeleteConfirmInput"
    ></nldd-text-field>

    <!-- The safe way out is the primary action; the destructive action is the
         secondary one (NLDD design guideline). -->
    <nldd-button slot="actions" variant="primary" text="Annuleer"
      @click="deleteModalOpen = false; deleteConfirmInput = ''"></nldd-button>
    <nldd-button slot="actions" variant="destructive" text="Assessment verwijderen"
      :disabled="deleteConfirmInput !== 'VERWIJDEREN' || undefined"
      @click="confirmDelete"></nldd-button>
  </nldd-modal-dialog>

  <!-- Sync toast: the notification places itself in the shared region. A
       failure keeps its own duration of 0, so it stays until the state clears. -->
  <nldd-notification
    v-if="syncToast"
    :variant="syncToast.kind === 'failure' ? 'critical' : 'accent'"
    :duration="syncToast.action || syncToast.kind ? 0 : 3000"
    :text="syncToast.message"
    @dismiss="dismissSyncToast"
  >
    <nldd-button
      v-if="syncToast.action"
      slot="actions"
      size="sm"
      :text="syncToast.actionLabel ?? 'Bijwerken'"
      @click="syncToast.action"
    ></nldd-button>
  </nldd-notification>
  </div>
</template>
