import { useEffect, useState } from 'react';
import BackupPanel from './BackupPanel';
import type { Content } from '../content/load';
import type { Screen } from '../App';
import { isLessonUnlocked, unlockLesson, getAllAttempts, getAllLessonStates, getTestResults, type Attempt, type LessonState, type LessonStatus, type TestResultRecord } from '../storage/db';

const STATUS: Record<LessonStatus, string> = {
  locked: 'zamčeno',
  practicing: 'procvičuje se',
  recommended: '🟢 doporučeno ke zkoušce',
  approved: '✓ schváleno',
};

interface Props {
  content: Content;
  go: (s: Screen) => void;
  startTest: (lessonId: string) => void;
}

export default function ParentHome({ content, go, startTest }: Props) {
  const order = content.orders[content.defaultOrderId];
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [states, setStates] = useState<Record<string, LessonState>>({});
  const [tests, setTests] = useState<Record<string, TestResultRecord | undefined>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    (async () => {
      setAttempts(await getAllAttempts());
      const st: Record<string, LessonState> = {};
      for (const s of await getAllLessonStates()) st[s.lessonId] = s;
      setStates(st);
      const t: Record<string, TestResultRecord | undefined> = {};
      for (const l of order.lessons) t[l.id] = (await getTestResults(content.defaultOrderId, l.id)).at(-1);
      setTests(t);
    })().catch(() => setErr('Pokrok se nepodařilo načíst z úložiště iPadu.'));
  };
  useEffect(load, [content, order]);

  const rows = order.lessons.flatMap((l) => l.letterIds.map((id) => ({ lesson: l, letter: content.letterById.get(id)! })));
  const letterIdsOf = (a: Attempt): string[] =>
    a.activity === 'A2' ? [a.itemId] : (a.activity === 'A4' || a.activity === 'A6') ? (content.syllableById.get(a.itemId)?.letterIds ?? []) : (a.activity === 'A5' || a.activity === 'A7') ? (content.wordById.get(a.itemId)?.letterIds ?? []) : [];
  /** Záměna písmene: A2 = zvolené písmeno; A4 = písmeno zvolené slabiky, které v cílové není. */
  const confusedWith = (a: Attempt, letterId: string): string | null => {
    if (a.correct || !a.chosenId) return null;
    if (a.activity === 'A2') return a.chosenId;
    if (a.activity === 'A4' || a.activity === 'A6') {
      const t = content.syllableById.get(a.itemId)?.letterIds ?? [];
      const c = content.syllableById.get(a.chosenId)?.letterIds ?? [];
      if (c.includes(letterId)) return null;
      return c.find((x) => !t.includes(x)) ?? null;
    }
    return null;
  };

  return (
    <main className="screen parent" data-testid="parent-home">
      <header className="topbar">
        <button className="back" onClick={() => go('home')}>‹ Konec rodičovské části</button>
        <h1>Pro rodiče</h1>
      </header>
      <nav className="actions">
        <button className="kbtn kbtn-primary" onClick={() => go('sounds')} data-testid="open-sounds">🎙 Zvuky (nahrát vlastní hlásku)</button>
      </nav>
      {err && <p className="notice is-error" role="alert">{err}</p>}

      <section className="card">
        <h2>Lekce a zkoušky</h2>
        <ul className="plist" data-testid="lesson-list">
          {order.lessons.map((l) => {
            const st = states[l.id]?.status;
            const last = tests[l.id];
            return (
              <li key={l.id} data-lesson={l.id} data-status={st ?? 'none'}>
                <strong>Lekce {l.index}: {l.title}</strong>
                <span className="muted"> – {!isLessonUnlocked(order.lessons, l.id, states) ? '🔒 zamčeno (odemkne se schválením předchozí lekce)' : st ? STATUS[st] : 'zatím nezačato'}</span>
                {last && <span className="small muted"> · poslední zkouška {last.score}/{last.total}</span>}
                {!isLessonUnlocked(order.lessons, l.id, states) && (
                  <button className="kbtn" data-testid={`unlock-${l.id}`} onClick={() => unlockLesson(content.defaultOrderId, l.id).then(load, () => setErr('Odemknutí se nepodařilo uložit.'))}>🔓 Odemknout lekci</button>
                )}
                <button className="kbtn" onClick={() => startTest(l.id)} data-testid={`start-test-${l.id}`}>Spustit zkoušku</button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2>Pokrok po písmenech</h2>
        <p className="small muted">Správně / pokusů v aktivitách „Najdi písmeno“, „Slož slabiku“, „Čti slabiku“, „Slovo k obrázku“ a „Čti slovo“ (slabiky a slova se počítají každému písmenu, které obsahují) a nejčastější záměna.</p>
        <table className="ptable" data-testid="letter-progress">
          <thead><tr><th>Písmeno</th><th>Lekce</th><th>Najdi písmeno</th><th>Slabiky</th><th>Čti slabiku</th><th>Slova k obrázku</th><th>Čti slovo</th><th>Celkem</th><th>Mate se s</th></tr></thead>
          <tbody>
            {rows.map(({ lesson, letter }) => {
              const mine = attempts.filter((a) => letterIdsOf(a).includes(letter.id));
              const fmt = (act: string) => { const m = mine.filter((a) => a.activity === act); return m.length ? `${m.filter((a) => a.correct).length} / ${m.length}` : '–'; };
              const conf = new Map<string, number>();
              for (const a of mine) { const c = confusedWith(a, letter.id); if (c) conf.set(c, (conf.get(c) ?? 0) + 1); }
              const top = [...conf.entries()].sort((x, y) => y[1] - x[1])[0];
              return (
                <tr key={letter.id} data-letter={letter.id}>
                  <td className="big">{letter.upper}{letter.lower}</td>
                  <td>{lesson.index}</td>
                  <td data-col="A2">{fmt('A2')}</td>
                  <td data-col="A4">{fmt('A4')}</td>
                  <td data-col="A6">{fmt('A6')}</td>
                  <td data-col="A5">{fmt('A5')}</td>
                  <td data-col="A7">{fmt('A7')}</td>
                  <td data-col="all">{mine.length ? `${mine.filter((a) => a.correct).length} / ${mine.length}` : '–'}</td>
                  <td>{top ? (content.letterById.get(top[0])?.upper ?? top[0]) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <BackupPanel onRestored={load} />
    </main>
  );
}
