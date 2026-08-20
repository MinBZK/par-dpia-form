import { describe, it, expect, vi } from 'vitest'
import { usePaginatedList } from '../../src/composables/usePaginatedList'

const item = (id: string) => ({ id })
const keyOf = (i: { id: string }) => i.id

describe('usePaginatedList', () => {
  it('loadFirst sets the first page', async () => {
    const list = usePaginatedList(async () => ({ items: [item('a'), item('b')], total: 5 }), keyOf)
    await list.loadFirst()
    expect(list.items.value.map(keyOf)).toEqual(['a', 'b'])
    expect(list.total.value).toBe(5)
    expect(list.hasMore.value).toBe(true)
    expect(list.nextBatchSize.value).toBe(3)
  })

  it('loadMore appends deduped items and announces progress while more remain', async () => {
    const pages = [
      { items: [item('a'), item('b')], total: 4 },
      { items: [item('b'), item('c')], total: 4 }, // b overlaps -> deduped
    ]
    let call = 0
    const list = usePaginatedList(async () => pages[call++], keyOf)
    await list.loadFirst()
    await list.loadMore()
    expect(list.items.value.map(keyOf)).toEqual(['a', 'b', 'c'])
    expect(list.hasMore.value).toBe(true)
    expect(list.loadStatus.value).toContain('3 van 4')
  })

  it('loadMore stops at reachedEnd when nothing new arrives and focuses the status region', async () => {
    const pages = [
      { items: [item('a'), item('b')], total: 4 },
      { items: [item('a')], total: 4 }, // fully overlapping -> fresh empty
    ]
    let call = 0
    const list = usePaginatedList(async () => pages[call++], keyOf)
    await list.loadFirst()
    const focus = vi.fn()
    list.statusRef.value = { focus } as unknown as HTMLElement
    await list.loadMore()
    expect(list.reachedEnd.value).toBe(true)
    expect(list.hasMore.value).toBe(false)
    expect(list.loadStatus.value).toContain('Alle 2')
    expect(focus).toHaveBeenCalled()
  })

  it('loadMore reaching the end without a bound status ref does not throw', async () => {
    const pages = [
      { items: [item('a')], total: 2 },
      { items: [item('b')], total: 2 },
    ]
    let call = 0
    const list = usePaginatedList(async () => pages[call++], keyOf)
    await list.loadFirst()
    await list.loadMore()
    expect(list.hasMore.value).toBe(false)
    expect(list.items.value.map(keyOf)).toEqual(['a', 'b'])
  })

  it('loadMore surfaces an error when the fetch fails', async () => {
    let call = 0
    const list = usePaginatedList(async () => {
      if (call++ === 0) return { items: [item('a')], total: 3 }
      throw new Error('netwerk')
    }, keyOf)
    await list.loadFirst()
    await list.loadMore()
    expect(list.loadError.value).toContain('mislukt')
    expect(list.loadingMore.value).toBe(false)
  })
})
