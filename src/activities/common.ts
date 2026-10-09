import type { Content } from '../content/load';
import type { Lesson, Letter } from '../content/types';
import { playAudio, stopAudio } from '../audio/player';
import { addAttempt, getAttempts, getLessonState, setLessonStatus } from '../storage/db';
import radost from '../assets/mascot/kulisek-radost.svg';
import povzbuzeni from '../assets/mascot/kulisek-povzbuzeni.svg';
import premysli from '../assets/mascot/kulisek-premysli.svg';

export const MASCOT = { radost, povzbuzeni, premysli };
export const ROUND_SIZE = 6;

export function shuffle<T>(a: readonly T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

/** Písmena probraná do dané lekce včetně (dle pořadí aplikace). */
export function learnedLetters(content: Content, lesson: Lesson): Letter[] {
  const order = content.orders[content.defaultOrderId];
  const ids = order.lessons.filter((l) => l.index <= lesson.index).flatMap((l) => l.letterIds);
  return ids.map((id) => content.letterById.get(id)!);
}

let sayRun = 0;
/** Přehraje zvuky za sebou (pokyn, hláska…). Chyby zvuku se tiše ignorují, nové volání předchozí přeruší. */
export async function say(audioIds: string[]): Promise<void> {
  const run = ++sayRun;
  for (const id of audioIds) {
    if (run !== sayRun) return;
    try {
      await playAudio(id);
      if (run !== sayRun) return;
    } catch {
      /* zvuk nikdy neblokuje hru */
    }
  }
}

/** Okamžitě utne zvuk a zruší rozehranou sekvenci (přechod na další úlohu, odchod z obrazovky). */
export function stopSay(): void {
  sayRun++;
  stopAudio();
}

export function promptAudio(content: Content, id: string): string[] {
  const p = content.promptById.get(id);
  return p ? [p.audioId] : [];
}

export function randomPrompt(content: Content, prefix: string): string[] {
  const list = [...content.promptById.values()].filter((p) => p.id.startsWith(prefix));
  return list.length ? [pick(list).audioId] : [];
}

/** Zapíše pokus a aktualizuje stav lekce (procvičuje → doporučeno ke zkoušce; schváleno se nesnižuje). */
export async function recordAttempt(
  content: Content,
  lesson: Lesson,
  activity: 'A2' | 'A4',
  itemId: string,
  chosenId: string | null,
  correct: boolean,
): Promise<void> {
  const orderId = content.defaultOrderId;
  await addAttempt({ orderId, lessonId: lesson.id, activity, itemId, correct, chosenId });
  const state = await getLessonState(orderId, lesson.id);
  if (state?.status === 'approved') return;
  const all = await getAttempts(orderId, lesson.id);
  const last = all.slice(-10);
  const okTotal = all.filter((a) => a.correct).length;
  const okLast = last.filter((a) => a.correct).length;
  const status = okTotal >= 10 && okLast / last.length >= 0.8 ? 'recommended' : 'practicing';
  if (state?.status !== status) await setLessonStatus(orderId, lesson.id, status);
}
