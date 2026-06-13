import { ref, computed } from 'vue'
import Keycloak from 'keycloak-js'
import { getConfig } from '../config'

let keycloak: Keycloak

const user = ref<{ id: string; email: string; displayName: string } | null>(null)
const initialized = ref(false)
const sessionExpired = ref(false)

const REFRESH_INTERVAL_MS = 240_000 // 4 minutes
const TOKEN_MIN_VALIDITY_S = 70 // seconds before expiry to trigger refresh

let refreshInterval: ReturnType<typeof setInterval> | null = null

export class SessionExpiredError extends Error {
  constructor() {
    super('Sessie verlopen')
    this.name = 'SessionExpiredError'
  }
}

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

      function refreshOrExpire() {
        keycloak.updateToken(TOKEN_MIN_VALIDITY_S).catch(() => {
          sessionExpired.value = true
        })
      }

      keycloak.onTokenExpired = refreshOrExpire
      keycloak.onAuthRefreshError = () => { sessionExpired.value = true }
      refreshInterval = setInterval(refreshOrExpire, REFRESH_INTERVAL_MS)
    }

    initialized.value = true
  }

  async function login() {
    await keycloak.login({ redirectUri: `${window.location.origin}/projecten` })
  }

  async function getToken(): Promise<string> {
    if (sessionExpired.value) {
      throw new SessionExpiredError()
    }
    try {
      await keycloak.updateToken(30)
    } catch {
      sessionExpired.value = true
      throw new SessionExpiredError()
    }
    return keycloak.token!
  }

  async function relogin(): Promise<void> {
    sessionStorage.setItem('auth:relogin', JSON.stringify({
      userId: keycloak.subject,
    }))
    await keycloak.login({ redirectUri: window.location.href })
  }

  async function logout() {
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
    await keycloak.logout({ redirectUri: window.location.origin })
  }

  return {
    user,
    isAuthenticated,
    sessionExpired,
    init,
    login,
    getToken,
    relogin,
    logout,
  }
}
