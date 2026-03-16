<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { assessments as assessmentsApi, type AssessmentVersion, type VersionEdit } from '../api'
import { useTaskStore, useAnswerStore, useSchemaStore, FormType, getPlainTextWithoutDefinitions } from '@overheid-assessment/core'
import { IconDotsVertical } from '@tabler/icons-vue'
import AppHeader from '../components/AppHeader.vue'

const props = defineProps<{
  assessmentId: string
}>()

const router = useRouter()
const schemaStore = useSchemaStore()
const taskStore = useTaskStore()
const answerStore = useAnswerStore()

// Reset stores on unmount so the assessment editor starts with a clean slate
onUnmounted(() => {
  taskStore.reset()
  answerStore.reset()
})

const versions = ref<AssessmentVersion[]>([])
const role = ref<string | null>(null)
const projectId = ref<string | null>(null)
const loading = ref(true)
const canEdit = computed(() => role.value === 'owner' || role.value === 'editor')
const canRestore = computed(() => role.value === 'owner')

// Expandable diff state
const expandedVersion = ref<number | null>(null)
const diffLoading = ref(false)
const diffFields = ref<Array<{ fieldId: string; label: string; oldValue: string; newValue: string; rawOldValue?: unknown; oldTimestamp?: string; originVersion?: number; canRestore: boolean }>>([])

// Description modal
const descDialogRef = ref<HTMLDialogElement | null>(null)
const descTextarea = ref<HTMLTextAreaElement | null>(null)
const descModalOpen = ref(false)
const descModalVersion = ref<number | null>(null)
const descModalText = ref('')

// Kebab menu
const openMenuVersion = ref<number | null>(null)

// Field-level kebab menu and restore
const openMenuField = ref<string | null>(null)
const fieldRestoreDialogRef = ref<HTMLDialogElement | null>(null)
const fieldRestoreModalOpen = ref(false)
const fieldRestoreTarget = ref<{ fieldId: string; label: string; rawOldValue?: unknown; originVersion?: number } | null>(null)

function openFieldRestoreModal(field: { fieldId: string; label: string; rawOldValue?: unknown; originVersion?: number }) {
  openMenuField.value = null
  fieldRestoreTarget.value = field
  fieldRestoreModalOpen.value = true
}

async function handleFieldRestore() {
  const field = fieldRestoreTarget.value
  const version = expandedVersion.value
  if (!field || !version) return

  const dotIndex = field.fieldId.indexOf('.')
  const ns = field.fieldId.substring(0, dotIndex)
  const key = field.fieldId.substring(dotIndex + 1)

  // Fetch the current (latest) state from the API so we only modify the one field
  const assessment = await assessmentsApi.get(props.assessmentId)
  const currentState = JSON.parse(JSON.stringify(assessment.state || {}))

  if (key.startsWith('completed.')) {
    const taskId = key.substring('completed.'.length)
    // Ensure path exists
    if (!currentState.taskState) currentState.taskState = {}
    if (!currentState.taskState[ns]) currentState.taskState[ns] = { completedRootTaskIds: [] }
    if (!Array.isArray(currentState.taskState[ns].completedRootTaskIds)) {
      currentState.taskState[ns].completedRootTaskIds = []
    }
    const completedIds: string[] = currentState.taskState[ns].completedRootTaskIds
    if (field.rawOldValue === true) {
      if (!completedIds.includes(taskId)) completedIds.push(taskId)
    } else {
      const idx = completedIds.indexOf(taskId)
      if (idx !== -1) completedIds.splice(idx, 1)
    }
  } else {
    if (!currentState.answers) currentState.answers = {}
    if (!currentState.answers[ns]) currentState.answers[ns] = {}
    const rawVal = field.rawOldValue as { value?: unknown; timestamp?: string } | null | undefined
    if (rawVal && typeof rawVal === 'object' && 'value' in rawVal) {
      currentState.answers[ns][key] = { value: rawVal.value, timestamp: new Date().toISOString() }
    } else {
      delete currentState.answers[ns][key]
    }
  }

  currentState.metadata = { ...currentState.metadata, savedAt: new Date().toISOString() }

  const originVer = field.originVersion ?? (version! - 1)
  const restoreDesc = key.startsWith('completed.')
    ? `Status uit versie ${originVer} hersteld`
    : `Antwoord uit versie ${originVer} hersteld`
  await assessmentsApi.update(props.assessmentId, currentState, { changeDescription: restoreDesc, newVersion: true, expectedVersion: assessment.currentVersion })

  // Refresh version list
  versions.value = await assessmentsApi.versions(props.assessmentId)

  fieldRestoreModalOpen.value = false
  fieldRestoreTarget.value = null
}

