import { createContext, useContext } from 'react';

export const Ctx = createContext(null);
export const useCtx = () => useContext(Ctx);

export const IMG = (path, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

export function Poster({ path, size }) {
  const src = IMG(path, size);
  return src ? <img src={src} alt="" loading="lazy" /> : <div className="noposter">🎬</div>;
}

export function RatingSelect({ value, onChange }) {
  const { t } = useCtx();
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? +e.target.value : null)} aria-label={t('rating')}>
      <option value="">{t('none')}</option>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

export function Segment({ value, onChange, options }) {
  return (
    <div className="segment">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}
