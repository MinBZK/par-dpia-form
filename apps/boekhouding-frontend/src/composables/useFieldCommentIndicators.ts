import { onUnmounted, watch, type Ref } from 'vue'
import { useCollaborationStore } from '../stores/collaboration'
import '@nldd/design-system/button'

/**
 * Observes the DOM for field labels and injects comment buttons.
 *
 * For open_text fields (which have an .open-text-field__toggle button),
 * the comment button is placed next to the toggle in the same flex row.
 *
 * For other fields, the label container gets flex styling so the button
 * appears on the right side of the label.
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

      // Create new button
      btn = createButton(fieldId, count)

      // Find the label container (parent div.form-field__label)
      const labelContainer = label.closest('.form-field__label')
      if (!labelContainer) {
        // Fallback: insert after the label element
        label.parentElement?.insertBefore(btn, label.nextSibling)
        injectedElements.set(fieldId, btn)
        continue
      }

      // Check if this is an open_text field (has toggle button)
      const toggle = labelContainer.querySelector('.open-text-field__toggle')

      if (toggle) {
        // Insert BEFORE the toggle — then move margin-auto to our button
        // so both buttons group on the right
        btn.classList.add('comment-field-label__btn')
        labelContainer.insertBefore(btn, toggle)
      } else {
        // Non-open_text: make the label container flex and add the button
        labelContainer.classList.add('comment-field-label--flex')
        btn.classList.add('comment-field-label__btn')

        // Insert before the description (if any) or at the end
        const description = labelContainer.querySelector('.form-field__description')
        if (description) {
          labelContainer.insertBefore(btn, description)
        } else {
          labelContainer.appendChild(btn)
        }
      }

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
