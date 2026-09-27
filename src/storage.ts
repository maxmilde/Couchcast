import type { RatingEvent } from './recommender'

// Everything lives in localStorage for now (single user, single device).

export interface WatchlistItem {
  id: number
  title: string
  year: string
  poster_path: string | null
  features: string[]
  addedAt: number
}

const KEYS = {
  events: 'couchcast.events',
  watchlist: 'couchcast.watchlist',
  genres: 'couchcast.genres',
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked; the session keeps working in memory
  }
}

export const loadEvents = () => load<RatingEvent[]>(KEYS.events, [])
export const saveEvents = (e: RatingEvent[]) => save(KEYS.events, e)
export const loadWatchlist = () => load<WatchlistItem[]>(KEYS.watchlist, [])
export const saveWatchlist = (w: WatchlistItem[]) => save(KEYS.watchlist, w)
export const loadGenres = () => load<number[]>(KEYS.genres, [])
export const saveGenres = (g: number[]) => save(KEYS.genres, g)
