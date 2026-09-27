import { useEffect, useState } from 'react'
import { getImdbRating, IMG, type MovieDetails } from '../api/tmdb'

function formatRuntime(min: number | null) {
  if (!min) return null
  const h = Math.floor(min / 60)
  return h ? `${h}h ${min % 60}m` : `${min}m`
}

export function MovieCard({ movie }: { movie: MovieDetails }) {
  const slides = [movie.poster_path, ...movie.backdrops].filter((s): s is string => Boolean(s))
  const [index, setIndex] = useState(0)
  const [imdb, setImdb] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getImdbRating(movie.imdbId).then((r) => alive && setImdb(r))
    // warm the cache for the other images
    for (const b of movie.backdrops) new Image().src = IMG + 'w1280' + b
    return () => {
      alive = false
    }
  }, [movie])

  const go = (delta: number) => setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const year = movie.release_date?.slice(0, 4)
  const runtime = formatRuntime(movie.runtime)
  const rating = imdb ? { label: 'IMDb', value: imdb } : { label: 'TMDB', value: movie.vote_average.toFixed(1) }
  const isPoster = index === 0
  const src = IMG + (isPoster ? 'w780' : 'w1280') + slides[index]

  return (
    <article className="card">
      <div className={`slide ${isPoster ? 'poster' : 'backdrop'}`}>
        {!isPoster && <img className="blur" src={src} alt="" aria-hidden />}
        <img className="main" src={src} alt={isPoster ? `${movie.title} poster` : `${movie.title} still ${index}`} />
      </div>

      {slides.length > 1 && (
        <div className="progress" aria-hidden>
          {slides.map((_, i) => (
            <span key={i} className={i === index ? 'on' : ''} />
          ))}
        </div>
      )}

      <button className="tap left" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous image" />
      <button className="tap right" onClick={() => go(1)} disabled={index === slides.length - 1} aria-label="Next image" />

      <div className={`info ${isPoster ? 'full' : 'compact'}`}>
        <h2>{movie.title}</h2>
        <p className="meta">
          {[year, runtime].filter(Boolean).join(' · ')}
          <span className="rating">
            ★ {rating.value} <small>{rating.label}</small>
          </span>
        </p>
        {isPoster && (
          <>
            <p className="genre-list">{movie.genres.map((g) => g.name).join(' · ')}</p>
            {movie.directors.length > 0 && (
              <p className="credits">
                Dir. {movie.directors.map((d) => d.name).join(', ')}
                {movie.cast.length > 0 && <> · {movie.cast.slice(0, 3).map((c) => c.name).join(', ')}</>}
              </p>
            )}
            <p className="overview">{movie.overview}</p>
          </>
        )}
      </div>
    </article>
  )
}
