export interface AppConfig {
  keycloakUrl: string
  keycloakRealm: string
  keycloakClientId: string
  standaloneUrl: string
}

let config: AppConfig

export async function loadConfig(): Promise<AppConfig> {
  try {
    const res = await fetch('/config.json')
    config = await res.json()
  } catch {
    // Fallback for local development (Vite dev server)
    config = {
      keycloakUrl: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
      keycloakRealm: import.meta.env.VITE_KEYCLOAK_REALM || 'invulhulpen',
      keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'boekhouding-frontend',
      standaloneUrl: import.meta.env.VITE_STANDALONE_URL || '/zonder-account/',
    }
  }
  return config
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('Config not loaded — call loadConfig() first')
  return config
}
