export interface VersionInfo {
  version: string
  commit: string
  channel: string
}

const DEV_FALLBACK: VersionInfo = { version: 'dev', commit: 'dev', channel: 'dev' }

export async function loadVersion(): Promise<VersionInfo> {
  try {
    const res = await fetch('/version.json')
    return (await res.json()) as VersionInfo
  } catch {
    return { ...DEV_FALLBACK }
  }
}
