<script setup lang="ts">
import { useCommentStore } from '../stores/comments'
import { IconMessage } from '@tabler/icons-vue'

defineEmits<{ toggle: [] }>()
defineProps<{ open: boolean }>()

const commentStore = useCommentStore()
</script>

<template>
  <button
    class="comment-badge"
    :class="{ 'comment-badge--active': open }"
    :aria-expanded="open"
    :aria-controls="open ? 'comment-panel' : undefined"
    @click="$emit('toggle')"
  >
    <IconMessage :size="18" aria-hidden="true" />
    <span class="comment-badge__label">Opmerkingen</span>
    <span v-if="commentStore.totalUnresolvedCount > 0" class="comment-badge__count">
      {{ commentStore.totalUnresolvedCount }}
    </span>
  </button>
</template>
