import { useEffect, useMemo, useRef, useState } from 'react';
import type { Content } from '../content/load';
import type { Lesson, Word } from '../content/types';
import Mascot from '../activities/Mascot';
import { wordImageUrl } from '../content/images';
import { promptAudio, randomPrompt, recordAttempt, say, stopSay, usePriorityIds } from '../activities/common';
import { buildWordQueue, pickChoices } from '../activities/wordQueue';
import { lessonPictureWords } from './WordActivity';

interface Props { content: Content; lesson: Lesson; back: () => void }

/** Slovo velkým písmem, pod každou slabikou oblouček (tvar z design/js/app.js, stejný jako u „Čti slabiku“). */
export function WordArcs({ word }: { word: Word }) {
  return (
    <span className="word-arcs" data-testid="word-arcs">
      {word.syllablesText.map((t, i) => (
        <span className="syll-arc" key={i} data-testid="word-syll">
          <span className="syll-text">{t}</span>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="M6 4 Q50 30 94 4" /></svg>
        </span>
      ))}
    </span>
  );
}

export default function ReadWord(props: Props) {
  const priority = usePriorityIds(props.content, props.lesson);
  if (!priority) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  return <Round {...props} priority={priority} />;
}

/** A7 – „Čti slovo“: dítě slovo (bez zvuku) přečte nahlas, pak vybere obrázek; zvuk slova zazní až po odpovědi. */
function Round({ content, lesson, back, priority }: Props & { priority: Set<string> }) {
  const all = useMemo(() => lessonPictureWords(content, lesson), [content, lesson]);
  const [queue, setQueue] = useState<Word[]>(() => buildWordQueue(all, lesson, priority));
  const [n, setN] = useState(0);
  const total = queue.length;
  const target = queue[Math.min(n, total - 1)];
  const choices = useMemo(() => pickChoices(all, target), [all, target, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const [step, setStep] = useState<'read' | 'pick'>('read');
  const [mood, setMood] = useState<'radost' | 'povzbuzeni' | 'premysli'>('premysli');
  const [message, setMessage] = useState('Přečti si slovo nahlas.');
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState<string[]>([]);
  const [requeued, setRequeued] = useState<string[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const busy = useRef(false);

  useEffect(() => () => stopSay(), []);
  // Pokyn na začátku každé úlohy (rodičova nahrávka má přednost – řeší say()).
  useEffect(() => { if (step === 'read' && n < total) void say(promptAudio(content, 'p-read-word')); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (w: Word) => {
    if (solved || busy.current || wrong.includes(w.id)) return;
    busy.current = true;
    const correct = w.id === target.id;
    try { await recordAttempt(content, lesson, 'A7', target.id, w.id, correct); setSaveError(false); } catch { setSaveError(true); }
    busy.current = false;
    if (correct) {
      setSolved(true); setMood('radost'); setCorrectCount((c) => c + (wrong.length === 0 ? 1 : 0));
      setMessage(`Správně! ${target.text}.`);
      void say([target.audioId, ...randomPrompt(content, 'p-praise-')]);
    } else {
      setWrong((x) => [...x, w.id]); setMood('povzbuzeni');
      if (!requeued.includes(target.id)) { setRequeued((r) => [...r, target.id]); setQueue((q) => [...q, target]); }
      setMessage('Skoro! Přečti si slovo ještě jednou a zkus to znovu.');
      void say(randomPrompt(content, 'p-retry-'));
    }
  };

  const reset = () => { setStep('read'); setSolved(false); setWrong([]); setMood('premysli'); setMessage('Přečti si slovo nahlas.'); };
  const next = () => {
    stopSay();
    if (n + 1 >= total) { setN(total); void say(promptAudio(content, 'p-round-end')); return; }
    setN(n + 1); reset();
  };
  const again = () => {
    stopSay(); setQueue(buildWordQueue(all, lesson, priority)); setN(0); setRequeued([]); setCorrectCount(0); reset();
  };

  if (all.length < 3) {
    return <main className="screen activity"><p className="notice">Slova s obrázky přijdou s dalšími lekcemi.</p><button className="kbtn" onClick={back}>Zpět</button></main>;
  }
  if (n >= total) {
    return (
      <main className="screen activity" data-testid="round-end">
        <Mascot mood="radost" />
        <h1>Hotovo! To bylo skvělé čtení.</h1>
        <p className="muted">Napoprvé správně: {correctCount} z {total - requeued.length}</p>
        <div className="actions">
          <button className="kbtn kbtn-xl" data-testid="again" onClick={again}>Hrát znovu</button>
          <button className="kbtn kbtn-primary kbtn-xl" onClick={back}>Zpět na lekci</button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen activity" data-testid="readword-activity" data-target={target.id} data-total={total}>
      <header className="topbar row">
        <button className="kbtn" onClick={back}>Zpět</button>
        <p className="muted" data-testid="progress">Úloha {n + 1} z {total}</p>
      </header>
      <div className="stage"><Mascot mood={mood} /></div>
      <div className="read-syll read-word" data-testid="read-word"><WordArcs word={target} /></div>
      <p className={`feedback ${mood}`} role="status" data-testid="feedback">{message}</p>
      {saveError && <p className="notice is-error" role="alert">Pokrok se nepodařilo uložit, hra ale pokračuje.</p>}
      {step === 'read' && (
        <div className="actions"><button className="kbtn kbtn-primary kbtn-xl" data-testid="read-done" onClick={() => { setStep('pick'); setMessage('Který obrázek patří ke slovu?'); }}>Přečetl(a) jsem</button></div>
      )}
      {step === 'pick' && (
        <div className="choices" data-testid="choices">
          {choices.map((w) => (
            <button key={w.id} className={`tile tile-pic${solved && w.id === target.id ? ' is-right' : ''}${wrong.includes(w.id) ? ' is-tried' : ''}`}
              data-word={w.id} aria-label={`Obrázek: ${w.gloss || w.text.toLowerCase()}`} onClick={() => void choose(w)}>
              <img src={wordImageUrl(w)!} alt="" draggable={false} />
            </button>
          ))}
        </div>
      )}
      {solved && <div className="actions"><button className="kbtn kbtn-primary kbtn-xl" onClick={next}>Dál ▶</button></div>}
    </main>
  );
}
