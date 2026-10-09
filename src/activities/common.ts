import type { Content } from '../content/load';
import type { Lesson, Letter } from '../content/types';
import { playAudio, stopAudio } from '../audio/player';
import { addAttempt, getAllAttempts, getAttempts, getLessonState, getTestResults, setLessonStatus } from '../storage/db';
import { useEffect, useState } from 'react';
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
  activity: 'A2' | 'A4' | 'A5' | 'A6',
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

/** Co se ve zkoušce lekce nepovedlo a dítě to od té doby ještě nezvládlo správně: id písmen, slabik a slov. */
export async function getPriorityIds(content: Content, lesson: Lesson): Promise<Set<string>> {
  const orderId = content.defaultOrderId;
  const last = (await getTestResults(orderId, lesson.id)).at(-1);
  const out = new Set<string>();
  if (!last || last.errors.length === 0) return out;
  const upper = new Map([...content.letterById.values()].map((l) => [l.upper, l.id]));
  const syl = new Map(content.syllables.map((s) => [s.text, s.id]));
  const wrd = new Map(content.words.map((w) => [w.text, w.id]));
  const lessonLetters = new Set(lesson.letterIds);
  for (const e of last.errors) {
    if (e.refId) { out.add(e.refId); continue; }
    if (e.type === 'letterRow' || e.type === 'letterFind') {
      // řádek písmen: vracíme nová písmena lekce, která v řádku byla
      for (const t of e.text.split(' ')) { const id = upper.get(t); if (id && lessonLetters.has(id)) out.add(id); }
    } else {
      const id = wrd.get(e.text) ?? syl.get(e.text) ?? upper.get(e.text);
      if (id) out.add(id);
    }
  }
  const later = (await getAllAttempts()).filter((a) => a.at > last.at && a.correct);
  for (const a of later) out.delete(a.itemId);
  return out;
}

export function usePriorityIds(content: Content, lesson: Lesson): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let alive = true;
    getPriorityIds(content, lesson).then((s) => alive && setIds(s), () => alive && setIds(new Set()));
    return () => { alive = false; };
  }, [content, lesson]);
  return ids;
}

/** Výběr s přednostmi: položky z chybné zkoušky mají trojnásobnou váhu; v první úloze kola se zařadí vždy, jsou-li k dispozici. */
export function pickPriority<T extends { id: string }>(list: readonly T[], priority: Set<string>, first: boolean): T {
  const pri = list.filter((x) => priority.has(x.id));
  if (pri.length && first) return pick(pri);
  return pick([...list, ...pri, ...pri]);
}
