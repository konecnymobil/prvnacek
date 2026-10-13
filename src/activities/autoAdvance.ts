import { useCallback, useEffect, useRef } from 'react';

export const AUTO_PAUSE_MS = 500;
export const AUTO_CAP_MS = 3000;

/** Automatický posun po správné odpovědi: počká na konec pochvaly (say() promise, nejdéle AUTO_CAP_MS),
 *  krátká pauza a pak `target.current()`. Token se zvýší při ručním Dál, odchodu i unmountu → nikdy dvojitý posun. */
export function useAutoAdvance() {
  const run = useRef(0);
  const timers = useRef<number[]>([]);
  const target = useRef<() => void>(() => {});
  const cancel = useCallback(() => { run.current++; timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; }, []);
  useEffect(() => cancel, [cancel]);
  const later = (ms: number) => new Promise<void>((r) => { timers.current.push(window.setTimeout(r, ms)); });
  const schedule = useCallback((sound: Promise<unknown>) => {
    cancel();
    const r = run.current;
    void (async () => {
      await Promise.race([sound.catch(() => {}), later(AUTO_CAP_MS)]);
      if (r !== run.current) return;
      await later(AUTO_PAUSE_MS);
      if (r !== run.current) return;
      cancel();
      target.current();
    })();
  }, [cancel]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Ruční Dál: zruší čekající posun a posune hned (jednou). */
  const manual = useCallback(() => { cancel(); target.current(); }, [cancel]);
  return { schedule, cancel, manual, target };
}
