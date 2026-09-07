import { ref } from 'vue'

export interface BackLink {
  text: string
  // Route to push; without it the back button walks the browser history.
  to?: string
}

// Module-level singleton: views declare their back link, App.vue renders it
// in the top navigation bar and clears it on every route change.
const backLink = ref<BackLink | null>(null)

export function useBackLink() {
  const set = (link: BackLink | null) => {
    backLink.value = link
  }
  return { backLink, set }
}
