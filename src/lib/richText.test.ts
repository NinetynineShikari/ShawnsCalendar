import { describe, expect, it } from 'vitest'
import { legacyRichTextToHtml } from './richText'

describe('legacy rich text conversion', () => {
  it('converts tkinter line-column ranges without losing line breaks', () => {
    const html = legacyRichTextToHtml('第一行\n第二行', { hl: [['2.0', '2.3']] })
    expect(html).toBe('第一行<br><mark>第二行</mark>')
  })

  it('escapes old plain text before rendering it as HTML', () => {
    expect(legacyRichTextToHtml('<script>alert(1)</script>', {})).not.toContain('<script>')
  })
})
