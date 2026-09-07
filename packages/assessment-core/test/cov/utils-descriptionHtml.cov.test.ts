import { describe, it, expect } from 'vitest'
import { tidyDescriptionHtml } from '../../src/utils/descriptionHtml'

describe('tidyDescriptionHtml', () => {
  it('drops the newlines around a list', () => {
    const html = 'Betrek deze functies:\n<ul>\n  <li>Projectleider</li>\n  <li>Jurist</li>\n</ul>\nDaarnaast geldt:'

    expect(tidyDescriptionHtml(html)).toBe(
      'Betrek deze functies:<ul><li>Projectleider</li><li>Jurist</li></ul>Daarnaast geldt:',
    )
  })

  it('drops the newlines around a banner with attributes', () => {
    const html = 'Vooraf\n\n<nldd-banner variant="accent" icon="info-circle">\n<p>Let op.</p>\n</nldd-banner>\n\nDaarna.'

    expect(tidyDescriptionHtml(html)).toBe(
      'Vooraf<nldd-banner variant="accent" icon="info-circle"><p>Let op.</p></nldd-banner>Daarna.',
    )
  })

  it('keeps the line breaks between paragraphs of plain prose', () => {
    const html = 'Eerste alinea.\n\nTweede alinea.\nDerde regel.'

    expect(tidyDescriptionHtml(html)).toBe(html)
  })

  it('takes a task without a description', () => {
    expect(tidyDescriptionHtml(undefined)).toBe('')
  })

  it('leaves inline markup alone', () => {
    const html = 'Zie het <a href="https://example.org">document</a>\nvoor meer uitleg.'

    expect(tidyDescriptionHtml(html)).toBe(html)
  })
})
