import { computed, nextTick, ref, type Ref } from 'vue'

const PAGE_SIZE = 100

// Shared "load more" behaviour for the bounded list endpoints (projects,
// members, assessments). Mirrors the version-history load-more: dedupe by key
// so a concurrently-created row cannot duplicate or wedge the button, surface
// load failures, and hand focus to a status region when the last page loads.
export function usePaginatedList<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
  keyOf: (item: T) => string,
) {
  const items = ref<T[]>([]) as Ref<T[]>
  const total = ref(0)
  const page = ref(1)
  const loadingMore = ref(false)
  const reachedEnd = ref(false)
  const loadError = ref('')
  const loadStatus = ref('')
  const statusRef = ref<HTMLElement | null>(null)
  const hasMore = computed(() => !reachedEnd.value && items.value.length < total.value)
  const nextBatchSize = computed(() => Math.min(PAGE_SIZE, total.value - items.value.length))

  async function loadFirst() {
    const res = await fetchPage(1, PAGE_SIZE)
    items.value = res.items
    total.value = res.total
    page.value = 1
    reachedEnd.value = false
  }

  async function loadMore() {
    loadingMore.value = true
    loadError.value = ''
    try {
      const res = await fetchPage(page.value + 1, PAGE_SIZE)
      page.value += 1
      total.value = res.total
      const seen = new Set(items.value.map(keyOf))
      const fresh = res.items.filter((i) => !seen.has(keyOf(i)))
      if (fresh.length === 0) reachedEnd.value = true
      else items.value.push(...fresh)
      loadStatus.value = hasMore.value
        ? `${items.value.length} van ${total.value} geladen`
        : `Alle ${items.value.length} geladen`
      if (!hasMore.value) {
        await nextTick()
        statusRef.value?.focus()
      }
    } catch {
      loadError.value = 'Meer laden is mislukt. Probeer het opnieuw.'
    } finally {
      loadingMore.value = false
    }
  }

  return {
    items, total, page, loadingMore, reachedEnd, loadError, loadStatus, statusRef,
    hasMore, nextBatchSize, loadFirst, loadMore,
  }
}
