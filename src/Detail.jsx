import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useCtx, Poster, RatingSelect } from './ctx.jsx';
import { showStatus, uniqueEpisodes } from './stats';

const today = () => new Date().toISOString().slice(0, 10);

export default function Detail({ kind, id, onClose }) {
  const { t, lib, act } = useCtx();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [markDate, setMarkDate] = useState('');
  const [newRating, setNewRating] = useState(null);
  const [openSeason, setOpenSeason] = useState(null);

  useEffect(() => {
    let live = true;
    setD(null); setErr(null);
    api.get(`title/${kind}/${id}`)
      .then((r) => { if (live) { setD(r); act.upsertTitle(r.title); } })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [kind, id]);

  const ti = d?.title;
  const eps = d?.episodes || [];
  const mv = lib.movieViews.get(id) || [];
  const ev = lib.epViews.get(id) || [];
  const inWl = lib.wl.has(kind + ':' + id);
  const watched = kind === 'movie' ? mv.length > 0 : ev.length > 0;

  // tv: ultima visione di ogni episodio e raggruppamento per stagione
  const evMap = useMemo(() => {
    const m = new Map();
    ev.forEach((v) => { const k = v.s + ':' + v.e; if (!m.has(k) || v.id > m.get(k).id) m.set(k, v); });
    return m;
  }, [ev]);
  const seasons = useMemo(() => {
    const m = new Map();
    eps.forEach((e) => { if (!m.has(e.s)) m.set(e.s, []); m.get(e.s).push(e); });
    return [...m.entries()].sort((a, b) => (a[0] || 1e9) - (b[0] || 1e9));
  }, [eps]);
  const rtOf = (a) => eps.find((e) => e.s === a.s && e.e === a.e)?.rt ?? null;
  const isAired = (e) => e.ad && e.ad <= today();

  const markEpisodes = (list) => {
    const rows = list
      .filter((e) => !evMap.has(e.s + ':' + e.e))
      .map((e) => ({ t: 'episode', tid: id, s: e.s, e: e.e, d: markDate || null, r: null }));
    if (rows.length) act.addViews(rows, rtOf);
  };
  const toggleEpisode = (e) => {
    const v = evMap.get(e.s + ':' + e.e);
    if (v) act.delViews([v.id]);
    else act.addViews([{ t: 'episode', tid: id, s: e.s, e: e.e, d: markDate || null, r: null }], rtOf);
  };
  const unmarkSeason = (s) => {
    if (confirm(t('confirmUnmark'))) act.delViews(ev.filter((v) => v.s === s).map((v) => v.id));
  };
  const addMovie = async () => {
    await act.addViews([{ t: 'movie', tid: id, s: null, e: null, d: markDate || null, r: newRating }]);
    setMarkDate(''); setNewRating(null);
  };

  const saved = lib.shows.get(id);
  const people = (arr) => arr.map((p) => p.name).join(', ');

  return (
    <div className="overlay">
      <div className="sheet">
        <button className="close" onClick={onClose} aria-label={t('close')}>✕</button>
        {err && <p className="muted pad">{err}</p>}
        {!d && !err && <p className="muted pad">{t('loading')}</p>}
        {ti && (
          <>
            <div className="hero">
              <div className="hero-poster"><Poster path={ti.poster_path} size="w342" /></div>
              <div>
                <h2>{ti.title}</h2>
                <p className="muted">
                  {[ti.year, kind === 'movie' ? (ti.runtime ? `${ti.runtime} ${t('minutes')}` : null) : (ti.seasons ? `${ti.seasons} ${t('season').toLowerCase()}` : null)].filter(Boolean).join(' · ')}
                </p>
                <p className="chips">{ti.genres.map((g) => <span key={g.id}>{g.name}</span>)}</p>
              </div>
            </div>

            {ti.overview && <p className="overview">{ti.overview}</p>}
            {ti.directors.length > 0 && <p className="line"><b>{kind === 'movie' ? t('directedBy') : t('createdBy')}:</b> {people(ti.directors)}</p>}
            {ti.actors.length > 0 && <p className="line"><b>{t('cast')}:</b> {people(ti.actors)}</p>}

            {/* ---- Azioni comuni: data e voto facoltativi ---- */}
            <div className="card">
              <div className="row wrap">
                <label className="field">{t('dateOpt')}
                  <input type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} />
                </label>
                {kind === 'movie' && (
                  <label className="field">{t('rating')}
                    <RatingSelect value={newRating} onChange={setNewRating} />
                  </label>
                )}
              </div>
              <div className="row wrap">
                {kind === 'movie' ? (
                  <button className="btn primary" onClick={addMovie}>{mv.length ? t('addView') : t('markWatched')}</button>
                ) : (
                  <button className="btn primary" onClick={() => markEpisodes(eps.filter((e) => e.s > 0 && isAired(e)))}>{t('markAll')}</button>
                )}
                {!watched && (
                  <button className={'btn' + (inWl ? ' on' : '')} onClick={() => act.toggleWatchlist(kind, id, !inWl)}>
                    {inWl ? '★ ' + t('inWatchlist') : '☆ ' + t('addWatchlist')}
                  </button>
                )}
              </div>
            </div>

            {/* ---- Film: elenco visioni ---- */}
            {kind === 'movie' && mv.length > 0 && (
              <div className="card">
                <h3>{t('views')}</h3>
                {[...mv].sort((a, b) => a.id - b.id).map((v) => (
                  <div className="row view" key={v.id}>
                    <input type="date" value={v.d || ''} onChange={(e) => act.patchView(v.id, { d: e.target.value || null, r: v.r })} />
                    <RatingSelect value={v.r} onChange={(r) => act.patchView(v.id, { d: v.d, r })} />
                    <button className="btn small danger" onClick={() => confirm(t('confirmDelete')) && act.delViews([v.id])}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* ---- Serie: stato, voto, stagioni ed episodi ---- */}
            {kind === 'tv' && (
              <>
                {ev.length > 0 && (
                  <div className="card">
                    <div className="row wrap">
                      <label className="field">{t('status')}
                        <select value={showStatus(ti, saved, ev)} onChange={(e) => act.setShow(id, { status: e.target.value, r: saved?.r ?? null })}>
                          {['watching', 'completed', 'paused', 'dropped'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
                        </select>
                      </label>
                      <label className="field">{t('rating')}
                        <RatingSelect value={saved?.r} onChange={(r) => act.setShow(id, { status: saved?.status ?? null, r })} />
                      </label>
                      <span className="muted progress">{uniqueEpisodes(ev)}{ti.episodes_aired ? ` / ${ti.episodes_aired}` : ''} {t('episodesLabel')}</span>
                    </div>
                  </div>
                )}
                {seasons.map(([s, list]) => {
                  const done = list.filter((e) => evMap.has(s + ':' + e.e)).length;
                  const open = openSeason === s;
                  return (
                    <div className="card season" key={s}>
                      <button className="season-head" onClick={() => setOpenSeason(open ? null : s)}>
                        <b>{s === 0 ? t('specials') : `${t('season')} ${s}`}</b>
                        <span className="muted">{done}/{list.length}</span>
                        <span>{open ? '▾' : '▸'}</span>
                      </button>
                      {open && (
                        <>
                          <div className="row wrap">
                            <button className="btn small" onClick={() => markEpisodes(list.filter(isAired))}>{t('markSeason')}</button>
                            {done > 0 && <button className="btn small danger" onClick={() => unmarkSeason(s)}>{t('unmarkSeason')}</button>}
                          </div>
                          {list.map((e) => {
                            const on = evMap.has(s + ':' + e.e);
                            return (
                              <label className={'ep' + (on ? ' on' : '')} key={e.e}>
                                <input type="checkbox" checked={on} onChange={() => toggleEpisode(e)} />
                                <span className="ep-name">{e.e}. {e.name || `${t('season')} ${s} · ${e.e}`}</span>
                                <span className="muted">{[e.rt && `${e.rt}′`, e.ad].filter(Boolean).join(' · ')}</span>
                              </label>
                            );
                          })}
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
