/** Resize a textarea to fit its content. Height goes via the `--autogrow-height`
 * custom property (+ `.autogrow-textarea` in base.css), not an inline style, so a
 * strict CSP without `style-src 'unsafe-inline'` keeps working. */
export function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.classList.add('autogrow-textarea')
  el.style.setProperty('--autogrow-height', 'auto')
  el.style.setProperty('--autogrow-height', el.scrollHeight + 'px')
}
