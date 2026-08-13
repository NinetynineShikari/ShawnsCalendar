export type RichTag = 'b' | 'i' | 'u' | 's' | 'hl'

export interface Todo {
  uid: string
  task: string
  done: boolean
  highlighted: boolean
  reminder_time: string | null
  repeat_weekly: boolean
}

export interface ScheduleData {
  schema_version: number
  todos: Record<string, Todo[]>
  goals: Record<string, string>
  goal_tags: Record<string, Partial<Record<RichTag, [string, string][]>>>
  diary: Record<string, string>
  diary_highlighted: Record<string, boolean>
  diary_tags: Record<string, Partial<Record<RichTag, [string, string][]>>>
  goal_html: Record<string, string>
  diary_html: Record<string, string>
  settings: {
    theme: 'light' | 'dark' | 'system'
    reminderLeadMinutes: number
  }
}

export interface SaveResult {
  ok: boolean
  savedAt: string
  error?: string
}

export interface ScheduleAPI {
  loadData: () => Promise<ScheduleData>
  saveData: (data: ScheduleData) => Promise<SaveResult>
  showWindow: () => Promise<void>
  quit: () => Promise<void>
  platform: 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd'
}

declare global {
  interface Window {
    scheduleAPI: ScheduleAPI
  }
}
