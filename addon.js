// addon.js
const { addonBuilder } = require('stremio-addon-sdk');
const fetch = require('node-fetch');
const manifest = require('./manifest');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';

if (!TMDB_API_KEY) {
  console.warn('WARNING: TMDB_API_KEY is not set (see .env.example).');
}

const builder = new addonBuilder(manifest);

// ---------- genre name -> TMDB id (cached) ----------
// TMDB's TV genre list differs from its movie list (e.g. "Sci-Fi & Fantasy"
// instead of "Science Fiction"), so we alias the common mismatches.
const GENRE_ALIASES = {
  tv: {
    'action': 'action & adventure',
    'adventure': 'action & adventure',
    'science fiction': 'sci-fi & fantasy',
    'fantasy': 'sci-fi & fantasy',
    'war': 'war & politics'
  }
};

const genreCache = { movie: null, tv: null };

async function getGenreMap(tmdbType) {
  if (genreCache[tmdbType]) return genreCache[tmdbType];
  const res = await fetch(`${TMDB_BASE}/genre/${tmdbType}/list?api_key=${TMDB_API_KEY}&language=en-US`);
  const data = await res.json();
  const map = {};
  (data.genres || []).forEach(g => { map[g.name.toLowerCase()] = g.id; });
  genreCache[tmdbType] = map;
  return map;
}

function resolveGenreId(genreLabel, genreMap, tmdbType) {
  const key = genreLabel.toLowerCase();
  if (genreMap[key]) return genreMap[key];
  const alias = GENRE_ALIASES[tmdbType] && GENRE_ALIASES[tmdbType][key];
  if (alias && genreMap[alias]) return genreMap[alias];
  return null;
}

// ---------- sort dropdown -> TMDB sort_by ----------
function mapSort(sortLabel, tmdbType) {
  const dateField = tmdbType === 'movie' ? 'primary_release_date' : 'first_air_date';
  switch (sortLabel) {
    case 'Rating Descending': return 'vote_average.desc';
    case 'Rating Ascending': return 'vote_average.asc';
    case 'Release Date Descending': return `${dateField}.desc`;
    case 'Release Date Ascending': return `${dateField}.asc`;
    default: return 'popularity.desc';
  }
}

function toTmdbType(stremioType) {
  return stremioType === 'series' ? 'tv' : 'movie';
}

// TMDB TV "type" ids (from /discover/tv's with_type param) — fixed by TMDB, not fetched.
const TV_TYPE_MINISERIES = '2';

// ---------- "Based on a True Story" keyword (resolved once, then cached) ----------
let trueStoryKeywordId = null;

async function getTrueStoryKeywordId() {
  if (trueStoryKeywordId) return trueStoryKeywordId;
  try {
    const res = await fetch(`${TMDB_BASE}/search/keyword?api_key=${TMDB_API_KEY}&query=based%20on%20a%20true%20story`);
    const data = await res.json();
    const match = (data.results || []).find(k => k.name.toLowerCase() === 'based on a true story');
    trueStoryKeywordId = match ? String(match.id) : null;
  } catch (err) {
    console.error('Keyword lookup failed for "based on a true story":', err.message);
  }
  return trueStoryKeywordId;
}

