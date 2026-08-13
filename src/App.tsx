import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CalendarDays, CloudOff, Leaf, Moon, Sun } from 'lucide-react'
import { Calendar } from './components/Calendar'
import { RichEditor } from './components/RichEditor'
import { ReminderDialog } from './components/ReminderDialog'
import { TodoList, type VisibleTodo } from './components/TodoList'
import { dateKey, occurrenceForDate, parseDateKey, weekKey, weekdayIndex } from './lib/dates'
import { legacyRichTextToHtml, richTextToPlainText } from './lib/richText'
import type { ScheduleData, Todo } from './types'
import './styles.css'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const newTodo = (task: string): Todo => ({
  uid: crypto.randomUUID(),
  task,
  done: false,
  highlighted: false,
  reminder_time: null,
  repeat_weekly: false,
})

function App() {
  const [data, setData] = useState<ScheduleData | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [visibleMonth, setVisibleMonth] = useState(new Date())
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [reminderTarget, setReminderTarget] = useState<VisibleTodo | null>(null)
  const firstLoad = useRef(true)
  const saveSequence = useRef(0)

  useEffect(() => {
    window.scheduleAPI.loadData().then((loaded) => {
      setData(loaded)
      const todayKey = dateKey(new Date())
      if (!loaded.todos[todayKey] && Object.keys(loaded.todos).length) {
        // Still open on today; historical dates remain one click away in the calendar.
      }
    })
  }, [])

  useEffect(() => {
    if (!data) return
    document.documentElement.dataset.theme = data.settings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : data.settings.theme
  }, [data?.settings.theme])

  useEffect(() => {
    if (!data) return
    if (firstLoad.current) {
      firstLoad.current = false
      return
    }
    const sequence = ++saveSequence.current
    setSaveStatus('saving')
    const timer = window.setTimeout(async () => {
      const result = await window.scheduleAPI.saveData(data)
      if (sequence !== saveSequence.current) return
      if (result.ok) {
        setSaveStatus('saved')
        setSavedAt(new Date(result.savedAt))
      } else {
        setSaveStatus('error')
      }
    }, 450)
    return () => window.clearTimeout(timer)
  }, [data])

  const selectedKey = dateKey(selectedDate)
  const selectedWeek = weekKey(selectedDate)

  const visibleTodos = useMemo<VisibleTodo[]>(() => {
    if (!data) return []
    const direct = (data.todos[selectedKey] ?? []).map((todo) => ({
      todo,
      ownerDate: selectedKey,
      projected: false,
      displayReminder: todo.reminder_time,
    }))
    const projected: VisibleTodo[] = []
    for (const [ownerDate, todos] of Object.entries(data.todos)) {
      if (ownerDate === selectedKey) continue
      for (const todo of todos) {
        if (!todo.repeat_weekly || !todo.reminder_time) continue
        const reminderDate = parseDateKey(todo.reminder_time.slice(0, 10))
        if (weekdayIndex(reminderDate) === weekdayIndex(selectedDate)) {
          projected.push({ todo, ownerDate, projected: true, displayReminder: occurrenceForDate(todo.reminder_time, selectedDate) })
        }
      }
    }
    return [...direct, ...projected]
  }, [data, selectedDate, selectedKey])

  const mutate = useCallback((recipe: (draft: ScheduleData) => void) => {
    setData((current) => {
      if (!current) return current
      const copy = structuredClone(current)
      recipe(copy)
      return copy
    })
  }, [])

  const addTodo = () => {
    const todo = newTodo('')
    mutate((draft) => {
      draft.todos[selectedKey] = [...(draft.todos[selectedKey] ?? []), todo]
    })
    return todo.uid
  }

  const updateTodo = (ownerDate: string, uid: string, patch: Partial<Todo>) => mutate((draft) => {
    const todo = draft.todos[ownerDate]?.find((entry) => entry.uid === uid)
    if (todo) Object.assign(todo, patch)
  })

  const reorderTodos = (ownerDate: string, draggedUid: string, targetUid: string, position: 'before' | 'after') => mutate((draft) => {
    const todos = draft.todos[ownerDate]
    if (!todos) return
    const from = todos.findIndex((todo) => todo.uid === draggedUid)
    if (from < 0 || draggedUid === targetUid) return
    const [dragged] = todos.splice(from, 1)
    const targetAfterRemoval = todos.findIndex((todo) => todo.uid === targetUid)
    if (targetAfterRemoval < 0) return
    const insertionIndex = position === 'before' ? targetAfterRemoval : targetAfterRemoval + 1
    todos.splice(insertionIndex, 0, dragged)
  })

  const deleteTodo = (ownerDate: string, uid: string) => mutate((draft) => {
    const todo = draft.todos[ownerDate]?.find((entry) => entry.uid === uid)
    if (!todo) return
    draft.todos[ownerDate] = draft.todos[ownerDate].filter((entry) => entry.uid !== uid)
    if (draft.todos[ownerDate].length === 0) delete draft.todos[ownerDate]
  })

  const confirmDeleteTodo = (ownerDate: string, uid: string) => {
    const todo = data?.todos[ownerDate]?.find((entry) => entry.uid === uid)
    if (!todo) return
    const detail = todo.repeat_weekly ? '这是每周重复事项，删除后将同时停止之后的提醒。' : '删除后无法从应用内撤销。'
    if (window.confirm(`确定删除“${todo.task || '未命名待办'}”吗？\n${detail}`)) deleteTodo(ownerDate, uid)
  }

  const datesWithTodos = useMemo(() => new Set(Object.entries(data?.todos ?? {})
    .filter(([, todos]) => todos.length > 0)
    .map(([date]) => date)), [data?.todos])

  if (!data) return <main className="loading-screen"><Leaf /><p>正在整理你的日程…</p></main>

  const currentTheme = document.documentElement.dataset.theme ?? 'light'
  const goalHtml = data.goal_html[selectedWeek] ?? legacyRichTextToHtml(data.goals[selectedWeek] ?? '', data.goal_tags[selectedWeek])
  const diaryHtml = data.diary_html[selectedKey] ?? legacyRichTextToHtml(data.diary[selectedKey] ?? '', data.diary_tags[selectedKey])

  const updateRichText = (kind: 'goal' | 'diary', key: string, html: string) => mutate((draft) => {
    if (kind === 'goal') {
      draft.goal_html[key] = html
      draft.goals[key] = richTextToPlainText(html)
    } else {
      draft.diary_html[key] = html
      draft.diary[key] = richTextToPlainText(html)
    }
  })

  return <div className={`app-shell platform-${window.scheduleAPI.platform}`}>
    <header className="topbar">
      <div className="selected-date-heading">
        <CalendarDays />
        <div><strong>{format(selectedDate, 'M月d日 EEEE', { locale: zhCN })}</strong><span>{format(selectedDate, 'yyyy')}</span></div>
      </div>
      <div className={`save-indicator ${saveStatus}`}>
        {saveStatus === 'error' ? <CloudOff /> : <i />}
        <span>{saveStatus === 'saving' ? '正在保存…' : saveStatus === 'error' ? '保存失败' : savedAt ? `${format(savedAt, 'HH:mm')} 已保存` : '本地自动保存'}</span>
      </div>
      <button
        className="icon-button theme-toggle"
        aria-label="切换深浅模式"
        onClick={() => mutate((draft) => { draft.settings.theme = currentTheme === 'dark' ? 'light' : 'dark' })}
      >{currentTheme === 'dark' ? <Sun /> : <Moon />}</button>
    </header>

    <aside className="calendar-panel">
      <Calendar month={visibleMonth} selected={selectedDate} datesWithTodos={datesWithTodos} onMonthChange={setVisibleMonth} onSelect={(date) => { setSelectedDate(date); setVisibleMonth(date) }} />
      <div className="sidebar-goal">
        <RichEditor key={`goal-${selectedWeek}`} eyebrow="WEEKLY INTENTION" label="本周总体目标" html={goalHtml} placeholder="这一周，什么事情最值得完成？" onChange={(html) => updateRichText('goal', selectedWeek, html)} />
      </div>
    </aside>

    <main className="workspace">
      <TodoList items={visibleTodos} onAdd={addTodo} onUpdate={updateTodo} onDelete={confirmDeleteTodo} onReminder={setReminderTarget} onReorder={reorderTodos} />
      <RichEditor key={`diary-${selectedKey}`} eyebrow="DAILY NOTE" label="今日日记" html={diaryHtml} placeholder="记下今天发生的事，或此刻的想法…" onChange={(html) => updateRichText('diary', selectedKey, html)} />
    </main>

    {reminderTarget && <ReminderDialog
      todo={reminderTarget.todo}
      fallbackDate={selectedDate}
      onClose={() => setReminderTarget(null)}
      onSave={(reminder, repeats) => {
        updateTodo(reminderTarget.ownerDate, reminderTarget.todo.uid, { reminder_time: reminder, repeat_weekly: repeats })
        setReminderTarget(null)
      }}
    />}
  </div>
}

export default App
