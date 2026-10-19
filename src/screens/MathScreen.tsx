/** Matematika: lekce z content/math/lessons.json (m0 Kde to je? + m1–m6), minihry. */
import HomeButton from '../components/HomeButton';
import { useTileTap } from '../games/tileTap';
import { useEffect, useMemo, useRef, useState } from 'react';
import PenSurface, { type TraceResult } from '../components/PenSurface';
import { awardSticker } from '../album/album';
import { buildRound, classifyError, getMathProgress, mathLevel, mathUnlocked, saveRound, type MathErr, type MathLesson, type MathProgress, type MathTask, type WherePos } from '../math/math';
import { useMathLessons } from '../math/lessons';
import { digitTemplate } from '../math/strokes';
import MathGame, { MATH_GAMES, type MathGameId } from '../games/MathGames';
import { say, stopSay } from '../activities/common';

export const MATH_AUDIO = {
  praise: ['snd-p-praise-1', 'snd-p-praise-2', 'snd-p-praise-3', 'snd-p-praise-4', 'snd-p-praise-5'],
  roundEnd: ['snd-p-round-end', 'snd-p-sticker'],
  retry: 'snd-p-retry-1',
  count: 'snd-m-p-count', findN: 'snd-m-p-find-n', more: 'snd-m-p-more', same: 'snd-m-p-same',
  trace: 'snd-m-p-trace', traceStart: 'snd-m-p-trace-start', gameKde: 'snd-m-p-game-kde',
  num: (n: number) => `snd-m-n-${n}`,
};
const WHERE_TEXT: Record<WherePos, string> = {
  top: 'Ťukni na obrázek nahoře.', bottom: 'Ťukni na obrázek dole.', middle: 'Ťukni na obrázek uprostřed.',
  left: 'Ťukni na obrázek vlevo.', right: 'Ťukni na obrázek vpravo.',
};
const instruction = (t: MathTask): string[] =>
  t.kind === 'where' ? [t.prompt]
    : t.kind === 'count' ? [MATH_AUDIO.count]
    : t.kind === 'find' || t.kind === 'find-group' ? [MATH_AUDIO.findN, MATH_AUDIO.num(t.n)]
    : t.kind === 'more' ? [MATH_AUDIO.more]
    : t.kind === 'same' ? [MATH_AUDIO.same]
    : [MATH_AUDIO.trace, MATH_AUDIO.traceStart];

const Dots = ({ n, item }: { n: number; item: string }) => (
  <span className="m-group" data-count={n}>{Array.from({ length: n }, (_, i) => <span key={i} className="m-item">{item}</span>)}</span>
);

export default function MathScreen({ back, openAlbum }: { back: () => void; openAlbum: () => void }) {
  const f = useMathLessons();
  const [game, setGame] = useState<MathGameId | null>(null);
  const tiles = useTileTap();
  const [progress, setProgress] = useState<MathProgress>({});
  const [lesson, setLesson] = useState<MathLesson | null>(null);
  useEffect(() => { if (!lesson) void getMathProgress().then(setProgress, () => {}); }, [lesson]);

  if (!f) return <main className="screen math"><p className="muted">Načítám…</p></main>;
  const level = mathLevel(f, progress);
  if (game) return <MathGame id={game} level={level} back={() => setGame(null)} openAlbum={openAlbum} />;
  return (
    <main className="screen math subj--mat" data-testid="math-screen">
      <header className="topbar">
        <HomeButton onClick={() => (lesson ? setLesson(null) : back())} />
        <h1>🔢 Matematika{lesson ? ` · ${lesson.title}` : ''}</h1>
      </header>
      {!lesson && (
        <section className="card">
          <div className="lesson-row" data-testid="math-lessons">
            {f.lessons.map((l, i) => {
              const open = mathUnlocked(f, progress, i);
              return (
                <button key={l.id} className={`stone m-stone${open ? '' : ' is-locked'}`} data-lesson={l.id} data-locked={open ? 'false' : 'true'} aria-disabled={!open} disabled={!open}
                  aria-label={`Lekce ${l.title}${open ? '' : ' (zamčeno)'}`} onClick={() => setLesson(l)}>
                  {l.title}{(progress[l.id]?.rounds ?? 0) > 0 && <span className="m-done">⭐</span>}
                </button>
              );
            })}
          </div>
          <h2>🎲 Hry</h2>
          <div className="subj-games">
            {MATH_GAMES.map((g) => {
              const open = level >= g.from;
              return <button key={g.id} className={`game-tile${open ? '' : ' is-locked'}${tiles.selected === g.id ? ' is-selected' : ''}`} data-game={g.id} data-locked={open ? 'false' : 'true'} disabled={!open} onClick={() => tiles.tap(g.id, () => setGame(g.id))}>
                <span className="game-icon">{g.icon}</span><span>{g.name}</span>{!open && <span aria-hidden>🔒</span>}</button>;
            })}
          </div>
        </section>
      )}
      {lesson && <Round key={lesson.id} lesson={lesson} unlock={f.unlockRule} onEnd={() => setLesson(null)} />}
    </main>
  );
}

