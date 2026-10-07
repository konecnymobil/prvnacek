import { useState } from 'react';
import type { Content } from '../content/load';
import { playAudio } from '../audio/player';
import type { Screen } from '../App';

interface Props {
  content: Content | null;
  error: string | null;
  go: (s: Screen) => void;
}

export default function Home({ content, error, go }: Props) {
  const [playing, setPlaying] = useState<string | null>(null);
  const order = content ? content.orders[content.defaultOrderId] : null;

  const play = (lessonId: string, audioId: string) => {
    setPlaying(lessonId);
    playAudio(audioId)
      .catch(() => {})
      .finally(() => setPlaying((p) => (p === lessonId ? null : p)));
  };

  return (
    <main className="screen home">
      <header className="topbar">
        <h1>Prvňáček</h1>
        <p className="muted">Verze M0 – základ aplikace</p>
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
          <p className="muted">Klepni na písmeno a poslechni si hlásku.</p>
          <div className="lesson-row" data-testid="lesson-row">
            {order.lessons.map((l) => {
              const letter = content.letterById.get(l.primaryLetterId)!;
              return (
                <button
                  key={l.id}
                  className={`stone${playing === l.id ? ' is-playing' : ''}`}
                  onClick={() => play(l.id, letter.audioId)}
                  aria-label={`Lekce ${l.index}: ${l.title}`}
                >
                  {letter.upper}
                </button>
              );
            })}
          </div>
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
        <button className="kbtn" onClick={() => go('about')}>
          ℹ️ O aplikaci
        </button>
      </nav>
    </main>
  );
}
