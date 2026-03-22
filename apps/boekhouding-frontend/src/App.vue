<script setup lang="ts">
import { computed } from 'vue'
import { AppBanner } from '@overheid-assessment/core'
import { useAuth } from './composables/useAuth'

const { isAuthenticated } = useAuth()
const homeUrl = computed(() => isAuthenticated.value ? '/projecten' : '/')
</script>

<template>
  <div class="app-layout">
    <AppBanner message="De Assessment Boekhouding en de invulhulpen zijn in ontwikkeling." title="Assessment Boekhouding" :homeUrl="homeUrl" />
    <router-view :key="$route.path" class="app-main" />
    <footer class="app-footer">
      <nav aria-label="Juridische informatie">
        <router-link to="/privacy" class="app-footer__link">Privacyverklaring</router-link>
        <span class="app-footer__separator">|</span>
        <router-link to="/toegankelijkheid" class="app-footer__link">Toegankelijkheid</router-link>
        <span class="app-footer__separator">|</span>
        <router-link to="/over" class="app-footer__link">Over de invulhulpen</router-link>
      </nav>
    </footer>
  </div>
</template>
