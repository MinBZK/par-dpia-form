/** Resize a textarea element to fit its content. */
export function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.overflow = 'hidden'
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}
