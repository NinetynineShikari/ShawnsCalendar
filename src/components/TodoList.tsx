import { useEffect, useRef, useState } from 'react'
import { Bell, BellRing, Check, GripVertical, Plus, Repeat2, Star, Trash2 } from 'lucide-react'
import type { Todo } from '../types'

export interface VisibleTodo {
  todo: Todo
  ownerDate: string
  projected: boolean
  displayReminder: string | null
}

interface Props {
  items: VisibleTodo[]
  onAdd: () => string
  onUpdate: (ownerDate: string, uid: string, patch: Partial<Todo>) => void
  onDelete: (ownerDate: string, uid: string) => void
  onReminder: (item: VisibleTodo) => void
  onReorder: (ownerDate: string, draggedUid: string, targetUid: string, position: DropPosition) => void
}

type DropPosition = 'before' | 'after'

interface DropHint {
  targetUid: string
  position: DropPosition
}

interface RowProps {
  item: VisibleTodo
  autoEdit: boolean
  dragging: boolean
  onUpdate: Props['onUpdate']
  onDelete: Props['onDelete']
  onReminder: Props['onReminder']
  onDragStart: (item: VisibleTodo, event: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (item: VisibleTodo, event: React.DragEvent) => void
  onDrop: (item: VisibleTodo, event: React.DragEvent) => void
}

function TodoRow({ item, autoEdit, dragging, onUpdate, onDelete, onReminder, onDragStart, onDragEnd, onDragOver, onDrop }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.todo.task)
  const hasMeta = item.projected || Boolean(item.displayReminder) || item.todo.highlighted

  useEffect(() => setDraft(item.todo.task), [item.todo.task])
  useEffect(() => { if (autoEdit && !item.projected) setEditing(true) }, [autoEdit, item.projected])

  const saveDraft = () => {
    const value = draft.trim()
    if (value !== item.todo.task) onUpdate(item.ownerDate, item.todo.uid, { task: value })
    setEditing(false)
  }

  return <article
    className={`todo-row ${item.todo.done ? 'done' : ''} ${item.todo.highlighted ? 'highlighted' : ''} ${dragging ? 'dragging' : ''}`}
    onDragOver={(event) => onDragOver(item, event)}
    onDrop={(event) => onDrop(item, event)}
  >
    <button
      className="drag-handle"
      draggable={!item.projected}
      disabled={item.projected}
      onDragStart={(event) => onDragStart(item, event)}
      onDragEnd={onDragEnd}
      aria-label="拖动调整顺序"
      title={item.projected ? '重复事项需在来源日期排序' : '拖动调整顺序'}
    ><GripVertical /></button>
    <button
      className="check-button"
      disabled={item.projected}
      onClick={() => onUpdate(item.ownerDate, item.todo.uid, { done: !item.todo.done })}
      aria-label={item.todo.done ? '标记为未完成' : '标记为完成'}
    >{item.todo.done && <Check />}</button>
    <div className="todo-content">
      {editing && !item.projected
        ? <input
            autoFocus
            className="todo-edit"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={saveDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveDraft()
              if (event.key === 'Escape') { setDraft(item.todo.task); setEditing(false) }
            }}
          />
        : <button className="todo-title" onClick={() => !item.projected && setEditing(true)}>{item.todo.task || '未命名待办'}</button>}
      {hasMeta && <div className="todo-meta">
          {item.projected && <span><Repeat2 />每周事项</span>}
          {item.displayReminder && <span><BellRing />{item.displayReminder.slice(11, 16)}</span>}
          {item.todo.highlighted && <span className="important-meta"><Star />重点</span>}
        </div>}
    </div>
    <button className={`reminder-button ${item.displayReminder ? 'active' : ''}`} onClick={() => onReminder(item)} title="设置提醒">
      {item.displayReminder ? <BellRing /> : <Bell />}
    </button>
    <button
      className={`todo-action-button star-action ${item.todo.highlighted ? 'active' : ''}`}
      onClick={() => onUpdate(item.ownerDate, item.todo.uid, { highlighted: !item.todo.highlighted })}
      aria-label={item.todo.highlighted ? '取消重点' : '标为重点'}
      title={item.todo.highlighted ? '取消重点' : '标为重点'}
    ><Star /></button>
    <button className="todo-action-button delete-action" onClick={() => onDelete(item.ownerDate, item.todo.uid)} aria-label="删除待办" title="删除待办"><Trash2 /></button>
  </article>
}

