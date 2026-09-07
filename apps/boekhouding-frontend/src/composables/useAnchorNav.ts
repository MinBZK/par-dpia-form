import { useRouter } from 'vue-router'

// NLDD components render their anchors inside a shadow root, so router-link is
// not an option there. Intercept the composed click instead and route it,
// leaving modified clicks (new tab, new window) to the browser.
export function useAnchorNav() {
  const router = useRouter()

  return (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.composedPath().find(
      (el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement,
    )
    if (!anchor || anchor.origin !== window.location.origin) return
    event.preventDefault()
    router.push(anchor.pathname)
  }
}
