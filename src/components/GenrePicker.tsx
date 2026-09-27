import { useEffect, useState } from 'react'
import { getGenres, type Genre } from '../api/tmdb'

interface Props {
  selected: number[]
  onChange: (ids: number[]) => void
}

export function GenrePicker({ selected, onChange }: Props) {
  const [genres, setGenres] = useState<Genre[]>([])

  useEffect(() => {
    getGenres().then(setGenres).catch(() => setGenres([]))
  }, [])

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((g) => g !== id) : [...selected, id])

  return (
    <nav className="genres" aria-label="Genres">
      <button className={`chip ${selected.length === 0 ? 'on' : ''}`} onClick={() => onChange([])}>
        🎲 Surprise me
      </button>
      {genres.map((g) => (
        <button
          key={g.id}
          className={`chip ${selected.includes(g.id) ? 'on' : ''}`}
          aria-pressed={selected.includes(g.id)}
          onClick={() => toggle(g.id)}
        >
          {g.name}
        </button>
      ))}
    </nav>
  )
}
