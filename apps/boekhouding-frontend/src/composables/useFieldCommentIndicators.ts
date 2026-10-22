import { onUnmounted, watch, type Ref } from 'vue'
import { useCollaborationStore } from '../stores/collaboration'
import '@nldd/design-system/button'

/**
 * Observes the DOM for field labels and injects comment buttons.
 *
 * The button goes into the label block, to the right of the question itself:
 * that is where you look to see whether a question carries a comment. The block
 * becomes a grid for it, so the description underneath keeps the full width.
 *
 * The question the panel is showing is marked in the form as well, so the two
 * columns say the same thing without the reader having to match titles.
 */
export function useFieldCommentIndicators(
  containerRef: Ref<HTMLElement | null>,
  onFieldClick: (fieldId: string) => void,
  canComment: Ref<boolean>,
  activeFieldId?: Ref<string | null>,
) {
  const commentStore = useCollaborationStore()
  const injectedElements = new Map<string, HTMLElement>()
  const ACTIVE_CLASS = 'comment-field-label--active'
  let observer: MutationObserver | null = null
  let isInjecting = false

  // The grid only exists for the button; without one the label block goes back
  // to being a plain column.
  function removeButton(btn: HTMLElement) {
    const labelContainer = btn.closest('.form-field__label')
    btn.remove()
    if (labelContainer && !labelContainer.querySelector('.comment-field-label__btn')) {
      labelContainer.classList.remove('comment-field-label--grid', ACTIVE_CLASS)
    }
  }

  function markActive() {
    const active = activeFieldId?.value
    for (const [fieldId, btn] of injectedElements) {
      btn.closest('.form-field__label')?.classList.toggle(ACTIVE_CLASS, fieldId === active)
    }
  }

  function createButton(fieldId: string, count: number): HTMLElement {
    const btn = document.createElement('nldd-button')
    btn.setAttribute('size', 'xs')
    btn.setAttribute('start-icon', 'comment')
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onFieldClick(fieldId)
    })
    updateButton(btn, count)
    return btn
  }

  // A question that carries comments says so with a filled button and the
  // count, which reads at a glance down a column of questions. One that carries
  // none keeps the word: an icon on its own was not enough of an invitation to
  // be recognised as the way to leave a comment.
  function updateButton(btn: HTMLElement, count: number) {
    if (count > 0) {
      btn.setAttribute('appearance', 'accent-filled')
      btn.setAttribute('text', `Opmerking (${count})`)
      btn.setAttribute('accessible-label', `${count} opmerking${count > 1 ? 'en' : ''} bij deze vraag`)
    } else {
      btn.setAttribute('appearance', 'accent-transparent')
      btn.setAttribute('text', 'Opmerking')
      btn.setAttribute('accessible-label', 'Opmerking toevoegen bij deze vraag')
    }
  }


  function scanAndInject() {
    const container = containerRef.value
    if (!container || isInjecting) return

    // Disconnect observer while we modify the DOM to prevent infinite loop.
    // The isInjecting flag alone is insufficient because MutationObserver
    // callbacks fire asynchronously — by the time they run, isInjecting
    // is already false again.
    isInjecting = true
    observer?.disconnect()

    const labels = container.querySelectorAll<HTMLElement>('[id^="label-"]')
    const seenFieldIds = new Set<string>()

    for (const label of labels) {
      const idParts = label.id.replace('label-', '').split('-')
      if (idParts.length < 2) continue

      const fieldId = idParts.slice(1).join('-')
      seenFieldIds.add(fieldId)

      const count = commentStore.unresolvedCountByField.get(fieldId) || 0

      // Don't show button if user can't comment and there are no comments
      if (!canComment.value && count === 0) {
        const existing = injectedElements.get(fieldId)
        if (existing) {
          removeButton(existing)
          injectedElements.delete(fieldId)
        }
        continue
      }

      // Update existing button
      let btn = injectedElements.get(fieldId)
      if (btn) {
        updateButton(btn, count)
        continue
      }

      // Beside the question, in the label block. The class turns that block
      // into the grid that reserves the right-hand slot; without a block to go
      // in, the button falls back to its own row under the label.
      const labelContainer = label.closest('.form-field__label')
      btn = createButton(fieldId, count)
      btn.classList.add('comment-field-label__btn')

      if (labelContainer) {
        labelContainer.classList.add('comment-field-label--grid')
        labelContainer.appendChild(btn)
      } else {
        const row = document.createElement('div')
        row.className = 'comment-field-row'
        row.appendChild(btn)
        label.after(row)
      }

      injectedElements.set(fieldId, btn)
    }

    // Clean up indicators for fields no longer in the DOM
    for (const [fieldId, btn] of injectedElements) {
      if (!seenFieldIds.has(fieldId)) {
        removeButton(btn)
        injectedElements.delete(fieldId)
      }
    }

    markActive()

    // Reconnect observer now that DOM modifications are done
    if (observer) {
      observer.observe(container, { childList: true, subtree: true })
    }
    isInjecting = false
  }

  function startObserving(container: HTMLElement) {
    if (observer) return

    observer = new MutationObserver(() => {
      scanAndInject()
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
    })

    // Initial scan
    scanAndInject()
  }

  function stopObserving() {
    if (observer) {
      observer.disconnect()
      observer = null
    }
    for (const btn of injectedElements.values()) {
      removeButton(btn)
    }
    injectedElements.clear()
  }

  watch(
    () => commentStore.unresolvedCountByField,
    () => scanAndInject(),
  )

  watch(() => activeFieldId?.value, () => markActive())

  watch(containerRef, (el) => {
    if (el) {
      startObserving(el)
    } else {
      stopObserving()
    }
  }, { immediate: true })

  onUnmounted(() => {
    stopObserving()
  })

  return { scanAndInject }
}
