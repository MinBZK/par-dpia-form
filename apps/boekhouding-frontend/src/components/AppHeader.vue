<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { IconArrowLeft, IconLogout } from '@tabler/icons-vue'

defineProps<{
  backLabel?: string
  backRoute?: string
  showBack?: boolean
}>()

const router = useRouter()
const { user, isAuthenticated, logout } = useAuth()
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <button
        v-if="backRoute || showBack"
        class="utrecht-button utrecht-button--rvo-tertiary-action utrecht-button--rvo-xs utrecht-button--icon-gap app-header__back"
        @click="backRoute ? router.push(backRoute) : router.back()"
      >
        <IconArrowLeft :size="16" /> {{ backLabel || 'Terug' }}
      </button>
      <slot name="left" />
    </div>
    <div class="app-header__right">
      <slot name="right" />
      <template v-if="isAuthenticated">
        <span v-if="user" class="app-header__user">{{ user.displayName }}</span>
        <button
          class="utrecht-button utrecht-button--rvo-tertiary-action utrecht-button--rvo-xs utrecht-button--icon-gap"
          @click="logout"
        >
          <IconLogout :size="16" /> Uitloggen
        </button>
      </template>
    </div>
  </header>
</template>
