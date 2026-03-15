import { ref, computed } from 'vue'
import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'assessment-boekhouding',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'boekhouding-frontend',
})

const user = ref<{ id: string; email: string; displayName: string } | null>(null)
const initialized = ref(false)

export function useAuth() {
  const isAuthenticated = computed(() => keycloak.authenticated === true)

  async function init() {
    if (initialized.value) return

    const authenticated = await keycloak.init({
      onLoad: 'check-sso',
      checkLoginIframe: false,
      silentCheckSsoRedirectUri: undefined,
    })

    if (authenticated) {
      const profile = keycloak.tokenParsed as {
        sub?: string
        email?: string
        name?: string
        preferred_username?: string
      }
      user.value = {
        id: profile.sub || '',
        email: profile.email || '',
        displayName: profile.name || profile.preferred_username || profile.email || '',
      }

    }

    initialized.value = true
  }

  async function login() {
    await keycloak.login({ redirectUri: window.location.href })
  }

  async function getToken(): Promise<string> {
    await keycloak.updateToken(30)
    return keycloak.token!
  }

  async function logout() {
    await keycloak.logout({ redirectUri: window.location.origin })
  }

  return {
    user,
    isAuthenticated,
    init,
    login,
    getToken,
    logout,
  }
}
