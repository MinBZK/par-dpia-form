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
import '@nldd/design-system/sheet'
import '@nldd/design-system/page'
import '@nldd/design-system/simple-section'
import '@nldd/design-system/text-field'
import '@nldd/design-system/modal-dialog'
import '@nldd/design-system/banner'
import '@nldd/design-system/spacer'
import '@nldd/design-system/menu'
import '@nldd/design-system/toolbar'
import '@nldd/design-system/notification'
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

// nldd-sheet exposes show()/hide(); they exist once the custom element has
// upgraded (not in jsdom), hence the optional calls. Mirroring the state onto
// them rather than mounting and unmounting the sheet keeps its slide-in.
type SheetElement = HTMLElement & { show?: () => void; hide?: () => void }

const commentSheet = ref<SheetElement | null>(null)

watch(commentPanelOpen, async (open) => {
  if (!open) {
    commentSheet.value?.hide?.()
    return
  }
  await nextTick()
  commentSheet.value?.show?.()
})

// The sheet emits close for its own routes out (its dismiss button, Escape
// while focus is inside it). Routing that back through the state keeps the
// button in step, and the watch above then performs no second hide() because
// the sheet is already closed.
const onCommentSheetClose = () => {
  commentPanelOpen.value = false
  activeCommentFieldId.value = null
}

// A modeless sheet is a non-modal dialog, so the browser only routes Escape to
// it while focus is inside. That is the point of modeless — the form stays
// usable — but it means clicking back into a question takes Escape away from
// the panel. Listening on the document gives it back.
const onDocumentKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !commentPanelOpen.value) return
  // Escape belongs to the innermost thing that can use it: cancelling an edit,
  // a reply or a new comment. Those handlers stop the event, so anything still
  // travelling up landed on nothing and closes the panel.
  commentPanelOpen.value = false
  activeCommentFieldId.value = null
}

onMounted(() => document.addEventListener('keydown', onDocumentKeydown))
onUnmounted(() => document.removeEventListener('keydown', onDocumentKeydown))

// The badge shows the count as a badge; a menu item has no room for one, so the
// overflow entry says it in words.
const commentOverflowText = computed(() => {
  const count = collaborationStore.totalUnresolvedCount
  return count > 0 ? `Opmerkingen (${count})` : 'Opmerkingen'
})

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

// Overflow-menu actions (nldd-menu closes itself on item activation)
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
  <nldd-simple-section v-if="loading">
    <p>Assessment laden...</p>
  </nldd-simple-section>

  <nldd-simple-section v-else-if="error"  role="alert">
    <h2>Foutmelding</h2>
    <p>{{ error }}</p>
    <nldd-button
      variant="accent-transparent"
      size="xs"
      start-icon="arrow-left"
      text="Terug naar project"
      @click="assessment ? router.push(`/project/${assessment.projectId}`) : router.push('/projecten')"
    ></nldd-button>
  </nldd-simple-section>

  <template v-else-if="assessment">
    <div ref="formContainerRef" class="assessment-editor__form"
      :class="{ 'form-readonly': isReadonly }">
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
          <template #header="{ tocCollapsed, toggleToc }">
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
                  @keydown.escape.stop="cancelName"
                ></nldd-text-field>
                <nldd-button variant="primary" size="xs" text="Opslaan" @click="saveName"></nldd-button>
                <nldd-button variant="accent-transparent" size="xs" text="Annuleer" @click="cancelName"></nldd-button>
              </div>
            </div>
            <!-- A toolbar, so the buttons shed into the overflow menu once the
                 row runs out of room instead of crowding the title. That menu is
                 the ellipsis button the toolbar draws itself, which is why the
                 assessment actions are plain overflow items here rather than a
                 kebab of their own: two ellipsis menus side by side would be one
                 too many. -->
            <nldd-toolbar class="form-subheader__right" size="sm" label="Assessmentacties">
              <!-- Only while the contents are folded into their sheet is there
                   something to open; with the sidebar in view this would open
                   what is already open. The item is mounted as a whole or not at
                   all, so the toolbar can move it into the overflow menu when the
                   row runs out of room. Lowest priority: first to give up its
                   place in the row. -->
              <nldd-toolbar-item v-if="tocCollapsed" slot="end" priority="1">
                <nldd-button
                  variant="accent-transparent"
                  size="sm"
                  start-icon="bullet-list"
                  text="Stappen"
                  aria-haspopup="dialog"
                  @click="toggleToc"
                ></nldd-button>
                <nldd-menu-item slot="overflow" icon="bullet-list" text="Stappen"
                  @select="toggleToc"></nldd-menu-item>
              </nldd-toolbar-item>
              <nldd-toolbar-item slot="end" priority="2">
                <CommentBadge :open="commentPanelOpen" @toggle="toggleCommentPanel" />
                <nldd-menu-item slot="overflow" icon="comment"
                  :text="commentOverflowText" @select="toggleCommentPanel"></nldd-menu-item>
              </nldd-toolbar-item>

              <nldd-menu-item slot="overflow" text="Versiegeschiedenis" @select="handleVersionHistory"></nldd-menu-item>
              <nldd-menu-divider slot="overflow"></nldd-menu-divider>
              <nldd-menu-item slot="overflow" text="Download als PDF" @select="handleDownloadPdf"></nldd-menu-item>
              <nldd-menu-item slot="overflow" text="Download als JSON" @select="handleDownloadJson"></nldd-menu-item>
              <nldd-menu-item slot="overflow" text="Download als Markdown" @select="handleDownloadMarkdown"></nldd-menu-item>
              <template v-if="isOwner">
                <nldd-menu-divider slot="overflow"></nldd-menu-divider>
                <nldd-menu-item slot="overflow" text="Assessment verwijderen" destructive @select="openDeleteModal"></nldd-menu-item>
              </template>
            </nldd-toolbar>
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

    <!-- A side panel, the way the rest of the family does it: a right-hand
         sheet that slides in over the page. Teleported to the body because a
         sheet must sit at the document root, and modeless so the form stays
         usable with it open — you read a comment and edit the answer beside it.
         The sheet owns Esc and the click outside; @close is the single way the
         state comes back down. -->
    <Teleport to="body">
      <nldd-sheet ref="commentSheet" placement="right" width="480px" modeless
        accessible-label="Opmerkingen" @close="onCommentSheetClose">
        <!-- sticky-header keeps the title bar in place while the list scrolls. -->
        <nldd-page sticky-header>
          <CommentPanel
            v-if="commentPanelOpen"
            :role="assessment.role || 'viewer'"
            :activeFieldId="activeCommentFieldId"
            :formContainerRef="formContainerRef"
            @close="commentPanelOpen = false"
            @deactivate-field="activeCommentFieldId = null"
          />
        </nldd-page>
      </nldd-sheet>
    </Teleport>
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
