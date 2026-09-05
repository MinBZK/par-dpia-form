<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, projects as projectsApi, type Project } from '../api'
import { useAnchorNav } from '../composables/useAnchorNav'
import { usePaginatedList } from '../composables/usePaginatedList'
import '@nldd/design-system/banner'
import '@nldd/design-system/inline-dialog'
import '@nldd/design-system/simple-section'
import '@nldd/design-system/button'
import '@nldd/design-system/sheet'
import '@nldd/design-system/button-group'
import '@nldd/design-system/card'
import '@nldd/design-system/collection'
import '@nldd/design-system/container'
import '@nldd/design-system/form'
import '@nldd/design-system/form-field'
import '@nldd/design-system/multi-line-text-field'
import '@nldd/design-system/text-field'
import '@nldd/design-system/title'

const router = useRouter()
const onCardNav = useAnchorNav()
const {
  items: projectList, total, loadingMore, loadError, loadStatus, statusRef,
  hasMore, nextBatchSize, loadFirst, loadMore,
} = usePaginatedList<Project>((page, pageSize) => projectsApi.list(page, pageSize), (p) => p.id)
const loading = ref(true)
const error = ref<string | null>(null)
type SheetElement = HTMLElement & { show?: () => void; hide?: () => void }
const createSheetRef = ref<SheetElement | null>(null)
const showCreateForm = ref(false)

watch(showCreateForm, (open) => {
  if (open) createSheetRef.value?.show?.()
  else createSheetRef.value?.hide?.()
})
const newProjectName = ref('')
const newProjectDescription = ref('')

onMounted(async () => {
  try {
    await loadFirst()
  } catch (e) {
    // This list only contains your own projects, so a 403 here is about the
    // account rather than one project. Retrying will not fix that, so show what
    // the server says instead of advising a retry.
    error.value = e instanceof ApiError && e.status === 403
      ? e.message
      : 'Kan projecten niet laden. Probeer het later opnieuw.'
  } finally {
    loading.value = false
  }
})

// NLDD fields deliver their value in event.detail; plain inputs on the target.
function fieldValue(event: Event): string {
  return (event as CustomEvent).detail?.value ?? (event.target as HTMLInputElement).value
}

const handleCreate = async () => {
  if (!newProjectName.value) return
  const project = await projectsApi.create(newProjectName.value, newProjectDescription.value)
  router.push(`/project/${project.id}`)
}

</script>

<template>
  <nldd-simple-section padding-top="24">
    <nldd-container gap="24">
    <nldd-title size="3"><h1>Projecten</h1></nldd-title>

    <div v-if="loading">
      <p>Projecten laden...</p>
    </div>

    <nldd-banner v-else-if="error" variant="warning" :text="error"></nldd-banner>

    <template v-else>
      <nldd-inline-dialog v-if="projectList.length === 0"
        icon="folder" icon-color="secondary"
        text="Nog geen projecten"
        supporting-text="Een project bundelt de assessments die bij elkaar horen. Maak er een aan om te beginnen."></nldd-inline-dialog>

      <!-- max-items: the collection hides items past its own cap (24) even
           without a load-more button. The server pages the list, so the cap is
           the server total and nothing loaded is ever hidden. -->
      <nldd-collection layout="grid" item-width="380px" gap="16px" :max-items="total" class="project-grid"
        @click="onCardNav">
        <nldd-card
          v-for="project in projectList"
          :key="project.id"
          :href="`/project/${project.id}`"
          :accessible-label="`Open project ${project.name}`"
        >
          <nldd-container padding="16">
            <h2 class="text-clamp-2">{{ project.name }}</h2>
            <p v-if="project.description" class="text-clamp-3">{{ project.description }}</p>
          </nldd-container>
        </nldd-card>

        <nldd-button
          v-if="hasMore"
          slot="footer"
          variant="neutral-tinted"
          width="full"
          :disabled="loadingMore || undefined"
          :text="`Laad de volgende ${nextBatchSize} projecten`"
          @click="loadMore"
        ></nldd-button>
      </nldd-collection>

      <p v-if="loadError" class="version-list__error" role="alert">{{ loadError }}</p>
      <p ref="statusRef" tabindex="-1" role="status" aria-live="polite" class="sr-only">{{ loadStatus }}</p>

      <div>
        <nldd-button
          variant="primary"
          size="md"
          start-icon="plus"
          text="Nieuw project"
          @click="showCreateForm = true"
        ></nldd-button>
      </div>
    </template>
    </nldd-container>
  </nldd-simple-section>

  <!-- A sheet, not a modal: this is data entry that keeps the page in view.
       The design system reserves the modal for an irreversible action. -->
  <nldd-sheet ref="createSheetRef" data-test="create-project-dialog"
    accessible-label="Nieuw project" width="30rem" @close="showCreateForm = false">
    <nldd-container padding="24" gap="16">
      <nldd-title size="4"><h2>Nieuw project</h2></nldd-title>
      <nldd-form>
        <!-- Own <form> as direct child: that is the framework-friendly mode, so
             the component mirrors attributes instead of migrating Vue's nodes. -->
        <form @submit.prevent="handleCreate">
        <nldd-form-field label="Naam">
          <nldd-text-field
            input-id="projectName"
            type="text"
            required
            :value="newProjectName"
            @input="newProjectName = fieldValue($event)"
          ></nldd-text-field>
        </nldd-form-field>
        <nldd-form-field label="Beschrijving" optional>
          <nldd-multi-line-text-field
            input-id="projectDesc"
            rows="2"
            resize="auto"
            :value="newProjectDescription"
            @input="newProjectDescription = fieldValue($event)"
          ></nldd-multi-line-text-field>
        </nldd-form-field>
        <nldd-button-group orientation="horizontal">
          <!-- type="submit": the component calls form.requestSubmit() itself, so
               the form's own required-check runs and Enter works in the field. -->
          <nldd-button variant="primary" type="submit" text="Project toevoegen"></nldd-button>
          <nldd-button variant="secondary" text="Annuleren"
            @click="showCreateForm = false"></nldd-button>
        </nldd-button-group>
        </form>
      </nldd-form>
    </nldd-container>
  </nldd-sheet>
</template>