// Restore modal
const restoreDialogRef = ref<HTMLDialogElement | null>(null)
const restoreModalOpen = ref(false)
const restoreModalVersion = ref<number | null>(null)
const restoreConfirmText = ref('')
const restoreConfirmWord = 'HERSTELLEN'

watch(descModalOpen, (open) => {
  if (open) {
    descDialogRef.value?.showModal()
  } else {
    descDialogRef.value?.close()
  }
})

watch(restoreModalOpen, (open) => {
  if (open) {
    restoreDialogRef.value?.showModal()
  } else {
    restoreDialogRef.value?.close()
  }
})

watch(fieldRestoreModalOpen, (open) => {
  if (open) {
    fieldRestoreDialogRef.value?.showModal()
  } else {
    fieldRestoreDialogRef.value?.close()
  }
})

onMounted(async () => {
  // Load schemas so task labels can be resolved in diffs
  if (!schemaStore.isInitialized) {
    const [dpiaModule, preScanModule] = await Promise.all([
      import('../../../../sources/generated/DPIA.json'),
      import('../../../../sources/generated/PreScanDPIA.json'),
    ])
    schemaStore.init({ dpia: dpiaModule.default, preScan: preScanModule.default })
  }
  for (const ns of [FormType.DPIA, FormType.PRE_SCAN]) {
    if (!taskStore.isInitialized[ns]) {
      const schema = schemaStore.getSchema(ns)
      if (schema) {
        taskStore.setActiveNamespace(ns)
        taskStore.init(schema.tasks)
      }
    }
  }

  const [assessment, v] = await Promise.all([
    assessmentsApi.get(props.assessmentId),
    assessmentsApi.versions(props.assessmentId),
  ])
  role.value = (assessment as any).role || null
  projectId.value = assessment.projectId
  versions.value = v
  loading.value = false
})

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// Description modal
function openDescModal(version: number, current: string | null) {
  descModalVersion.value = version
  descModalText.value = current || ''
  descModalOpen.value = true
  nextTick(() => autoResize())
}

