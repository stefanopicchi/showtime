import { useMemo, useState } from 'react';
import { useCtx, Poster, Segment } from './ctx.jsx';
import { computeStats, fmtTime } from './stats';

// Barre cliccabili: toccando una voce si apre l'elenco dei titoli che la compongono
function Bars({ rows, onPick, byPlays }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="bars">
      {rows.map(([label, v, entries]) => (
        <button className="bar" key={label} onClick={() => onPick(label, entries, byPlays)}>
          <span className="bl">{label}</span>
          <span className="bt"><i style={{ width: (v / max) * 100 + '%' }} /></span>
          <span className="bv">{v}</span>
        </button>
      ))}
    </div>
  );
}

function PickList({ label, entries, byPlays, onClose }) {
  const { t, lib, open } = useCtx();
  const list = entries
    .map(([key, n]) => ({ key, n, kind: key.split(':')[0], id: +key.split(':')[1], ti: lib.titles.get(key) }))
    .sort((a, b) => (byPlays ? b.n - a.n : 0) || (a.ti?.title || '').localeCompare(b.ti?.title || ''));
  return (
    <div className="overlay">
      <div className="sheet">
        <button className="close" onClick={onClose} aria-label={t('close')}>✕</button>
        <h2>{label}</h2>
        <p className="muted">{list.length} {t('titlesCount').toLowerCase()}</p>
        {list.map((i) => (
          <button className="item" key={i.key} onClick={() => open(i.kind, i.id)}>
            <div className="thumb"><Poster path={i.ti?.poster_path} size="w185" /></div>
            <div className="item-text">
              <b>{i.ti?.title || '…'}</b>
              <span className="muted">{[i.ti?.year, t(i.kind === 'movie' ? 'movie' : 'tv')].filter(Boolean).join(' · ')}</span>
            </div>
            {(byPlays || i.n > 1) && <span className="marks">×{i.n}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

const Section = ({ title, children }) => <div className="card"><h3>{title}</h3>{children}</div>;

export default function Stats() {
  const { t, lib, open } = useCtx();
  const [scope, setScope] = useState('all');
  const [picked, setPicked] = useState(null);
  const s = useMemo(() => computeStats(lib, scope), [lib, scope]);
  const time = fmtTime(s.minutes);
  const peopleTitle = scope === 'movie' ? t('topDirectors') : scope === 'tv' ? t('topCreators') : t('topDirectors') + ' / ' + t('topCreators');
  const pick = (label, entries, byPlays) => setPicked({ label, entries, byPlays });
  const yearRows = [...s.years, ...(s.noDate ? [[t('noDate'), s.noDate[1], s.noDate[2]]] : [])];

  return (
    <div className="screen">
      <Segment value={scope} onChange={setScope} options={[['all', t('all')], ['movie', t('movies')], ['tv', t('series')]]} />
      <div className="kpis">
        <div className="kpi"><b>{s.titles.toLocaleString()}</b><span>{t('titlesCount')}</span></div>
        <div className="kpi"><b>{time.hours}</b><span>{t('hoursUnit')}{time.days ? ` · ≈ ${time.days} ${t('days')}` : ''}</span></div>
        {scope !== 'tv' && <div className="kpi"><b>{s.moviePlays.toLocaleString()}</b><span>{t('plays')} ({t('movies').toLowerCase()})</span></div>}
        {scope !== 'movie' && <div className="kpi"><b>{s.episodes.toLocaleString()}</b><span>{t('episodesSeen')}</span></div>}
        <div className="kpi"><b>{s.avgRating ? s.avgRating.toFixed(1) : '—'}</b><span>{t('avgRating')}{s.ratedCount ? ` (${s.ratedCount})` : ''}</span></div>
      </div>

      {s.genres.length > 0 && <Section title={t('topGenres')}><Bars rows={s.genres} onPick={pick} /></Section>}
      {s.actors.length > 0 && <Section title={t('topActors')}><Bars rows={s.actors} onPick={pick} /></Section>}
      {s.directors.length > 0 && <Section title={peopleTitle}><Bars rows={s.directors} onPick={pick} /></Section>}
      {s.decades.length > 0 && <Section title={t('byDecade')}><Bars rows={s.decades} onPick={pick} /></Section>}
      {yearRows.length > 0 && <Section title={t('byYear')}><Bars rows={yearRows} onPick={pick} byPlays /></Section>}
      {scope !== 'movie' && s.status.length > 0 && (
        <Section title={t('seriesStatus')}>
          <Bars rows={s.status.map(([k, v, e]) => [t(k), v, e])} onPick={pick} />
        </Section>
      )}
      {scope !== 'tv' && s.longest && (
        <Section title={`${t('longest')} / ${t('shortest')}`}>
          <button className="linkline" onClick={() => open('movie', s.longest.tmdb_id)}>{s.longest.title} — {s.longest.runtime} {t('minutes')}</button>
          <button className="linkline" onClick={() => open('movie', s.shortest.tmdb_id)}>{s.shortest.title} — {s.shortest.runtime} {t('minutes')}</button>
        </Section>
      )}
      {picked && <PickList {...picked} onClose={() => setPicked(null)} />}
    </div>
  );
}
