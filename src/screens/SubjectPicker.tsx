/** s) Výběr předmětu na dvě klepnutí: 1. = výběr (karta se zvedne, objeví se ➜), 2. = vstup. */
import { useEffect, useState } from 'react';
import { say } from '../activities/common';

export type SubjectKey = 'cz-reading' | 'math' | 'world' | 'english';
const SUBJECT_AUDIO: Record<SubjectKey, string> = { 'cz-reading': 'snd-subject-cti', math: 'snd-subject-mat', world: 'snd-subject-prv', english: 'snd-subject-aj' };
const SUBJECTS: { id: SubjectKey; name: string; icon: string; cls: string }[] = [
  { id: 'cz-reading', name: 'Čtení', icon: '📖', cls: 'subj--cti' },
  { id: 'math', name: 'Matematika', icon: '🔢', cls: 'subj--mat' },
  { id: 'world', name: 'Prvouka', icon: '🌳', cls: 'subj--prv' },
  { id: 'english', name: 'Angličtina', icon: '🐶', cls: 'subj--aj' },
];

export default function SubjectPicker({ current, onEnter }: { current: SubjectKey; onEnter: (s: SubjectKey) => void }) {
  const [sel, setSel] = useState<SubjectKey | null>(null);
  useEffect(() => { const h = window.setTimeout(() => void say(['snd-p-subject-pick']), 1000); return () => window.clearTimeout(h); }, []);
  return (
    <section className="subject-picker" data-testid="subject-picker" aria-label="Kam půjdeme dnes?">
      {SUBJECTS.map((s) => (
        <button key={s.id} className={`subj-card ${s.cls}${sel === s.id ? ' is-selected' : ''}${current === s.id ? ' is-current' : ''}`} data-subject={s.id}
          aria-pressed={sel === s.id} aria-label={sel === s.id ? `${s.name} – klepni znovu a jdeme` : s.name}
          onClick={() => { if (sel === s.id) { setSel(null); onEnter(s.id); } else { setSel(s.id); void say([SUBJECT_AUDIO[s.id]]); } }}>
          <span className="subj-icon">{s.icon}</span><span className="subj-name">{s.name}</span>
          {sel === s.id && <span className="subj-go" aria-hidden>➜</span>}
        </button>
      ))}
    </section>
  );
}
