import { ref, computed } from 'vue'
import Keycloak from 'keycloak-js'
import { getConfig } from '../config'

let keycloak: Keycloak

const user = ref<{ id: string; email: string; displayName: string } | null>(null)
const initialized = ref(false)

export function useAuth() {
  const isAuthenticated = computed(() => keycloak?.authenticated === true)

  async function init() {
    if (initialized.value) return

    const config = getConfig()
    keycloak = new Keycloak({
      url: config.keycloakUrl,
      realm: config.keycloakRealm,
      clientId: config.keycloakClientId,
    })

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
    await keycloak.login({ redirectUri: `${window.location.origin}/projecten` })
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
