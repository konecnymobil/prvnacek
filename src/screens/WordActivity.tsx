import { useEffect, useMemo, useRef, useState } from 'react';
import type { Content } from '../content/load';
import type { Lesson, Word } from '../content/types';
import Mascot from '../activities/Mascot';
import { wordImageUrl } from '../content/images';
import { learnedLetters, promptAudio, randomPrompt, recordAttempt, say, stopSay, usePriorityIds } from '../activities/common';
import { buildWordQueue, pickChoices } from '../activities/wordQueue';

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

/** A5 – „Přiřaď slovo k obrázku“: dítě slyší slovo a klepne na správný obrázek. */
function WordRound({ content, lesson, back, priority }: Props & { priority: Set<string> }) {
  const all = useMemo(() => lessonPictureWords(content, lesson), [content, lesson]);
  const [queue, setQueue] = useState<Word[]>(() => buildWordQueue(all, lesson, priority));
  const [n, setN] = useState(0);
  const target = queue[Math.min(n, queue.length - 1)];
  const choices = useMemo(() => pickChoices(all, target), [all, target, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const task = { target, choices };
  const total = queue.length;
  const [requeued, setRequeued] = useState<string[]>([]);
  const [roundKey, setRoundKey] = useState(0);
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
  }, [n, roundKey]);

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
      // chybné slovo se na konci kola zopakuje (jednou)
      if (!requeued.includes(task.target.id)) { setRequeued((r) => [...r, task.target.id]); setQueue((q) => [...q, task.target]); }
      setMood('povzbuzeni');
      setMessage('Skoro! Poslechni si to ještě jednou a zkus to znovu.');
      void say([...randomPrompt(content, 'p-retry-'), task.target.audioId]);
    }
  };

  const again = () => {
    stopSay();
    setQueue(buildWordQueue(all, lesson, priority)); setN(0); setRequeued([]); setCorrectCount(0);
    setSolved(false); setWrong([]); setMood('premysli'); setMessage('Poslechni si slovo a najdi obrázek.'); setRoundKey((k) => k + 1);
  };

  const next = () => {
    stopSay();
    if (n + 1 >= total) {
      setN(total);
      void say(promptAudio(content, 'p-round-end'));
      return;
    }
    setN(n + 1);
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

  if (n >= total) {
    return (
      <main className="screen activity" data-testid="round-end">
        <Mascot mood="radost" />
        <h1>Hotovo! To bylo skvělé hraní.</h1>
        <p className="muted">Napoprvé správně: {correctCount} z {total - requeued.length}</p>
        <div className="actions"><button className="kbtn kbtn-xl" data-testid="again" onClick={again}>Hrát znovu</button><button className="kbtn kbtn-primary kbtn-xl" onClick={back}>Zpět na lekci</button></div>
      </main>
    );
  }

  return (
    <main className="screen activity" data-testid="word-activity" data-total={total} data-target={task.target.id}>
      <header className="topbar row">
        <button className="kbtn" onClick={back}>Zpět</button>
        <p className="muted" data-testid="progress">Úloha {n + 1} z {total}</p>
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
