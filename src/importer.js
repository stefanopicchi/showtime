// Import dei dati: export ZIP di Trakt oppure backup JSON di ShowTime
import { unzipSync, strFromU8 } from 'fflate';
import { api } from './api';

const ymd = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; // data locale
};

function parseTrakt(bytes) {
  const files = unzipSync(bytes, {
    filter: (f) => /(?:^|\/)(watched-history-\d+|lists-watchlist|ratings-movies|ratings-shows)\.json$/.test(f.name),
  });
  const views = [], watchlist = [], shows = new Map(), movieRatings = new Map();
  let skipped = 0;
  for (const [name, buf] of Object.entries(files)) {
    const arr = JSON.parse(strFromU8(buf));
    if (name.includes('watched-history')) {
      for (const h of arr) {
        if (h.type === 'movie') {
          const id = h.movie?.ids?.tmdb;
          if (!id) { skipped++; continue; }
          views.push({ t: 'movie', tid: id, s: null, e: null, d: ymd(h.watched_at), r: null, src: 'trakt:' + h.id });
        } else if (h.type === 'episode') {
          const id = h.show?.ids?.tmdb;
          if (!id || h.episode?.season == null || h.episode?.number == null) { skipped++; continue; }
          views.push({ t: 'episode', tid: id, s: h.episode.season, e: h.episode.number, d: ymd(h.watched_at), r: null, src: 'trakt:' + h.id });
        }
      }
    } else if (name.includes('watchlist')) {
      for (const w of arr) {
        if (w.type === 'movie' && w.movie?.ids?.tmdb) watchlist.push({ t: 'movie', id: w.movie.ids.tmdb });
        else if (w.type === 'show' && w.show?.ids?.tmdb) watchlist.push({ t: 'tv', id: w.show.ids.tmdb });
      }
    } else if (name.includes('ratings-movies')) {
      for (const r of arr) if (r.movie?.ids?.tmdb) movieRatings.set(r.movie.ids.tmdb, r.rating);
    } else if (name.includes('ratings-shows')) {
      for (const r of arr) if (r.show?.ids?.tmdb) shows.set(r.show.ids.tmdb, { id: r.show.ids.tmdb, status: null, r: r.rating });
    }
  }
  for (const v of views) if (v.t === 'movie' && movieRatings.has(v.tid)) v.r = movieRatings.get(v.tid);
  return { views, watchlist, shows: [...shows.values()], skipped };
}

function parseBackup(j) {
  if (j?.app !== 'showtime') throw new Error('bad_file');
  return {
    views: (j.views || []).map((v) => ({ t: v.t, tid: v.tid, s: v.s, e: v.e, d: v.d, r: v.r, src: 'bk:' + v.id })),
    watchlist: (j.watchlist || []).map((w) => ({ t: w.t, id: w.id })),
    shows: j.shows || [],
    skipped: 0,
  };
}

export async function readImportFile(file) {
  if (/\.zip$/i.test(file.name)) return parseTrakt(new Uint8Array(await file.arrayBuffer()));
  return parseBackup(JSON.parse(await file.text()));
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

// Scarica i metadati (TMDB) dei titoli indicati. Restituisce quelli falliti.
export async function ensureTitles(items, onProgress = () => {}) {
  const chunks = [];
  for (let i = 0; i < items.length; i += 4) chunks.push(items.slice(i, i + 4));
  let done = 0, failed = [];
  await pool(chunks, 3, async (chunk) => {
    try {
      const r = await api.post('ensure', { items: chunk });
      failed.push(...r.failed);
    } catch { failed.push(...chunk); }
    done += chunk.length;
    onProgress(done, items.length);
  });
  return failed;
}

export async function runImport(data, onPhase) {
  const key = (t, id) => t + ':' + id;
  const wanted = new Map();
  data.views.forEach((v) => wanted.set(key(v.t === 'movie' ? 'movie' : 'tv', v.tid), { t: v.t === 'movie' ? 'movie' : 'tv', id: v.tid }));
  data.watchlist.forEach((w) => wanted.set(key(w.t, w.id), w));
  data.shows.forEach((s) => wanted.set(key('tv', s.id), { t: 'tv', id: s.id }));
  const items = [...wanted.values()];

  onPhase('titles', 0, items.length);
  let failed = await ensureTitles(items, (d, n) => onPhase('titles', d, n));
  if (failed.length) failed = await ensureTitles(failed); // secondo tentativo

  let added = 0;
  for (let i = 0; i < data.views.length; i += 500) {
    const r = await api.post('views', { rows: data.views.slice(i, i + 500) });
    added += r.added.length;
    onPhase('views', Math.min(i + 500, data.views.length), data.views.length);
  }
  const watched = new Set(data.views.map((v) => key(v.t === 'movie' ? 'movie' : 'tv', v.tid)));
  for (const w of data.watchlist) if (!watched.has(key(w.t, w.id))) await api.put('watchlist', { t: w.t, id: w.id, on: true });
  for (const s of data.shows) await api.put('show/' + s.id, { status: s.status, r: s.r });
  return { added, total: data.views.length, failed: failed.length };
}
