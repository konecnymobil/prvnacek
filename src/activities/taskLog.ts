/** M4: záznam průběhu úloh pro týdenní souhrn (doba odpovědi, nečinnost, předčasné ukončení). */
import { useEffect, useRef } from 'react';
import { addEvent } from '../storage/db';
import { IDLE_MS } from '../summary/weekly';

let lastMark = 0; // čas zobrazení úlohy nebo poslední odpovědi
let current: { activity: string; lessonId?: string; graded: number } | null = null;
let round = 0; // id kola (pro „první pokus o položku v kole“)
const newRound = () => { round = Date.now() * 1000 + (round % 1000) + 1; };

/** Zavolat při každé hodnocené odpovědi; vrátí dobu odpovědi a kolo, při nečinnosti > 60 s zapíše signál únavy. */
export function noteAnswer(now = Date.now()): { responseMs: number | null; round: number | null } {
  const ms = lastMark ? now - lastMark : null;
  lastMark = now;
  if (current) current.graded++;
  if (ms !== null && ms > IDLE_MS && current) void addEvent({ kind: 'idle', activity: current.activity, lessonId: current.lessonId, data: { ms } }).catch(() => {});
  return { responseMs: ms, round: current ? round : null };
}

/** Hook do obrazovky aktivity: začátek, dokončení kola a předčasné ukončení (odchod s ≥ 1 odpovědí bez dokončení). */
export function useTaskLog(activity: string, lessonId: string | undefined, done: boolean) {
  const doneRef = useRef(done);
  doneRef.current = done;
  useEffect(() => {
    current = { activity, lessonId, graded: 0 };
    newRound();
    lastMark = Date.now();
    void addEvent({ kind: 'taskStart', activity, lessonId }).catch(() => {});
    return () => {
      const c = current;
      if (c && !doneRef.current && c.graded > 0) void addEvent({ kind: 'earlyExit', activity, lessonId, data: { graded: c.graded } }).catch(() => {});
      current = null;
      lastMark = 0;
    };
  }, [activity, lessonId]);
  useEffect(() => {
    if (!done) { lastMark = Date.now(); newRound(); if (current) current.graded = 0; return; }
    void addEvent({ kind: 'taskEnd', activity, lessonId }).catch(() => {});
  }, [done, activity, lessonId]);
}
