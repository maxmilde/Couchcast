import { useCallback, useEffect, useRef, useState } from 'react'
import { hasTmdbKey, type MovieDetails } from './api/tmdb'
import { Engine } from './engine'
import { detailFeatures, type Action, type RatingEvent } from './recommender'
import {
  loadEvents,
  loadGenres,
  loadWatchlist,
  saveEvents,
  saveGenres,
  saveWatchlist,
  type WatchlistItem,
} from './storage'
import { GenrePicker } from './components/GenrePicker'
import { MovieCard } from './components/MovieCard'
import { Watchlist } from './components/Watchlist'

const QUEUE_SIZE = 3

interface UndoEntry {
  event: RatingEvent
  movie: MovieDetails
}

export default function App() {
  const [events, setEvents] = useState<RatingEvent[]>(loadEvents)
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(loadWatchlist)
  const [genres, setGenres] = useState<number[]>(loadGenres)
  const [view, setView] = useState<'discover' | 'watchlist'>('discover')
  const [queue, setQueue] = useState<MovieDetails[]>([])
  const [askRating, setAskRating] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])

  useEffect(() => saveEvents(events), [events])
  useEffect(() => saveWatchlist(watchlist), [watchlist])
  useEffect(() => saveGenres(genres), [genres])

  // Refs let the engine read current state without being rebuilt on every rating.
  const eventsRef = useRef(events)
  eventsRef.current = events
  const queueRef = useRef(queue)
  queueRef.current = queue

  const engineRef = useRef<Engine | null>(null)
  const generation = useRef(0)
  const filling = useRef(false)

  useEffect(() => {
    generation.current++
    filling.current = false
    engineRef.current = new Engine(
      genres,
      () => eventsRef.current,
      () => new Set(queueRef.current.map((m) => m.id)),
    )
    setQueue([])
    setExhausted(false)
    setError(null)
  }, [genres])

  useEffect(() => {
    if (!hasTmdbKey || filling.current || exhausted || queue.length >= QUEUE_SIZE) return
    const engine = engineRef.current
    if (!engine) return
    const gen = generation.current
    filling.current = true
    engine
      .next()
      .then((m) => {
        if (gen !== generation.current) return
        if (m) setQueue((q) => (q.some((x) => x.id === m.id) ? q : [...q, m]))
        else setExhausted(true)
      })
      .catch((e: unknown) => {
        if (gen === generation.current) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (gen === generation.current) filling.current = false
      })
  }, [queue, exhausted, genres])

  const current = queue[0]

  const rate = useCallback(
    (action: Action) => {
      if (!current) return
      const event: RatingEvent = { id: current.id, action, features: detailFeatures(current), at: Date.now() }
      setEvents((e) => [...e, event])
      if (action === 'watchlist') {
        setWatchlist((w) => [
          {
            id: current.id,
            title: current.title,
            year: current.release_date?.slice(0, 4) ?? '',
            poster_path: current.poster_path,
            features: event.features,
            addedAt: event.at,
          },
          ...w.filter((x) => x.id !== current.id),
        ])
      }
      setUndoStack((s) => [...s.slice(-19), { event, movie: current }])
      setQueue((q) => q.slice(1))
      setAskRating(false)
    },
    [current],
  )

  const undo = useCallback(() => {
    const last = undoStack[undoStack.length - 1]
    if (!last) return
    setUndoStack((s) => s.slice(0, -1))
    setEvents((e) => e.filter((x) => x !== last.event))
    if (last.event.action === 'watchlist') setWatchlist((w) => w.filter((x) => x.id !== last.event.id))
    setQueue((q) => [last.movie, ...q.filter((m) => m.id !== last.movie.id)])
    setAskRating(false)
  }, [undoStack])

  const rateFromWatchlist = (item: WatchlistItem, action: 'liked' | 'disliked') => {
    setEvents((e) => [...e, { id: item.id, action, features: item.features, at: Date.now() }])
    setWatchlist((w) => w.filter((x) => x.id !== item.id))
  }

  useEffect(() => {
    if (view !== 'discover') return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (askRating) {
        if (k === 'y' || k === '1') rate('liked')
        else if (k === 'n' || k === '2') rate('disliked')
        else if (k === 'escape') rate('seen')
        return
      }
      if (k === 'x') rate('pass')
      else if (k === 's') setAskRating(true)
      else if (k === 'a') rate('watchlist')
      else if (k === 'z') undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, askRating, rate, undo])

  if (!hasTmdbKey) return <SetupNotice />

  return (
    <div className="app">
      <header className="topbar">
        <button className="logo" onClick={() => setView('discover')}>
          Couch<span>cast</span>
        </button>
        <button
          className={`tab ${view === 'watchlist' ? 'active' : ''}`}
          onClick={() => setView(view === 'watchlist' ? 'discover' : 'watchlist')}
        >
          {view === 'watchlist' ? '← Discover' : `Watch later · ${watchlist.length}`}
        </button>
      </header>

      {view === 'watchlist' ? (
        <Watchlist
          items={watchlist}
          onRate={rateFromWatchlist}
          onRemove={(id) => setWatchlist((w) => w.filter((x) => x.id !== id))}
        />
      ) : (
        <>
          <GenrePicker selected={genres} onChange={setGenres} />
          <main className="stage">
            {current ? (
              <MovieCard key={current.id} movie={current} />
            ) : (
              <div className="placeholder">
                {error ? (
                  <>
                    <p>Couldn't load movies: {error}</p>
                    <button className="btn-ghost" onClick={() => { setError(null); setQueue([]) }}>
                      Try again
                    </button>
                  </>
                ) : exhausted ? (
                  <p>No more movies for these genres. Try another genre.</p>
                ) : (
                  <div className="spinner" aria-label="Loading" />
                )}
              </div>
            )}
            {askRating && current && (
              <div className="rating-prompt" role="dialog" aria-label="Did you like it?">
                <p>Did you like it?</p>
                <div className="rating-buttons">
                  <button onClick={() => rate('liked')} aria-label="Liked it">👍</button>
                  <button onClick={() => rate('disliked')} aria-label="Didn't like it">👎</button>
                </div>
                <button className="btn-ghost" onClick={() => rate('seen')}>
                  Skip
                </button>
              </div>
            )}
          </main>
          <footer className="actions">
            <button className="undo" onClick={undo} disabled={!undoStack.length} aria-label="Undo">
              ↶
            </button>
            <button className="act pass" onClick={() => rate('pass')} disabled={!current || askRating}>
              <span>✕</span>Not interested
            </button>
            <button className="act seen" onClick={() => setAskRating(true)} disabled={!current || askRating}>
              <span>✓</span>Watched
            </button>
            <button className="act add" onClick={() => rate('watchlist')} disabled={!current || askRating}>
              <span>+</span>Watch later
            </button>
          </footer>
          <p className="attribution">Movie data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </>
      )}
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="setup">
      <h1>Couch<span>cast</span></h1>
      <p>Add your TMDB API key to get started:</p>
      <ol>
        <li>Get a free key at themoviedb.org → Settings → API</li>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> and set <code>VITE_TMDB_KEY</code>
        </li>
        <li>
          Restart <code>npm run dev</code>
        </li>
      </ol>
    </div>
  )
}