export function TodoList({ items, onAdd, onUpdate, onDelete, onReminder, onReorder }: Props) {
  const [newTodoUid, setNewTodoUid] = useState<string | null>(null)
  const [draggedItem, setDraggedItem] = useState<VisibleTodo | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const completed = items.filter(({ todo }) => todo.done).length

  useEffect(() => {
    if (newTodoUid) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [items.length, newTodoUid])

  const addEmptyTodo = () => setNewTodoUid(onAdd())
  const endDrag = () => {
    setDraggedItem(null)
    setDropHint(null)
  }

  const dropOn = (target: VisibleTodo, event: React.DragEvent) => {
    event.preventDefault()
    if (draggedItem && dropHint && !target.projected && target.ownerDate === draggedItem.ownerDate && target.todo.uid !== draggedItem.todo.uid) {
      onReorder(target.ownerDate, draggedItem.todo.uid, target.todo.uid, dropHint.position)
    }
    endDrag()
  }

  const dropSlot = (target: VisibleTodo, position: DropPosition) => <div
    className="todo-drop-slot"
    aria-hidden="true"
    onDragOver={(event) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setDropHint({ targetUid: target.todo.uid, position })
    }}
    onDrop={(event) => dropOn(target, event)}
  ><i /></div>

  return <section className="todo-card">
    <header className="todo-heading">
      <div><span className="eyebrow">TODAY'S FOCUS</span><h2>待办事项</h2></div>
      <div className="todo-heading-actions">
        <button className="add-todo-button" onClick={addEmptyTodo} aria-label="新增待办" title="新增待办"><Plus /></button>
        <span className="todo-progress">{items.length ? `${completed} / ${items.length} 完成` : '轻松的一天'}</span>
      </div>
    </header>
    <div className="todo-list" ref={listRef}>
      {items.length === 0
        ? <div className="empty-state"><span>✓</span><h3>今天还没有安排</h3><p>点击右上角的 + 添加第一项待办。</p></div>
        : items.flatMap((item) => {
            const key = `${item.ownerDate}-${item.todo.uid}-${item.projected}`
            const showBefore = dropHint?.targetUid === item.todo.uid && dropHint.position === 'before'
            const showAfter = dropHint?.targetUid === item.todo.uid && dropHint.position === 'after'
            return [
              showBefore ? <div key={`${key}-before`}>{dropSlot(item, 'before')}</div> : null,
              <TodoRow
                key={key}
                item={item}
                autoEdit={newTodoUid === item.todo.uid}
                dragging={draggedItem?.todo.uid === item.todo.uid}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onReminder={onReminder}
                onDragStart={(dragged, event) => {
                  if (dragged.projected) return
                  setDraggedItem(dragged)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', dragged.todo.uid)
                }}
                onDragEnd={endDrag}
                onDragOver={(target, event) => {
                  if (!draggedItem || target.projected || target.ownerDate !== draggedItem.ownerDate || target.todo.uid === draggedItem.todo.uid) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  const bounds = event.currentTarget.getBoundingClientRect()
                  const position: DropPosition = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
                  setDropHint({ targetUid: target.todo.uid, position })
                }}
                onDrop={(target, event) => dropOn(target, event)}
              />,
              showAfter ? <div key={`${key}-after`}>{dropSlot(item, 'after')}</div> : null,
            ]
          })}
    </div>
  </section>
}
