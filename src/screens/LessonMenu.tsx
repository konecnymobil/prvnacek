import { useEffect, useState } from 'react';
import type { Content } from '../content/load';
import type { Lesson } from '../content/types';
import type { Screen } from '../App';
import { say } from '../activities/common';
import { lessonSyllables } from './SyllableActivity';
import { getLessonState, type LessonStatus } from '../storage/db';

const STATUS: Record<LessonStatus, string> = {
  locked: 'Zatím zamčeno',
  practicing: 'Procvičuje se',
  recommended: 'Připraveno na výzvu s rodičem',
  approved: 'Hotovo',
};

interface Props {
  content: Content;
  lesson: Lesson;
  go: (s: Screen) => void;
}

export default function LessonMenu({ content, lesson, go }: Props) {
  const letter = content.letterById.get(lesson.primaryLetterId)!;
  const hasSyllables = lessonSyllables(content, lesson).length > 0;
  const [status, setStatus] = useState<LessonStatus | null>(null);

  useEffect(() => {
    getLessonState(content.defaultOrderId, lesson.id).then((s) => setStatus(s?.status ?? null), () => {});
  }, [content, lesson]);

  return (
    <main className="screen activity" data-testid="lesson-menu">
      <header className="topbar row">
        <button className="kbtn" onClick={() => go('home')}>Zpět</button>
        <h1>Lekce {lesson.index}: {lesson.title}</h1>
      </header>
      <button className="tile tile-hero" onClick={() => void say([letter.audioId])} aria-label={`Poslechnout hlásku ${letter.upper}`}>
        {letter.upper}
      </button>
      {status && <p className="muted" data-testid="lesson-status">{STATUS[status]}</p>}
      <nav className="actions">
        <button className="kbtn kbtn-primary kbtn-xl" onClick={() => go('letterActivity')}>👂 Najdi písmeno</button>
        <button className="kbtn kbtn-primary kbtn-xl" onClick={() => go('syllableActivity')} disabled={!hasSyllables}>
          🧩 Slož slabiku
        </button>
        {!hasSyllables && <p className="small muted">Slabiky se odemknou s další lekcí.</p>}
      </nav>
    </main>
  );
}
