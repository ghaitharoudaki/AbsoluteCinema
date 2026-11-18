import type { SearchResult } from '../components/MovieSearch'

// Titles opened from search, kept on this device so the search panel can offer them again.

export const MAX_RECENT = 8
const KEY = 'ac.recentSearches'

const same = (a: SearchResult, b: SearchResult) => a.tmdb_id === b.tmdb_id && a.media_type === b.media_type

export function addRecent(list: SearchResult[], item: SearchResult): SearchResult[] {
  return [item, ...list.filter((existing) => !same(existing, item))].slice(0, MAX_RECENT)
}

export function loadRecent(): SearchResult[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x?.tmdb_id === 'number' && typeof x?.title === 'string').slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

export function saveRecent(list: SearchResult[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Private mode or storage full: recents are a convenience, so just skip.
  }
}
