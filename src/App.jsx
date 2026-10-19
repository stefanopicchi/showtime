import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { makeT, errText } from './i18n';
import { Ctx, useCtx, Poster, Segment } from './ctx.jsx';
import { ensureTitles } from './importer';
import { uniqueEpisodes } from './stats';
import Detail from './Detail.jsx';
import Stats from './Stats.jsx';
import Settings from './Settings.jsx';

const icons = {
  library: 'M4 6h16M4 12h16M4 18h10',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4-4',
  watchlist: 'M6 4h12v17l-6-4-6 4z',
  stats: 'M5 20V10m7 10V4m7 16v-7',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0-6v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1',
};
const Icon = ({ n }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icons[n]} /></svg>
);

/* ---------- Schermate ---------- */

function Library() {
  const { t, lib, open } = useCtx();
  const [scope, setScope] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');

  const items = useMemo(() => {
    const out = [];
    const add = (kind, id, vs) => {
      let last = '', maxId = 0;
      vs.forEach((v) => { if (v.d && v.d > last) last = v.d; if (v.id > maxId) maxId = v.id; });
      out.push({ kind, id, ti: lib.titles.get(kind + ':' + id), count: kind === 'movie' ? vs.length : uniqueEpisodes(vs), last, maxId });
    };
    lib.movieViews.forEach((vs, id) => add('movie', id, vs));
    lib.epViews.forEach((vs, id) => add('tv', id, vs));
    return out;
  }, [lib]);

  const list = items
    .filter((i) => (scope === 'all' || i.kind === scope) && (i.ti?.title || '').toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) =>
      sort === 'title' ? (a.ti?.title || '').localeCompare(b.ti?.title || '')
      : sort === 'year' ? (b.ti?.year || 0) - (a.ti?.year || 0)
      : b.last.localeCompare(a.last) || b.maxId - a.maxId);

  return (
    <div className="screen">
      <Segment value={scope} onChange={setScope} options={[['all', t('all')], ['movie', t('movies')], ['tv', t('series')]]} />
      <div className="row">
        <input className="grow" placeholder={t('filter')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">{t('sortRecent')}</option>
          <option value="title">{t('sortTitle')}</option>
          <option value="year">{t('sortYear')}</option>
        </select>
      </div>
      {!items.length && <p className="muted center">{t('emptyLibrary')}</p>}
      <div className="grid">
        {list.map((i) => (
          <button className="tile" key={i.kind + i.id} onClick={() => open(i.kind, i.id)}>
            <div className="tile-img">
              <Poster path={i.ti?.poster_path} />
              {(i.kind === 'tv' || i.count > 1) && (
                <span className="badge">{i.kind === 'tv' ? `${i.count}${i.ti?.episodes_aired ? '/' + i.ti.episodes_aired : ''}` : '×' + i.count}</span>
              )}
            </div>
            <span className="tile-title">{i.ti?.title || '…'}</span>
            <span className="muted">{i.ti?.year || ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Search() {
  const { t, lib, open, fail } = useCtx();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);

  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const h = setTimeout(() => {
      api.get('search?q=' + encodeURIComponent(q.trim())).then((r) => setRes(r.results)).catch((e) => fail(e.message));
    }, 400);
    return () => clearTimeout(h);
  }, [q]);

  return (
    <div className="screen">
      <input autoFocus placeholder={t('searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
      {res && !res.length && <p className="muted center">{t('noResults')}</p>}
      {(res || []).map((r) => {
        const k = r.t + ':' + r.id;
        const seen = lib.movieViews.has(r.id) && r.t === 'movie' || lib.epViews.has(r.id) && r.t === 'tv';
        return (
          <button className="item" key={k} onClick={() => open(r.t, r.id)}>
            <div className="thumb"><Poster path={r.poster} size="w185" /></div>
            <div className="item-text">
              <b>{r.title}</b>
              <span className="muted">{[r.year, t(r.t)].filter(Boolean).join(' · ')}</span>
            </div>
            <span className="marks">{seen ? '✓' : ''}{lib.wl.has(k) ? '★' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function Watchlist() {
  const { t, lib, act, open } = useCtx();
  const [scope, setScope] = useState('all');
  const list = lib.watchlist.filter((w) => scope === 'all' || w.t === scope);
  return (
    <div className="screen">
      <Segment value={scope} onChange={setScope} options={[['all', t('all')], ['movie', t('movies')], ['tv', t('series')]]} />
      {!list.length && <p className="muted center">{t('emptyWatchlist')}</p>}
      {list.map((w) => {
        const ti = lib.titles.get(w.t + ':' + w.id);
        return (
          <div className="item" key={w.t + w.id}>
            <button className="item-main" onClick={() => open(w.t, w.id)}>
              <div className="thumb"><Poster path={ti?.poster_path} size="w185" /></div>
              <div className="item-text">
                <b>{ti?.title || '…'}</b>
                <span className="muted">{[ti?.year, t(w.t)].filter(Boolean).join(' · ')}</span>
              </div>
            </button>
            <div className="item-actions">
              <button className="btn small primary" onClick={() => (w.t === 'movie' ? act.addViews([{ t: 'movie', tid: w.id, s: null, e: null, d: null, r: null }]) : open(w.t, w.id))}>✓ {t('markWatched')}</button>
              <button className="btn small" onClick={() => act.toggleWatchlist(w.t, w.id, false)}>{t('remove')}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- App ---------- */

export default function App() {
  const [raw, setRaw] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('library');
  const [detail, setDetail] = useState(null);
  const [sync, setSync] = useState(null);
  const [theme, setThemeState] = useState(localStorage.getItem('theme') || 'auto');
  const tried = useRef(new Set());

  const uiLang = raw ? raw.lang.slice(0, 2) : localStorage.getItem('lang') || 'it';
  const t = useMemo(() => makeT(uiLang), [uiLang]);

  useEffect(() => {
    if (raw) localStorage.setItem('lang', uiLang);
    document.documentElement.lang = uiLang;
  }, [uiLang, raw]);

  const setTheme = (v) => { localStorage.setItem('theme', v); setThemeState(v); };
  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const load = useCallback(() => api.get('library').then(setRaw).catch((e) => setFatal(e.message)), []);
  useEffect(() => { load(); }, [load]);

  // Titoli senza metadati nella lingua scelta (es. dopo il cambio lingua): scarica in background
  useEffect(() => {
    if (!raw?.missing?.length) return;
    const todo = raw.missing.filter((m) => !tried.current.has(m.t + ':' + m.id));
    if (!todo.length) return;
    todo.forEach((m) => tried.current.add(m.t + ':' + m.id));
    setSync({ done: 0, total: todo.length });
    ensureTitles(todo, (done, total) => setSync({ done, total })).then(() => { setSync(null); load(); });
  }, [raw?.missing, load]);

  const fail = useCallback((code) => setError(code), []);

  const act = useMemo(() => {
    const safe = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { setError(e.message); } };
    return {
      reload: load,
      upsertTitle: (ti) => setRaw((r) => r && ({ ...r, titles: [...r.titles.filter((x) => !(x.media_type === ti.media_type && x.tmdb_id === ti.tmdb_id)), ti] })),
      addViews: safe(async (rows, rtOf) => {
        const all = [];
        for (let i = 0; i < rows.length; i += 500) all.push(...(await api.post('views', { rows: rows.slice(i, i + 500) })).added);
        setRaw((r) => {
          const done = new Set(all.map((a) => (a.t === 'movie' ? 'movie' : 'tv') + ':' + a.tid));
          return { ...r, views: [...r.views, ...all.map((a) => ({ ...a, rt: rtOf ? rtOf(a) : null }))], watchlist: r.watchlist.filter((w) => !done.has(w.t + ':' + w.id)) };
        });
      }),
      delViews: safe(async (ids) => {
        await api.post('views/delete', { ids });
        const gone = new Set(ids);
        setRaw((r) => ({ ...r, views: r.views.filter((v) => !gone.has(v.id)) }));
      }),
      patchView: safe(async (id, { d, r }) => {
        await api.patch('views/' + id, { d, r });
        setRaw((x) => ({ ...x, views: x.views.map((v) => (v.id === id ? { ...v, d, r } : v)) }));
      }),
      toggleWatchlist: safe(async (kind, id, on) => {
        await api.put('watchlist', { t: kind, id, on });
        setRaw((r) => ({
          ...r,
          watchlist: on ? [{ t: kind, id, at: new Date().toISOString() }, ...r.watchlist] : r.watchlist.filter((w) => !(w.t === kind && w.id === id)),
        }));
      }),
      setShow: safe(async (id, { status, r }) => {
        await api.put('show/' + id, { status, r });
        setRaw((x) => ({ ...x, shows: [...x.shows.filter((s) => s.id !== id), { id, status, r }] }));
      }),
      setLang: safe(async (lang) => {
        await api.put('settings', { lang });
        tried.current.clear();
        await load();
      }),
    };
  }, [load]);

  const lib = useMemo(() => {
    if (!raw) return null;
    const movieViews = new Map(), epViews = new Map();
    for (const v of raw.views) {
      const m = v.t === 'movie' ? movieViews : epViews;
      if (!m.has(v.tid)) m.set(v.tid, []);
      m.get(v.tid).push(v);
    }
    return {
      ...raw,
      titles: new Map(raw.titles.map((x) => [x.media_type + ':' + x.tmdb_id, x])),
      shows: new Map(raw.shows.map((s) => [s.id, s])),
      wl: new Set(raw.watchlist.map((w) => w.t + ':' + w.id)),
      movieViews, epViews,
    };
  }, [raw]);

  if (fatal) {
    return (
      <div className="fatal">
        <h1>ShowTime</h1>
        <p>{errText(t, fatal)}</p>
        <button className="btn primary" onClick={() => location.reload()}>{t('retry')}</button>
      </div>
    );
  }
  if (!lib) return <div className="fatal"><h1>ShowTime</h1><p className="muted">{t('loading')}</p></div>;

  const screens = { library: <Library />, search: <Search />, watchlist: <Watchlist />, stats: <Stats />, settings: <Settings /> };

  return (
    <Ctx.Provider value={{ t, lib, act, theme, setTheme, fail, open: (kind, id) => setDetail({ kind, id }) }}>
      <header className="top"><b>ShowTime</b></header>
      {sync && <div className="banner">{t('updatingTitles')} {sync.done}/{sync.total}</div>}
      {error && <div className="banner error" onClick={() => setError(null)}>{errText(t, error)} ✕</div>}
      <main>{screens[tab]}</main>
      <nav className="tabs">
        {Object.keys(screens).map((k) => (
          <button key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)}>
            <Icon n={k} /><span>{t(k)}</span>
          </button>
        ))}
      </nav>
      {detail && <Detail kind={detail.kind} id={detail.id} onClose={() => setDetail(null)} />}
    </Ctx.Provider>
  );
}
