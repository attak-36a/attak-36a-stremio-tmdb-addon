// manifest.js
// NOTE: dropdown order in Stremio's Discover header:
//   1) Type          -> built-in, from `types` below.
//   2) Catalog name   -> NATIVE Stremio UI, not addon-controlled. It shows
//                        whenever more than one catalog of that type exists
//                        across ALL installed addons (Cinemeta's built-in
//                        "Popular"/"Top" catalogs count). Cannot be suppressed
//                        from the manifest even with a single catalog here.
//   3+) extra[] entries with `options`, in array order -> genre, then year,
//       then sort (the client may collapse extras into a filter icon
//       depending on available width).

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = ['All Years'];
for (let y = CURRENT_YEAR; y >= 1980; y--) YEARS.push(String(y));

const GENRES = [
  'All', 'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror',
  'Music', 'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western'
];

const SORT_OPTIONS = [
  'Rating Descending',
  'Rating Ascending',
  'Release Date Descending',
  'Release Date Ascending'
];

const TRUE_STORY_OPTIONS = ['All', 'Yes'];
const SERIES_TYPE_OPTIONS = ['All', 'Miniseries']; // TV-only — TMDB has no movie equivalent

function extraFor(type) {
  const extra = [
    { name: 'genre', options: GENRES, isRequired: false },
    { name: 'year', options: YEARS, isRequired: false },
    { name: 'sort', options: SORT_OPTIONS, isRequired: false },
    { name: 'trueStory', options: TRUE_STORY_OPTIONS, isRequired: false }
  ];
  if (type === 'series') {
    extra.push({ name: 'seriesType', options: SERIES_TYPE_OPTIONS, isRequired: false });
  }
  extra.push({ name: 'skip' });
  return extra;
}

const manifest = {
  id: 'org.yourname.tmdbdiscover',
  version: '1.0.0',
  name: 'TMDB Discover',
  description: 'Discover movies & series from TMDB with Genre, Year, Sort, True Story and Mini-Series filters',
  logo: 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg',
  resources: ['catalog', 'meta'],
  types: ['movie', 'series'],
  idPrefixes: ['tmdb:'],
  catalogs: [
    {
      type: 'movie',
      id: 'tmdb-discover-movie',
      name: 'Discover',
      extra: extraFor('movie')
    },
    {
      type: 'series',
      id: 'tmdb-discover-series',
      name: 'Discover',
      extra: extraFor('series')
    }
  ]
};

module.exports = manifest;
