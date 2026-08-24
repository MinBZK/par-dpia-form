<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { members as membersApi, type Member } from '../api'
import { usePaginatedList } from '../composables/usePaginatedList'
import { useBackLink } from '../composables/useBackLink'
import '@nldd/design-system/banner'
import '@nldd/design-system/button'
import '@nldd/design-system/cell'
import '@nldd/design-system/container'
import '@nldd/design-system/dropdown'
import '@nldd/design-system/form'
import '@nldd/design-system/form-actions'
import '@nldd/design-system/form-field'
import '@nldd/design-system/list'
import '@nldd/design-system/list-item'
import '@nldd/design-system/modal-dialog'
import '@nldd/design-system/spacer-cell'
import '@nldd/design-system/text-cell'
import '@nldd/design-system/text-field'
import '@nldd/design-system/title'

const props = defineProps<{ projectId: string }>()
const router = useRouter()

useBackLink().set({ text: 'Project', to: `/project/${props.projectId}` })

const {
  items: memberList, loadingMore, loadError, loadStatus, statusRef,
  hasMore, nextBatchSize, loadFirst, loadMore,
} = usePaginatedList<Member>((page, pageSize) => membersApi.list(props.projectId, page, pageSize), (m) => m.userId)
const loading = ref(true)
const inviteEmail = ref('')
const inviteEmailError = ref('')
const inviteRole = ref<'owner' | 'editor' | 'commenter' | 'viewer'>('editor')
const error = ref<string | null>(null)

const ownerCount = computed(() => memberList.value.filter(m => m.role === 'owner').length)

const isOnlyOwner = (member: Member) => member.role === 'owner' && ownerCount.value <= 1

onMounted(async () => {
  try {
    await loadFirst()
  } catch {
    error.value = 'Kan leden niet laden. Probeer het later opnieuw.'
  } finally {
    loading.value = false
  }
})

// NLDD fields deliver their value in event.detail; plain inputs on the target.
function fieldValue(event: Event): string {
  return (event as CustomEvent).detail?.value ?? (event.target as HTMLInputElement).value
}

// Own rules, DS presentation: nldd-form carries novalidate so the browser does
// not intercept with its own bubble before this runs.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const handleInvite = async () => {
  error.value = null
  const address = inviteEmail.value.trim()
  if (!address) {
    inviteEmailError.value = 'Vul een e-mailadres in.'
    return
  }
  if (!EMAIL_SHAPE.test(address)) {
    inviteEmailError.value = 'Vul een geldig e-mailadres in, bijvoorbeeld naam@organisatie.nl.'
    return
  }
  inviteEmailError.value = ''

  try {
    await membersApi.add(props.projectId, address, inviteRole.value)
    await loadFirst()
    inviteEmail.value = ''
  } catch (e: any) {
    error.value = e.message
  }
}

const handleRoleChange = async (member: Member, newRole: string) => {
  error.value = null
  try {
    await membersApi.update(props.projectId, member.userId, newRole)
    await loadFirst()
  } catch (e: any) {
    error.value = e.message
  }
}

// Delete confirmation modal. show/hide are optional: they only exist once the
// custom element is upgraded (not in jsdom unit tests).
type ModalDialogElement = HTMLElement & { show?: () => void; hide?: () => void }

const deleteDialogRef = ref<ModalDialogElement | null>(null)
const deleteModalOpen = ref(false)
const memberToDelete = ref<Member | null>(null)

watch(deleteModalOpen, (open) => {
  if (!deleteDialogRef.value) return
  if (open) deleteDialogRef.value.show?.()
  else deleteDialogRef.value.hide?.()
})

const openDeleteModal = (member: Member) => {
  memberToDelete.value = member
  deleteModalOpen.value = true
}

const closeDeleteModal = () => {
  deleteModalOpen.value = false
  memberToDelete.value = null
}

// The modal closes itself on Esc and fires `close`; route that through the
// shared open-state so the watch performs the single hide() (no hide loop).
const onDialogClose = () => {
  if (deleteModalOpen.value) closeDeleteModal()
}

onBeforeUnmount(() => {
  deleteDialogRef.value?.hide?.()
})

const confirmRemove = async () => {
  if (!memberToDelete.value) return

  error.value = null
  try {
    await membersApi.remove(props.projectId, memberToDelete.value.userId)
    await loadFirst()
  } catch (e: any) {
    error.value = e.message
  } finally {
    closeDeleteModal()
  }
}

// An invited member has no display name until they first sign in; the API fills
// it with the email, so name and email would otherwise read twice.
const isPlaceholderName = (member: Member) => member.displayName === member.email

const whoLabel = (member: Member) =>
  isPlaceholderName(member) ? member.email : `${member.displayName} (${member.email})`
</script>

