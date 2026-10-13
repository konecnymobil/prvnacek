import { awardSticker } from '../album/album';
import { useEffect, useRef, useState } from 'react';
import Mascot from '../activities/Mascot';
import Glyphs, { GlyphText, useTaskForm } from '../components/Glyphs';
import type { Content } from '../content/load';
import { wordImageUrl } from '../content/images';
import { say, stopSay } from '../activities/common';
import { buildCards, levelsFor, pexesoCandidates, pickPairs, starsFor, PEX_KEY, type PexCard, type PexGame } from '../activities/pexeso';
import { getLessonStatesMap, getSetting, setSetting, type LessonState } from '../storage/db';

const END_PAUSE_MS = 500;
const END_CAP_MS = 3000;
const MISMATCH_MS = 1400;

/** Pexeso: obrázek slova + první slabika slova. Bez trestů a bez počítání chyb. */
export default function Pexeso({ content, back }: { content: Content; back: () => void }) {
  const [states, setStates] = useState<Record<string, LessonState | undefined> | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => { getLessonStatesMap().then(setStates, () => setStates({})); return () => stopSay(); }, []);
  if (!states) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  const cands = pexesoCandidates(content, states);
  const levels = levelsFor(new Set(cands.map((w) => w.firstSyllableId)).size);
  if (level === null || !levels.includes(level)) {
    return (
      <main className="screen activity" data-testid="pex-levels">
        <header className="topbar row"><button className="kbtn" onClick={back}>Zpět</button></header>
        <Mascot mood="premysli" />
        <h1>Pexeso</h1>
        <p className="muted">Najdi obrázek a jeho první slabiku.</p>
        {levels.length === 0 && <p className="notice">Pexeso se otevře, až budeš mít aspoň tři slova s obrázkem.</p>}
        <div className="actions">
          {levels.map((l) => <button key={l} className="kbtn kbtn-primary kbtn-xl" data-testid={`pex-level-${l}`} onClick={() => setLevel(l)}>{l * 2} karet</button>)}
        </div>
      </main>
    );
  }
  return <Game key={level} content={content} cands={cands} pairs={level} back={back} again={() => setLevel(null)} />;
}

