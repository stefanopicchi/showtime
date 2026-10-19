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

const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = (map, k, by = 1) => map.set(k, (map.get(k) || 0) + by);

export function computeStats({ views, titles, shows, epViews }, scope) {
  const vs = views.filter((v) => scope === 'all' || (scope === 'movie') === (v.t === 'movie'));
  const seen = new Map(); // titolo -> visioni
  let minutes = 0, ratingSum = 0, ratingN = 0, noDate = 0;
  const years = new Map();
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
    if (v.d) bump(years, v.d.slice(0, 4)); else noDate++;
  }
  // voti delle serie: uno per serie
  if (scope !== 'movie') {
    for (const k of seen.keys()) {
      if (!k.startsWith('tv:')) continue;
      const r = shows.get(+k.slice(3))?.r;
      if (r) { ratingSum += r; ratingN++; }
    }
  }

  const genres = new Map(), decades = new Map(), actors = new Map(), directors = new Map();
  const status = new Map();
  const movies = [];
  for (const k of seen.keys()) {
    const ti = titles.get(k);
    if (!ti) continue;
    ti.genres.forEach((g) => bump(genres, g.name));
    if (ti.year) bump(decades, Math.floor(ti.year / 10) * 10 + 's');
    ti.actors.forEach((p) => bump(actors, p.name));
    ti.directors.forEach((p) => bump(directors, p.name));
    if (k.startsWith('movie:') && ti.runtime) movies.push(ti);
    if (k.startsWith('tv:')) bump(status, showStatus(ti, shows.get(ti.tmdb_id), epViews.get(ti.tmdb_id)));
  }
  movies.sort((a, b) => b.runtime - a.runtime);

  return {
    titles: seen.size,
    plays: vs.length,
    moviePlays,
    episodes,
    minutes,
    avgRating: ratingN ? ratingSum / ratingN : null,
    ratedCount: ratingN,
    genres: top(genres, 8),
    decades: [...decades.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    years: [...years.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    noDate,
    actors: top(actors, 10),
    directors: top(directors, 10),
    longest: movies[0] || null,
    shortest: movies[movies.length - 1] || null,
    status: [...status.entries()],
  };
}

export function fmtTime(min) {
  const h = Math.round(min / 60);
  const days = h / 24;
  return { hours: h.toLocaleString(), days: days >= 2 ? days.toFixed(1) : null };
}
