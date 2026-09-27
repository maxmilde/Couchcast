# Couchcast

A movie picker with buttons instead of swiping. Each movie is shown as a card, and the recommendations get better the more you rate.

## Setup

1. Get a free TMDB API key: https://www.themoviedb.org/settings/api
2. `cp .env.example .env.local` and set `VITE_TMDB_KEY` (optionally `VITE_OMDB_KEY` for IMDb ratings; without it the TMDB rating is shown)
3. `npm install && npm run dev`

The dev server also listens on your local network, so you can open the printed "Network" URL on your phone.

## Controls

| Action | Button | Key |
| --- | --- | --- |
| Previous / next image | tap left / right side of card | ← / → |
| Not interested | ✕ | X |
| Watched (then 👍 / 👎 / skip) | ✓ | S (then Y / N / Esc) |
| Watch later | + | A |
| Undo | ↶ | Z |

## How recommendations work

- **Candidates** come from TMDB (random popular pages in your chosen genres, plus TMDB's "similar" lists for movies you liked).
- **Features** describe each movie: its genres, keywords, director and main cast, decade and language.
- **Learning:** each rating nudges the weight of every feature the movie has. Watch later and 👍 count as positive, Not interested and 👎 as negative, and a Watched with no rating as mildly positive.
- **Ranking:** candidates are pre-ranked on cheap features, then the top 8 are fetched in full and re-ranked.
- **Exploration:** 15% of picks are random, so the app keeps finding new tastes.

All data is stored in the browser's localStorage (single user for now). The tuning constants are in `src/recommender.ts` and `src/engine.ts`.
