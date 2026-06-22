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
    <a class="skip-link" href="#main-content">Naar hoofdinhoud</a>
    <AppBanner :homeUrl="homeUrl" />
    <main id="main-content" tabindex="-1" class="app-main">
      <router-view :key="$route.path" />
    </main>
    <SessionExpiredDialog />
    <footer class="app-footer">
      <nav aria-label="Juridische informatie">
        <router-link to="/privacy" class="app-footer__link">Privacyverklaring</router-link>
        <span class="app-footer__separator">|</span>
        <router-link to="/toegankelijkheid" class="app-footer__link">Toegankelijkheid</router-link>
        <span class="app-footer__separator">|</span>
        <router-link to="/over" class="app-footer__link">Over Invulhulpen</router-link>
        <span class="app-footer__separator">|</span>
        <router-link to="/modellen" class="app-footer__link">Modelversies</router-link>
        <span class="app-footer__separator">|</span>
        <router-link to="/status" class="app-footer__link">Status</router-link>
      </nav>
    </footer>
  </div>
</template>
