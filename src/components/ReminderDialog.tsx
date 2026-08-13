import { useEffect, useState } from 'react'
import { Bell, CalendarDays, Clock, Repeat2, X } from 'lucide-react'
import type { Todo } from '../types'
import { dateKey } from '../lib/dates'

interface Props {
  todo: Todo
  fallbackDate: Date
  onClose: () => void
  onSave: (reminder: string | null, repeats: boolean) => void
}

export function ReminderDialog({ todo, fallbackDate, onClose, onSave }: Props) {
  const [date, setDate] = useState(todo.reminder_time?.slice(0, 10) ?? dateKey(fallbackDate))
  const [time, setTime] = useState(todo.reminder_time?.slice(11, 16) ?? '09:00')
  const [repeats, setRepeats] = useState(todo.repeat_weekly)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="reminder-title">
      <header>
        <div className="modal-icon"><Bell /></div>
        <div><span className="eyebrow">REMINDER</span><h2 id="reminder-title">设置提醒</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button>
      </header>
      <p className="modal-task">{todo.task || '未命名待办'}</p>
      <div className="field-row">
        <label><span><CalendarDays />日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span><Clock />时间</span><input type="time" step="300" value={time} onChange={(event) => setTime(event.target.value)} /></label>
      </div>
      <label className="repeat-toggle">
        <span><Repeat2 /><span><b>每周重复</b><small>在每周同一天和时间提醒</small></span></span>
        <input type="checkbox" checked={repeats} onChange={(event) => setRepeats(event.target.checked)} />
      </label>
      <footer>
        {todo.reminder_time && <button className="text-button danger" onClick={() => onSave(null, false)}>清除提醒</button>}
        <span />
        <button className="secondary-button" onClick={onClose}>取消</button>
        <button className="primary-button" disabled={!date || !time} onClick={() => onSave(`${date} ${time}`, repeats)}>保存提醒</button>
      </footer>
    </section>
  </div>
}
