import { app } from 'electron'
import { constants, copyFile, mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import type { RichTag, ScheduleData, Todo } from '../../src/types'

const CURRENT_SCHEMA = 4
const TAGS: RichTag[] = ['b', 'i', 'u', 's', 'hl']

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordOfStrings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function validRanges(value: unknown): [string, string][] {
  if (!Array.isArray(value)) return []
  return value.flatMap((range) => {
    if (!Array.isArray(range) || range.length !== 2 || !range.every((part) => typeof part === 'string')) return []
    return [[range[0], range[1]] as [string, string]]
  })
}

function readTags(value: unknown): ScheduleData['goal_tags'] {
  if (!isRecord(value)) return {}
  const output: ScheduleData['goal_tags'] = {}
  for (const [date, rawTags] of Object.entries(value)) {
    if (!isRecord(rawTags)) continue
    output[date] = {}
    for (const tag of TAGS) output[date][tag] = validRanges(rawTags[tag])
  }
  return output
}

function readLegacyHighlights(value: unknown): ScheduleData['goal_tags'] {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([date, ranges]) => [date, { hl: validRanges(ranges) }]))
}

function migrateTodo(raw: unknown): Todo {
  const todo = isRecord(raw) ? raw : {}
  return {
    uid: typeof todo.uid === 'string' && todo.uid ? todo.uid : randomUUID(),
    task: typeof todo.task === 'string' ? todo.task : '',
    done: todo.done === true,
    highlighted: todo.highlighted === true,
    reminder_time: typeof todo.reminder_time === 'string' ? todo.reminder_time : null,
    repeat_weekly: todo.repeat_weekly === true,
  }
}

export function migrateData(raw: unknown): ScheduleData {
  const source = isRecord(raw) ? raw : {}
  const rawTodos = isRecord(source.todos) ? source.todos : {}
  const todos = Object.fromEntries(
    Object.entries(rawTodos).map(([date, entries]) => [date, Array.isArray(entries) ? entries.map(migrateTodo) : []]),
  )
  const explicitGoalTags = readTags(source.goal_tags)
  const legacyGoalTags = readLegacyHighlights(source.goal_highlights)

  return {
    schema_version: CURRENT_SCHEMA,
    todos,
    goals: recordOfStrings(source.goals),
    goal_tags: { ...legacyGoalTags, ...explicitGoalTags },
    diary: recordOfStrings(source.diary),
    diary_highlighted: Object.fromEntries(
      Object.entries(isRecord(source.diary_highlighted) ? source.diary_highlighted : {})
        .filter((entry): entry is [string, boolean] => entry[1] === true),
    ),
    diary_tags: readTags(source.diary_tags),
    goal_html: recordOfStrings(source.goal_html),
    diary_html: recordOfStrings(source.diary_html),
    settings: {
      theme: isRecord(source.settings) && ['light', 'dark', 'system'].includes(String(source.settings.theme))
        ? source.settings.theme as ScheduleData['settings']['theme']
        : 'light',
      reminderLeadMinutes: isRecord(source.settings) && Number.isFinite(source.settings.reminderLeadMinutes)
        ? Math.max(0, Number(source.settings.reminderLeadMinutes))
        : 5,
    },
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

export class DataStore {
  private readonly directory = app.getPath('userData')
  private readonly dataFile = path.join(this.directory, 'schedule_data.json')
  private readonly backupDirectory = path.join(this.directory, 'backups')
  private saveQueue: Promise<string> = Promise.resolve('')
  private hasSessionBackup = false

  async load(): Promise<ScheduleData> {
    await mkdir(this.directory, { recursive: true })
    if (await exists(this.dataFile)) {
      try {
        return migrateData(JSON.parse(await readFile(this.dataFile, 'utf8')))
      } catch (error) {
        await this.backup(this.dataFile, 'unreadable')
        console.error('Unable to read schedule data:', error)
      }
    }

    const imported = await this.findLegacySource()
    if (imported) {
      await this.backup(imported, 'imported-original')
      const migrated = migrateData(JSON.parse(await readFile(imported, 'utf8')))
      await this.save(migrated)
      return migrated
    }

    const empty = migrateData({})
    await this.save(empty)
    return empty
  }

  async save(data: ScheduleData): Promise<string> {
    const snapshot = structuredClone(data)
    this.saveQueue = this.saveQueue.catch(() => '').then(() => this.writeSnapshot(snapshot))
    return this.saveQueue
  }

  private async writeSnapshot(data: ScheduleData): Promise<string> {
    await mkdir(this.directory, { recursive: true })
    if (!this.hasSessionBackup && await exists(this.dataFile)) {
      await this.backup(this.dataFile, 'session-start')
      this.hasSessionBackup = true
    }
    const migrated = migrateData(data)
    const temporary = `${this.dataFile}.${process.pid}.tmp`
    const contents = `${JSON.stringify(migrated, null, 2)}\n`
    await writeFile(temporary, contents, 'utf8')
    const handle = await open(temporary, constants.O_RDONLY)
    await handle.sync()
    await handle.close()
    await rename(temporary, this.dataFile)
    return new Date().toISOString()
  }

  private async findLegacySource(): Promise<string | null> {
    const candidates = [
      path.join(os.homedir(), '.simple_schedule', 'schedule_data.json'),
    ]
    for (const candidate of candidates) {
      if (candidate !== this.dataFile && await exists(candidate)) return candidate
    }
    return null
  }

  private async backup(source: string, label: string): Promise<void> {
    try {
      await mkdir(this.backupDirectory, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      await copyFile(source, path.join(this.backupDirectory, `${label}-${stamp}.json`))
    } catch (error) {
      console.error('Unable to back up schedule data:', error)
    }
  }
}
