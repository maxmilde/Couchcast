import type { MovieDetails, MovieSummary } from './api/tmdb'

/**
 * Content-based taste model.
 *
 * Every movie is described by features grouped by kind (genre, keyword, person, decade, language).
 * Each rating adds a signed amount to the weight of every feature the movie has. A candidate's
 * score is the average learned weight per group, combined with fixed group importances, so a
 * movie with 15 keywords doesn't drown out its 2 genres.
 */

export type Action = 'watchlist' | 'liked' | 'disliked' | 'seen' | 'pass'

export const ACTION_SIGNAL: Record<Action, number> = {
  watchlist: 1.0, // wants to watch it: strongest forward-looking signal
  liked: 1.0, // watched and liked it
  seen: 0.3, // watched, no opinion given: they chose it once, mild positive
  pass: -0.6, // not interested
  disliked: -0.8, // watched and didn't like it
}

type Group = 'g' | 'k' | 'p' | 'd' | 'l'

const GROUP_WEIGHT: Record<Group, number> = { g: 1.0, k: 0.8, p: 0.6, d: 0.35, l: 0.25 }

export interface RatingEvent {
  id: number
  action: Action
  features: string[]
  at: number
}

export type Profile = Record<string, number>

function decade(date?: string): string | null {
  const y = date ? Number(date.slice(0, 4)) : NaN
  return Number.isFinite(y) ? `d:${Math.floor(y / 10) * 10}` : null
}

export function detailFeatures(m: MovieDetails): string[] {
  return [
    ...m.genres.map((g) => `g:${g.id}`),
    ...m.keywords.map((k) => `k:${k.id}`),
    ...m.directors.map((p) => `p:${p.id}`),
    ...m.cast.map((p) => `p:${p.id}`),
    decade(m.release_date),
    `l:${m.original_language}`,
  ].filter((f): f is string => f !== null)
}

/** Features available without a details call — used for cheap pre-ranking. */
export function summaryFeatures(m: MovieSummary): string[] {
  return [...m.genre_ids.map((g) => `g:${g}`), decade(m.release_date), `l:${m.original_language}`].filter(
    (f): f is string => f !== null,
  )
}

export function buildProfile(events: RatingEvent[]): Profile {
  const profile: Profile = {}
  for (const e of events) {
    const s = ACTION_SIGNAL[e.action]
    for (const f of e.features) profile[f] = (profile[f] ?? 0) + s
  }
  return profile
}

export function score(features: string[], profile: Profile): number {
  const sums: Partial<Record<Group, { total: number; n: number }>> = {}
  for (const f of features) {
    const g = f[0] as Group
    const w = profile[f] ?? 0
    const s = (sums[g] ??= { total: 0, n: 0 })
    // tanh keeps one heavily-rated feature from dominating everything
    s.total += Math.tanh(w / 3)
    s.n++
  }
  let total = 0
  for (const [g, s] of Object.entries(sums) as [Group, { total: number; n: number }][]) {
    total += GROUP_WEIGHT[g] * (s.total / s.n)
  }
  return total
}

/** Small prior so well-rated, well-known movies win ties while the profile is still empty. */
export function qualityPrior(voteAverage: number, voteCount: number): number {
  return ((voteAverage - 6.5) / 10) * Math.min(1, Math.log10(Math.max(voteCount, 1)) / 4)
}

/** Share of picks that ignore the profile, so the app keeps discovering new tastes. */
export const EXPLORATION_RATE = 0.15
