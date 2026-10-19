import { useMemo, useState } from 'react';
import { useCtx, Segment } from './ctx.jsx';
import { computeStats, fmtTime } from './stats';

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="bars">
      {rows.map(([label, v]) => (
        <div className="bar" key={label}>
          <span className="bl">{label}</span>
          <span className="bt"><i style={{ width: (v / max) * 100 + '%' }} /></span>
          <span className="bv">{v}</span>
        </div>
      ))}
    </div>
  );
}

const Section = ({ title, children }) => <div className="card"><h3>{title}</h3>{children}</div>;

export default function Stats() {
  const { t, lib } = useCtx();
  const [scope, setScope] = useState('all');
  const s = useMemo(() => computeStats(lib, scope), [lib, scope]);
  const time = fmtTime(s.minutes);
  const peopleTitle = scope === 'movie' ? t('topDirectors') : scope === 'tv' ? t('topCreators') : t('topDirectors') + ' / ' + t('topCreators');

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

      {s.genres.length > 0 && <Section title={t('topGenres')}><Bars rows={s.genres} /></Section>}
      {s.actors.length > 0 && <Section title={t('topActors')}><Bars rows={s.actors} /></Section>}
      {s.directors.length > 0 && <Section title={peopleTitle}><Bars rows={s.directors} /></Section>}
      {s.decades.length > 0 && <Section title={t('byDecade')}><Bars rows={s.decades} /></Section>}
      {(s.years.length > 0 || s.noDate > 0) && (
        <Section title={t('byYear')}>
          <Bars rows={[...s.years, ...(s.noDate ? [[t('noDate'), s.noDate]] : [])]} />
        </Section>
      )}
      {scope !== 'movie' && s.status.length > 0 && (
        <Section title={t('seriesStatus')}>
          <Bars rows={s.status.map(([k, v]) => [t(k), v])} />
        </Section>
      )}
      {scope !== 'tv' && s.longest && (
        <Section title={`${t('longest')} / ${t('shortest')}`}>
          <p className="line">{s.longest.title} — {s.longest.runtime} {t('minutes')}</p>
          <p className="line">{s.shortest.title} — {s.shortest.runtime} {t('minutes')}</p>
        </Section>
      )}
    </div>
  );
}
