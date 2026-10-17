/** s) Výběr předmětu na dvě klepnutí: 1. = výběr (karta se zvedne, objeví se ➜), 2. = vstup. */
import { useState } from 'react';

export type SubjectKey = 'cz-reading' | 'math';
const SUBJECTS: { id: SubjectKey; name: string; icon: string; cls: string }[] = [
  { id: 'cz-reading', name: 'Čtení', icon: '📖', cls: 'subj--cti' },
  { id: 'math', name: 'Matematika', icon: '🔢', cls: 'subj--mat' },
];

export default function SubjectPicker({ current, onEnter }: { current: SubjectKey; onEnter: (s: SubjectKey) => void }) {
  const [sel, setSel] = useState<SubjectKey | null>(null);
  return (
    <section className="subject-picker" data-testid="subject-picker" aria-label="Kam půjdeme dnes?">
      {SUBJECTS.map((s) => (
        <button key={s.id} className={`subj-card ${s.cls}${sel === s.id ? ' is-selected' : ''}${current === s.id ? ' is-current' : ''}`} data-subject={s.id}
          aria-pressed={sel === s.id} aria-label={sel === s.id ? `${s.name} – klepni znovu a jdeme` : s.name}
          onClick={() => (sel === s.id ? (setSel(null), onEnter(s.id)) : setSel(s.id))}>
          <span className="subj-icon">{s.icon}</span><span className="subj-name">{s.name}</span>
          {sel === s.id && <span className="subj-go" aria-hidden>➜</span>}
        </button>
      ))}
    </section>
  );
}
