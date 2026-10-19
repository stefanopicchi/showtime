import { useRef, useState } from 'react';
import { api } from './api';
import { useCtx, Segment } from './ctx.jsx';
import { readImportFile, runImport } from './importer';
import { errText } from './i18n';

export default function Settings() {
  const { t, lib, act, theme, setTheme, fail } = useCtx();
  const fileRef = useRef(null);
  const [prog, setProg] = useState(null);
  const [result, setResult] = useState(null);

  const exportData = async () => {
    try {
      const data = await api.get('export');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      a.download = `showtime-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } catch (e) { fail(e.message); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setResult(null);
    try {
      const data = await readImportFile(file);
      setProg({ phase: 'titles', done: 0, total: 1 });
      const r = await runImport(data, (phase, done, total) => setProg({ phase, done, total }));
      setResult(t('importDoneDetail', r.added, r.total, r.failed));
      await act.reload();
    } catch (err) {
      fail(err.message === 'Unexpected end of JSON input' ? 'bad_file' : err.message);
    }
    setProg(null);
  };

  return (
    <div className="screen">
      <div className="card">
        <h3>{t('language')}</h3>
        <Segment value={lib.lang} onChange={act.setLang} options={[['it-IT', 'Italiano'], ['en-US', 'English']]} />
      </div>
      <div className="card">
        <h3>{t('theme')}</h3>
        <Segment value={theme} onChange={setTheme} options={[['auto', t('auto')], ['light', t('light')], ['dark', t('dark')]]} />
      </div>
      <div className="card">
        <h3>{t('backup')}</h3>
        <button className="btn" onClick={exportData}>{t('exportBtn')}</button>
      </div>
      <div className="card">
        <h3>{t('importTitle')}</h3>
        <p className="muted">{t('importHint')}</p>
        <input ref={fileRef} type="file" accept=".zip,.json,application/zip,application/json" hidden onChange={onFile} />
        <button className="btn" disabled={!!prog} onClick={() => fileRef.current.click()}>{t('chooseFile')}</button>
        {prog && (
          <div className="progress-box">
            <p>{prog.phase === 'titles' ? t('phaseTitles') : t('phaseViews')} — {prog.done}/{prog.total}</p>
            <div className="bt"><i style={{ width: (prog.done / Math.max(prog.total, 1)) * 100 + '%' }} /></div>
          </div>
        )}
        {result && <p className="ok"><b>{t('importDone')}.</b> {result}</p>}
      </div>
      <div className="card">
        <h3>{t('account')}</h3>
        <button className="btn" onClick={() => api.post('logout', {}).then(() => location.reload()).catch((e) => fail(e.message))}>{t('logout')}</button>
      </div>
      <p className="credits">
        <img src="/tmdb.svg" alt="TMDB" onError={(e) => (e.currentTarget.style.display = 'none')} />
        {t('credits')}
      </p>
    </div>
  );
}
