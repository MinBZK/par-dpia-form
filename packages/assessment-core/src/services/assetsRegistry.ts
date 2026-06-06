type AssetsRegistry = {
  [key: string]: string | Promise<string>
}

export const _assetRegistry: AssetsRegistry = {}

const _filePaths: Record<string, string> = {}
const _pendingFetches: Record<string, Promise<string>> = {}

const _assets = import.meta.glob(['../assets/fonts/**.ttf', '../assets/images/**.*'], {
  eager: true,
  query: '?url',
  import: 'default'
})

const _isDevelopment = (url: string) => {
  return url.startsWith('/')
}

async function _fetchAndEncode(url: string): Promise<string> {
  // Return existing promise if there's already a fetch in progress
  const pendingFetch = _pendingFetches[url]
  if (pendingFetch) {
    return pendingFetch
  }

  // Start a new fetch and cache the promise
  const fetchPromise = new Promise<string>(async (resolve) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()

      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = reader.result as string
        delete _pendingFetches[url]
        resolve(dataUrl)
      }
      reader.readAsDataURL(blob)
    } catch (error) {
      console.error(`Failed to fetch and encode asset: ${url}`, error)
      delete _pendingFetches[url]
      resolve('') // Return empty string on error
    }
  })
  _pendingFetches[url] = fetchPromise
  return fetchPromise
}

// The dev flag is a parameter (not read from the env) so both arms are unit-testable.
export function _registerAsset(filename: string, url: string, isDev: boolean) {
  if (isDev) {
    _filePaths[filename] = url
    _assetRegistry[filename] = url
  } else {
    _assetRegistry[filename] = url
  }
}

Object.entries(_assets).forEach(([path, url]) => {
  const filename = path.split('/').pop()!
  _registerAsset(filename, url as string, _isDevelopment(url as string))
})

export async function getAsset(filename: string): Promise<string | undefined> {
  let asset = _assetRegistry[filename]
  if (!asset) return undefined

  if (_isDevelopment(asset as string)) {
    const path = _filePaths[filename]
    if (!path) return undefined
    const dataUrl = await _fetchAndEncode(path)
    _assetRegistry[filename] = dataUrl
    asset = dataUrl
  }
  return (<string>asset).split(',')[1]
}
