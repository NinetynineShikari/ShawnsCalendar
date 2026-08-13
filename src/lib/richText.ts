import type { RichTag } from '../types'

const TAG_ORDER: RichTag[] = ['b', 'i', 'u', 's', 'hl']
const HTML_TAG: Record<RichTag, string> = { b: 'strong', i: 'em', u: 'u', s: 's', hl: 'mark' }

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function tkIndexToOffset(text: string, index: string): number {
  const match = /^(\d+)\.(\d+)$/.exec(index)
  if (!match) return 0
  const line = Math.max(1, Number(match[1]))
  const column = Math.max(0, Number(match[2]))
  const lines = text.split('\n')
  let offset = 0
  for (let current = 1; current < line && current <= lines.length; current += 1) offset += lines[current - 1].length + 1
  return Math.min(text.length, offset + column)
}

export function legacyRichTextToHtml(
  text: string,
  tags: Partial<Record<RichTag, [string, string][]>> | undefined,
): string {
  if (!text) return ''
  const ranges = TAG_ORDER.flatMap((tag) => (tags?.[tag] ?? []).map(([start, end]) => ({
    tag,
    start: tkIndexToOffset(text, start),
    end: tkIndexToOffset(text, end),
  }))).filter(({ start, end }) => end > start)

  const boundaries = [...new Set([0, text.length, ...ranges.flatMap(({ start, end }) => [start, end])])].sort((a, b) => a - b)
  let html = ''
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index]
    const end = boundaries[index + 1]
    const active = TAG_ORDER.filter((tag) => ranges.some((range) => range.tag === tag && range.start <= start && range.end >= end))
    let part = escapeHtml(text.slice(start, end)).replace(/\n/g, '<br>')
    for (const tag of active) part = `<${HTML_TAG[tag]}>${part}</${HTML_TAG[tag]}>`
    html += part
  }
  return html
}

export function richTextToPlainText(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return document.body.innerText.replace(/\u00a0/g, ' ')
}
