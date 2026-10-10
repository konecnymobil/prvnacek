import { useEffect, useRef, useState } from 'react';
import Glyphs, { useTaskForm } from '../components/Glyphs';
import Mascot from '../activities/Mascot';
import type { Content } from '../content/load';
import { promptAudio, randomPrompt, say, stopSay } from '../activities/common';
import { buildReview, itemAudio, itemForms, type ReviewItem } from '../activities/review';
import { addAttempt, getAllAttempts, getLessonStatesMap } from '../storage/db';

const PROMPT = { letter: 'p-find-letter', syllable: 'p-find-syllable', word: 'p-a7' } as const;
const ASK = { letter: 'Najdi písmenko, které slyšíš.', syllable: 'Najdi slabiku, kterou slyšíš.', word: 'Které slovo slyšíš?' } as const;

/** Opakování napříč lekcemi: 5 úloh ze schválených lekcí, bez trestů a bodů. */
export default function Review({ content, back }: { content: Content; back: () => void }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [n, setN] = useState(0);
  const [mood, setMood] = useState<'radost' | 'povzbuzeni' | 'premysli'>('premysli');
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState<string[]>([]);
  const [message, setMessage] = useState('Zopakujeme si, co už umíš.');
  const [saveError, setSaveError] = useState(false);
  const [firstTry, setFirstTry] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getLessonStatesMap(), getAllAttempts()]).then(
      ([st, at]) => alive && setItems(buildReview(content, st, at)),
      () => alive && setItems([]),
    );
    return () => { alive = false; stopSay(); };
  }, [content]);

  const it = items?.[n];
  const form = useTaskForm(n);
  useEffect(() => {
    if (it) void say([...promptAudio(content, PROMPT[it.kind]), itemAudio(content, it)]);
  }, [content, it]);

  if (!items) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  if (items.length === 0) return <main className="screen activity" data-testid="review-empty"><p className="notice">Opakování se otevře, až rodič schválí aspoň dvě lekce.</p><button className="kbtn" onClick={back}>Zpět</button></main>;
  if (n >= items.length) {
    return (
      <main className="screen activity" data-testid="round-end">
        <Mascot mood="radost" />
        <h1>Hotovo! Moc ti to jde.</h1>
        <p className="muted">Napoprvé správně: {firstTry} z {items.length}</p>
        <div className="actions"><button className="kbtn kbtn-primary kbtn-xl" onClick={back}>Domů</button></div>
      </main>
    );
  }
  const item = it!;

  const choose = async (id: string) => {
    if (solved || busy.current || wrong.includes(id)) return;
    busy.current = true;
    const correct = id === item.id;
    try {
      await addAttempt({ orderId: content.defaultOrderId, lessonId: item.lessonId, activity: item.activity, itemId: item.id, correct, chosenId: id, source: 'review' });
      setSaveError(false);
    } catch { setSaveError(true); }
    busy.current = false;
    if (correct) {
      setSolved(true); setMood('radost'); setMessage('Správně! Výborně!');
      if (wrong.length === 0) setFirstTry((c) => c + 1);
      void say(randomPrompt(content, 'p-praise-'));
    } else {
      const w = [...wrong, id];
      setWrong(w); setMood('povzbuzeni'); setMessage('Skoro! Poslechni si to ještě jednou a zkus to znovu.');
      void say([...randomPrompt(content, 'p-retry-'), itemAudio(content, item)]);
    }
  };

  const next = () => {
    stopSay();
    if (n + 1 >= items.length) { setN(items.length); void say(promptAudio(content, 'p-round-end')); return; }
    setN(n + 1); setSolved(false); setWrong([]); setMood('premysli'); setMessage('Zopakujeme si, co už umíš.');
  };

  return (
    <main className="screen activity" data-testid="review-activity" data-kind={item.kind} data-lesson={item.lessonId} data-target={item.id} data-total={items.length}>
      <header className="topbar row">
        <button className="kbtn" onClick={() => { stopSay(); back(); }}>Zpět</button>
        <p className="muted" data-testid="progress">Opakování {n + 1} z {items.length}</p>
      </header>
      <div className="stage">
        <Mascot mood={mood} />
        <button className="kbtn kbtn-xl" onClick={() => void say([itemAudio(content, item)])} aria-label="Přehrát znovu">🔊 Poslechnout</button>
      </div>
      <p className={`feedback ${mood}`} role="status" data-testid="feedback">{message} {ASK[item.kind]}</p>
      {saveError && <p className="notice is-error" role="alert">Pokrok se nepodařilo uložit, hra ale pokračuje.</p>}
      <div className="choices" data-testid="choices">
        {item.choiceIds.map((id) => (
          <button key={id} className={`tile${(solved || wrong.length >= 2) && id === item.id ? ' is-right' : ''}${wrong.includes(id) ? ' is-tried' : ''}`} data-choice={id} onClick={() => void choose(id)}>
            <Glyphs forms={itemForms(content, id, item.kind)} form={form} />
          </button>
        ))}
      </div>
      {solved && <div className="actions"><button className="kbtn kbtn-primary kbtn-xl" data-testid="next" onClick={next}>Dál ▶</button></div>}
    </main>
  );
}
