import { onBeforeUnmount, onMounted } from 'vue'

// Term explanations arrive as generated HTML (span.aiv-definition wrapping a
// span.aiv-definition-text), so they cannot be nldd-tooltip elements: v-html
// renders markup, not components. NLDD's own tooltip keeps itself in view with
// floating-ui; this does the same job for the markup we do have, by shifting
// the panel back inside the viewport before it is shown.
const MARGIN = 8

export function positionDefinitionPanel(term: HTMLElement, viewportWidth: number): void {
  const panel = term.querySelector<HTMLElement>('.aiv-definition-text')
  if (!panel) return

  // Measure from a clean slate: a shift left over from the previous hover would
  // be baked into the rect. The panel is display:none until :hover paints it,
  // and a hidden element has no box, so show it invisibly for the measurement.
  panel.style.removeProperty('--aiv-definition-shift')
  panel.style.visibility = 'hidden'
  panel.style.display = 'block'
  const rect = panel.getBoundingClientRect()
  panel.style.removeProperty('display')
  panel.style.removeProperty('visibility')

  let shift = 0
  if (rect.left < MARGIN) shift = MARGIN - rect.left
  else if (rect.right > viewportWidth - MARGIN) shift = viewportWidth - MARGIN - rect.right

  if (shift !== 0) panel.style.setProperty('--aiv-definition-shift', `${Math.round(shift)}px`)
}

export function useDefinitionTooltips() {
  const onEnter = (event: Event) => {
    const term = (event.target as HTMLElement | null)?.closest?.('.aiv-definition')
    if (term instanceof HTMLElement) positionDefinitionPanel(term, window.innerWidth)
  }

  onMounted(() => {
    // Capture: pointerover/focusin do bubble, but the panel must be placed
    // before the :hover rule paints it, and capture runs first.
    document.addEventListener('pointerover', onEnter, true)
    document.addEventListener('focusin', onEnter, true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerover', onEnter, true)
    document.removeEventListener('focusin', onEnter, true)
  })
}
