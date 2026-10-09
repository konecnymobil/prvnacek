import { useEffect, useMemo, useRef, useState } from 'react';
import type { Content } from '../content/load';
import type { Lesson, Syllable } from '../content/types';
import Mascot from '../activities/Mascot';
import { ROUND_SIZE, randomPrompt, promptAudio, recordAttempt, say, stopSay, pickPriority, usePriorityIds, shuffle } from '../activities/common';
import { allUsableSyllables, lessonSyllables } from './SyllableActivity';

interface Props { content: Content; lesson: Lesson; back: () => void }

/** Oblouček pod slabikou – tvar z design/js/app.js (P.arcSvg). */
export function SyllableArc({ text }: { text: string }) {
  return (
    <span className="syll-arc" data-testid="syllable-arc">
      <span className="syll-text">{text}</span>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="M6 4 Q50 30 94 4" /></svg>
    </span>
  );
}

/** Vybere cíl a 2 rozptylovače (jiné otevřené slabiky; nejraději se stejnou souhláskou nebo samohláskou). */
function makeTask(pool: Syllable[], candidates: Syllable[], priority: Set<string>, first: boolean, prev?: string) {
  const others = candidates.filter((s) => s.id !== prev);
  const target = pickPriority(others.length ? others : candidates, priority, first);
  const rest = pool.filter((s) => s.id !== target.id && s.audioId !== target.audioId);
  const near = shuffle(rest.filter((s) => s.consonantLetterId === target.consonantLetterId || s.vowelLetterId === target.vowelLetterId));
  const far = shuffle(rest.filter((s) => !near.includes(s)));
  const options = shuffle([target, ...[...near, ...far].slice(0, 2)]);
  return { target, options };
}

/** A6 – „Čti slabiku“: slabika velká s obloučkem, dítě ji přečte, pak poslechem vybere, která zní stejně. */
export default function ReadSyllable(props: Props) {
  const priority = usePriorityIds(props.content, props.lesson);
  if (!priority) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  return <Round {...props} priority={priority} />;
}

function Round({ content, lesson, back, priority }: Props & { priority: Set<string> }) {
  const pool = useMemo(() => allUsableSyllables(content, lesson), [content, lesson]);
  const candidates = useMemo(() => {
    const base = lessonSyllables(content, lesson);
    const extra = pool.filter((s) => priority.has(s.id) && !base.some((b) => b.id === s.id));
    return [...base, ...extra];
  }, [content, lesson, pool, priority]);
  const [n, setN] = useState(0);
  const [task, setTask] = useState(() => makeTask(pool, candidates, priority, true));
  const [step, setStep] = useState<'read' | 'pick'>('read');
  const [mood, setMood] = useState<'radost' | 'povzbuzeni' | 'premysli'>('premysli');
  const [message, setMessage] = useState('Přečti si slabiku nahlas.');
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const busy = useRef(false);

  useEffect(() => () => stopSay(), []);

  const done = () => { setStep('pick'); setMood('premysli'); setMessage('Poslechni si zvuky a vyber ten, který zní jako tvoje slabika.'); };

  const choose = async (o: Syllable) => {
    if (solved || busy.current) return;
    busy.current = true;
    const correct = o.id === task.target.id;
    try { await recordAttempt(content, lesson, 'A6', task.target.id, o.id, correct); setSaveError(false); } catch { setSaveError(true); }
    busy.current = false;
    if (correct) {
      setSolved(true); setMood('radost'); setCorrectCount((c) => c + (failed ? 0 : 1));
      setMessage(`Správně! Slabika ${task.target.text}.`);
      void say([task.target.audioId, ...randomPrompt(content, 'p-praise-')]);
    } else {
      setFailed(true); setMood('povzbuzeni'); setWrongIds((w) => [...w, o.id]);
      setMessage('Skoro! Poslechni si to ještě jednou a zkus to znovu.');
      void say([...randomPrompt(content, 'p-retry-'), o.audioId]);
    }
  };

  const next = () => {
    stopSay();
    if (n + 1 >= ROUND_SIZE) { setN(ROUND_SIZE); void say(promptAudio(content, 'p-round-end')); return; }
    setN(n + 1);
    setTask(makeTask(pool, candidates, priority, false, task.target.id));
    setStep('read'); setSolved(false); setFailed(false); setWrongIds([]); setMood('premysli');
    setMessage('Přečti si slabiku nahlas.');
  };

  if (pool.length < 3) {
    return <main className="screen activity"><p className="notice">Slabiky budou k dispozici od lekce A.</p><button className="kbtn" onClick={back}>Zpět</button></main>;
  }
  if (n >= ROUND_SIZE) {
    return (
      <main className="screen activity" data-testid="round-end">
        <Mascot mood="radost" />
        <h1>Hotovo! To bylo skvělé hraní.</h1>
        <p className="muted">Napoprvé správně: {correctCount} z {ROUND_SIZE}</p>
        <div className="actions"><button className="kbtn kbtn-primary kbtn-xl" onClick={back}>Zpět na lekci</button></div>
      </main>
    );
  }

  return (
    <main className="screen activity" data-testid="read-activity" data-target={task.target.id}>
      <header className="topbar row">
        <button className="kbtn" onClick={back}>Zpět</button>
        <p className="muted" data-testid="progress">Úloha {n + 1} z {ROUND_SIZE}</p>
      </header>
      <div className="stage"><Mascot mood={mood} /></div>
      <div className="read-syll" data-testid="read-syllable"><SyllableArc text={task.target.text} /></div>
      <p className={`feedback ${mood}`} role="status" data-testid="feedback">{message}</p>
      {saveError && <p className="notice is-error" role="alert">Pokrok se nepodařilo uložit, hra ale pokračuje.</p>}
      {step === 'read' && (
        <div className="actions"><button className="kbtn kbtn-primary kbtn-xl" data-testid="read-done" onClick={done}>Přečetl(a) jsem</button></div>
      )}
      {step === 'pick' && (
        <div className="choices" data-testid="read-options">
          {task.options.map((o, i) => (
            <div key={o.id} className={`opt${wrongIds.includes(o.id) ? ' is-wrong' : ''}${solved && o.id === task.target.id ? ' is-right' : ''}`}>
              <button className="kbtn kbtn-xl" aria-label={`Poslechnout možnost ${i + 1}`} data-testid="opt-listen" onClick={() => void say([o.audioId])}>🔊 {i + 1}</button>
              <button className="kbtn kbtn-primary" data-opt={o.id} data-testid="opt-pick" disabled={solved || wrongIds.includes(o.id)} onClick={() => void choose(o)}>To je ono</button>
            </div>
          ))}
        </div>
      )}
      {solved && <div className="actions"><button className="kbtn kbtn-primary kbtn-xl" onClick={next}>Dál ▶</button></div>}
    </main>
  );
}
