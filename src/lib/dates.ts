import { addDays, format, getDay, parseISO, startOfWeek } from 'date-fns'

export const dateKey = (date: Date): string => format(date, 'yyyy-MM-dd')

export const parseDateKey = (value: string): Date => {
  const parsed = parseISO(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export const weekKey = (date: Date): string => dateKey(startOfWeek(date, { weekStartsOn: 1 }))

export const sameLocalDate = (a: Date, b: Date): boolean => dateKey(a) === dateKey(b)

export const weekdayIndex = (date: Date): number => getDay(date)

export const occurrenceForDate = (reminder: string, targetDate: Date): string => {
  const time = reminder.slice(11, 16)
  return `${dateKey(targetDate)} ${time}`
}

export const nextSevenDays = (from: Date): Date[] => Array.from({ length: 7 }, (_, index) => addDays(from, index))