function autoResize() {
  const el = descTextarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

async function saveDescription() {
  if (descModalVersion.value === null) return
  await assessmentsApi.updateVersionDescription(props.assessmentId, descModalVersion.value, descModalText.value)
  const v = versions.value.find((v) => v.version === descModalVersion.value)
  if (v) v.changeDescription = descModalText.value || null
  descModalOpen.value = false
}

// Restore modal
function openRestoreModal(version: number) {
  restoreModalVersion.value = version
  restoreConfirmText.value = ''
  restoreModalOpen.value = true
}

const restoreConfirmed = computed(() =>
  restoreConfirmText.value.trim() === restoreConfirmWord,
)

async function handleRestore() {
  if (!restoreConfirmed.value || restoreModalVersion.value === null) return
  const [versionData, currentAssessment] = await Promise.all([
    assessmentsApi.version(props.assessmentId, restoreModalVersion.value, { includeState: true }),
    assessmentsApi.get(props.assessmentId),
  ])

  const restoredState = (versionData.state || {}) as Record<string, unknown>
  const currentState = (currentAssessment.state || {}) as Record<string, unknown>

  // rebuildState() reconstructs answers + taskState from edits, but metadata
  // (activeNamespace, urn) is not tracked in edits. Carry over from current state.
  if (currentState.metadata) {
    restoredState.metadata = currentState.metadata
  }
  if (currentState.$schema && !restoredState.$schema) {
    restoredState.$schema = currentState.$schema
  }

  // Verify the restored state has usable content
  const hasAnswers = restoredState.answers && Object.keys(restoredState.answers as object).length > 0
  const hasTaskState = restoredState.taskState && Object.keys(restoredState.taskState as object).length > 0
  if (!hasAnswers && !hasTaskState) {
    alert('Deze versie bevat geen herstelbare gegevens.')
    return
  }

  await assessmentsApi.update(
    props.assessmentId,
    restoredState,
    { changeDescription: `Hersteld naar versie ${restoreModalVersion.value}`, newVersion: true, expectedVersion: currentAssessment.currentVersion },
  )
  restoreModalOpen.value = false
  router.push(`/assessment/${props.assessmentId}`)
}

// Field label lookup
const namespaceLabels: Record<string, string> = {
  dpia: 'DPIA',
  prescan: 'Pre-scan DPIA',
}

function stripInstanceSuffix(taskId: string): string {
  const underscoreIndex = taskId.indexOf('_')
  return underscoreIndex === -1 ? taskId : taskId.substring(0, underscoreIndex)
}

function getFieldLabel(fieldId: string): string {
  const dotIndex = fieldId.indexOf('.')
  if (dotIndex === -1) return fieldId

  const ns = fieldId.substring(0, dotIndex)
  const taskId = stripInstanceSuffix(fieldId.substring(dotIndex + 1))

  const formType = ns === 'dpia' ? FormType.DPIA : FormType.PRE_SCAN
  const task = taskStore.getTaskByIdFromNamespace(formType, taskId)

  if (task?.task) {
    const plain = getPlainTextWithoutDefinitions(task.task)
    const label = plain.length > 80 ? plain.substring(0, 77) + '...' : plain
    return task.is_official_id ? `${task.id}. ${label}` : label
  }

  return fieldId
}

function getFieldOptions(fieldId: string): Record<string, string> | null {
  const dotIndex = fieldId.indexOf('.')
  if (dotIndex === -1) return null

  const ns = fieldId.substring(0, dotIndex)
  const taskId = stripInstanceSuffix(fieldId.substring(dotIndex + 1))

  const formType = ns === 'dpia' ? FormType.DPIA : FormType.PRE_SCAN
  const task = taskStore.getTaskByIdFromNamespace(formType, taskId)

  if (task?.options && task.options.length > 0) {
    const map: Record<string, string> = {}
    for (const opt of task.options) {
      map[String(opt.value)] = opt.label || String(opt.value)
    }
    return map
  }
  return null
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

function formatTimestamp(val: string): string {
  const date = new Date(val)
  if (isNaN(date.getTime())) return val
  return date.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function stripHtml(str: string): string {
  if (!str.includes('<')) return str
  return str.replace(/<[^>]*>/g, '')
}

function formatValue(val: unknown, options: Record<string, string> | null): string {
  if (val === null || val === undefined) return 'Leeg'
  if (typeof val === 'boolean') return val ? 'Ja' : 'Nee'

  if (typeof val === 'string') {
    if (!val) return 'Leeg'
    if (val === 'true') return 'Ja'
    if (val === 'false') return 'Nee'
    // Try to parse JSON arrays stored as strings
    if (val.startsWith('[')) {
      try {
        const parsed = JSON.parse(val)
        if (Array.isArray(parsed)) return formatValue(parsed, options)
      } catch { /* not JSON, treat as plain string */ }
    }
    if (options && options[val]) return escapeHtml(stripHtml(options[val]))
    if (isoDatePattern.test(val)) return formatTimestamp(val)
    return escapeHtml(stripHtml(val))
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return 'Geen selectie'
    const items = options
      ? val.map((v) => stripHtml(options[String(v)] || String(v)))
      : val.map((v) => stripHtml(String(v)))
    return '<ul style="margin: 0; padding-left: 1.25rem;">' + items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') + '</ul>'
  }

  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    const parts: string[] = []

    // Show main value without label
    if ('value' in obj && obj.value !== null && obj.value !== undefined && obj.value !== '') {
      const v = obj.value
      if (Array.isArray(v)) {
        if (v.length === 0) {
          parts.push('Geen selectie')
        } else {
          const items = options
            ? v.map((item) => stripHtml(options[String(item)] || String(item)))
            : v.map((item) => stripHtml(String(item)))
          parts.push('<ul style="margin: 0; padding-left: 1.25rem;">' + items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') + '</ul>')
        }
      } else {
        const formatted = typeof v === 'boolean' ? (v ? 'Ja' : 'Nee')
          : v === 'true' ? 'Ja' : v === 'false' ? 'Nee'
          : typeof v === 'string' ? escapeHtml(stripHtml(v)) : escapeHtml(JSON.stringify(v))
        parts.push(formatted)
      }
    }

    // Skip timestamp — rendered separately in template

    // Any remaining keys
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'value' || k === 'timestamp' || k === 'lastEditedAt' || v === null || v === undefined || v === '') continue
      const formatted = typeof v === 'string' && isoDatePattern.test(v)
        ? formatTimestamp(v)
        : typeof v === 'boolean' ? (v ? 'Ja' : 'Nee')
        : typeof v === 'string' ? escapeHtml(v) : escapeHtml(JSON.stringify(v))
      parts.push(`${escapeHtml(k)}: ${formatted}`)
    }

    if (parts.length === 0) return 'Leeg'
    return parts.join('\n')
  }

  return escapeHtml(String(val))
}

/**
 * Parse a URN-based field ID into namespace and key for label lookup.
 * "urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0" → { namespace: "dpia", key: "2.1.3[0]" }
 * Falls back to dot-format parsing: "dpia.2.1" → { namespace: "dpia", key: "2.1" }
 */
function parseFieldId(fieldId: string): { namespace: string; key: string } | null {
  if (fieldId.startsWith('urn:')) {
    const match = fieldId.match(/^urn:nl:(\w+):[^?]+\?=task_id=([^&]+)(?:&task_index=(\d+))?$/)
    if (!match) return null
    const namespace = match[1] === 'prescan_dpia' ? 'prescan' : match[1]
    const taskId = match[2]
    const index = match[3]
    const key = index !== undefined ? `${taskId}[${index}]` : taskId
    return { namespace, key }
  }
  const dotIndex = fieldId.indexOf('.')
  if (dotIndex === -1) return null
  return { namespace: fieldId.substring(0, dotIndex), key: fieldId.substring(dotIndex + 1) }
}

/**
 * Convert a fieldId (URN or dot-format) to dot-format for label lookup.
 */
function toDotFieldId(fieldId: string): string {
  const parsed = parseFieldId(fieldId)
  if (!parsed) return fieldId
  return `${parsed.namespace}.${parsed.key}`
}

// Diff — fetch edits from the API instead of diffing full states
async function toggleDiff(version: number) {
  if (expandedVersion.value === version) {
    expandedVersion.value = null
    return
  }

  expandedVersion.value = version
  diffFields.value = []

  if (version <= 1) {
    return
  }

  diffLoading.value = true
  try {
    const edits = await assessmentsApi.versionEdits(props.assessmentId, version)
    diffFields.value = mapEditsToDiffFields(edits, version)
  } catch {
    diffFields.value = []
  } finally {
    diffLoading.value = false
  }
}

function mapEditsToDiffFields(
  edits: VersionEdit[],
  version: number,
): Array<{ fieldId: string; label: string; oldValue: string; newValue: string; rawOldValue?: unknown; oldTimestamp?: string; originVersion?: number; canRestore: boolean }> {
  // During consolidation, multiple edits for the same field can exist within one version.
  // Collapse them to show only the net change: first oldValue → last newValue.
  // If the net result is no change, skip the field entirely.
  const relevant = edits.filter(edit =>
    edit.editType !== 'initial_state' &&
    edit.editType !== 'task_instance_add' &&
    edit.editType !== 'task_instance_remove',
  )

  const collapsed = new Map<string, { editType: string; fieldId: string; oldValue: unknown; newValue: unknown }>()
  for (const edit of relevant) {
    const dotId = toDotFieldId(edit.fieldId)
    const existing = collapsed.get(dotId)
    if (existing) {
      // Keep original oldValue, update newValue to latest
      existing.newValue = edit.newValue
    } else {
      collapsed.set(dotId, {
        editType: edit.editType,
        fieldId: edit.fieldId,
        oldValue: edit.oldValue,
        newValue: edit.newValue,
      })
    }
  }

  const result: Array<{ fieldId: string; label: string; oldValue: string; newValue: string; rawOldValue?: unknown; oldTimestamp?: string; originVersion?: number; canRestore: boolean }> = []

  for (const [dotId, edit] of collapsed) {
    // Skip if net result is no change
    if (JSON.stringify(edit.oldValue) === JSON.stringify(edit.newValue)) continue

    const options = getFieldOptions(dotId)

    if (edit.editType === 'section_complete') {
      const parsed = parseFieldId(edit.fieldId)
      const taskId = parsed ? (parsed.key.startsWith('completed.') ? parsed.key.substring('completed.'.length) : parsed.key) : edit.fieldId
      const formType = parsed?.namespace === 'dpia' ? FormType.DPIA : FormType.PRE_SCAN
      const task = taskStore.getTaskByIdFromNamespace(formType, taskId)
      const name = task?.task ? getPlainTextWithoutDefinitions(task.task) : taskId
      result.push({
        fieldId: dotId,
        label: `Status sectie ${taskId} "${name}"`,
        oldValue: edit.oldValue === true ? 'Voltooid' : 'Niet voltooid',
        newValue: edit.newValue === true ? 'Voltooid' : 'Niet voltooid',
        rawOldValue: edit.oldValue,
        originVersion: version - 1,
        canRestore: true,
      })
      continue
    }

    // answer_change
    result.push({
      fieldId: dotId,
      label: getFieldLabel(dotId),
      oldValue: formatValue(edit.oldValue, options),
      newValue: formatValue(edit.newValue, options),
      rawOldValue: edit.oldValue,
      originVersion: version - 1,
      canRestore: true,
    })
  }

  return result
}
</script>

<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <AppHeader backLabel="Terug naar assessment" :backRoute="`/assessment/${assessmentId}`" />

    <h1 class="utrecht-heading-1">Versiegeschiedenis</h1>

    <div v-if="loading"><p>Laden...</p></div>

    <template v-else>
      <div v-if="versions.length === 0">
        <p>Geen versies gevonden.</p>
      </div>

      <div v-else class="version-list rvo-margin-block-end--lg">
        <div class="version-row version-row--header">
          <span class="version-col--toggle"></span>
          <span class="version-col--nr">Versie</span>
          <span class="version-col--date">Opgeslagen op</span>
          <span class="version-col--who">Door</span>
          <span class="version-col--desc">Beschrijving</span>
          <span v-if="canEdit" class="version-col--action"></span>
        </div>

        <template v-for="version in versions" :key="version.id">
          <div class="version-row" :class="{ 'version-row--expanded': expandedVersion === version.version }">
            <span class="version-col--toggle">
              <button
                v-if="version.version > 1"
                class="toggle-btn"
                :aria-label="expandedVersion === version.version ? 'Verschillen inklappen' : 'Verschillen tonen'"
                :aria-expanded="expandedVersion === version.version"
                @click="toggleDiff(version.version)"
              >
                <span class="toggle-icon" :class="{ 'toggle-icon--open': expandedVersion === version.version }">&gt;</span>
              </button>
            </span>
            <span class="version-col--nr">{{ version.version }}</span>
            <span class="version-col--date">{{ formatDate(version.savedAt) }}</span>
            <span class="version-col--who">{{ version.savedByName }}</span>
            <span class="version-col--desc">
              <button
                v-if="canEdit && version.changeDescription"
                class="desc-edit-btn"
                @click="openDescModal(version.version, version.changeDescription)"
              >
                {{ version.changeDescription.split('\n')[0] }}<span v-if="version.changeDescription.includes('\n')">...</span>
                <span class="sr-only">— beschrijving bewerken</span>
              </button>
              <span v-else-if="version.changeDescription">{{ version.changeDescription.split('\n')[0] }}<span v-if="version.changeDescription.includes('\n')">...</span></span>
              <span v-else-if="!version.changeDescription"></span>
            </span>
            <span v-if="canEdit" class="version-col--action">
              <div class="kebab-menu" @focusout="openMenuVersion = null">
                <button
                  class="kebab-menu__trigger"
                  aria-haspopup="true"
                  :aria-expanded="openMenuVersion === version.version"
                  aria-label="Acties"
                  @click="openMenuVersion = openMenuVersion === version.version ? null : version.version"
                >
                  <IconDotsVertical :size="18" />
                </button>
                <div v-if="openMenuVersion === version.version" class="kebab-menu__dropdown" role="menu">
                  <button class="kebab-menu__item" role="menuitem" @mousedown="openMenuVersion = null; openDescModal(version.version, version.changeDescription)">
                    {{ version.changeDescription ? 'Beschrijving bewerken' : 'Beschrijving toevoegen' }}
                  </button>
                  <template v-if="canRestore">
                    <div class="kebab-menu__divider"></div>
                    <button class="kebab-menu__item kebab-menu__item--danger" role="menuitem" @mousedown="openMenuVersion = null; openRestoreModal(version.version)">
                      Herstellen naar deze versie
                    </button>
                  </template>
                </div>
              </div>
            </span>
          </div>

          <!-- Diff panel -->
          <div v-if="expandedVersion === version.version" class="diff-panel">
            <div v-if="version.changeDescription && version.changeDescription.includes('\n')" class="diff-description">
              <strong>Volledige beschrijving</strong>
              <p>{{ version.changeDescription }}</p>
            </div>
            <div v-if="diffLoading" class="diff-loading">Verschillen laden...</div>
            <div v-else-if="version.version <= 1" class="diff-empty">Eerste versie — geen vorige versie om mee te vergelijken.</div>
            <div v-else-if="diffFields.length === 0" class="diff-empty">Geen inhoudelijke wijzigingen gevonden.</div>
            <table v-else class="diff-table">
              <colgroup>
                <col class="diff-col--field" />
                <col class="diff-col--old" />
                <col class="diff-col--new" />
              </colgroup>
              <thead>
                <tr>
                  <th>Vraag</th>
                  <th>Was</th>
                  <th>Wordt</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in diffFields" :key="field.fieldId" class="diff-row">
                  <td class="diff-field">{{ field.label }}</td>
                  <td class="diff-old diff-value">
                    <div class="diff-old-inner">
                      <span v-html="field.oldValue.replace(/\n/g, '<br>')"></span>
                      <div v-if="field.canRestore" class="diff-old-footer">
                        <em class="diff-timestamp">
                          <template v-if="field.oldTimestamp">{{ field.oldTimestamp }} · </template>versie {{ field.originVersion ?? (expandedVersion! - 1) }}
                        </em>
                        <div v-if="canRestore" class="kebab-menu diff-kebab" @focusout="openMenuField = null">
                          <button
                            class="kebab-menu__trigger"
                            aria-haspopup="true"
                            :aria-expanded="openMenuField === field.fieldId"
                            aria-label="Acties"
                            @click="openMenuField = openMenuField === field.fieldId ? null : field.fieldId"
                          >
                            <IconDotsVertical :size="16" />
                          </button>
                          <div v-if="openMenuField === field.fieldId" class="kebab-menu__dropdown" role="menu">
                            <button class="kebab-menu__item" role="menuitem" @mousedown="openFieldRestoreModal(field)">
                              Herstel dit antwoord
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="diff-new diff-value" v-html="field.newValue.replace(/\n/g, '<br>')"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </template>

    <!-- Description modal -->
    <dialog ref="descDialogRef" class="confirm-dialog" @close="descModalOpen = false">
      <div class="confirm-dialog__content">
        <h2 class="utrecht-heading-2">Beschrijving versie {{ descModalVersion }} bewerken</h2>
        <label class="confirm-dialog__label" for="desc-input">Beschrijving</label>
        <textarea
          id="desc-input"
          ref="descTextarea"
          v-model="descModalText"
          class="utrecht-textarea desc-textarea"
          rows="1"
          @input="autoResize"
        ></textarea>
        <div class="confirm-dialog__actions">
          <button
            class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md"
            @click="saveDescription"
          >Opslaan</button>
          <button
            class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-md"
            @click="descModalOpen = false"
          >Annuleren</button>
        </div>
      </div>
    </dialog>

    <!-- Restore confirmation modal -->
    <dialog ref="restoreDialogRef" class="confirm-dialog" @close="restoreModalOpen = false; restoreConfirmText = ''">
      <div class="confirm-dialog__content">
        <h2 class="utrecht-heading-2">Versie herstellen</h2>
        <p>
          Dit overschrijft de huidige versie van het assessment met de gegevens uit
          <strong>versie {{ restoreModalVersion }}</strong>.
        </p>
        <label class="confirm-dialog__label">
          Typ <strong>{{ restoreConfirmWord }}</strong> om te bevestigen
          <input
            v-model="restoreConfirmText"
            class="utrecht-textbox utrecht-textbox--html-input confirm-dialog__input"
            :placeholder="restoreConfirmWord"
            @keyup.enter="restoreConfirmed && handleRestore()"
          />
        </label>
        <div class="confirm-dialog__actions">
          <button
            class="utrecht-button utrecht-button--rvo-md confirm-dialog__delete"
            :class="restoreConfirmed ? 'utrecht-button--primary-action' : 'confirm-dialog__delete--disabled'"
            :disabled="!restoreConfirmed"
            @click="handleRestore"
          >Herstellen</button>
          <button
            class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-md"
            @click="restoreModalOpen = false; restoreConfirmText = ''"
          >Annuleren</button>
        </div>
      </div>
    </dialog>

    <!-- Field restore confirmation modal -->
    <dialog ref="fieldRestoreDialogRef" class="confirm-dialog" @close="fieldRestoreModalOpen = false; fieldRestoreTarget = null">
      <div class="confirm-dialog__content">
        <h2 class="utrecht-heading-2">Antwoord herstellen</h2>
        <p>
          Weet je zeker dat je <strong>"{{ fieldRestoreTarget?.label }}"</strong>
          wilt herstellen naar de waarde uit versie {{ fieldRestoreTarget?.originVersion ?? (expandedVersion! - 1) }}?
        </p>
        <div class="confirm-dialog__actions">
          <button
            class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md"
            @click="handleFieldRestore"
          >Herstellen</button>
          <button
            class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-md"
            @click="fieldRestoreModalOpen = false"
          >Annuleren</button>
        </div>
      </div>
    </dialog>
  </div>
</template>
