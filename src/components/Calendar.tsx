import { useMemo } from 'react'
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dateKey, sameLocalDate } from '../lib/dates'

interface Props {
  month: Date
  selected: Date
  datesWithTodos: Set<string>
  onMonthChange: (month: Date) => void
  onSelect: (date: Date) => void
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export function Calendar({ month, selected, datesWithTodos, onMonthChange, onSelect }: Props) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    const output: Date[] = []
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) output.push(cursor)
    return output
  }, [month])

  return <section className="calendar-card" aria-label="月历">
    <div className="calendar-heading">
      <div>
        <span className="eyebrow">CALENDAR</span>
        <h2>{format(month, 'yyyy年 M月', { locale: zhCN })}</h2>
      </div>
      <div className="month-actions">
        <button className="icon-button" onClick={() => onMonthChange(addMonths(month, -1))} aria-label="上个月"><ChevronLeft /></button>
        <button className="today-button" onClick={() => { const today = new Date(); onMonthChange(today); onSelect(today) }}>今天</button>
        <button className="icon-button" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="下个月"><ChevronRight /></button>
      </div>
    </div>
    <div className="calendar-grid weekdays">
      {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
    </div>
    <div className="calendar-grid days">
      {days.map((day) => {
        const key = dateKey(day)
        const selectedDay = sameLocalDate(day, selected)
        const today = sameLocalDate(day, new Date())
        return <button
          className={`calendar-day ${selectedDay ? 'selected' : ''} ${today ? 'today' : ''} ${!isSameMonth(day, month) ? 'muted' : ''}`}
          key={key}
          onClick={() => onSelect(day)}
          aria-pressed={selectedDay}
        >
          <span>{format(day, 'd')}</span>
          {datesWithTodos.has(key) && <i />}
        </button>
      })}
    </div>
  </section>
}
