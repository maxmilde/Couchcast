import { IMG } from '../api/tmdb'
import type { WatchlistItem } from '../storage'

interface Props {
  items: WatchlistItem[]
  onRate: (item: WatchlistItem, action: 'liked' | 'disliked') => void
  onRemove: (id: number) => void
}

export function Watchlist({ items, onRate, onRemove }: Props) {
  if (!items.length) {
    return (
      <div className="placeholder">
        <p>Nothing here yet. Hit “Watch later” on a movie to save it.</p>
      </div>
    )
  }
  return (
    <ul className="watchlist">
      {items.map((item) => (
        <li key={item.id}>
          {item.poster_path ? <img src={IMG + 'w185' + item.poster_path} alt="" /> : <div className="noimg" />}
          <div className="wl-body">
            <strong>{item.title}</strong>
            <span>{item.year}</span>
            <div className="wl-actions">
              <span className="wl-label">Watched it?</span>
              <button onClick={() => onRate(item, 'liked')} aria-label={`Watched ${item.title}, liked it`}>
                👍
              </button>
              <button onClick={() => onRate(item, 'disliked')} aria-label={`Watched ${item.title}, didn't like it`}>
                👎
              </button>
              <button className="remove" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.title}`}>
                Remove
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
