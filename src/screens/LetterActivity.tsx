import HomeButton from '../components/HomeButton';
import { useStickerOnDone } from '../album/useStickerOnDone';
import { useTaskLog } from '../activities/taskLog';
import Glyphs, { useTaskForm } from '../components/Glyphs';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Content } from '../content/load';
import type { Lesson, Letter } from '../content/types';
import Mascot from '../activities/Mascot';
import { drawFresh } from '../activities/fresh';
import { ROUND_SIZE, learnedLetters, promptAudio, randomPrompt, recordAttempt, say, stopSay, shuffle, pickPriority, usePriorityIds } from '../activities/common';
import { useAutoAdvance } from '../activities/autoAdvance';

interface Task {
  target: Letter;
  choices: Letter[];
}

const firstIndex = (content: Content) => Math.min(...content.orders[content.defaultOrderId].lessons.map((l) => l.index));
/** A-10: v 1. lekci kratší kolo (4 úlohy). */
export const letterRoundSize = (content: Content, lesson: Lesson) => (lesson.index === firstIndex(content) ? 4 : ROUND_SIZE);

export function makeTask(content: Content, lesson: Lesson, prev: string | null, priority: Set<string>, first: boolean): Task {
  const learned = learnedLetters(content, lesson);
  let targets = lesson.letterIds.map((id) => content.letterById.get(id)!).filter((l) => l.id !== prev);
  // lekce s jediným písmenem: po něm následuje dříve probrané písmeno, ať se stejné nevolá dvakrát za sebou
  if (!targets.length) targets = learned.filter((l) => l.id !== prev);
  if (!targets.length) targets = lesson.letterIds.map((id) => content.letterById.get(id)!);
  // k písmenům lekce se přidají písmena, která dítěti ve zkoušce nešla (i z dřívějších lekcí)
  const extra = learned.filter((l) => priority.has(l.id) && !targets.some((t) => t.id === l.id) && l.id !== prev);
  const all = targets.length ? [...targets, ...extra] : learned;
  const target = drawFresh(`A2:${lesson.id}`, all, (l) => l.id, ROUND_SIZE, (a) => pickPriority(a, priority, first));
  // Á a A si dítě zatím nespletlo záměrně: krátké a dlouhé nedáváme vedle sebe jako nabídku.
  const confusable = (l: Letter) => l.baseLetterId === target.id || target.baseLetterId === l.id;
  let pool = learned.filter((l) => l.id !== target.id && !confusable(l));
  if (lesson.index === firstIndex(content)) {
    // A-10: v 1. lekci rozptylovače jen tvarově vzdálené (shapeDistractors z obsahu), ne písmena dalších lekcí
    const shapes = (target.shapeDistractors ?? []).map((ch): Letter => ({ ...target, id: `shape-${ch}`, upper: ch, lower: ch.toLowerCase(), baseLetterId: null,
      forms: { upperPrint: ch, lowerPrint: ch.toLowerCase(), cursive: ch.toLowerCase(), cursiveUpper: ch } }));
    if (shapes.length >= 2) pool = shapes;
  }
  if (pool.length < 2) {
    // Na začátku (lekce M) není z čeho vybírat – doplníme písmena z prvních lekcí.
    const order = content.orders[content.defaultOrderId];
    const first = order.lessons.slice(0, 4).flatMap((l) => l.letterIds).map((id) => content.letterById.get(id)!);
    pool = first.filter((l) => l.id !== target.id && !confusable(l));
  }
  const choices = shuffle([target, ...shuffle(pool).slice(0, Math.min(3, pool.length))]);
  return { target, choices };
}

interface Props {
  content: Content;
  lesson: Lesson;
  back: () => void;
}

/** A2 – „Poslechni si hlásku a najdi písmeno“. */
export default function LetterActivity(props: Props) {
  const priority = usePriorityIds(props.content, props.lesson);
  if (!priority) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  return <LetterRound {...props} priority={priority} />;
}

