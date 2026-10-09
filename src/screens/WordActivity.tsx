import { useEffect, useMemo, useRef, useState } from 'react';
import type { Content } from '../content/load';
import type { Lesson, Word } from '../content/types';
import Mascot from '../activities/Mascot';
import { wordImageUrl } from '../content/images';
import { ROUND_SIZE, learnedLetters, pickPriority, promptAudio, randomPrompt, recordAttempt, say, shuffle, stopSay, usePriorityIds } from '../activities/common';

/** Slova s obrázkem složená jen z probraných písmen. */
export function lessonPictureWords(content: Content, lesson: Lesson): Word[] {
  const known = new Set(learnedLetters(content, lesson).map((l) => l.id));
  return content.words.filter((w) => w.usableInPictureTasks && wordImageUrl(w) && w.letterIds.every((id) => known.has(id)));
}

interface Props { content: Content; lesson: Lesson; back: () => void }

export default function WordActivity(props: Props) {
  const priority = usePriorityIds(props.content, props.lesson);
  if (!priority) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  return <WordRound {...props} priority={priority} />;
}

function makeTask(all: Word[], lesson: Lesson, prev: string | null, priority: Set<string>, first: boolean) {
  // přednost mají slova s novým písmenem lekce a slova ze zkoušky
  const fresh = all.filter((w) => w.letterIds.some((id) => lesson.letterIds.includes(id)));
  const pool = (fresh.length ? fresh : all).filter((w) => w.id !== prev);
  const withPri = [...pool, ...all.filter((w) => priority.has(w.id) && !pool.includes(w) && w.id !== prev)];
  const target = pickPriority(withPri.length ? withPri : all, priority, first);
  const others = shuffle(all.filter((w) => w.id !== target.id)).slice(0, 2);
  return { target, choices: shuffle([target, ...others]) };
}

/** A5 – „Přiřaď slovo k obrázku“: dítě slyší slovo a klepne na správný obrázek. */
function WordRound({ content, lesson, back, priority }: Props & { priority: Set<string> }) {
  const all = useMemo(() => lessonPictureWords(content, lesson), [content, lesson]);
  const [n, setN] = useState(0);
  const [task, setTask] = useState(() => makeTask(all, lesson, null, priority, true));
  const [mood, setMood] = useState<'radost' | 'povzbuzeni' | 'premysli'>('premysli');
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState<string[]>([]);
  const [message, setMessage] = useState('Poslechni si slovo a najdi obrázek.');
  const [saveError, setSaveError] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const busy = useRef(false);

  useEffect(() => () => stopSay(), []);
  useEffect(() => {
    void say([...promptAudio(content, 'p-find-picture'), task.target.audioId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  const choose = async (w: Word) => {
    if (solved || busy.current || wrong.includes(w.id)) return;
    busy.current = true;
    const correct = w.id === task.target.id;
    try {
      await recordAttempt(content, lesson, 'A5', task.target.id, w.id, correct);
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
    busy.current = false;
    if (correct) {
      setSolved(true);
      setMood('radost');
      setCorrectCount((c) => c + (wrong.length === 0 ? 1 : 0));
      setMessage(`Správně! ${task.target.text}.`);
      void say([task.target.audioId, ...randomPrompt(content, 'p-praise-')]);
    } else {
      setWrong((x) => [...x, w.id]);
      setMood('povzbuzeni');
      setMessage('Skoro! Poslechni si to ještě jednou a zkus to znovu.');
      void say([...randomPrompt(content, 'p-retry-'), task.target.audioId]);
    }
  };

  const next = () => {
    stopSay();
    if (n + 1 >= ROUND_SIZE) {
      setN(ROUND_SIZE);
      void say(promptAudio(content, 'p-round-end'));
      return;
    }
    setN(n + 1);
    setTask(makeTask(all, lesson, task.target.id, priority, false));
    setSolved(false);
    setWrong([]);
    setMood('premysli');
    setMessage('Poslechni si slovo a najdi obrázek.');
  };

  if (all.length < 2) {
    return (
      <main className="screen activity">
        <p className="notice">Slova s obrázky přijdou s dalšími lekcemi.</p>
        <button className="kbtn" onClick={back}>Zpět</button>
      </main>
    );
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
    <main className="screen activity" data-testid="word-activity" data-target={task.target.id}>
      <header className="topbar row">
        <button className="kbtn" onClick={back}>Zpět</button>
        <p className="muted" data-testid="progress">Úloha {n + 1} z {ROUND_SIZE}</p>
      </header>
      <div className="stage">
        <Mascot mood={mood} />
        <button className="kbtn kbtn-xl" onClick={() => void say([task.target.audioId])} aria-label="Přehrát slovo znovu">🔊 Poslechnout</button>
      </div>
      <p className={`feedback ${mood}`} role="status" data-testid="feedback">{message}</p>
      {saveError && <p className="notice is-error" role="alert">Pokrok se nepodařilo uložit, hra ale pokračuje.</p>}
      <div className="choices" data-testid="choices">
        {task.choices.map((w) => (
          <button
            key={w.id}
            className={`tile tile-pic${solved && w.id === task.target.id ? ' is-right' : ''}${wrong.includes(w.id) ? ' is-tried' : ''}`}
            data-word={w.id}
            aria-label={`Obrázek: ${w.gloss || w.text.toLowerCase()}`}
            onClick={() => void choose(w)}
          >
            <img src={wordImageUrl(w)!} alt="" draggable={false} />
          </button>
        ))}
      </div>
      {solved && <div className="actions"><button className="kbtn kbtn-primary kbtn-xl" onClick={next}>Dál ▶</button></div>}
    </main>
  );
}
