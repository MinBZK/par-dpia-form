<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { assessments as assessmentsApi, type AssessmentVersion } from '../api'
import { useTaskStore, useAnswerStore, useSchemaStore, FormType, getPlainTextWithoutDefinitions } from '@par-assessment/core'
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

  // Fetch the current (latest) snapshot from the API so we only modify the one field
  const assessment = await assessmentsApi.get(props.assessmentId)
  const snapshot = JSON.parse(JSON.stringify(assessment.snapshot || {}))

  if (key.startsWith('completed.')) {
    const taskId = key.substring('completed.'.length)
    // Ensure path exists
    if (!snapshot.taskState) snapshot.taskState = {}
    if (!snapshot.taskState[ns]) snapshot.taskState[ns] = { completedRootTaskIds: [] }
    if (!Array.isArray(snapshot.taskState[ns].completedRootTaskIds)) {
      snapshot.taskState[ns].completedRootTaskIds = []
    }
    const completedIds: string[] = snapshot.taskState[ns].completedRootTaskIds
    if (field.rawOldValue === true) {
      if (!completedIds.includes(taskId)) completedIds.push(taskId)
    } else {
      const idx = completedIds.indexOf(taskId)
      if (idx !== -1) completedIds.splice(idx, 1)
    }
  } else {
    if (!snapshot.answers) snapshot.answers = {}
    if (!snapshot.answers[ns]) snapshot.answers[ns] = {}
    const rawVal = field.rawOldValue as { value?: unknown; timestamp?: string } | null | undefined
    if (rawVal && typeof rawVal === 'object' && 'value' in rawVal) {
      snapshot.answers[ns][key] = { value: rawVal.value, timestamp: new Date().toISOString() }
    } else {
      delete snapshot.answers[ns][key]
    }
  }

  snapshot.metadata = { ...snapshot.metadata, savedAt: new Date().toISOString() }

  const originVer = field.originVersion ?? (version! - 1)
  const restoreDesc = key.startsWith('completed.')
    ? `Status uit versie ${originVer} hersteld`
    : `Antwoord uit versie ${originVer} hersteld`
  await assessmentsApi.update(props.assessmentId, snapshot, restoreDesc)

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
  const versionData = await assessmentsApi.version(props.assessmentId, restoreModalVersion.value)
  if (versionData.snapshot) {
    await assessmentsApi.update(
      props.assessmentId,
      versionData.snapshot,
      `Hersteld naar versie ${restoreModalVersion.value}`,
    )
    restoreModalOpen.value = false
    router.push(`/assessment/${props.assessmentId}`)
  }
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
    if (options && options[val]) return escapeHtml(options[val])
    if (isoDatePattern.test(val)) return formatTimestamp(val)
    return escapeHtml(val)
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return 'Geen selectie'
    const items = options
      ? val.map((v) => options[String(v)] || String(v))
      : val.map(String)
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
            ? v.map((item) => options[String(item)] || String(item))
            : v.map(String)
          parts.push('<ul style="margin: 0; padding-left: 1.25rem;">' + items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') + '</ul>')
        }
      } else {
        const formatted = typeof v === 'boolean' ? (v ? 'Ja' : 'Nee')
          : v === 'true' ? 'Ja' : v === 'false' ? 'Nee'
          : typeof v === 'string' ? escapeHtml(v) : escapeHtml(JSON.stringify(v))
        parts.push(formatted)
      }
    }

    // Skip timestamp — rendered separately in template

    // Any remaining keys
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'value' || k === 'timestamp' || v === null || v === undefined || v === '') continue
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

// Diff
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
    const [current, previous] = await Promise.all([
      assessmentsApi.version(props.assessmentId, version),
      assessmentsApi.version(props.assessmentId, version - 1),
    ])
    const fields = computeDiff(previous.snapshot, current.snapshot)
    diffFields.value = fields
    // Resolve actual origin version for each changed field
    await resolveOriginVersions(fields, version, previous.snapshot)
  } catch {
    diffFields.value = []
  } finally {
    diffLoading.value = false
  }
}

