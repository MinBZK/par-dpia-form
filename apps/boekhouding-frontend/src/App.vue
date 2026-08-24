<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AppBanner, ThemeMenuItems, useTheme } from '@overheid-assessment/core'
import { useAuth } from './composables/useAuth'
import { useAnchorNav } from './composables/useAnchorNav'
import { useBackLink } from './composables/useBackLink'
import SessionExpiredDialog from './components/SessionExpiredDialog.vue'

import '@nldd/design-system/app-view'
import '@nldd/design-system/page'
import '@nldd/design-system/page-footer'
import '@nldd/design-system/skip-link'
import '@nldd/design-system/menu-bar'
import '@nldd/design-system/menu-bar-item'
import '@nldd/design-system/menu'

const router = useRouter()
const { isAuthenticated, user, login, logout } = useAuth()
// Apply a stored theme preference on every page, not only once the account
// menu (the place to change it) has rendered.
useTheme()

// Views declare their back link; a route change clears it before the next
// view mounts and sets its own.
const { backLink, set: setBackLink } = useBackLink()
router.afterEach(() => setBackLink(null))
const goBack = () => {
  const link = backLink.value
  if (!link) return
  if (link.to) router.push(link.to)
  else router.back()
}

const onFooterNav = useAnchorNav()

const homeUrl = computed(() => isAuthenticated.value ? '/projecten' : '/')
const displayName = computed(() => user.value?.displayName || 'Account')
</script>

<template>
  <nldd-app-view>
    <nldd-page>
      <div slot="header">
        <nldd-skip-link text="Naar hoofdinhoud" href="#main-content"></nldd-skip-link>
        <AppBanner :homeUrl="homeUrl" :backText="backLink?.text" @back="goBack">
          <template #utility>
            <nldd-menu-bar slot="utility" accessible-label="Account">
              <nldd-menu-bar-item v-if="isAuthenticated" icon="user" :text="displayName"
                expandable accessible-label="Accountmenu">
                <nldd-menu accessible-label="Accountmenu">
                  <nldd-menu-group text="Weergave">
                    <ThemeMenuItems />
                  </nldd-menu-group>
                  <nldd-menu-item text="Uitloggen" icon="logout"
                    @select="logout()"></nldd-menu-item>
                </nldd-menu>
              </nldd-menu-bar-item>
              <nldd-menu-bar-item v-else icon="login" text="Inloggen"
                @select="login()"></nldd-menu-bar-item>
            </nldd-menu-bar>
          </template>
        </AppBanner>
      </div>

      <main id="main-content" tabindex="-1" class="app-main">
        <router-view :key="$route.path" />
        <SessionExpiredDialog />
      </main>

      <nldd-page-footer slot="footer">
        <nldd-page-footer-legal-bar slot="legal-bar" @click="onFooterNav">
          <nldd-page-footer-legal-bar-item slot="end" href="/privacy"
            text="Privacyverklaring"></nldd-page-footer-legal-bar-item>
          <nldd-page-footer-legal-bar-item slot="end" href="/toegankelijkheid"
            text="Toegankelijkheid"></nldd-page-footer-legal-bar-item>
          <nldd-page-footer-legal-bar-item slot="end" href="/over"
            text="Over Invulhulpen"></nldd-page-footer-legal-bar-item>
          <nldd-page-footer-legal-bar-item slot="end" href="/status"
            text="Status"></nldd-page-footer-legal-bar-item>
        </nldd-page-footer-legal-bar>
      </nldd-page-footer>
    </nldd-page>
  </nldd-app-view>
</template>
