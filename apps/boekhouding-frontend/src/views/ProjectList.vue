<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { projects as projectsApi, type Project } from '../api'
import { UiButton, MarkdownEditor, renderMarkdownToHtml } from '@overheid-assessment/core'
import { IconPlus } from '@tabler/icons-vue'
import AppHeader from '../components/AppHeader.vue'

const router = useRouter()
const projectList = ref<Project[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showCreateForm = ref(false)
const newProjectName = ref('')
const newProjectDescription = ref('')

onMounted(async () => {
  try {
    projectList.value = await projectsApi.list()
  } catch {
    error.value = 'Kan projecten niet laden. Probeer het later opnieuw.'
  } finally {
    loading.value = false
  }
})

const handleCreate = async () => {
  if (!newProjectName.value) return
  const project = await projectsApi.create(newProjectName.value, newProjectDescription.value)
  router.push(`/project/${project.id}`)
}

// The card is itself a link, so the description can only be a plain-text teaser
// (rendered markdown would nest links inside the card link). Strip the markdown
// to its text content and let the CSS line-clamp truncate it.
const descriptionPreview = (markdown: string): string =>
  // textContent of a parsed <body> element is always a string (never null).
  new DOMParser().parseFromString(renderMarkdownToHtml(markdown), 'text/html').body.textContent!

</script>

<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <AppHeader>
      <template #left>
        <h1 class="utrecht-heading-1 rvo-heading--no-margins">Projecten</h1>
      </template>
    </AppHeader>

    <div v-if="loading">
      <p>Projecten laden...</p>
    </div>

    <div v-else-if="error" class="rvo-alert rvo-alert--warning">
      {{ error }}
    </div>

    <template v-else>
      <div v-if="projectList.length === 0" class="rvo-margin-block-end--lg">
        <p>Je hebt nog geen projecten. Maak er een aan om te beginnen.</p>
      </div>

      <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two rvo-margin-block-end--lg">
        <router-link
          v-for="project in projectList"
          :key="project.id"
          :to="`/project/${project.id}`"
          class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card--full-colour--grijs-100 card-link"
        >
          <div class="rvo-card__content">
            <h2 class="utrecht-heading-2 rvo-margin--none text-clamp-2">{{ project.name }}</h2>
            <p v-if="project.description" class="text-clamp-3">{{ descriptionPreview(project.description) }}</p>
          </div>
        </router-link>
      </div>

      <div v-if="!showCreateForm">
        <button class="rvo-button rvo-button--primary rvo-button--size-md rvo-button--icon-before" @click="showCreateForm = true">
          <IconPlus :size="20" /> Nieuw project
        </button>
      </div>

      <form v-else @submit.prevent="handleCreate" class="rvo-margin-block-start--md">
        <h2 class="utrecht-heading-2">Nieuw project</h2>
        <div class="rvo-form-field rvo-margin-block-end--md">
          <label class="rvo-form-field__label" for="projectName">Naam</label>
          <input id="projectName" v-model="newProjectName" type="text" class="utrecht-textbox utrecht-textbox--html-input" required />
        </div>
        <div class="rvo-form-field rvo-margin-block-end--md">
          <label class="rvo-form-field__label" id="projectDescLabel" for="projectDesc">Beschrijving (optioneel)</label>
          <MarkdownEditor :model-value="newProjectDescription" :base-heading-level="2"
            input-id="projectDesc" aria-labelledby="projectDescLabel"
            @update:model-value="(value) => newProjectDescription = value" />
        </div>
        <div class="rvo-action-group">
          <UiButton variant="primary" type="submit" label="Project toevoegen" />
          <UiButton variant="secondary" label="Annuleren" @click="showCreateForm = false" />
        </div>
      </form>
    </template>
  </div>
</template>
