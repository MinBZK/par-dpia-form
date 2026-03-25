<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { members as membersApi, type Member } from '../api'
import AppHeader from '../components/AppHeader.vue'

const props = defineProps<{ projectId: string }>()
const router = useRouter()

const memberList = ref<Member[]>([])
const loading = ref(true)
const inviteEmail = ref('')
const inviteRole = ref<'owner' | 'editor' | 'commenter' | 'viewer'>('editor')
const error = ref<string | null>(null)

const ownerCount = computed(() => memberList.value.filter(m => m.role === 'owner').length)

const isOnlyOwner = (member: Member) => member.role === 'owner' && ownerCount.value <= 1

onMounted(async () => {
  try {
    memberList.value = await membersApi.list(props.projectId)
  } catch {
    error.value = 'Kan leden niet laden. Probeer het later opnieuw.'
  } finally {
    loading.value = false
  }
})

const handleInvite = async () => {
  error.value = null
  if (!inviteEmail.value) return

  try {
    await membersApi.add(props.projectId, inviteEmail.value, inviteRole.value)
    memberList.value = await membersApi.list(props.projectId)
    inviteEmail.value = ''
  } catch (e: any) {
    error.value = e.message
  }
}

const handleRoleChange = async (member: Member, newRole: string) => {
  error.value = null
  try {
    await membersApi.update(props.projectId, member.userId, newRole)
    memberList.value = await membersApi.list(props.projectId)
  } catch (e: any) {
    error.value = e.message
  }
}

// Delete confirmation modal
const deleteDialogRef = ref<HTMLDialogElement | null>(null)
const deleteModalOpen = ref(false)
const memberToDelete = ref<Member | null>(null)

watch(deleteModalOpen, (open) => {
  if (open) {
    deleteDialogRef.value?.showModal()
  } else {
    deleteDialogRef.value?.close()
  }
})

const openDeleteModal = (member: Member) => {
  memberToDelete.value = member
  deleteModalOpen.value = true
}

const closeDeleteModal = () => {
  deleteModalOpen.value = false
  memberToDelete.value = null
}

const confirmRemove = async () => {
  if (!memberToDelete.value) return

  error.value = null
  try {
    await membersApi.remove(props.projectId, memberToDelete.value.userId)
    memberList.value = memberList.value.filter(m => m.userId !== memberToDelete.value!.userId)
  } catch (e: any) {
    error.value = e.message
  } finally {
    closeDeleteModal()
  }
}

const whoLabel = (member: Member) => {
  const isPlaceholder = member.displayName === member.email
  if (isPlaceholder) return member.email
  return `${member.displayName} (${member.email})`
}
</script>

<template>
  <div>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <AppHeader backLabel="Terug naar project" :backRoute="`/project/${projectId}`" />

    <h1 class="utrecht-heading-1">Leden beheren</h1>

    <div v-if="loading"><p>Laden...</p></div>

    <template v-else>
      <div v-if="error" class="rvo-alert rvo-alert--error rvo-margin-block-end--md" role="alert">
        <p>{{ error }}</p>
      </div>

      <div class="member-list rvo-margin-block-end--lg">
        <div class="member-row member-row--header">
          <span class="member-col--who">Wie</span>
          <span class="member-col--role">Rol</span>
          <span class="member-col--action"></span>
        </div>
        <div v-for="member in memberList" :key="member.userId" class="member-row">
          <span class="member-col--who">{{ whoLabel(member) }}</span>
          <span class="member-col--role">
            <select
              :value="member.role"
              :disabled="isOnlyOwner(member)"
              :aria-label="`Rol van ${whoLabel(member)}`"
              class="utrecht-select utrecht-select--html-select member-select"
              @change="handleRoleChange(member, ($event.target as HTMLSelectElement).value)"
            >
              <option value="owner">Project eigenaar</option>
              <option value="editor">Bewerker</option>
              <option value="commenter">Commentator</option>
              <option value="viewer">Lezer</option>
            </select>
          </span>
          <span class="member-col--action">
            <button
              v-if="!isOnlyOwner(member)"
              class="utrecht-button utrecht-button--primary-action confirm-dialog__delete member-delete"
              @click="openDeleteModal(member)"
            >
              Verwijderen
            </button>
          </span>
        </div>
      </div>

      <h2 class="utrecht-heading-2">Lid toevoegen</h2>

      <form @submit.prevent="handleInvite">
        <div class="rvo-form-field rvo-margin-block-end--md">
          <label class="rvo-form-field__label" for="inviteEmail">E-mailadres</label>
          <input id="inviteEmail" v-model="inviteEmail" type="email" class="utrecht-textbox utrecht-textbox--html-input" required />
        </div>
        <div class="rvo-form-field rvo-margin-block-end--md">
          <label class="rvo-form-field__label" for="inviteRole">Rol</label>
          <select id="inviteRole" v-model="inviteRole" class="utrecht-select utrecht-select--html-select">
            <option value="owner">Project eigenaar</option>
            <option value="editor">Bewerker</option>
            <option value="viewer">Lezer</option>
          </select>
        </div>
        <button class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md" type="submit">Toevoegen</button>
      </form>
    </template>
  </div>

  <!-- Delete member confirmation modal -->
  <dialog ref="deleteDialogRef" class="confirm-dialog" @close="closeDeleteModal">
    <div class="confirm-dialog__content">
      <h2 class="utrecht-heading-2">Lid verwijderen</h2>
      <p>Weet je zeker dat je <strong>{{ memberToDelete ? whoLabel(memberToDelete) : '' }}</strong> wilt verwijderen uit dit project?</p>
      <div class="confirm-dialog__actions">
        <button
          class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md confirm-dialog__delete"
          @click="confirmRemove"
        >
          Verwijderen
        </button>
        <button class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-md" @click="closeDeleteModal">
          Annuleer
        </button>
      </div>
    </div>
  </dialog>
  </div>
</template>
