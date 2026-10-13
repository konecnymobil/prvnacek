/** M4: Týdenní souhrn pro rodiče (jen v rodičovské sekci za bránou; dítě ho nevidí). Data jen z IndexedDB. */
import { useEffect, useMemo, useState } from 'react';
import type { Content } from '../content/load';
import type { Screen } from '../App';
import type { WeeklySummaryFile } from '../content/types';
import { getAllAttempts, getAllEvents, getAllLessonStates, getDb, getSetting, setSetting, type TestResultRecord } from '../storage/db';
import { buildWeekSummary, completedWeeks, type SContent, type SData } from '../summary/weekly';

export const CHILD_NAME_KEY = 'childName';

async function loadData(): Promise<SData> {
  const db = await getDb();
  const tests: TestResultRecord[] = [];
  for (const k of await db.getAllKeys('settings')) if (String(k).startsWith('tests:')) tests.push(...(((await db.get('settings', k)) as TestResultRecord[]) ?? []));
  return { attempts: await getAllAttempts(), events: await getAllEvents(), tests, lessonStates: await getAllLessonStates() };
}

export default function WeeklySummary({ content, go }: { content: Content; go: (s: Screen) => void }) {
  const [spec, setSpec] = useState<WeeklySummaryFile | null>(null);
  const [data, setData] = useState<SData | null>(null);
  const [name, setName] = useState('');
  const [page, setPage] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}content/weekly-summary.json`).then((r) => r.json()).then(setSpec, () => setErr('Nepodařilo se načíst texty souhrnu.'));
    loadData().then(setData, () => setErr('Nepodařilo se načíst data z iPadu.'));
    void getSetting<string>(CHILD_NAME_KEY).then((n) => setName(n ?? ''));
  }, []);

  const sc: SContent = useMemo(() => ({
    lessons: content.orders[content.defaultOrderId].lessons,
    letters: content.letters, syllables: content.syllables, words: content.words,
    recommendation: content.testRules.recommendation,
  }), [content]);
  const weeks = useMemo(() => (data ? completedWeeks(data, Date.now()) : []), [data]);
  const ws = weeks[page];
  const s = useMemo(() => (spec && data && ws !== undefined ? buildWeekSummary(data, sc, spec, ws, name.trim() || 'dítě') : null), [spec, data, ws, sc, name]);

  return (
    <main className="screen parent" data-testid="weekly-summary">
      <header className="topbar"><button className="back" onClick={() => go('parent')}>‹ Zpět</button><h1>Týdenní souhrn</h1></header>
      {err && <p className="notice is-error" role="alert">{err}</p>}
      <label className="small">Jméno dítěte v textech: <input value={name} placeholder="dítě" data-testid="child-name"
        onChange={(e) => { setName(e.target.value); void setSetting(CHILD_NAME_KEY, e.target.value); }} /></label>
      {data && spec && weeks.length === 0 && <p className="card" data-testid="summary-empty">Zatím tu není žádný ukončený týden. Souhrn se ukáže v pondělí za uplynulý týden (po–ne).</p>}
      {s && (
        <>
          <nav className="actions">
            <button className="kbtn" disabled={page >= weeks.length - 1} onClick={() => setPage(page + 1)} data-testid="week-older">‹ Starší týden</button>
            <button className="kbtn" disabled={page === 0} onClick={() => setPage(page - 1)} data-testid="week-newer">Novější týden ›</button>
          </nav>
          <section className="card" data-section="overview"><h2>Týden v kostce</h2><p data-testid="summary-headline">{s.lines.headline}</p>
            <p className="small muted">Hodnocené úlohy: {String(s.metrics.ratedTasks)}, úspěšnost {Math.round(Number(s.metrics.successRatio) * 100)} %, průměrné sezení {Math.round(Number(s.metrics.avgSessionMinutes))} min, signály únavy: {String(s.metrics.frustrationSignals)}.</p></section>
          <section className="card" data-section="mastered"><h2>Co je zvládnuté</h2><p data-testid="summary-mastered">{s.lines.mastered}</p></section>
          <section className="card" data-section="tests"><h2>Zkoušky</h2><p data-testid="summary-tests">{s.lines.tests}</p>
            {s.approvedLessons.length > 0 && <p className="small muted">Schváleno: {s.approvedLessons.join(', ')}</p>}</section>
          <section className="card" data-section="trend"><h2>Trend</h2><p data-testid="summary-trend">{s.lines.trend}</p><p className="small muted">Nově zvládnuto: {s.trend.newly}.</p></section>
          <section className="card" data-section="errors"><h2>Co ještě dělá potíže</h2>{s.lines.errors.map((t) => <p key={t} data-testid="summary-error">{t}</p>)}</section>
          <section className="card" data-section="recommendations"><h2>Doporučení na další týden</h2>
            <ul>{s.recommendations.map((r) => <li key={r.id} data-rec={r.id}>{r.text}</li>)}</ul></section>
          <section className="card" data-section="praise"><p data-testid="summary-praise">{s.lines.praise}</p></section>
        </>
      )}
    </main>
  );
}
