import { Notification } from 'electron'
import type { ScheduleData, Todo } from '../../src/types'

const MAX_TIMEOUT = 2_147_000_000

interface ScheduledReminder {
  timer: NodeJS.Timeout
  todo: Todo
}

export interface NotificationDeliveryResult {
  status: 'shown' | 'unsupported' | 'failed' | 'unknown'
  detail: string
}

function parseLocalMinute(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  const parsed = new Date(year, month - 1, day, hour, minute)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function nextWeeklyOccurrence(base: Date, after: Date): Date {
  const next = new Date(after)
  next.setSeconds(0, 0)
  next.setHours(base.getHours(), base.getMinutes(), 0, 0)
  const days = (base.getDay() - next.getDay() + 7) % 7
  next.setDate(next.getDate() + days)
  if (next.getTime() <= after.getTime()) next.setDate(next.getDate() + 7)
  return next
}

export function resolveReminderFireAt(eventAt: Date, repeatWeekly: boolean, leadMs: number, now: Date): Date | null {
  const occurrence = repeatWeekly ? nextWeeklyOccurrence(eventAt, now) : eventAt
  if (occurrence.getTime() <= now.getTime()) return null
  const earlyFire = new Date(occurrence.getTime() - leadMs)
  return earlyFire.getTime() > now.getTime() ? earlyFire : occurrence
}

export class ReminderService {
  private jobs = new Map<string, ScheduledReminder>()

  showTestNotification(): Promise<NotificationDeliveryResult> {
    if (!Notification.isSupported()) {
      return Promise.resolve({
        status: 'unsupported',
        detail: '当前系统或运行环境不支持桌面通知。',
      })
    }

    return new Promise((resolve) => {
      const notificationId = `mori-test-${Date.now()}`
      const notification = new Notification({
        id: notificationId,
        title: "Shawn's Calendar 通知测试",
        body: '系统通知工作正常。之后的待办提醒会显示在这里。',
        silent: false,
        sound: 'default',
        timeoutType: 'default',
      })
      let settled = false
      const finish = (result: NotificationDeliveryResult) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve(result)
      }
      const timeout = setTimeout(() => {
        if (process.platform === 'darwin') {
          void Notification.getHistory().then((delivered) => {
            if (delivered.some((item) => item.id === notificationId)) {
              finish({ status: 'shown', detail: '通知已经进入 macOS 通知中心。' })
            }
          }).catch(() => undefined)
        }
        // Never let the native history API prevent the user-facing result.
        // It can remain pending on some local/ad-hoc signed macOS builds.
        setTimeout(() => {
          finish({
            status: 'unknown',
            detail: '应用已经请求发送通知，但系统没有确认投递。请在“系统设置 → 通知 → Shawn\'s Calendar”中开启“允许通知”和横幅或提醒样式。',
          })
        }, 250)
      }, 900)

      if (process.platform !== 'darwin') notification.once('show', () => finish({
        status: 'shown',
        detail: '系统已接受这条测试通知。',
      }))
      notification.once('failed', (_event, error) => finish({
        status: 'failed',
        detail: `系统拒绝了通知：${error || '未知错误'}`,
      }))
      notification.show()
    })
  }

  sync(data: ScheduleData): void {
    this.clear()
    const leadMs = data.settings.reminderLeadMinutes * 60_000
    for (const entries of Object.values(data.todos)) {
      for (const todo of entries) {
        if (!todo.reminder_time) continue
        const eventAt = parseLocalMinute(todo.reminder_time)
        if (!eventAt) continue
        const fireAt = resolveReminderFireAt(eventAt, todo.repeat_weekly, leadMs, new Date())
        if (!fireAt) continue
        this.arm(todo, fireAt, leadMs)
      }
    }
  }

  clear(): void {
    for (const job of this.jobs.values()) clearTimeout(job.timer)
    this.jobs.clear()
  }

  private arm(todo: Todo, fireAt: Date, leadMs: number): void {
    const delay = fireAt.getTime() - Date.now()
    if (delay > MAX_TIMEOUT) {
      const timer = setTimeout(() => this.arm(todo, fireAt, leadMs), MAX_TIMEOUT)
      this.jobs.set(todo.uid, { timer, todo })
      return
    }
    const timer = setTimeout(() => {
      if (Notification.isSupported()) {
        new Notification({
          title: '待办提醒',
          body: todo.task.trim() || '你有一项待办即将开始',
          silent: false,
          sound: 'default',
          timeoutType: 'default',
        }).show()
      }
      this.jobs.delete(todo.uid)
      if (todo.repeat_weekly && todo.reminder_time) {
        const base = parseLocalMinute(todo.reminder_time)
        const next = base ? resolveReminderFireAt(base, true, leadMs, new Date()) : null
        if (next) this.arm(todo, next, leadMs)
      }
    }, Math.max(0, delay))
    this.jobs.set(todo.uid, { timer, todo })
  }
}
