<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue'
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
  PERSISTENCE_KEY,
  type NavigationFunctions,
} from '@overheid-assessment/core'
import { assessments as assessmentsApi, type AssessmentInstance } from '../api'
import { createApiPersistence } from '../ApiPersistence'
import { IconArrowLeft, IconDotsVertical } from '@tabler/icons-vue'
import AppHeader from '../components/AppHeader.vue'

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
const isReadonly = computed(() => assessment.value?.role === 'viewer')
const canEdit = computed(() => assessment.value?.role === 'owner' || assessment.value?.role === 'editor')

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
const persistence = createApiPersistence(props.assessmentId)
provide(PERSISTENCE_KEY, persistence)

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

    // If this is a DPIA with PRE_SCAN data in the snapshot, initialize the PRE_SCAN
    // task structure so that usePreScanReferences can find pre-scan tasks and answers.
    if (namespace === FormType.DPIA && assessment.value.snapshot) {
      const snapshot = assessment.value.snapshot as { answers?: Record<string, unknown> }
      if (snapshot.answers?.[FormType.PRE_SCAN] && Object.keys(snapshot.answers[FormType.PRE_SCAN] as object).length > 0) {
        const preScanSchema = schemaStore.getSchema(FormType.PRE_SCAN)
        if (preScanSchema && !taskStore.isInitialized[FormType.PRE_SCAN]) {
          const prevNamespace = taskStore.activeNamespace
          taskStore.setActiveNamespace(FormType.PRE_SCAN)
          taskStore.init(preScanSchema.tasks)
          taskStore.setActiveNamespace(prevNamespace)
        }
      }
    }
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

const namespace = ref<FormType>(FormType.DPIA)

watch(assessment, (a) => {
  if (a) {
    namespace.value = assessmentTypeMap[a.assessmentType] || FormType.DPIA
  }
})

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
  const { exportToPdf } = await import('@overheid-assessment/core')
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

      <div v-if="isReadonly" class="rvo-alert rvo-alert--info rvo-alert--padding-sm rvo-margin-block-end--md" role="status">
        Je hebt alleen leesrechten op deze assessment.
      </div>
    </div>

    <div :inert="isReadonly || undefined" class="assessment-editor" :class="{ 'form-readonly': isReadonly }">
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
  </template>

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
  </div>
</template>