<template>
  <div>
  <div class="page-container">
    <nldd-title size="3"><h1>Leden beheren</h1></nldd-title>

    <div v-if="loading"><p>Laden...</p></div>

    <template v-else>
      <nldd-banner v-if="error" variant="critical" :text="error"></nldd-banner>

      <nldd-list class="member-list" accessible-label="Projectleden">
        <nldd-list-item v-for="member in memberList" :key="member.userId" class="member-row">
          <nldd-text-cell
            class="member-col--who"
            :text="isPlaceholderName(member) ? member.email : member.displayName"
            :supporting-text="isPlaceholderName(member) ? undefined : member.email"
          ></nldd-text-cell>
          <!-- Fixed width so the dropdowns line up: a fit-content cell would size
               to its own label and "Project eigenaar" is wider than "Bewerker". -->
          <nldd-cell class="member-col--role" width="12.5rem">
            <nldd-dropdown :disabled="isOnlyOwner(member) || undefined">
              <select
                :value="member.role"
                :disabled="isOnlyOwner(member)"
                :aria-label="`Rol van ${whoLabel(member)}`"
                class="member-select"
                @change="handleRoleChange(member, ($event.target as HTMLSelectElement).value)"
              >
                <option value="owner">Project eigenaar</option>
                <option value="editor">Bewerker</option>
                <option value="commenter">Commentator</option>
                <option value="viewer">Lezer</option>
              </select>
            </nldd-dropdown>
          </nldd-cell>
          <nldd-spacer-cell size="8"></nldd-spacer-cell>
          <!-- Fixed width so the role dropdowns line up down the list. The
               sole owner cannot be removed: the button is disabled rather than
               hidden, the same way their role select is. -->
          <nldd-cell class="member-col--action" width="8.5rem" horizontal-alignment="right">
            <nldd-button
              variant="destructive"
              text="Verwijderen"
              class="member-delete"
              :disabled="isOnlyOwner(member) || undefined"
              :accessible-label="isOnlyOwner(member)
                ? `${whoLabel(member)} is de enige eigenaar en kan niet worden verwijderd`
                : `${whoLabel(member)} verwijderen uit dit project`"
              @click="openDeleteModal(member)"
            ></nldd-button>
          </nldd-cell>
        </nldd-list-item>
      </nldd-list>

      <div v-if="hasMore" class="version-list__more">
        <nldd-button
          variant="neutral-tinted"
          size="sm"
          :disabled="loadingMore || undefined"
          :text="`Laad de volgende ${nextBatchSize} leden`"
          @click="loadMore"
        ></nldd-button>
      </div>
      <p v-if="loadError" class="version-list__error" role="alert">{{ loadError }}</p>
      <p ref="statusRef" tabindex="-1" role="status" aria-live="polite" class="sr-only">{{ loadStatus }}</p>

      <h2>Lid toevoegen</h2>

      <nldd-container max-width="32rem">
      <nldd-form novalidate>
        <!-- Own <form> as direct child: that is the framework-friendly mode, so
             the component mirrors attributes instead of migrating Vue's nodes. -->
        <form @submit.prevent="handleInvite">
        <nldd-form-field label="E-mailadres">
          <nldd-text-field
            input-id="inviteEmail"
            type="email"
            required
            :value="inviteEmail"
            :invalid="inviteEmailError ? true : undefined"
            error-message="inviteEmailError"
            @input="inviteEmail = fieldValue($event); inviteEmailError = ''"
          ></nldd-text-field>
          <nldd-form-field-error-text id="inviteEmailError">
            {{ inviteEmailError }}
          </nldd-form-field-error-text>
        </nldd-form-field>
        <nldd-form-field label="Rol">
          <nldd-dropdown>
            <select id="inviteRole" v-model="inviteRole" aria-label="Rol">
              <option value="owner">Project eigenaar</option>
              <option value="editor">Bewerker</option>
              <option value="viewer">Lezer</option>
            </select>
          </nldd-dropdown>
        </nldd-form-field>
        <nldd-form-actions>
          <nldd-button variant="primary" size="md" type="submit" text="Toevoegen"></nldd-button>
        </nldd-form-actions>
        </form>
      </nldd-form>
      </nldd-container>
    </template>
  </div>

  <!-- Delete member confirmation modal -->
  <nldd-modal-dialog
    ref="deleteDialogRef"
    variant="alert"
    text="Lid verwijderen"
    @close="onDialogClose"
  >
    <p>Weet je zeker dat je <strong>{{ memberToDelete ? whoLabel(memberToDelete) : '' }}</strong> wilt verwijderen uit dit project?</p>
    <!-- The safe way out is the primary action; the destructive action is the
         secondary one (NLDD design guideline). -->
    <nldd-button slot="actions" variant="primary" text="Annuleer" @click="closeDeleteModal"></nldd-button>
    <nldd-button slot="actions" variant="destructive" text="Verwijderen" @click="confirmRemove"></nldd-button>
  </nldd-modal-dialog>
  </div>
</template>