function computeDiff(
  oldSnapshot: unknown,
  newSnapshot: unknown,
): Array<{ fieldId: string; label: string; oldValue: string; newValue: string; rawOldValue?: unknown; oldTimestamp?: string; originVersion?: number; canRestore: boolean }> {
  const result: Array<{ fieldId: string; label: string; oldValue: string; newValue: string; rawOldValue?: unknown; oldTimestamp?: string; originVersion?: number; canRestore: boolean }> = []
  const oldAnswers = (oldSnapshot as any)?.answers || {}
  const newAnswers = (newSnapshot as any)?.answers || {}
  const allNamespaces = new Set([...Object.keys(oldAnswers), ...Object.keys(newAnswers)])

  for (const ns of allNamespaces) {
    const oldNs = oldAnswers[ns] || {}
    const newNs = newAnswers[ns] || {}
    const allKeys = new Set([...Object.keys(oldNs), ...Object.keys(newNs)])

    for (const key of allKeys) {
      const oldVal = oldNs[key]
      const newVal = newNs[key]
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        const fieldId = `${ns}.${key}`
        const options = getFieldOptions(fieldId)
        result.push({
          fieldId,
          label: getFieldLabel(fieldId),
          oldValue: formatValue(oldVal, options),
          newValue: formatValue(newVal, options),
          rawOldValue: oldVal,
          canRestore: true,
        })
      }
    }
  }

  // Compare completed sections
  const oldTaskState = (oldSnapshot as any)?.taskState || {}
  const newTaskState = (newSnapshot as any)?.taskState || {}
  const taskNamespaces = new Set([...Object.keys(oldTaskState), ...Object.keys(newTaskState)])

  for (const ns of taskNamespaces) {
    const oldCompleted = new Set<string>(oldTaskState[ns]?.completedRootTaskIds || [])
    const newCompleted = new Set<string>(newTaskState[ns]?.completedRootTaskIds || [])

    for (const id of newCompleted) {
      if (!oldCompleted.has(id)) {
        const formType = ns === 'dpia' ? FormType.DPIA : FormType.PRE_SCAN
        const task = taskStore.getTaskByIdFromNamespace(formType, id)
        const name = task?.task ? getPlainTextWithoutDefinitions(task.task) : id
        result.push({ fieldId: `${ns}.completed.${id}`, label: `Status sectie ${id} "${name}"`, oldValue: 'Niet voltooid', newValue: 'Voltooid', rawOldValue: false, canRestore: true })
      }
    }
    for (const id of oldCompleted) {
      if (!newCompleted.has(id)) {
        const formType = ns === 'dpia' ? FormType.DPIA : FormType.PRE_SCAN
        const task = taskStore.getTaskByIdFromNamespace(formType, id)
        const name = task?.task ? getPlainTextWithoutDefinitions(task.task) : id
        result.push({ fieldId: `${ns}.completed.${id}`, label: `Status sectie ${id} "${name}"`, oldValue: 'Voltooid', newValue: 'Niet voltooid', rawOldValue: true, canRestore: true })
      }
    }
  }

  return result
}

// Walk backwards through versions to find when each field's old value was actually set.
// This gives the true "origin version" instead of always showing version N-1.
async function resolveOriginVersions(
  fields: Array<{ fieldId: string; rawOldValue?: unknown; oldTimestamp?: string; originVersion?: number; canRestore: boolean }>,
  currentVersion: number,
  prevSnapshot: unknown,
) {
  const toResolve = fields.filter(f => f.canRestore)
  if (toResolve.length === 0 || currentVersion <= 2) {
    for (const field of toResolve) {
      field.originVersion = 1
      const v1 = versions.value.find(v => v.version === 1)
      if (v1) field.oldTimestamp = formatTimestamp(v1.savedAt)
    }
    return
  }

  const resolved = new Map<string, number>()

  // Walk backwards from version N-1 comparing with N-2, then N-2 with N-3, etc.
  // prevSnapshot starts as the already-fetched version N-1 snapshot.
  let newerSnap = prevSnapshot
  for (let v = currentVersion - 2; v >= 1; v--) {
    if (toResolve.every(f => resolved.has(f.fieldId))) break

    const olderVersion = await assessmentsApi.version(props.assessmentId, v)
    const olderSnap = olderVersion.snapshot as any

    for (const field of toResolve) {
      if (resolved.has(field.fieldId)) continue

      const dotIndex = field.fieldId.indexOf('.')
      const ns = field.fieldId.substring(0, dotIndex)
      const key = field.fieldId.substring(dotIndex + 1)

      if (key.startsWith('completed.')) {
        const taskId = key.substring('completed.'.length)
        const olderCompleted = new Set<string>(olderSnap?.taskState?.[ns]?.completedRootTaskIds || [])
        const newerCompleted = new Set<string>((newerSnap as any)?.taskState?.[ns]?.completedRootTaskIds || [])
        if (olderCompleted.has(taskId) !== newerCompleted.has(taskId)) {
          // Value changed at version v+1
          resolved.set(field.fieldId, v + 1)
        }
      } else {
        const olderVal = olderSnap?.answers?.[ns]?.[key]
        const newerVal = (newerSnap as any)?.answers?.[ns]?.[key]
        if (JSON.stringify(olderVal) !== JSON.stringify(newerVal)) {
          resolved.set(field.fieldId, v + 1)
        }
      }
    }

    newerSnap = olderSnap
  }

  // Unresolved fields: value was already present in version 1
  for (const field of toResolve) {
    const origin = resolved.get(field.fieldId) ?? 1
    field.originVersion = origin
    const originVersion = versions.value.find(v => v.version === origin)
    if (originVersion) {
      field.oldTimestamp = formatTimestamp(originVersion.savedAt)
    }
  }
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
                  <div class="kebab-menu__divider"></div>
                  <button class="kebab-menu__item kebab-menu__item--danger" role="menuitem" @mousedown="openMenuVersion = null; openRestoreModal(version.version)">
                    Herstellen naar deze versie
                  </button>
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
                        <div v-if="canEdit" class="kebab-menu diff-kebab" @focusout="openMenuField = null">
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
