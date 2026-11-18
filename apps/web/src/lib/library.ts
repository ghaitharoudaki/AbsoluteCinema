export interface MonthGroup<T> {
  key: string
  label: string
  items: T[]
}

/** Diary view: ratings grouped by the month they were watched, newest first; undated last. */
export function groupByMonth<T extends { watched_date: string | null }>(rows: T[]): MonthGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = row.watched_date ? row.watched_date.slice(0, 7) : 'undated'
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'undated' ? 1 : b === 'undated' ? -1 : b.localeCompare(a)))
    .map(([key, items]) => ({
      key,
      label: key === 'undated' ? 'No date' : monthLabel(key),
      items: key === 'undated' ? items : [...items].sort((x, y) => (y.watched_date ?? '').localeCompare(x.watched_date ?? '')),
    }))
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** "Just now", "45 min ago", "5 h ago", "Yesterday", "4 days ago", then a short date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function pickRandom<T>(items: T[], rand: () => number = Math.random): T | null {
  if (items.length === 0) return null
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))]
}
