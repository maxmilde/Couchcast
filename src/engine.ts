import { discover, getDetails, recommendationsFor, IMG, type MovieDetails, type MovieSummary } from './api/tmdb'
import {
  buildProfile,
  detailFeatures,
  EXPLORATION_RATE,
  qualityPrior,
  score,
  summaryFeatures,
  type RatingEvent,
} from './recommender'

interface Candidate {
  movie: MovieSummary
  /** Came from TMDB "recommendations" of a movie the user liked. */
  related: boolean
}

const RELATED_BONUS = 0.15
const RERANK_SIZE = 8
const MIN_POOL = 25

/**
 * Picks the next movie to show. Keeps a pool of candidates from TMDB discover (random pages,
 * filtered by the chosen genres) plus recommendations for recently liked movies, pre-ranks
 * them on cheap features, then fetches details for the top few and re-ranks on full features.
 */
export class Engine {
  private pool = new Map<number, Candidate>()
  private relatedFetched = new Set<number>()
  private totalPages = 20
  private busy: Promise<unknown> = Promise.resolve()

  constructor(
    private genres: number[],
    private getEvents: () => RatingEvent[],
    /** Ids currently queued on screen, so they aren't picked twice. */
    private getQueued: () => Set<number>,
  ) {}

  private excluded(): Set<number> {
    const s = new Set(this.getQueued())
    for (const e of this.getEvents()) s.add(e.id)
    return s
  }

  private matchesGenres(m: MovieSummary): boolean {
    return !this.genres.length || m.genre_ids.some((g) => this.genres.includes(g))
  }

  private add(movies: MovieSummary[], related: boolean) {
    const excluded = this.excluded()
    for (const m of movies) {
      if (excluded.has(m.id) || !m.poster_path || !this.matchesGenres(m)) continue
      const existing = this.pool.get(m.id)
      this.pool.set(m.id, { movie: m, related: related || Boolean(existing?.related) })
    }
  }

  private async fill() {
    const events = this.getEvents()
    const recentLikes = events
      .filter((e) => e.action === 'liked' || e.action === 'watchlist')
      .slice(-3)
      .map((e) => e.id)
      .filter((id) => !this.relatedFetched.has(id))
    for (const id of recentLikes) this.relatedFetched.add(id)

    // Skew toward popular pages but reach deep enough to surface lesser-known films.
    const randomPage = () => 1 + Math.floor(Math.random() ** 2 * Math.min(this.totalPages, 100))
    const pages = [randomPage(), randomPage()]

    const [discovered, related] = await Promise.all([
      Promise.all(pages.map((p) => discover(this.genres, p).catch(() => null))),
      Promise.all(recentLikes.map((id) => recommendationsFor(id).catch(() => []))),
    ])
    for (const d of discovered) {
      if (!d) continue
      this.totalPages = d.totalPages
      this.add(d.results, false)
    }
    for (const r of related) this.add(r, true)
  }

  /** Serialize calls so concurrent prefetches don't pick the same movie. */
  next(): Promise<MovieDetails | null> {
    const run = this.busy.then(() => this.pick())
    this.busy = run.catch(() => undefined)
    return run
  }

  private async pick(): Promise<MovieDetails | null> {
    const excluded = this.excluded()
    for (const id of excluded) this.pool.delete(id)
    for (let tries = 0; this.pool.size < MIN_POOL && tries < 4; tries++) await this.fill()
    if (!this.pool.size) return null

    const candidates = [...this.pool.values()]
    let chosen: Candidate

    if (Math.random() < EXPLORATION_RATE) {
      chosen = candidates[Math.floor(Math.random() * candidates.length)]
    } else {
      const profile = buildProfile(this.getEvents())
      const base = (c: Candidate) =>
        qualityPrior(c.movie.vote_average, c.movie.vote_count) + (c.related ? RELATED_BONUS : 0)

      const top = candidates
        .map((c) => ({ c, s: score(summaryFeatures(c.movie), profile) + base(c) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, RERANK_SIZE)
        .map((x) => x.c)

      const detailed = await Promise.all(top.map((c) => getDetails(c.movie.id).catch(() => null)))
      let best = -Infinity
      chosen = top[0]
      detailed.forEach((d, i) => {
        if (!d) return
        // a little noise so the same profile doesn't always produce the same order
        const s = score(detailFeatures(d), profile) + base(top[i]) + Math.random() * 0.05
        if (s > best) {
          best = s
          chosen = top[i]
        }
      })
    }

    this.pool.delete(chosen.movie.id)
    const details = await getDetails(chosen.movie.id)
    if (details.poster_path) new Image().src = IMG + 'w780' + details.poster_path
    return details
  }
}
