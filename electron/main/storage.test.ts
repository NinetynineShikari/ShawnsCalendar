import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrateData } from './storage'

describe('legacy data migration', () => {
  it('preserves todos and fills new reminder fields', () => {
    const data = migrateData({
      todos: { '2025-03-25': [{ task: '旧待办', done: true, highlighted: true }] },
    })
    const todo = data.todos['2025-03-25'][0]
    expect(todo.task).toBe('旧待办')
    expect(todo.done).toBe(true)
    expect(todo.highlighted).toBe(true)
    expect(todo.reminder_time).toBeNull()
    expect(todo.repeat_weekly).toBe(false)
    expect(todo.uid).toBeTruthy()
  })

  it('maps legacy goal_highlights to the rich text highlight tag', () => {
    const data = migrateData({
      goals: { '2025-03-24': '第一行\n第二行' },
      goal_highlights: { '2025-03-24': [['2.0', '2.3']] },
    })
    expect(data.goal_tags['2025-03-24'].hl).toEqual([['2.0', '2.3']])
  })

  it('prefers explicit v2 tags while retaining all text sections', () => {
    const data = migrateData({
      goals: { '2025-03-24': '目标' },
      diary: { '2025-03-25': '日记' },
      goal_highlights: { '2025-03-24': [['1.0', '1.1']] },
      goal_tags: { '2025-03-24': { b: [['1.0', '1.2']] } },
      diary_tags: { '2025-03-25': { i: [['1.0', '1.2']] } },
    })
    expect(data.goals['2025-03-24']).toBe('目标')
    expect(data.diary['2025-03-25']).toBe('日记')
    expect(data.goal_tags['2025-03-24'].b).toEqual([['1.0', '1.2']])
    expect(data.diary_tags['2025-03-25'].i).toEqual([['1.0', '1.2']])
  })

  it('migrates the complete real-world legacy file without dropping records', () => {
    const legacy = JSON.parse(readFileSync(resolve('schedule_data.json'), 'utf8'))
    const migrated = migrateData(legacy)
    expect(Object.keys(migrated.todos)).toHaveLength(72)
    expect(Object.values(migrated.todos).flat()).toHaveLength(207)
    expect(Object.keys(migrated.goals)).toHaveLength(21)
    expect(Object.keys(migrated.diary)).toHaveLength(21)
    expect(Object.values(migrated.todos).flat().filter((todo) => todo.highlighted)).toHaveLength(4)
    expect(Object.values(migrated.todos).flat().every((todo) => todo.uid)).toBe(true)
  })
})
