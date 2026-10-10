import { useEffect, useMemo, useRef, useState } from 'react';
import type { Content } from '../content/load';
import type { Lesson, Word } from '../content/types';
import Mascot from '../activities/Mascot';
import Glyphs from '../components/Glyphs';
import { wordImageUrl } from '../content/images';
import { promptAudio, randomPrompt, recordAttempt, say, shuffle, stopSay, usePriorityIds } from '../activities/common';
import { buildWordQueue } from '../activities/wordQueue';
import { composeWords, distractorCount, distractorsFor } from '../activities/composeWord';

interface Props { content: Content; lesson: Lesson; back: () => void }
interface Card { key: string; syllableId: string }

export default function ComposeWord(props: Props) {
  const priority = usePriorityIds(props.content, props.lesson);
  if (!priority) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  return <Round {...props} priority={priority} />;
}

const START = 'Poslechni si slovo a slož ho ze slabik.';

/** A5c – „Slož slovo“: dítě klepnutím nebo přetažením skládá slabiky do políček; po složení zazní slovo a ukáže se obrázek. */
function Round({ content, lesson, back, priority }: Props & { priority: Set<string> }) {
  const all = useMemo(() => composeWords(content, lesson), [content, lesson]);
  const [queue, setQueue] = useState<Word[]>(() => buildWordQueue(all, lesson, priority));
  const [n, setN] = useState(0);
  const total = queue.length;
  const target = queue[Math.min(n, total - 1)];
  const [roundKey, setRoundKey] = useState(0);
  const cards = useMemo<Card[]>(() => {
    const ids = [...target.syllableIds, ...distractorsFor(content, lesson, target, distractorCount(target, n))];
    return shuffle(ids.map((syllableId, i) => ({ key: `c${i}`, syllableId })));
  }, [content, lesson, target, n, roundKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [filled, setFilled] = useState<Card[]>([]);
  const [misses, setMisses] = useState(0); // chyby na aktuálním políčku
  const [flash, setFlash] = useState<string | null>(null);
  const [requeued, setRequeued] = useState<string[]>([]);
  const [mood, setMood] = useState<'radost' | 'povzbuzeni' | 'premysli'>('premysli');
  const [message, setMessage] = useState(START);
  const [saveError, setSaveError] = useState(false);
  const [firstTry, setFirstTry] = useState(0);
  const [wordWrong, setWordWrong] = useState(false);
  const [drag, setDrag] = useState<{ key: string; x: number; y: number } | null>(null);
  const busy = useRef(false);
  const done = filled.length === target.syllableIds.length;
  const sylText = (id: string) => content.syllableById.get(id)!.text;
  const sylAudio = (id: string) => content.syllableById.get(id)!.audioId;
  const next_ = target.syllableIds[filled.length];

  useEffect(() => () => stopSay(), []);
  useEffect(() => { if (n < total) void say([...promptAudio(content, 'p-compose-word'), target.audioId]); }, [n, roundKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = (nn: number) => { setN(nn); setFilled([]); setMisses(0); setWordWrong(false); setMood('premysli'); setMessage(START); setFlash(null); };

  const place = async (card: Card) => {
    if (done || busy.current || filled.some((c) => c.key === card.key)) return;
    busy.current = true;
    const correct = card.syllableId === next_;
    try { await recordAttempt(content, lesson, 'A5c', target.id, card.syllableId, correct); setSaveError(false); } catch { setSaveError(true); }
    busy.current = false;
    if (correct) {
      const nf = [...filled, card];
      setFilled(nf);
      setMisses(0);
      if (nf.length === target.syllableIds.length) {
        setMood('radost');
        if (!wordWrong) setFirstTry((c) => c + 1);
        setMessage(`Správně! ${target.text}.`);
        void say([sylAudio(card.syllableId), target.audioId, ...randomPrompt(content, 'p-praise-')]);
      } else {
        setMood('premysli');
        setMessage('Správně, pokračuj dál.');
        void say([sylAudio(card.syllableId)]);
      }
    } else {
      const m = misses + 1;
      setMisses(m);
      setWordWrong(true);
      setFlash(card.key);
      window.setTimeout(() => setFlash((f) => (f === card.key ? null : f)), 500);
      if (!requeued.includes(target.id)) { setRequeued((r) => [...r, target.id]); setQueue((q) => [...q, target]); }
      setMood('povzbuzeni');
      setMessage(m >= 2 ? 'Skoro! Zkus tu zvýrazněnou kartu.' : 'Skoro! Poslechni si slabiku a zkus jinou.');
      // zazní zvuk zvolené slabiky (dítě slyší rozdíl); po 3. chybě i ta správná
      void say(m >= 3 ? [sylAudio(card.syllableId), sylAudio(next_)] : [sylAudio(card.syllableId)]);
    }
  };

  // Přetahování pointer eventy (prst i myš); krátké klepnutí = vložení do dalšího políčka.
  const onDown = (card: Card) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (done) return;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 12) moved = true;
      if (moved) setDrag({ key: card.key, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      setDrag(null);
      if (!moved) return; // klepnutí obslouží onClick
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      if (over?.closest('[data-testid="slots"]')) void place(card);
    };
    const cancel = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); setDrag(null); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    suppressClick.current = false;
    const mark = () => { suppressClick.current = moved; };
    el.addEventListener('pointerup', mark, { once: true });
  };
  const suppressClick = useRef(false);

  const nextTask = () => {
    stopSay();
    if (n + 1 >= total) { setN(total); void say(promptAudio(content, 'p-round-end')); return; }
    reset(n + 1);
  };
  const again = () => {
    stopSay();
    setQueue(buildWordQueue(all, lesson, priority)); setRequeued([]); setFirstTry(0); reset(0); setRoundKey((k) => k + 1);
  };

  if (all.length < 1) {
    return (
      <main className="screen activity">
        <p className="notice">Slova ke skládání přijdou s dalšími lekcemi.</p>
        <button className="kbtn" onClick={back}>Zpět</button>
      </main>
    );
  }

  if (n >= total) {
    return (
      <main className="screen activity" data-testid="round-end">
        <Mascot mood="radost" />
        <h1>Hotovo! To bylo skvělé hraní.</h1>
        <p className="muted">Napoprvé správně: {firstTry} z {total - requeued.length}</p>
        <div className="actions"><button className="kbtn kbtn-xl" data-testid="again" onClick={again}>Hrát znovu</button><button className="kbtn kbtn-primary kbtn-xl" onClick={back}>Zpět na lekci</button></div>
      </main>
    );
  }

  const img = wordImageUrl(target);
  return (
    <main className="screen activity" data-testid="compose-activity" data-total={total} data-target={target.id} data-done={done}>
      <header className="topbar row">
        <button className="kbtn" onClick={back}>Zpět</button>
        <p className="muted" data-testid="progress">Úloha {n + 1} z {total}</p>
      </header>
      <div className="stage">
        <Mascot mood={mood} />
        <button className="kbtn kbtn-xl" onClick={() => void say([target.audioId])} aria-label="Přehrát slovo znovu">🔊 Poslechnout</button>
      </div>
      <p className={`feedback ${mood}`} role="status" data-testid="feedback">{message}</p>
      {saveError && <p className="notice is-error" role="alert">Pokrok se nepodařilo uložit, hra ale pokračuje.</p>}
      <div className="compose-board">
        <div className="compose-slots" data-testid="slots">
          {target.syllableIds.map((_, i) => (
            <span key={i} className={`slot compose-slot${filled[i] ? ' is-right' : ''}${i === filled.length && !done ? ' is-next' : ''}`} data-testid="slot" data-filled={filled[i] ? sylText(filled[i].syllableId) : ''}>
              {filled[i] ? <Glyphs forms={content.syllableById.get(filled[i].syllableId)!.forms} /> : ''}
            </span>
          ))}
        </div>
        <div className="compose-pic" data-testid="compose-pic">
          {done && img ? <img src={img} alt={target.gloss || target.text.toLowerCase()} draggable={false} data-testid="picture" /> : <span className="compose-q" aria-hidden="true">?</span>}
        </div>
      </div>
      <div className="choices compose-cards" data-testid="cards">
        {cards.map((c) => {
          const used = filled.some((f) => f.key === c.key);
          const hint = misses >= 2 && !done && c.syllableId === next_ && !used;
          return (
            <button
              key={c.key}
              className={`tile compose-card${used ? ' is-used' : ''}${hint ? ' is-hint' : ''}${flash === c.key ? ' is-shake' : ''}${drag?.key === c.key ? ' is-dragging' : ''}`}
              data-syllable={c.syllableId}
              disabled={used}
              onPointerDown={onDown(c)}
              onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } void place(c); }}
              style={drag?.key === c.key ? { transform: `translate(${drag.x - 60}px, ${drag.y - 60}px)`, position: 'fixed', left: 0, top: 0, zIndex: 10, pointerEvents: 'none' } : undefined}
            >
              <Glyphs forms={content.syllableById.get(c.syllableId)!.forms} />
            </button>
          );
        })}
      </div>
      {done && <div className="actions"><button className="kbtn kbtn-primary kbtn-xl" onClick={nextTask}>Dál ▶</button></div>}
    </main>
  );
}
