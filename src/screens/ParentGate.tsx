import { useEffect, useMemo, useRef, useState } from 'react';
import type { Screen } from '../App';

const HOLD_MS = 3000;

/** Rodičovská brána: podržet tlačítko 3 s a pak sečíst dvě čísla. Žádná změna URL. */
export default function ParentGate({ go, onPass }: { go: (s: Screen) => void; onPass: () => void }) {
  const [step, setStep] = useState<'hold' | 'sum'>('hold');
  const [holding, setHolding] = useState(false);
  const [wrong, setWrong] = useState(false);
  const timer = useRef<number | null>(null);
  const q = useMemo(() => {
    const a = 3 + Math.floor(Math.random() * 7);
    const b = 3 + Math.floor(Math.random() * 7);
    const set = new Set([a + b]);
    while (set.size < 3) set.add(a + b + (Math.floor(Math.random() * 7) - 3) || a + b + 4);
    return { a, b, options: [...set].sort(() => Math.random() - 0.5) };
  }, []);

  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => cancel, []);
  const start = () => {
    if (timer.current) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      setStep('sum');
    }, HOLD_MS);
  };

  return (
    <main className="screen gate" data-testid="parent-gate">
      <header className="topbar">
        <button className="back" onClick={() => go('home')}>‹ Zpět</button>
        <h1>Pro rodiče</h1>
      </header>
      {step === 'hold' ? (
        <section className="card">
          <p>Tato část je jen pro dospělé. Podrž tlačítko 3 sekundy.</p>
          <button
            className={`kbtn kbtn-primary kbtn-xl gate-hold${holding ? ' is-holding' : ''}`}
            data-testid="gate-hold"
            onPointerDown={start}
            onPointerUp={cancel}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            onContextMenu={(e) => e.preventDefault()}
          >
            {holding ? 'Držím… ještě chvíli' : '🔒 Podrž 3 sekundy'}
          </button>
        </section>
      ) : (
        <section className="card" data-testid="gate-sum">
          <p>Kolik je <strong data-testid="gate-question">{q.a} + {q.b}</strong>?</p>
          <div className="row">
            {q.options.map((o) => (
              <button
                key={o}
                className="kbtn kbtn-xl"
                data-testid="gate-answer"
                onClick={() => (o === q.a + q.b ? onPass() : setWrong(true))}
              >
                {o}
              </button>
            ))}
          </div>
          {wrong && <p className="notice is-error" role="alert" data-testid="gate-wrong">Zkus to ještě jednou.</p>}
        </section>
      )}
    </main>
  );
}
