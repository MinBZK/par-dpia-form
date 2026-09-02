import { onUnmounted, watch, type Ref } from 'vue'
import { useCollaborationStore } from '../stores/collaboration'
import '@nldd/design-system/button'

/**
 * Observes the DOM for field labels and injects comment buttons.
 *
 * The label container gets flex styling so the button sits at the right of the
 * label row, before the description.
 */
export function useFieldCommentIndicators(
  containerRef: Ref<HTMLElement | null>,
  onFieldClick: (fieldId: string) => void,
  canComment: Ref<boolean>,
) {
  const commentStore = useCollaborationStore()
  const injectedElements = new Map<string, HTMLElement>()
  let observer: MutationObserver | null = null
  let isInjecting = false

  // In a toolbar the button is an icon-button like the ones beside it: same
  // square footprint, same flat ground, so the row reads as one control strip
  // rather than a text button parked next to a switch. Elsewhere it keeps its
  // label, because there it stands alone under a question.
  function createButton(fieldId: string, count: number): HTMLElement {
    const btn = document.createElement('nldd-button')
    btn.setAttribute('size', 'xs')
    btn.setAttribute('variant', 'accent-transparent')
    btn.setAttribute('start-icon', 'comment')
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onFieldClick(fieldId)
    })
    updateButton(btn, count)
    return btn
  }

  function updateButton(btn: HTMLElement, count: number) {
    if (count > 0) {
      btn.setAttribute('text', `Opmerking (${count})`)
      btn.setAttribute('accessible-label', `${count} opmerking${count > 1 ? 'en' : ''} bij deze vraag`)
    } else {
      btn.setAttribute('text', 'Opmerking')
      btn.setAttribute('accessible-label', 'Opmerking toevoegen bij deze vraag')
    }
  }


  // FormField renders the label block and the field itself as siblings with no
  // wrapper around the pair, so a question is a label plus everything up to and
  // including the first field after it. Anything past that is the next question.
  function fieldRegionOf(labelContainer: Element): Element[] {
    const region: Element[] = [labelContainer]
    let el = labelContainer.nextElementSibling
    while (el) {
      // Another label means we walked into the next question.
      if (el.classList.contains('form-field__label')) break
      region.push(el)
      if (el.classList.contains('field-group')) break
      el = el.nextElementSibling
    }
    return region
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
          existing.remove()
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

      // One place for every question: on its own line under the field. The
      // button used to sit in the label row, and in an open-text field's own
      // toolbar — two placements, and in a task group the row of labels ended up
      // carrying controls that belong to the answer below them.
      const labelContainer = label.closest('.form-field__label')
      btn = createButton(fieldId, count)
      btn.classList.add('comment-field-label__btn')

      const row = document.createElement('div')
      row.className = 'comment-field-row'
      row.appendChild(btn)

      // After the field that belongs to this label; without a label container
      // there is nothing to walk from, so it goes straight after the label.
      const field = labelContainer && fieldRegionOf(labelContainer).at(-1)
      if (field) field.after(row)
      else label.after(row)

      injectedElements.set(fieldId, btn)
    }

    // Clean up indicators for fields no longer in the DOM
    for (const [fieldId, btn] of injectedElements) {
      if (!seenFieldIds.has(fieldId)) {
        btn.remove()
        injectedElements.delete(fieldId)
      }
    }

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
      btn.remove()
    }
    injectedElements.clear()
  }

  watch(
    () => commentStore.unresolvedCountByField,
    () => scanAndInject(),
  )

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
