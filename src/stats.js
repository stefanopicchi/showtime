// Calcolo delle statistiche all-time (tutto, solo film, solo serie)

const tvKey = (v) => (v.t === 'movie' ? 'movie:' : 'tv:') + v.tid;

// Episodi unici visti di una serie (speciali esclusi)
export function uniqueEpisodes(views) {
  return new Set((views || []).filter((v) => v.s > 0).map((v) => v.s + ':' + v.e)).size;
}

// Stato mostrato di una serie: quello scelto dall'utente, altrimenti calcolato
export function showStatus(title, saved, views) {
  if (saved?.status) return saved.status;
  const aired = title?.episodes_aired;
  return aired && uniqueEpisodes(views) >= aired ? 'completed' : 'watching';
}

// Ogni categoria e' una mappa  etichetta -> (titolo -> numero di visioni),
// cosi' toccando una barra si puo' mostrare l'elenco dei titoli che la compongono.
const add = (map, label, key, n = 1) => {
  let m = map.get(label);
  if (!m) map.set(label, (m = new Map()));
  m.set(key, (m.get(key) || 0) + n);
};
// righe [etichetta, valore, [[titolo, visioni], ...]]
const rows = (map, { limit, byPlays = false, byLabel = false } = {}) => {
  const out = [...map.entries()].map(([label, m]) => [
    label,
    byPlays ? [...m.values()].reduce((x, y) => x + y, 0) : m.size,
    [...m.entries()],
  ]);
  out.sort(byLabel ? (x, y) => String(x[0]).localeCompare(String(y[0])) : (x, y) => y[1] - x[1]);
  return limit ? out.slice(0, limit) : out;
};

export function computeStats({ views, titles, shows, epViews }, scope) {
  const vs = views.filter((v) => scope === 'all' || (scope === 'movie') === (v.t === 'movie'));
  const seen = new Map(); // titolo -> visioni
  let minutes = 0, ratingSum = 0, ratingN = 0;
  const years = new Map(), noDate = new Map();
  let episodes = 0, moviePlays = 0;

  for (const v of vs) {
    const k = tvKey(v);
    const ti = titles.get(k);
    seen.set(k, (seen.get(k) || 0) + 1);
    minutes += (v.t === 'movie' ? ti?.runtime : v.rt ?? ti?.runtime) || 0;
    if (v.t === 'movie') {
      moviePlays++;
      if (v.r) { ratingSum += v.r; ratingN++; }
    } else episodes++;
    if (v.d) add(years, v.d.slice(0, 4), k); else add(noDate, '', k);
  }
  // voti delle serie: uno per serie
  if (scope !== 'movie') {
    for (const k of seen.keys()) {
      if (!k.startsWith('tv:')) continue;
      const r = shows.get(+k.slice(3))?.r;
      if (r) { ratingSum += r; ratingN++; }
    }
  }

  const genres = new Map(), decades = new Map(), actors = new Map(), directors = new Map(), status = new Map();
  const movies = [];
  for (const [k, n] of seen) {
    const ti = titles.get(k);
    if (!ti) continue;
    ti.genres.forEach((g) => add(genres, g.name, k, n));
    if (ti.year) add(decades, Math.floor(ti.year / 10) * 10 + 's', k, n);
    ti.actors.forEach((p) => add(actors, p.name, k, n));
    ti.directors.forEach((p) => add(directors, p.name, k, n));
    if (k.startsWith('movie:') && ti.runtime) movies.push(ti);
    if (k.startsWith('tv:')) add(status, showStatus(ti, shows.get(ti.tmdb_id), epViews.get(ti.tmdb_id)), k, n);
  }
  movies.sort((a, b) => b.runtime - a.runtime);
  const noDateRow = noDate.size ? rows(noDate, { byPlays: true })[0] : null;

  return {
    titles: seen.size,
    plays: vs.length,
    moviePlays,
    episodes,
    minutes,
    avgRating: ratingN ? ratingSum / ratingN : null,
    ratedCount: ratingN,
    genres: rows(genres, { limit: 8 }),
    decades: rows(decades, { byLabel: true }),
    years: rows(years, { byPlays: true, byLabel: true }),
    noDate: noDateRow,
    actors: rows(actors, { limit: 10 }),
    directors: rows(directors, { limit: 10 }),
    longest: movies[0] || null,
    shortest: movies[movies.length - 1] || null,
    status: rows(status),
  };
}

export function fmtTime(min) {
  const h = Math.round(min / 60);
  const days = h / 24;
  return { hours: h.toLocaleString(), days: days >= 2 ? days.toFixed(1) : null };
}