function LetterRound({ content, lesson, back, priority }: Props & { priority: Set<string> }) {
  const ROUND = letterRoundSize(content, lesson);
  const [n, setN] = useState(0);
  const [task, setTask] = useState<Task>(() => makeTask(content, lesson, null, priority, true));
  const [mood, setMood] = useState<'radost' | 'povzbuzeni' | 'premysli'>('premysli');
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState<string[]>([]);
  const [message, setMessage] = useState('Poslechni si hlásku a najdi její písmenko.');
  const [saveError, setSaveError] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const busy = useRef(false);
  const form = useTaskForm(task);
  const auto = useAutoAdvance(); // po pochvale sám pokračuje

  const hear = useCallback(() => void say([task.target.audioId]), [task]);

  useEffect(() => () => stopSay(), []);

  useEffect(() => {
    void say([...promptAudio(content, 'p-a2'), task.target.audioId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  const choose = async (l: Letter) => {
    if (solved || busy.current || wrong.includes(l.id)) return;
    busy.current = true;
    const correct = l.id === task.target.id;
    try {
      await recordAttempt(content, lesson, 'A2', task.target.id, l.id, correct);
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
    busy.current = false;
    if (correct) {
      setSolved(true);
      setMood('radost');
      setCorrectCount((c) => c + (wrong.length === 0 ? 1 : 0));
      setMessage('Správně! Výborně!');
      auto.schedule(say(randomPrompt(content, 'p-praise-')));
    } else {
      setWrong((w) => [...w, l.id]);
      setMood('povzbuzeni');
      setMessage('Skoro! Poslechni si to ještě jednou a zkus to znovu.');
      void say([...randomPrompt(content, 'p-retry-'), task.target.audioId]);
    }
  };

  auto.target.current = () => next();
  const next = () => {
    stopSay();
    if (n + 1 >= ROUND) {
      setN(ROUND);
      void say(promptAudio(content, 'p-round-end'));
      return;
    }
    setN(n + 1);
    setTask(makeTask(content, lesson, task.target.id, priority, false));
    setSolved(false);
    setWrong([]);
    setMood('premysli');
    setMessage('Poslechni si hlásku a najdi její písmenko.');
  };

  useStickerOnDone('cviceni', n >= ROUND);
  useTaskLog('A2', lesson.id, n >= ROUND);
  if (n >= ROUND) {
    return (
      <main className="screen activity" data-testid="round-end">
        <Mascot mood="radost" />
        <h1>Hotovo! To bylo skvělé hraní.</h1>
        <p className="muted">Napoprvé správně: {correctCount} z {ROUND}</p>
        <div className="actions">
          <button className="kbtn kbtn-primary kbtn-xl" onClick={back}>Zpět na lekci</button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen activity" data-testid="letter-activity" data-target={task.target.id}>
      <header className="topbar row">
        <HomeButton onClick={back} />
        <p className="muted" data-testid="progress">Úloha {n + 1} z {ROUND}</p>
      </header>
      <div className="stage">
        <Mascot mood={mood} />
        <button className="kbtn kbtn-xl" onClick={hear} aria-label="Přehrát hlásku znovu">🔊 Poslechnout</button>
      </div>
      <p className={`feedback ${mood}`} role="status" data-testid="feedback">{message}</p>
      {saveError && <p className="notice is-error" role="alert">Pokrok se nepodařilo uložit, hra ale pokračuje.</p>}
      <div className="choices" data-testid="choices">
        {task.choices.map((l) => (
          <button
            key={l.id}
            className={`tile${solved && l.id === task.target.id ? ' is-right' : ''}${wrong.includes(l.id) ? ' is-tried' : ''}`}
            data-letter={l.id}
            aria-label={`Písmeno ${l.upper}`}
            onClick={() => void choose(l)}
          >
            <Glyphs forms={l.forms} form={form} />
          </button>
        ))}
      </div>
      {solved && (
        <div className="actions">
          <button className="kbtn kbtn-primary kbtn-xl" onClick={auto.manual}>Dál ▶</button>
        </div>
      )}
    </main>
  );
}
