// API di ShowTime: un unico router per tutte le chiamate /api/*

const TMDB = 'https://api.themoviedb.org/3';
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (error, status = 400) => json({ error }, status);

const int = (v) => (Number.isInteger(v) ? v : null);
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const rating = (v) => (Number.isInteger(v) && v >= 1 && v <= 10 ? v : null);
const STATUSES = ['watching', 'completed', 'paused', 'dropped'];

// ---------- TMDB ----------

async function tmdb(env, path, params = {}) {
  const url = new URL(TMDB + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${env.TMDB_TOKEN}`, accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`tmdb_${r.status}`);
  return r.json();
}

const person = (p) => ({ id: p.id, name: p.name });
const year = (d) => (d ? parseInt(d.slice(0, 4), 10) || null : null);

async function fetchTitle(env, type, id, lang) {
  if (type === 'movie') {
    const d = await tmdb(env, `/movie/${id}`, { language: lang, append_to_response: 'credits' });
    return {
      row: {
        media_type: 'movie', tmdb_id: id, lang,
        title: d.title, original_title: d.original_title, year: year(d.release_date),
        poster_path: d.poster_path, overview: d.overview || null, runtime: d.runtime || null,
        genres: JSON.stringify((d.genres || []).map((g) => ({ id: g.id, name: g.name }))),
        actors: JSON.stringify((d.credits?.cast || []).slice(0, 10).map(person)),
        directors: JSON.stringify((d.credits?.crew || []).filter((c) => c.job === 'Director').slice(0, 3).map(person)),
        tv_status: null, seasons: null, episodes_aired: null,
      },
      episodes: [],
    };
  }
  const d = await tmdb(env, `/tv/${id}`, { language: lang, append_to_response: 'credits' });
  const nums = (d.seasons || []).map((s) => s.season_number);
  const episodes = [];
  for (let i = 0; i < nums.length; i += 20) {
    const part = nums.slice(i, i + 20);
    const s = await tmdb(env, `/tv/${id}`, {
      language: lang, append_to_response: part.map((n) => `season/${n}`).join(','),
    });
    for (const n of part) {
      for (const e of s[`season/${n}`]?.episodes || []) {
        episodes.push({ season: n, episode: e.episode_number, name: e.name, runtime: e.runtime || null, air_date: e.air_date || null });
      }
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const runtimes = episodes.map((e) => e.runtime).filter(Boolean);
  const avg = runtimes.length
    ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length)
    : d.episode_run_time?.[0] || null;
  return {
    row: {
      media_type: 'tv', tmdb_id: id, lang,
      title: d.name, original_title: d.original_name, year: year(d.first_air_date),
      poster_path: d.poster_path, overview: d.overview || null, runtime: avg,
      genres: JSON.stringify((d.genres || []).map((g) => ({ id: g.id, name: g.name }))),
      actors: JSON.stringify((d.credits?.cast || []).slice(0, 10).map(person)),
      directors: JSON.stringify((d.created_by || []).slice(0, 3).map(person)),
      tv_status: d.status || null,
      seasons: nums.filter((n) => n > 0).length,
      episodes_aired: episodes.filter((e) => e.season > 0 && e.air_date && e.air_date <= today).length,
    },
    episodes,
  };
}

async function saveTitle(db, { row, episodes }) {
  const cols = Object.keys(row);
  const keys = ['media_type', 'tmdb_id', 'lang'];
  const stmts = [
    db.prepare(
      `INSERT INTO titles (${cols.join(',')}, fetched_at) VALUES (${cols.map(() => '?').join(',')}, datetime('now'))
       ON CONFLICT(media_type, tmdb_id, lang) DO UPDATE SET
       ${cols.filter((c) => !keys.includes(c)).map((c) => `${c}=excluded.${c}`).join(',')}, fetched_at=datetime('now')`
    ).bind(...cols.map((c) => row[c] ?? null)),
  ];
  if (episodes.length) {
    stmts.push(
      db.prepare(
        `INSERT INTO episodes (show_id, season, episode, name, runtime, air_date)
         SELECT ?1, json_extract(value,'$.season'), json_extract(value,'$.episode'), json_extract(value,'$.name'),
                json_extract(value,'$.runtime'), json_extract(value,'$.air_date')
         FROM json_each(?2) WHERE true
         ON CONFLICT(show_id, season, episode) DO UPDATE SET
           name=excluded.name, runtime=excluded.runtime, air_date=excluded.air_date`
      ).bind(row.tmdb_id, JSON.stringify(episodes))
    );
  }
  await db.batch(stmts);
}

async function getLang(db, user) {
  const r = await db.prepare('SELECT lang FROM user_settings WHERE user_id = ?').bind(user).first();
  return r?.lang || 'it-IT';
}

const parseTitle = (r) => ({
  ...r, genres: JSON.parse(r.genres), actors: JSON.parse(r.actors), directors: JSON.parse(r.directors),
});

// Restituisce il titolo dalla cache, aggiornandolo da TMDB se manca o e' vecchio
async function ensureTitle(env, type, id, lang) {
  const db = env.DB;
  let row = await db.prepare('SELECT * FROM titles WHERE media_type=? AND tmdb_id=? AND lang=?').bind(type, id, lang).first();
  const ongoing = row && type === 'tv' && !['Ended', 'Canceled'].includes(row.tv_status);
  const maxAgeDays = ongoing ? 7 : 90;
  const stale = !row || Date.now() - new Date(row.fetched_at + 'Z').getTime() > maxAgeDays * 864e5;
  if (stale) {
    await saveTitle(db, await fetchTitle(env, type, id, lang));
    row = await db.prepare('SELECT * FROM titles WHERE media_type=? AND tmdb_id=? AND lang=?').bind(type, id, lang).first();
  }
  return row;
}

// ---------- Handlers ----------

async function library(env, user) {
  const db = env.DB;
  const lang = await getLang(db, user);
  const mine = `WITH mine AS (
      SELECT CASE media_type WHEN 'movie' THEN 'movie' ELSE 'tv' END AS mt, tmdb_id AS tid FROM views WHERE user_id = ?1
      UNION SELECT media_type, tmdb_id FROM watchlist WHERE user_id = ?1
      UNION SELECT 'tv', tmdb_id FROM user_shows WHERE user_id = ?1)`;
  const [views, titles, missing, wl, shows] = await db.batch([
    db.prepare(
      `SELECT v.id, v.media_type AS t, v.tmdb_id AS tid, v.season AS s, v.episode AS e,
              v.watched_at AS d, v.rating AS r, ep.runtime AS rt
       FROM views v LEFT JOIN episodes ep
         ON v.media_type = 'episode' AND ep.show_id = v.tmdb_id AND ep.season = v.season AND ep.episode = v.episode
       WHERE v.user_id = ?`
    ).bind(user),
    db.prepare(
      `${mine} SELECT t.media_type, t.tmdb_id, t.title, t.original_title, t.year, t.poster_path, t.runtime,
              t.genres, t.actors, t.directors, t.tv_status, t.seasons, t.episodes_aired
       FROM titles t JOIN mine m ON m.mt = t.media_type AND m.tid = t.tmdb_id WHERE t.lang = ?2`
    ).bind(user, lang),
    db.prepare(
      `${mine} SELECT m.mt AS t, m.tid AS id FROM mine m
       LEFT JOIN titles t ON t.media_type = m.mt AND t.tmdb_id = m.tid AND t.lang = ?2 WHERE t.tmdb_id IS NULL`
    ).bind(user, lang),
    db.prepare('SELECT media_type AS t, tmdb_id AS id, added_at AS at FROM watchlist WHERE user_id = ? ORDER BY added_at DESC, rowid DESC').bind(user),
    db.prepare('SELECT tmdb_id AS id, status, rating AS r FROM user_shows WHERE user_id = ?').bind(user),
  ]);
  return json({
    lang,
    views: views.results,
    titles: titles.results.map(parseTitle),
    missing: missing.results,
    watchlist: wl.results,
    shows: shows.results,
  });
}

function cleanViews(rows) {
  if (!Array.isArray(rows) || rows.length > 800) return null;
  return rows
    .map((r) => ({
      t: r.t === 'movie' ? 'movie' : 'episode',
      tid: int(r.tid), s: int(r.s), e: int(r.e), d: date(r.d), r: rating(r.r),
      src: typeof r.src === 'string' ? r.src.slice(0, 80) : null,
    }))
    .filter((r) => r.tid && (r.t === 'movie' || (r.s !== null && r.e !== null)));
}

export async function onRequest({ request, env, data, params }) {
  if (!env.DB) return fail('db_not_configured', 503);
  if (!env.TMDB_TOKEN) return fail('tmdb_not_configured', 503);
  const db = env.DB;
  const user = data.user;
  const route = [].concat(params.route || []);
  const [a, b, c] = route;
  const method = request.method;
  const body = method === 'GET' ? {} : await request.json().catch(() => ({}));
  const url = new URL(request.url);

  try {
    // Ricerca film/serie
    if (a === 'search' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return json({ results: [] });
      const lang = await getLang(db, user);
      const d = await tmdb(env, '/search/multi', { query: q, language: lang, include_adult: 'false', page: '1' });
      const results = (d.results || [])
        .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
        .map((r) => ({
          t: r.media_type, id: r.id, title: r.title || r.name,
          year: year(r.release_date || r.first_air_date), poster: r.poster_path,
        }));
      return json({ results });
    }

    // Dettaglio titolo (+ episodi)
    if (a === 'title' && method === 'GET') {
      const type = b === 'movie' ? 'movie' : b === 'tv' ? 'tv' : null;
      const id = parseInt(c, 10);
      if (!type || !id) return fail('bad_request');
      const row = await ensureTitle(env, type, id, await getLang(db, user));
      const eps = type === 'tv'
        ? (await db.prepare('SELECT season AS s, episode AS e, name, runtime AS rt, air_date AS ad FROM episodes WHERE show_id = ? ORDER BY season, episode').bind(id).all()).results
        : [];
      return json({ title: parseTitle(row), episodes: eps });
    }

    // Scarica/aggiorna piu' titoli (usato dall'import e dal cambio lingua)
    if (a === 'ensure' && method === 'POST') {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 4);
      const lang = await getLang(db, user);
      const ok = [], failed = [];
      for (const it of items) {
        const type = it.t === 'movie' ? 'movie' : 'tv';
        const id = int(it.id);
        if (!id) continue;
        try { await ensureTitle(env, type, id, lang); ok.push(it); } catch { failed.push(it); }
      }
      return json({ ok, failed });
    }

    if (a === 'library' && method === 'GET') return await library(env, user);

    // Visioni
    if (a === 'views' && !b && method === 'POST') {
      const rows = cleanViews(body.rows);
      if (!rows) return fail('bad_rows');
      if (!rows.length) return json({ added: [] });
      const payload = JSON.stringify(rows);
      const res = await db.batch([
        db.prepare(
          `INSERT OR IGNORE INTO views (user_id, media_type, tmdb_id, season, episode, watched_at, rating, src)
           SELECT ?1, json_extract(value,'$.t'), json_extract(value,'$.tid'), json_extract(value,'$.s'), json_extract(value,'$.e'),
                  json_extract(value,'$.d'), json_extract(value,'$.r'), json_extract(value,'$.src')
           FROM json_each(?2) WHERE true
           RETURNING id, media_type AS t, tmdb_id AS tid, season AS s, episode AS e, watched_at AS d, rating AS r`
        ).bind(user, payload),
        db.prepare(
          `DELETE FROM watchlist WHERE user_id = ?1 AND (media_type, tmdb_id) IN
             (SELECT CASE json_extract(value,'$.t') WHEN 'movie' THEN 'movie' ELSE 'tv' END, json_extract(value,'$.tid')
              FROM json_each(?2))`
        ).bind(user, payload),
      ]);
      return json({ added: res[0].results });
    }
    if (a === 'views' && b === 'delete' && method === 'POST') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter(Number.isInteger).slice(0, 2000);
      await db.prepare('DELETE FROM views WHERE user_id = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(user, JSON.stringify(ids)).run();
      return json({ ok: true });
    }
    if (a === 'views' && b && method === 'PATCH') {
      await db.prepare('UPDATE views SET watched_at = ?, rating = ? WHERE id = ? AND user_id = ?')
        .bind(date(body.d), rating(body.r), parseInt(b, 10), user).run();
      return json({ ok: true });
    }

    // Watchlist
    if (a === 'watchlist' && method === 'PUT') {
      const type = body.t === 'movie' ? 'movie' : 'tv';
      const id = int(body.id);
      if (!id) return fail('bad_request');
      if (body.on) {
        await db.prepare('INSERT OR IGNORE INTO watchlist (user_id, media_type, tmdb_id) VALUES (?, ?, ?)').bind(user, type, id).run();
      } else {
        await db.prepare('DELETE FROM watchlist WHERE user_id = ? AND media_type = ? AND tmdb_id = ?').bind(user, type, id).run();
      }
      return json({ ok: true });
    }

    // Stato e voto di una serie
    if (a === 'show' && b && method === 'PUT') {
      const status = STATUSES.includes(body.status) ? body.status : null;
      await db.prepare(
        `INSERT INTO user_shows (user_id, tmdb_id, status, rating) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, tmdb_id) DO UPDATE SET status = excluded.status, rating = excluded.rating`
      ).bind(user, parseInt(b, 10), status, rating(body.r)).run();
      return json({ ok: true });
    }

    // Impostazioni
    if (a === 'settings' && method === 'PUT') {
      const lang = body.lang === 'en-US' ? 'en-US' : 'it-IT';
      await db.prepare(
        `INSERT INTO user_settings (user_id, lang) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET lang = excluded.lang`
      ).bind(user, lang).run();
      return json({ ok: true });
    }

    // Backup completo dei dati dell'utente
    if (a === 'export' && method === 'GET') {
      const [views, wl, shows] = await db.batch([
        db.prepare('SELECT id, media_type AS t, tmdb_id AS tid, season AS s, episode AS e, watched_at AS d, rating AS r FROM views WHERE user_id = ? ORDER BY id').bind(user),
        db.prepare('SELECT media_type AS t, tmdb_id AS id, added_at AS at FROM watchlist WHERE user_id = ?').bind(user),
        db.prepare('SELECT tmdb_id AS id, status, rating AS r FROM user_shows WHERE user_id = ?').bind(user),
      ]);
      return json({
        app: 'showtime', version: 1, exported_at: new Date().toISOString(),
        views: views.results, watchlist: wl.results, shows: shows.results,
      });
    }

    return fail('not_found', 404);
  } catch (err) {
    return fail(String(err.message || err).slice(0, 200), 500);
  }
}
