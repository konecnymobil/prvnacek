import { useEffect, useMemo, useRef, useState } from 'react';
import type { Content } from '../content/load';
import type { Lesson, Letter, Syllable } from '../content/types';
import Mascot from '../activities/Mascot';
import { ROUND_SIZE, learnedLetters, pick, promptAudio, randomPrompt, recordAttempt, say } from '../activities/common';

/** Slabiky použitelné ve slabikových úlohách (jen usableInSyllableTasks), složené z probraných písmen. */
export function lessonSyllables(content: Content, lesson: Lesson): Syllable[] {
  const known = new Set(learnedLetters(content, lesson).map((l) => l.id));
  const all = content.taskSyllables.filter((s) => s.letterIds.every((id) => known.has(id)));
  const fresh = all.filter((s) => s.letterIds.some((id) => lesson.letterIds.includes(id)));
  return fresh.length ? fresh : all;
}

interface Props {
  content: Content;
  lesson: Lesson;
  back: () => void;
}

/** A4 – „Skládání slabiky“: přisuň souhlásku a samohlásku, ať vznikne slabika, kterou dítě slyší. */
export default function SyllableActivity({ content, lesson, back }: Props) {
  const candidates = useMemo(() => lessonSyllables(content, lesson), [content, lesson]);
  const letters = useMemo(() => learnedLetters(content, lesson), [content, lesson]);
  const consonants = useMemo(() => letters.filter((l) => l.kind === 'consonant'), [letters]);
  const vowels = useMemo(() => letters.filter((l) => l.kind === 'vowel'), [letters]);
  const [n, setN] = useState(0);
  const [target, setTarget] = useState<Syllable>(() => pick(candidates));
  const [slots, setSlots] = useState<(Letter | null)[]>([null, null]);
  const [mood, setMood] = useState<'radost' | 'povzbuzeni' | 'premysli'>('premysli');
  const [solved, setSolved] = useState(false);
  const [message, setMessage] = useState('Slož slabiku, kterou uslyšíš.');
  const [saveError, setSaveError] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    void say([...promptAudio(content, 'p-a4-make'), target.audioId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const place = async (l: Letter) => {
    if (solved || busy.current) return;
    const idx = l.kind === 'consonant' ? 0 : 1; // souhláska vlevo, samohláska vpravo
    const s = slots.slice();
    s[idx] = l;
    setSlots(s);
    if (!s[0] || !s[1]) return;
    busy.current = true;
    const correct = s[0].id === target.consonantLetterId && s[1].id === target.vowelLetterId;
    const chosen = `${s[0].id}+${s[1].id}`;
    try {
      await recordAttempt(content, lesson, 'A4', target.id, chosen, correct);
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
    busy.current = false;
    if (correct) {
      setSolved(true);
      setMood('radost');
      setCorrectCount((c) => c + (failed ? 0 : 1));
      setMessage(`Správně! Slabika ${target.text}.`);
      void say([target.audioId, ...randomPrompt(content, 'p-praise-')]);
    } else {
      setFailed(true);
      setMood('povzbuzeni');
      setMessage('Skoro! Poslechni si to ještě jednou a zkus to znovu.');
      void say([...randomPrompt(content, 'p-retry-'), target.audioId]);
      window.setTimeout(() => setSlots([null, null]), 900);
    }
  };

  const clear = (idx: number) => {
    if (solved) return;
    setSlots((s) => s.map((x, i) => (i === idx ? null : x)));
  };

  const next = () => {
    if (n + 1 >= ROUND_SIZE) {
      setN(ROUND_SIZE);
      void say(promptAudio(content, 'p-round-end'));
      return;
    }
    const others = candidates.filter((s) => s.id !== target.id);
    setN(n + 1);
    setTarget(pick(others.length ? others : candidates));
    setSlots([null, null]);
    setSolved(false);
    setFailed(false);
    setMood('premysli');
    setMessage('Slož slabiku, kterou uslyšíš.');
  };

  if (candidates.length === 0) {
    return (
      <main className="screen activity">
        <p className="notice">Slabiky budou k dispozici od lekce A.</p>
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
        <div className="actions">
          <button className="kbtn kbtn-primary kbtn-xl" onClick={back}>Zpět na lekci</button>
        </div>
      </main>
    );
  }

  const tray = (list: Letter[]) =>
    shuffleStable(list).map((l) => (
      <button key={l.id} className="tile tile-sm" data-letter={l.id} aria-label={`Písmeno ${l.upper}`} onClick={() => void place(l)}>
        {l.upper}
      </button>
    ));

  return (
    <main className="screen activity" data-testid="syllable-activity" data-target={target.id}>
      <header className="topbar row">
        <button className="kbtn" onClick={back}>Zpět</button>
        <p className="muted" data-testid="progress">Úloha {n + 1} z {ROUND_SIZE}</p>
      </header>
      <div className="stage">
        <Mascot mood={mood} />
        <button className="kbtn kbtn-xl" onClick={() => void say([target.audioId])} aria-label="Přehrát slabiku znovu">🔊 Poslechnout</button>
      </div>
      <p className={`feedback ${mood}`} role="status" data-testid="feedback">{message}</p>
      {saveError && <p className="notice is-error" role="alert">Pokrok se nepodařilo uložit, hra ale pokračuje.</p>}
      <div className="slots" data-testid="slots">
        {slots.map((s, i) => (
          <button key={i} className={`slot${s ? ' is-filled' : ''}${solved ? ' is-right' : ''}`} data-slot={i} aria-label={s ? `Vrátit ${s.upper}` : 'Prázdné místo'} onClick={() => clear(i)}>
            {s?.upper ?? ''}
          </button>
        ))}
      </div>
      {!solved && (
        <div className="trays" data-testid="trays">
          <div className="choices">{tray(consonants)}</div>
          <div className="choices">{tray(vowels)}</div>
        </div>
      )}
      {solved && (
        <div className="actions">
          <button className="kbtn kbtn-primary kbtn-xl" onClick={next}>Dál ▶</button>
        </div>
      )}
    </main>
  );
}

// Pořadí dlaždic se mezi překresleními nemění (jinak by skákaly pod prstem).
const orderCache = new Map<string, number>();
function shuffleStable(list: Letter[]): Letter[] {
  for (const l of list) if (!orderCache.has(l.id)) orderCache.set(l.id, Math.random());
  return [...list].sort((a, b) => orderCache.get(a.id)! - orderCache.get(b.id)!);
}
