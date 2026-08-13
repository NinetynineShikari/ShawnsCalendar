import { describe, expect, it } from 'vitest'
import { resolveReminderFireAt } from './reminders'

describe('reminder scheduling', () => {
  const lead = 5 * 60_000

  it('fires five minutes before an event when there is enough time', () => {
    const now = new Date(2026, 7, 13, 10, 0)
    const event = new Date(2026, 7, 13, 10, 20)
    expect(resolveReminderFireAt(event, false, lead, now)?.getTime()).toBe(new Date(2026, 7, 13, 10, 15).getTime())
  })

  it('falls back to event time when the five-minute lead has passed', () => {
    const now = new Date(2026, 7, 13, 10, 18)
    const event = new Date(2026, 7, 13, 10, 20)
    expect(resolveReminderFireAt(event, false, lead, now)?.getTime()).toBe(event.getTime())
  })

  it('uses this week event time instead of skipping a near weekly event', () => {
    const now = new Date(2026, 7, 13, 10, 18)
    const event = new Date(2026, 7, 13, 10, 20)
    expect(resolveReminderFireAt(event, true, lead, now)?.getTime()).toBe(event.getTime())
  })

  it('moves an elapsed weekly event to the next week', () => {
    const now = new Date(2026, 7, 13, 10, 21)
    const event = new Date(2026, 7, 13, 10, 20)
    expect(resolveReminderFireAt(event, true, lead, now)?.getTime()).toBe(new Date(2026, 7, 20, 10, 15).getTime())
  })
})
