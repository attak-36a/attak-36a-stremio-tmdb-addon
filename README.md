# TMDB Discover — Stremio Addon

Correction: the real npm package is **`stremio-addon-sdk`** (no `@stremio/` scope) — `package.json` already uses the correct one.

## Files
- `manifest.js` — catalogs + the 4-dropdown `extra` filter definitions
- `addon.js` — catalog/meta handlers, TMDB querying, genre/sort mapping
- `server.js` — local / persistent-host entrypoint (Render, Railway, VPS)
- `api/[...stremio].js` + `vercel.json` — Vercel serverless entrypoint

## 1. Get a TMDB API key
Create a free account at themoviedb.org → Settings → API → request a **v3 API key**.

## 2. Run locally
```bash
npm install
cp .env.example .env
# edit .env and paste your TMDB_API_KEY
npm start
```
Open Stremio → search bar → paste:
```
http://127.0.0.1:7000/manifest.json
```
Click **Install**. The addon appears under Discover with Type / Genre / Year / Sort dropdowns.

**Note on the dropdown row:** Stremio always inserts a native "catalog" picker as dropdown #2 (letting you switch between this addon's catalog and any others installed for that type, e.g. Cinemeta's "Popular"/"Top"). That dropdown is part of Stremio's client UI, not something an addon manifest can remove — Genre/Year/Sort are dropdowns #3+.

## 3. Deploy to Render (recommended — persistent server)
1. Push this folder to a GitHub repo.
2. Render.com → New → Web Service → connect the repo.
3. Build command: `npm install` — Start command: `npm start`.
4. Add environment variable `TMDB_API_KEY` in Render's dashboard.
5. Once deployed, install in Stremio via `https://<your-app>.onrender.com/manifest.json`.

## 4. Deploy to Vercel (serverless)
1. Push this folder to a GitHub repo.
2. Vercel.com → New Project → import the repo (it auto-detects `vercel.json`).
3. Project Settings → Environment Variables → add `TMDB_API_KEY`.
4. Deploy. Install in Stremio via `https://<your-app>.vercel.app/manifest.json`.

Note: Vercel's free tier serverless functions cold-start and have execution time limits — fine for this addon's request volume, but Render/Railway give a warmer, more typical addon-hosting experience.

## Notes / things to extend
- **IMDb ids for stream compatibility:** for each catalog item, `addon.js` calls TMDB's `/{type}/{id}/external_ids` and uses the returned `imdb_id` (e.g. `tt1234567`) as the item's id. That's what lets stream-providing addons (Torrentio, etc.) and Cinemeta's own meta recognize the title — same as native catalogs. Titles TMDB has no `imdb_id` for fall back to `tmdb:<type>:<id>`, which is still browsable but won't have stream links (our own `meta` handler only serves that fallback case). This adds one extra TMDB request per catalog item (run in parallel), so a catalog page can take a couple seconds longer to load.
- Genre names differ between TMDB's movie and TV genre lists (e.g. "Science Fiction" vs "Sci-Fi & Fantasy"); `addon.js` aliases the common mismatches — extend `GENRE_ALIASES` if you hit others.
- **Rating shown is a weighted TMDB score, not real IMDb data:** the `imdbRating` field is derived from TMDB's `vote_average`/`vote_count` (there's no free way to pull true IMDb ratings without a separate API key/service). `addon.js` runs a Bayesian-style weighting — same idea IMDb's own Top 250 uses — that pulls low-vote titles toward the page average instead of letting a handful of 10/10 votes spike the score, without excluding those titles from the catalog. `MIN_VOTES_FOR_CREDIBILITY` (default 50) controls how aggressively that pull happens; raise it for more smoothing, lower it to trust raw scores sooner. The displayed number can still diverge somewhat from IMDb's own site — that's expected, not a bug.
- **"Based on a True Story"** filters via TMDB's keyword system — `addon.js` looks up the keyword's id at runtime (via `/search/keyword`) rather than hardcoding it, since TMDB's ids aren't guaranteed stable across their catalog. **"Mini-Series"** filters via TMDB's `with_type=2` (Miniseries), available for the Series catalog only — TMDB has no equivalent concept for movies.
