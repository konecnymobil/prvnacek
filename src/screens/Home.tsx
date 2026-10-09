import type { Content } from '../content/load';
import { useEffect, useState } from 'react';
import type { Screen } from '../App';
import { getLessonStatesMap, isLessonUnlocked, type LessonState } from '../storage/db';

interface Props {
  content: Content | null;
  error: string | null;
  go: (s: Screen) => void;
  openLesson: (lessonId: string) => void;
}

export default function Home({ content, error, go, openLesson }: Props) {
  const [states, setStates] = useState<Record<string, LessonState | undefined>>({});
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => { getLessonStatesMap().then(setStates, () => {}); }, [content]);
  const order = content ? content.orders[content.defaultOrderId] : null;

  return (
    <main className="screen home">
      <header className="topbar">
        <h1>Prvňáček</h1>
        <p className="muted">Verze M1 – aktivity a rodičovská část</p>
      </header>

      {error && (
        <p className="notice is-error" role="alert" data-testid="content-error">
          Obsah se nenačetl: {error}
        </p>
      )}
      {!content && !error && <p className="muted">Načítám obsah…</p>}

      {content && order && (
        <section className="card" data-testid="content-info">
          <h2>{order.title}</h2>
          <p className="muted">Vyber lekci a pojď hrát.</p>
          <div className="lesson-row" data-testid="lesson-row">
            {order.lessons.map((l) => {
              const letter = content.letterById.get(l.primaryLetterId)!;
              const open = isLessonUnlocked(order.lessons, l.id, states);
              return (
                <button
                  key={l.id}
                  className={`stone${open ? '' : ' is-locked'}`}
                  data-locked={open ? 'false' : 'true'}
                  aria-disabled={!open}
                  onClick={() => (open ? openLesson(l.id) : setHint(`Lekce ${l.title} se otevře, až ji s rodičem dokončíš. Zatím si zahraj ty předchozí.`))}
                  aria-label={`Lekce ${l.index}: ${l.title}${open ? '' : ' (zamčeno)'}`}
                >
                  {letter.upper}
                </button>
              );
            })}
          </div>
          {hint && <p className="notice" role="status" data-testid="lock-hint">🔒 {hint}</p>}
          <p className="small muted" data-testid="content-version">
            Obsah {content.version} · {content.letters.length} písmen · {content.taskSyllables.length} slabik do úloh · {content.words.length} slov ·{' '}
            {content.prompts.length} pokynů
          </p>
        </section>
      )}

      <nav className="actions">
        <button className="kbtn kbtn-primary" onClick={() => go('soundTest')}>
          🔊 Test zvuku a mikrofonu
        </button>
        <button className="kbtn" onClick={() => go('parentGate')} data-testid="open-parent">
          🔒 Pro rodiče
        </button>
        <button className="kbtn" onClick={() => go('about')}>
          ℹ️ O aplikaci
        </button>
      </nav>
    </main>
  );
}