function Game({ content, cands, pairs, back, again }: { content: Content; cands: ReturnType<typeof pexesoCandidates>; pairs: number; back: () => void; again: () => void }) {
  const [round, setRound] = useState(0);
  const form = useTaskForm(round);
  const [cards, setCards] = useState<PexCard[]>(() => buildCards(pickPairs(cands, pairs)));
  const [open, setOpen] = useState<string[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [flips, setFlips] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const lock = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const saved = useRef(false);
  const word = (id: string) => content.wordById.get(id)!;
  const done = found.length === pairs;
  const [showEnd, setShowEnd] = useState(false);
  // Token pro přechod na konec: každé zrušení (Hrát znovu, odchod, unmount) ho zvýší → čekající krok se zahodí.
  const endRun = useRef(0);
  const endTimers = useRef<number[]>([]);
  const cancelEnd = () => { endRun.current++; endTimers.current.forEach((t) => window.clearTimeout(t)); endTimers.current = []; };
  const later = (ms: number) => new Promise<void>((r) => { endTimers.current.push(window.setTimeout(r, ms)); });

  useEffect(() => () => { window.clearTimeout(timer.current); cancelEnd(); stopSay(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!done || saved.current) return;
    saved.current = true;
    const g: PexGame = { at: Date.now(), pairs, stars: starsFor(pairs), flips };
    (async () => { const list = ((await getSetting<PexGame[]>(PEX_KEY)) ?? []); await setSetting(PEX_KEY, [...list, g]); })().catch(() => setSaveError(true));
    void awardSticker('pexeso').catch(() => {});
    // „hotovo“ se pouští v tap() hned za posledním slovem, aby se nic nepřekrývalo
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (c: PexCard) => {
    if (lock.current || open.includes(c.key) || found.includes(c.wordId)) return;
    const w = word(c.wordId);
    void say([c.face === 'syllable' ? content.syllableById.get(w.firstSyllableId)!.audioId : w.audioId]);
    const next = [...open, c.key];
    setOpen(next);
    setFlips((n) => n + 1);
    if (next.length < 2) return;
    const [a, b] = next.map((k) => cards.find((x) => x.key === k)!);
    if (a.wordId === b.wordId) {
      const last = found.length + 1 === pairs;
      setFound((f) => [...f, a.wordId]); setOpen([]);
      const played = say([word(a.wordId).audioId]);
      if (last) {
        // Poslední pár: karta zůstane vidět, slovo dohraje, hned „hotovo“ ještě nad hrací plochou
        // (každý zvuk nejdéle END_CAP_MS), krátká pauza, pak tichá obrazovka Hotovo.
        lock.current = true;
        const run = ++endRun.current;
        void (async () => {
          await Promise.race([played, later(END_CAP_MS)]);
          if (run !== endRun.current) return;
          await Promise.race([say(['snd-p-round-end'].filter((id) => content.audioIds.has(id))), later(END_CAP_MS)]);
          if (run !== endRun.current) return;
          await later(END_PAUSE_MS);
          if (run !== endRun.current) return;
          setShowEnd(true);
        })();
      }
    } else {
      lock.current = true;
      timer.current = window.setTimeout(() => { setOpen([]); lock.current = false; }, MISMATCH_MS);
    }
  };

  const restart = () => { window.clearTimeout(timer.current); cancelEnd(); stopSay(); setShowEnd(false); lock.current = false; setCards(buildCards(pickPairs(cands, pairs))); setOpen([]); setFound([]); setFlips(0); saved.current = false; setRound((r) => r + 1); };

  if (done && showEnd) {
    const stars = starsFor(pairs);
    return (
      <main className="screen activity" data-testid="pex-end">
        <Mascot mood="radost" />
        <h1>Hotovo! Našel jsi všechny páry.</h1>
        <p className="pex-stars" data-testid="pex-stars" data-stars={stars} aria-label={`${stars} hvězdy`}>{'⭐'.repeat(stars)}</p>
        {saveError && <p className="notice is-error" role="alert">Hru se nepodařilo uložit.</p>}
        <div className="actions">
          <button className="kbtn kbtn-primary kbtn-xl" onClick={restart}>Hrát znovu</button>
          <button className="kbtn" onClick={() => { cancelEnd(); stopSay(); again(); }}>Jiná velikost</button>
          <button className="kbtn" onClick={() => { cancelEnd(); stopSay(); back(); }}>Domů</button>
        </div>
      </main>
    );
  }
  return (
    <main className="screen activity pex" data-testid="pex-game" data-pairs={pairs} key={round}>
      <header className="topbar row">
        <button className="kbtn" onClick={() => { cancelEnd(); stopSay(); back(); }}>Zpět</button>
        {done && <button className="kbtn kbtn-primary" data-testid="pex-wait-restart" onClick={restart}>Hrát znovu</button>}
        <p className="muted" data-testid="pex-progress">Páry {found.length} z {pairs}</p>
      </header>
      <div className="pex-grid" data-cards={cards.length} role="group" aria-label="Karty pexesa">
        {cards.map((c) => {
          const w = word(c.wordId);
          const isFound = found.includes(c.wordId);
          const isOpen = isFound || open.includes(c.key);
          const img = wordImageUrl(w);
          return (
            <button key={c.key} className={`pex-card${isOpen ? ' is-open' : ''}${isFound ? ' is-matched' : ''}`} data-card={c.key} data-word={c.wordId} data-face={c.face}
              data-state={isFound ? 'matched' : isOpen ? 'open' : 'back'} aria-label={isOpen ? (c.face === 'picture' ? w.text : w.syllablesText[0]) : 'Zakrytá karta'} aria-pressed={isOpen} onClick={() => tap(c)}>
              {isOpen ? (c.face === 'picture' ? (img ? <img src={img} alt={w.text} draggable={false} /> : <GlyphText text={w.text} form={form} />) : <Glyphs forms={content.syllableById.get(w.firstSyllableId)!.forms} form={form} />) : <span aria-hidden="true">?</span>}
            </button>
          );
        })}
      </div>
    </main>
  );
}