function Round({ lesson, unlock, onEnd }: { lesson: MathLesson; unlock: { minFirstTryRatio: number }; onEnd: () => void }) {
  const first = (typeof sessionStorage !== 'undefined' ? Number(sessionStorage.getItem(`math:${lesson.id}:rounds`) ?? 0) : 0) === 0;
  const tasks = useMemo(() => buildRound(lesson, { firstRound: first }), [lesson, first]);
  const [i, setI] = useState(0);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, errors: {} as Partial<Record<MathErr, number>>, traced: 0 });
  const [fb, setFb] = useState<'ok' | 'try' | null>(null);
  const [tries, setTries] = useState(0);
  const started = useRef(new Date().toISOString());
  const t = tasks[i];
  const finished = i >= tasks.length;

  useEffect(() => { if (t) void say([...(i === 0 && lesson.id === 'm0' ? [MATH_AUDIO.gameKde] : []), ...instruction(t)]); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSay(), []);
  useEffect(() => {
    if (!finished) return;
    void say([MATH_AUDIO.praise[4], ...MATH_AUDIO.roundEnd]);
    try { sessionStorage.setItem(`math:${lesson.id}:rounds`, String(Number(sessionStorage.getItem(`math:${lesson.id}:rounds`) ?? 0) + 1)); } catch { /* */ }
    const rated = tasks.filter((x) => x.kind !== 'trace').length;
    void saveRound(lesson.id, stats, rated, unlock, started.current).then(() => awardSticker('matematika', { refId: lesson.id })).catch(() => {});
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const praise = () => void say([MATH_AUDIO.praise[i % MATH_AUDIO.praise.length]]);
  const next = () => { setFb(null); setTries(0); setI((n) => n + 1); };
  const answer = (correct: boolean, err?: MathErr) => {
    if (correct) { praise(); setStats((s) => ({ ...s, correct: s.correct + (tries === 0 ? 1 : 0) })); setFb('ok'); setTimeout(next, 1400); }
    else { void say([MATH_AUDIO.retry]); setStats((s) => ({ ...s, wrong: s.wrong + 1, errors: err ? { ...s.errors, [err]: (s.errors[err] ?? 0) + 1 } : s.errors })); setTries((n) => n + 1); setFb('try'); }
  };
  const onTrace = (r: TraceResult) => {
    if (r.ok) { praise(); setStats((s) => ({ ...s, traced: s.traced + 1 })); setFb('ok'); setTimeout(next, 1400); }
    else { void say([MATH_AUDIO.retry, MATH_AUDIO.traceStart]); setTries((n) => n + 1); setFb('try'); }
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
      <Task t={t} answer={answer} onTrace={onTrace} calm={tries >= 2} />
      {fb === 'ok' && <p className="notice m-fb" role="status" data-testid="math-ok">🦉 Správně!</p>}
      {fb === 'try' && <p className="notice m-fb" role="status" data-testid="math-try">🦉 Zkus to ještě jednou{t.kind === 'trace' ? ' – ✋ ukáže směr.' : '.'}</p>}
      {t.kind === 'trace' && tries >= 2 && <button className="kbtn" data-testid="math-skip" onClick={next}>➜ Dál</button>}
    </section>
  );
}

function Task({ t, answer, onTrace, calm }: { t: MathTask; answer: (ok: boolean, err?: MathErr) => void; onTrace: (r: TraceResult) => void; calm: boolean }) {
  if (t.kind === 'where') return (
    <>
      <h2 data-testid="math-where-prompt">{WHERE_TEXT[t.pos]}</h2>
      <div className={`xg-grid${calm ? ' is-hint' : ''}`} data-testid="math-grid" data-pos={t.pos}>
        {t.cells.map((img, c) => (
          <button key={c} className="cell" data-c={c} disabled={!img} onClick={() => answer(c === t.target, c === t.target ? undefined : 'position-wrong')}>
            {img ?? ''}
          </button>
        ))}
        {(t.pos === 'left' || t.pos === 'right') && <><span className="xg-hand l" aria-hidden="true">🤚</span><span className="xg-hand r" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}>🤚</span></>}
      </div>
    </>
  );
  if (t.kind === 'count') return (
    <>
      <h2>Kolik jich je?</h2>
      <div className="m-scene"><Dots n={t.n} item={t.item} /></div>
      <div className="m-options">{t.options.map((o) => <button key={o} className="kbtn kbtn-xl m-opt" data-value={o} onClick={() => answer(o === t.n, o === t.n ? undefined : classifyError(t.n, o))}>{o}</button>)}</div>
    </>
  );
  if (t.kind === 'find') return (
    <>
      <h2>Najdi tolik puntíků: <span className="m-digit" data-testid="math-digit" data-n={t.n}>{t.n}</span></h2>
      <div className="m-options">{t.options.map((o) => <button key={o} className="kbtn m-opt m-opt-dots" data-value={o} aria-label={`${o} puntíků`} onClick={() => answer(o === t.n, o === t.n ? undefined : classifyError(t.n, o))}><Dots n={o} item="●" /></button>)}</div>
    </>
  );
  if (t.kind === 'find-group') return (
    <>
      <h2>Najdi jich tolik: <span className="m-digit" data-testid="math-digit" data-n={t.n}>{t.n === 1 ? 'jedna' : t.n}</span></h2>
      <div className="m-options">{t.options.map((o) => <button key={o} className="kbtn m-opt m-opt-dots" data-value={o} aria-label={`${o}`} onClick={() => answer(o === t.n, o === t.n ? undefined : classifyError(t.n, o))}><Dots n={o} item={t.item} /></button>)}</div>
    </>
  );
  if (t.kind === 'more') {
    const res = t.a > t.b ? 'a' : 'b';
    const pick = (c: string) => answer(c === res, c === res ? undefined : 'compare-wrong');
    return (
      <>
        <h2>Kde je jich víc?</h2>
        <div className="m-options m-compare">
          <button className="kbtn m-opt m-opt-dots" data-value="a" onClick={() => pick('a')}><Dots n={t.a} item={t.item} /></button>
          <button className="kbtn m-opt m-opt-dots" data-value="b" onClick={() => pick('b')}><Dots n={t.b} item={t.item} /></button>
        </div>
      </>
    );
  }
  if (t.kind === 'same') return (
    <>
      <h2>Kde je jich stejně?</h2>
      <div className="m-scene"><Dots n={t.n} item={t.item} /></div>
      <div className="m-options">{t.options.map((o) => <button key={o} className="kbtn m-opt m-opt-dots" data-value={o} onClick={() => answer(o === t.n, o === t.n ? undefined : 'compare-wrong')}><Dots n={o} item={t.item} /></button>)}</div>
    </>
  );
  return (
    <>
      <h2>Obtáhni číslici {t.digit}</h2>
      <PenSurface template={digitTemplate(t.digit)} onDone={onTrace} />
    </>
  );
}

