/** Matematika MVP (Matýsek 1. díl): výběr lekce → kolo 5 úloh s automatickou kontrolou + obtažení číslice perem/prstem. */
import { useEffect, useMemo, useState } from 'react';
import PenSurface, { type TraceResult } from '../components/PenSurface';
import { awardSticker } from '../album/album';
import { MATH_LESSONS, buildRound, classifyError, getMathProgress, mathUnlocked, saveRound, type MathErr, type MathLesson, type MathProgress, type MathTask } from '../math/math';
import { digitTemplate } from '../math/strokes';

const Dots = ({ n, item }: { n: number; item: string }) => (
  <span className="m-group" data-count={n}>{Array.from({ length: n }, (_, i) => <span key={i} className="m-item">{item}</span>)}</span>
);

export default function MathScreen({ back }: { back: () => void }) {
  const [progress, setProgress] = useState<MathProgress>({});
  const [lesson, setLesson] = useState<MathLesson | null>(null);
  useEffect(() => { if (!lesson) void getMathProgress().then(setProgress, () => {}); }, [lesson]);

  return (
    <main className="screen math subj--mat" data-testid="math-screen">
      <header className="topbar">
        <button className="back" onClick={() => (lesson ? setLesson(null) : back())}>‹ Zpět</button>
        <h1>🔢 Matematika{lesson ? ` · ${lesson.title}` : ''}</h1>
      </header>
      {!lesson && (
        <section className="card">
          <div className="lesson-row" data-testid="math-lessons">
            {MATH_LESSONS.map((l, i) => {
              const open = mathUnlocked(progress, i);
              return (
                <button key={l.id} className={`stone m-stone${open ? '' : ' is-locked'}`} data-lesson={l.id} data-locked={open ? 'false' : 'true'} aria-disabled={!open} disabled={!open}
                  aria-label={`Lekce ${l.title}${open ? '' : ' (zamčeno)'}`} onClick={() => setLesson(l)}>
                  {l.title}{(progress[l.id]?.rounds ?? 0) > 0 && <span className="m-done">⭐</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}
      {lesson && <Round key={lesson.id} lesson={lesson} onEnd={() => setLesson(null)} />}
    </main>
  );
}

function Round({ lesson, onEnd }: { lesson: MathLesson; onEnd: () => void }) {
  const tasks = useMemo(() => buildRound(lesson), [lesson]);
  const [i, setI] = useState(0);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, errors: {} as Partial<Record<MathErr, number>>, traced: 0 });
  const [fb, setFb] = useState<'ok' | 'try' | null>(null);
  const [tries, setTries] = useState(0);
  const t = tasks[i];
  const finished = i >= tasks.length;

  useEffect(() => {
    if (!finished) return;
    void saveRound(lesson.id, stats).then(() => awardSticker('matematika', { refId: lesson.id })).catch(() => {});
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => { setFb(null); setTries(0); setI((n) => n + 1); };
  const answer = (correct: boolean, err?: MathErr) => {
    if (correct) { setStats((s) => ({ ...s, correct: s.correct + (tries === 0 ? 1 : 0) })); setFb('ok'); setTimeout(next, 900); }
    else { setStats((s) => ({ ...s, wrong: s.wrong + 1, errors: err ? { ...s.errors, [err]: (s.errors[err] ?? 0) + 1 } : s.errors })); setTries((n) => n + 1); setFb('try'); }
  };
  const onTrace = (r: TraceResult) => {
    if (r.ok) { setStats((s) => ({ ...s, traced: s.traced + 1 })); setFb('ok'); setTimeout(next, 900); }
    else { setTries((n) => n + 1); setFb('try'); }
  };

  if (finished) return (
    <section className="card m-end" data-testid="math-end">
      <p className="m-big">⭐ Výborně!</p>
      <p>Hotovo – nová nálepka je v albu.</p>
      <button className="kbtn kbtn-primary kbtn-xl" data-testid="math-end-ok" onClick={onEnd}>➜</button>
    </section>
  );

  return (
    <section className="card m-task" data-testid="math-task" data-kind={t.kind} data-index={i}>
      <Task t={t} answer={answer} onTrace={onTrace} />
      {fb === 'ok' && <p className="notice m-fb" role="status" data-testid="math-ok">🦉 Správně!</p>}
      {fb === 'try' && <p className="notice m-fb" role="status" data-testid="math-try">🦉 Zkus to ještě jednou{t.kind === 'trace' ? ' – ✋ ukáže směr.' : '.'}</p>}
      {t.kind === 'trace' && tries >= 2 && <button className="kbtn" data-testid="math-skip" onClick={next}>➜ Dál</button>}
    </section>
  );
}

function Task({ t, answer, onTrace }: { t: MathTask; answer: (ok: boolean, err?: MathErr) => void; onTrace: (r: TraceResult) => void }) {
  if (t.kind === 'count') return (
    <>
      <h2>Kolik jich je?</h2>
      <div className="m-scene"><Dots n={t.n} item={t.item} /></div>
      <div className="m-options">{t.options.map((o) => <button key={o} className="kbtn kbtn-xl m-opt" data-value={o} onClick={() => answer(o === t.n, o === t.n ? undefined : classifyError(t.n, o))}>{o}</button>)}</div>
    </>
  );
  if (t.kind === 'find') return (
    <>
      <h2>Najdi tolik puntíků: <span className="m-digit" data-testid="math-digit">{t.n}</span></h2>
      <div className="m-options">{t.options.map((o) => <button key={o} className="kbtn m-opt m-opt-dots" data-value={o} aria-label={`${o} puntíků`} onClick={() => answer(o === t.n, o === t.n ? undefined : classifyError(t.n, o))}><Dots n={o} item="●" /></button>)}</div>
    </>
  );
  if (t.kind === 'compare') {
    const res = t.a === t.b ? 'same' : t.a > t.b ? 'a' : 'b';
    const pick = (c: string) => answer(c === res, c === res ? undefined : 'count-off-by-one');
    return (
      <>
        <h2>Kde je jich víc?</h2>
        <div className="m-options m-compare">
          <button className="kbtn m-opt m-opt-dots" data-value="a" onClick={() => pick('a')}><Dots n={t.a} item={t.item} /></button>
          <button className="kbtn m-opt" data-value="same" onClick={() => pick('same')}>= stejně</button>
          <button className="kbtn m-opt m-opt-dots" data-value="b" onClick={() => pick('b')}><Dots n={t.b} item={t.item} /></button>
        </div>
      </>
    );
  }
  return (
    <>
      <h2>Obtáhni číslici {t.digit}</h2>
      <PenSurface template={digitTemplate(t.digit)} onDone={onTrace} />
    </>
  );
}
