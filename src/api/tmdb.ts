const TMDB_KEY = import.meta.env.VITE_TMDB_KEY as string | undefined
const OMDB_KEY = import.meta.env.VITE_OMDB_KEY as string | undefined
const BASE = 'https://api.themoviedb.org/3'
export const IMG = 'https://image.tmdb.org/t/p/'

export const hasTmdbKey = Boolean(TMDB_KEY)

export interface Genre {
  id: number
  name: string
}

/** Lightweight movie from list endpoints (discover / recommendations). */
export interface MovieSummary {
  id: number
  title: string
  release_date?: string
  genre_ids: number[]
  original_language: string
  vote_average: number
  vote_count: number
  poster_path: string | null
}

export interface MovieDetails {
  id: number
  title: string
  overview: string
  release_date?: string
  runtime: number | null
  genres: Genre[]
  original_language: string
  vote_average: number
  vote_count: number
  poster_path: string | null
  imdbId: string | null
  keywords: Genre[]
  directors: Genre[]
  cast: Genre[]
  backdrops: string[]
}

// v4 read-access tokens are long JWTs sent as a bearer header; v3 keys go in the query string.
async function tmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  if (!TMDB_KEY) throw new Error('Missing VITE_TMDB_KEY')
  const url = new URL(BASE + path)
  const isBearer = TMDB_KEY.length > 40
  if (!isBearer) url.searchParams.set('api_key', TMDB_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url, isBearer ? { headers: { Authorization: `Bearer ${TMDB_KEY}` } } : undefined)
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`)
  return res.json() as Promise<T>
}

let genresCache: Promise<Genre[]> | null = null
export function getGenres(): Promise<Genre[]> {
  genresCache ??= tmdb<{ genres: Genre[] }>('/genre/movie/list', { language: 'en-US' }).then((r) => r.genres)
  return genresCache
}

export async function discover(genreIds: number[], page: number): Promise<{ results: MovieSummary[]; totalPages: number }> {
  const params: Record<string, string | number> = {
    include_adult: 'false',
    language: 'en-US',
    sort_by: 'popularity.desc',
    'vote_count.gte': 150,
    page,
  }
  // "|" = any of the chosen genres
  if (genreIds.length) params.with_genres = genreIds.join('|')
  const r = await tmdb<{ results: MovieSummary[]; total_pages: number }>('/discover/movie', params)
  return { results: r.results, totalPages: Math.min(r.total_pages, 500) }
}

export async function recommendationsFor(movieId: number): Promise<MovieSummary[]> {
  const r = await tmdb<{ results: MovieSummary[] }>(`/movie/${movieId}/recommendations`, { language: 'en-US' })
  return r.results
}

interface RawDetails {
  id: number
  title: string
  overview: string
  release_date?: string
  runtime: number | null
  genres: Genre[]
  original_language: string
  vote_average: number
  vote_count: number
  poster_path: string | null
  external_ids?: { imdb_id: string | null }
  keywords?: { keywords: Genre[] }
  credits?: { cast: Genre[]; crew: (Genre & { job: string })[] }
  images?: { backdrops: { file_path: string; iso_639_1: string | null }[] }
}

const detailsCache = new Map<number, Promise<MovieDetails>>()
export function getDetails(id: number): Promise<MovieDetails> {
  let p = detailsCache.get(id)
  if (!p) {
    p = tmdb<RawDetails>(`/movie/${id}`, {
      language: 'en-US',
      append_to_response: 'external_ids,keywords,credits,images',
      include_image_language: 'en,null',
    }).then((d) => ({
      id: d.id,
      title: d.title,
      overview: d.overview,
      release_date: d.release_date,
      runtime: d.runtime,
      genres: d.genres,
      original_language: d.original_language,
      vote_average: d.vote_average,
      vote_count: d.vote_count,
      poster_path: d.poster_path,
      imdbId: d.external_ids?.imdb_id ?? null,
      keywords: (d.keywords?.keywords ?? []).slice(0, 15),
      directors: (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map(({ id, name }) => ({ id, name })),
      cast: (d.credits?.cast ?? []).slice(0, 5).map(({ id, name }) => ({ id, name })),
      // Prefer textless backdrops (null language), they look better full-screen.
      backdrops: [...(d.images?.backdrops ?? [])]
        .sort((a, b) => Number(a.iso_639_1 !== null) - Number(b.iso_639_1 !== null))
        .slice(0, 6)
        .map((b) => b.file_path),
    }))
    p.catch(() => detailsCache.delete(id))
    detailsCache.set(id, p)
  }
  return p
}

const imdbCache = new Map<string, Promise<string | null>>()
/** IMDb rating via OMDb, or null if no key / not found. */
export function getImdbRating(imdbId: string | null): Promise<string | null> {
  if (!OMDB_KEY || !imdbId) return Promise.resolve(null)
  let p = imdbCache.get(imdbId)
  if (!p) {
    p = fetch(`https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdbId}`)
      .then((r) => r.json())
      .then((j: { imdbRating?: string }) => (j.imdbRating && j.imdbRating !== 'N/A' ? j.imdbRating : null))
      .catch(() => null)
    imdbCache.set(imdbId, p)
  }
  return p
}
