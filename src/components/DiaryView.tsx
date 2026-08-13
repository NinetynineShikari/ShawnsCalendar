import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Search, Star } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { parseDateKey } from '../lib/dates'
import type { ScheduleData } from '../types'
import { RichEditor } from './RichEditor'

interface DiaryEntry {
  date: string
  plainText: string
  html: string
  highlighted: boolean
}

interface Props {
  data: ScheduleData
  selectedKey: string | null
  rangeStart: string
  rangeEnd: string
  importantOnly: boolean
  query: string
  onSelect: (key: string) => void
  onRangeStartChange: (value: string) => void
  onRangeEndChange: (value: string) => void
  onImportantOnlyChange: (value: boolean) => void
  onQueryChange: (value: string) => void
  onChange: (key: string, html: string) => void
  onToggleHighlight: (key: string) => void
  resolveHtml: (key: string) => string
}

const fullDate = (key: string) => format(parseDateKey(key), 'yyyy年 M月d日 EEEE', { locale: zhCN })

export function DiaryView({
  data,
  selectedKey,
  rangeStart,
  rangeEnd,
  importantOnly,
  query,
  onSelect,
  onRangeStartChange,
  onRangeEndChange,
  onImportantOnlyChange,
  onQueryChange,
  onChange,
  onToggleHighlight,
  resolveHtml,
}: Props) {
  const entries = useMemo<DiaryEntry[]>(() => Object.entries(data.diary)
    .filter(([, text]) => text.trim().length > 0)
    .map(([date, plainText]) => ({
      date,
      plainText,
      html: resolveHtml(date),
      highlighted: data.diary_highlighted[date] === true,
    }))
    .filter((entry) => (!rangeStart || entry.date >= rangeStart) && (!rangeEnd || entry.date <= rangeEnd))
    .filter((entry) => !importantOnly || entry.highlighted)
    .filter((entry) => !query.trim() || entry.plainText.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date)), [data.diary, data.diary_highlighted, importantOnly, query, rangeEnd, rangeStart, resolveHtml])

  useEffect(() => {
    if (entries.length && !entries.some((entry) => entry.date === selectedKey)) onSelect(entries[0].date)
  }, [entries, onSelect, selectedKey])

  const selectedExists = selectedKey && entries.some((entry) => entry.date === selectedKey)

  return <>
    <aside className="diary-index-panel">
      <div className="diary-filters">
        <div className="date-range-filter">
          <input type="date" value={rangeStart} max={rangeEnd || undefined} aria-label="日记起始日期" onChange={(event) => onRangeStartChange(event.target.value)} />
          <span>至</span>
          <input type="date" value={rangeEnd} min={rangeStart || undefined} aria-label="日记结束日期" onChange={(event) => onRangeEndChange(event.target.value)} />
        </div>
        <button className={`important-filter ${importantOnly ? 'active' : ''}`} onClick={() => onImportantOnlyChange(!importantOnly)} aria-pressed={importantOnly}>
          <Star />重点日记
        </button>
        <label className="diary-search">
          <Search />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索日记内容" />
        </label>
      </div>

      <div className="diary-list">
        {entries.length === 0
          ? <div className="diary-list-empty"><Search /><p>没有找到符合条件的日记</p></div>
          : entries.map((entry) => <button
              key={entry.date}
              className={`diary-list-item ${entry.highlighted ? 'highlighted' : ''} ${selectedKey === entry.date ? 'selected' : ''}`}
              onClick={() => onSelect(entry.date)}
            >
              <span className="diary-list-title"><strong>{fullDate(entry.date)}</strong>{entry.highlighted && <em><Star />重点</em>}</span>
              <span className="diary-list-preview">{entry.plainText.replace(/\s+/g, ' ')}</span>
            </button>)}
      </div>
    </aside>

    <main className="diary-detail-panel">
      {selectedKey && selectedExists
        ? <RichEditor
            key={`diary-browser-${selectedKey}`}
            eyebrow="DIARY"
            label={fullDate(selectedKey)}
            html={resolveHtml(selectedKey)}
            placeholder="记下这一天发生的事，或当时的想法…"
            highlighted={data.diary_highlighted[selectedKey] === true}
            onToggleHighlight={() => onToggleHighlight(selectedKey)}
            onChange={(html) => onChange(selectedKey, html)}
          />
        : <div className="diary-detail-empty"><Star /><h2>选择一篇日记</h2><p>从左侧列表中选择日记后，可在这里查看和继续编辑。</p></div>}
    </main>
  </>
}
