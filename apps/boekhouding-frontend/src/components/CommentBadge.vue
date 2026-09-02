<script setup lang="ts">
import { computed } from 'vue'
import { useCollaborationStore } from '../stores/collaboration'
import '@nldd/design-system/badge'
import '@nldd/design-system/button'

defineEmits<{ toggle: [] }>()
const props = defineProps<{ open: boolean }>()

const commentStore = useCollaborationStore()

// The text slot carries a badge, so the accessible name is set explicitly.
const accessibleLabel = computed(() => {
  const count = commentStore.totalUnresolvedCount
  return count > 0 ? `Opmerkingen, ${count} onopgelost` : 'Opmerkingen'
})
</script>

<template>
  <nldd-button
    size="sm"
    :variant="props.open ? 'accent-filled' : 'accent-transparent'"
    start-icon="comment"
    :expanded="props.open || undefined"
    :accessible-label="accessibleLabel"
    @click="$emit('toggle')"
  >
    <span slot="text">
      Opmerkingen
      <nldd-badge
        v-if="commentStore.totalUnresolvedCount > 0"
        :number="commentStore.totalUnresolvedCount"
        :color="props.open ? 'inherit' : 'accent'"
        decorative
      ></nldd-badge>
    </span>
  </nldd-button>
</template>
