import { useEffect, useState } from 'react';
import type { Content } from '../content/load';
import type { Screen } from '../App';
import { getAllAttempts, getAllLessonStates, getTestResults, type Attempt, type LessonState, type LessonStatus, type TestResultRecord } from '../storage/db';

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

  useEffect(() => {
    (async () => {
      setAttempts(await getAllAttempts());
      const st: Record<string, LessonState> = {};
      for (const s of await getAllLessonStates()) st[s.lessonId] = s;
      setStates(st);
      const t: Record<string, TestResultRecord | undefined> = {};
      for (const l of order.lessons) t[l.id] = (await getTestResults(content.defaultOrderId, l.id)).at(-1);
      setTests(t);
    })().catch(() => setErr('Pokrok se nepodařilo načíst z úložiště iPadu.'));
  }, [content, order]);

  const rows = order.lessons.flatMap((l) => l.letterIds.map((id) => ({ lesson: l, letter: content.letterById.get(id)! })));

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
                <span className="muted"> – {st ? STATUS[st] : 'zatím nezačato'}</span>
                {last && <span className="small muted"> · poslední zkouška {last.score}/{last.total}</span>}
                <button className="kbtn" onClick={() => startTest(l.id)} data-testid={`start-test-${l.id}`}>Spustit zkoušku</button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2>Pokrok po písmenech</h2>
        <p className="small muted">Správně / pokusů v aktivitě „Najdi písmeno“ a nejčastější záměna.</p>
        <table className="ptable" data-testid="letter-progress">
          <thead><tr><th>Písmeno</th><th>Lekce</th><th>Správně</th><th>Mate se s</th></tr></thead>
          <tbody>
            {rows.map(({ lesson, letter }) => {
              const mine = attempts.filter((a) => a.itemId === letter.id && a.activity === 'A2');
              const ok = mine.filter((a) => a.correct).length;
              const conf = new Map<string, number>();
              for (const a of mine) if (!a.correct && a.chosenId) conf.set(a.chosenId, (conf.get(a.chosenId) ?? 0) + 1);
              const top = [...conf.entries()].sort((x, y) => y[1] - x[1])[0];
              return (
                <tr key={letter.id} data-letter={letter.id}>
                  <td className="big">{letter.upper}{letter.lower}</td>
                  <td>{lesson.index}</td>
                  <td>{mine.length ? `${ok} / ${mine.length}` : '–'}</td>
                  <td>{top ? (content.letterById.get(top[0])?.upper ?? top[0]) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
