import { describe, expect, it } from 'vitest'
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
    expect(data.diary_highlighted).toEqual({})
  })

  it('preserves highlighted diaries while normalizing false entries', () => {
    const data = migrateData({
      diary: { '2025-03-25': '重点日记', '2025-03-26': '普通日记' },
      diary_highlighted: { '2025-03-25': true, '2025-03-26': false },
    })
    expect(data.diary_highlighted).toEqual({ '2025-03-25': true })
    expect(data.schema_version).toBe(4)
  })

  it('migrates representative v2 data without dropping records', () => {
    const legacy = {
      schema_version: 2,
      todos: {
        '2025-03-25': [
          {
            uid: 'legacy-1',
            task: '带提醒的旧待办',
            done: false,
            highlighted: true,
            reminder_time: '2025-03-25 09:30',
            repeat_weekly: true,
          },
        ],
        '2025-03-26': [{ task: '普通旧待办', done: true }],
      },
      goals: { '2025-03-24': '本周目标' },
      goal_tags: { '2025-03-24': { b: [['1.0', '1.2']] } },
      diary: { '2025-03-25': '旧日日记' },
      diary_tags: { '2025-03-25': { hl: [['1.0', '1.2']] } },
    }
    const migrated = migrateData(legacy)
    expect(Object.keys(migrated.todos)).toHaveLength(2)
    expect(Object.values(migrated.todos).flat()).toHaveLength(2)
    expect(migrated.goals['2025-03-24']).toBe('本周目标')
    expect(migrated.diary['2025-03-25']).toBe('旧日日记')
    expect(migrated.todos['2025-03-25'][0]).toMatchObject({
      task: '带提醒的旧待办',
      highlighted: true,
      reminder_time: '2025-03-25 09:30',
      repeat_weekly: true,
    })
    expect(Object.values(migrated.todos).flat().every((todo) => todo.uid)).toBe(true)
  })
})
