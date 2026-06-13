<script setup lang="ts">
import { computed } from 'vue'
import { AppBanner } from '@overheid-assessment/core'
import { useAuth } from './composables/useAuth'
import SessionExpiredDialog from './components/SessionExpiredDialog.vue'

const { isAuthenticated } = useAuth()
const homeUrl = computed(() => isAuthenticated.value ? '/projecten' : '/')
</script>

<template>
  <div class="app-layout">
    <AppBanner :homeUrl="homeUrl" />
    <router-view :key="$route.path" class="app-main" />
    <SessionExpiredDialog />
    <footer class="app-footer">
      <nav aria-label="Juridische informatie">
        <router-link to="/privacy" class="app-footer__link">Privacyverklaring</router-link>
        <span class="app-footer__separator">|</span>
        <router-link to="/toegankelijkheid" class="app-footer__link">Toegankelijkheid</router-link>
        <span class="app-footer__separator">|</span>
        <router-link to="/over" class="app-footer__link">Over Invulhulpen</router-link>
        <span class="app-footer__separator">|</span>
        <router-link to="/status" class="app-footer__link">Status</router-link>
      </nav>
    </footer>
  </div>
</template>