// ---------- catalog handler ----------
builder.defineCatalogHandler(async (args) => {
  try {
    const { type, extra = {} } = args;
    const tmdbType = toTmdbType(type);
    const { year, genre, sort, skip, trueStory, seriesType } = extra;

    // Stremio paginates in units of ~20 items via `skip`; TMDB paginates by page.
    const page = skip ? Math.floor(Number(skip) / 20) + 1 : 1;

    const params = new URLSearchParams({
      api_key: TMDB_API_KEY,
      language: 'en-US',
      page: String(page),
      include_adult: 'false',
      'vote_count.gte': '10', // just enough to exclude near-zero-vote noise; weighting handles the rest
      sort_by: mapSort(sort, tmdbType)
    });

    if (year && year !== 'All Years') {
      params.set(tmdbType === 'movie' ? 'primary_release_year' : 'first_air_date_year', year);
    }

    if (genre && genre !== 'All') {
      const genreMap = await getGenreMap(tmdbType);
      const genreId = resolveGenreId(genre, genreMap, tmdbType);
      if (genreId) params.set('with_genres', String(genreId));
    }

    if (trueStory === 'Yes') {
      const keywordId = await getTrueStoryKeywordId();
      if (keywordId) params.set('with_keywords', keywordId);
    }

    if (seriesType === 'Miniseries' && tmdbType === 'tv') {
      params.set('with_type', TV_TYPE_MINISERIES);
    }

    const url = `${TMDB_BASE}/discover/${tmdbType}?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    const results = data.results || [];

    // Average raw score across this page — used as the "pull toward" baseline
    // for titles that don't have many votes yet.
    const pageAverage = results.length
      ? results.reduce((sum, r) => sum + (r.vote_average || 0), 0) / results.length
      : 6.5;

    // Fetch each item's IMDb id in parallel and build the preview once we have it.
    let metas = await Promise.all(
      results.map(item => toMetaPreview(item, tmdbType, pageAverage))
    );

    // TMDB's own vote_average.desc/asc sort doesn't account for vote count, so
    // a title with 3 votes can outrank one with 5,000. Re-rank this page by the
    // weighted score instead when the user picked a Rating sort.
    if (sort === 'Rating Descending') {
      metas.sort((a, b) => b._weightedRating - a._weightedRating);
    } else if (sort === 'Rating Ascending') {
      metas.sort((a, b) => a._weightedRating - b._weightedRating);
    }
    metas = metas.map(({ _weightedRating, ...meta }) => meta);

    return { metas };
  } catch (err) {
    console.error('Catalog handler error:', err);
    return { metas: [] };
  }
});

// ---------- meta handler (detail page) ----------
// Only fires for our own fallback ids ("tmdb:movie:12345") — see idPrefixes
// in manifest.js. Items that got a real IMDb id are NOT ours to serve meta
// for; Cinemeta (already installed in every Stremio) handles "tt..." ids,
// which is also what lets stream addons recognize and offer links for them.
builder.defineMetaHandler(async (args) => {
  try {
    if (!args.id.startsWith('tmdb:')) return { meta: {} };
    const [, tmdbType, id] = args.id.split(':'); // "tmdb:movie:12345" -> ['tmdb','movie','12345']
    const res = await fetch(`${TMDB_BASE}/${tmdbType}/${id}?api_key=${TMDB_API_KEY}&language=en-US`);
    const item = await res.json();
    return { meta: toMetaFull(item, tmdbType) };
  } catch (err) {
    console.error('Meta handler error:', err);
    return { meta: {} };
  }
});

// ---------- TMDB -> Stremio mappers ----------

// Real IMDb id when TMDB has one (lets stream addons + Cinemeta's meta work),
// falling back to our own tmdb:<type>:<id> scheme when it doesn't.
async function getPreviewId(item, tmdbType) {
  try {
    const res = await fetch(`${TMDB_BASE}/${tmdbType}/${item.id}/external_ids?api_key=${TMDB_API_KEY}`);
    const data = await res.json();
    if (data.imdb_id) return data.imdb_id;
  } catch (err) {
    console.error(`external_ids lookup failed for ${tmdbType}/${item.id}:`, err.message);
  }
  return `tmdb:${tmdbType}:${item.id}`;
}

// Bayesian-style weighted rating (same idea IMDb's own Top 250 uses): pulls a
// title's score toward the page average in proportion to how few votes it
// has, instead of letting a handful of 10/10 votes spike it to 9.9. MIN_VOTES
// controls how aggressively low-vote titles get pulled — raise it for more
// smoothing, lower it to trust raw scores sooner.
const MIN_VOTES_FOR_CREDIBILITY = 50;

function weightedRating(voteAverage, voteCount, pageAverage) {
  const v = voteCount || 0;
  const R = voteAverage || 0;
  const m = MIN_VOTES_FOR_CREDIBILITY;
  return (v / (v + m)) * R + (m / (v + m)) * pageAverage;
}

async function toMetaPreview(item, tmdbType, pageAverage) {
  const releaseDate = item.release_date || item.first_air_date;
  const id = await getPreviewId(item, tmdbType);
  const wr = weightedRating(item.vote_average, item.vote_count, pageAverage);
  return {
    id,
    type: tmdbType === 'tv' ? 'series' : 'movie',
    name: item.title || item.name,
    poster: item.poster_path ? `${IMG_BASE}${item.poster_path}` : undefined,
    description: item.overview,
    releaseInfo: releaseDate ? releaseDate.slice(0, 4) : undefined,
    imdbRating: wr.toFixed(1),
    _weightedRating: wr // internal only, stripped before the response is returned
  };
}

function toMetaFull(item, tmdbType) {
  const releaseDate = item.release_date || item.first_air_date;
  return {
    id: `tmdb:${tmdbType}:${item.id}`,
    type: tmdbType === 'tv' ? 'series' : 'movie',
    name: item.title || item.name,
    poster: item.poster_path ? `${IMG_BASE}${item.poster_path}` : undefined,
    background: item.backdrop_path ? `${BACKDROP_BASE}${item.backdrop_path}` : undefined,
    description: item.overview,
    releaseInfo: releaseDate ? releaseDate.slice(0, 4) : undefined,
    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : undefined,
    genres: (item.genres || []).map(g => g.name),
    runtime: item.runtime ? `${item.runtime} min` : undefined
  };
}

module.exports = builder.getInterface();
