import { onUnmounted, watch, type Ref } from 'vue'
import { useCollaborationStore } from '../stores/collaboration'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Creates an SVG icon matching tabler IconMessage (same as header badge). */
function createMessageIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')

  const path1 = document.createElementNS(SVG_NS, 'path')
  path1.setAttribute('d', 'M8 9h8')
  const path2 = document.createElementNS(SVG_NS, 'path')
  path2.setAttribute('d', 'M8 13h6')
  const path3 = document.createElementNS(SVG_NS, 'path')
  path3.setAttribute('d', 'M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z')

  svg.append(path1, path2, path3)
  return svg
}

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
  const injectedElements = new Map<string, HTMLButtonElement>()
  let observer: MutationObserver | null = null
  let isInjecting = false

  function createButton(fieldId: string, count: number): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onFieldClick(fieldId)
    })
    updateButton(btn, count)
    return btn
  }

  function updateButton(btn: HTMLButtonElement, count: number) {
    // Preserve layout classes that are added separately by scanAndInject
    const wasInLabelRow = btn.classList.contains('comment-field-btn--in-label-row')

    btn.textContent = ''
    btn.appendChild(createMessageIcon())

    const label = document.createElement('span')
    if (count > 0) {
      btn.className = 'comment-field-btn comment-field-btn--has-comments'
      label.textContent = `Opmerking (${count})`
      btn.setAttribute('aria-label', `${count} opmerking${count > 1 ? 'en' : ''} bij deze vraag`)
    } else {
      btn.className = 'comment-field-btn'
      label.textContent = 'Opmerking'
      btn.setAttribute('aria-label', 'Opmerking toevoegen bij deze vraag')
    }
    btn.appendChild(label)

    if (wasInLabelRow) btn.classList.add('comment-field-btn--in-label-row')
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

      // Find the label container (parent div.rvo-form-field__label)
      const labelContainer = label.closest('.rvo-form-field__label')
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
        btn.classList.add('comment-field-btn--in-label-row')
        labelContainer.insertBefore(btn, toggle)
      } else {
        // Non-open_text: make the label container flex and add the button
        labelContainer.classList.add('comment-field-label--flex')
        btn.classList.add('comment-field-btn--in-label-row')

        // Insert before the description (if any) or at the end
        const description = labelContainer.querySelector('.utrecht-form-field-description')
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

  function startObserving() {
    const container = containerRef.value
    if (!container || observer) return

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
      startObserving()
    } else {
      stopObserving()
    }
  }, { immediate: true })

  onUnmounted(() => {
    stopObserving()
  })

  return { scanAndInject }
}
