import policy from '../policy/data-policy.json';
import type { Screen } from '../App';

export default function DataPolicy({ go, back }: { go: (s: Screen) => void; back: Screen }) {
  return (
    <main className="screen about" data-testid="data-policy">
      <header className="topbar">
        <button className="back" onClick={() => go(back)} aria-label="Zpět">‹ Zpět</button>
        <h1>{policy.title}</h1>
      </header>
      <section className="card">
        <p className="muted" data-testid="policy-version">Verze {policy.policyVersion}, platná od {policy.effectiveDate}</p>
        <p>{policy.intro}</p>
        <h2>{policy.today.heading}</h2>
        <ul>{policy.today.items.map((i) => <li key={i}>{i}</li>)}</ul>
        <h2>Pravidla</h2>
        <ol>
          {policy.rules.map((r) => (
            <li key={r.id} data-testid={`policy-rule-${r.id}`}><strong>{r.title}.</strong> {r.text}</li>
          ))}
        </ol>
        <h2>Poznámka u zálohy</h2>
        <p data-testid="policy-backup-note">{policy.backupNote}</p>
        <p className="muted">{policy.changes}</p>
      </section>
    </main>
  );
}
