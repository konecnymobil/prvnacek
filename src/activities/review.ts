import type { Content } from '../content/load';
import type { Attempt, LessonState } from '../storage/db';
import { shuffle } from './common';

export type ReviewKind = 'letter' | 'syllable' | 'word';
export interface ReviewItem {
  kind: ReviewKind;
  id: string;            // id písmene / slabiky / slova
  lessonId: string;      // lekce, ze které položka pochází
  activity: 'A2' | 'A4' | 'A7';
  choiceIds: string[];   // cíl + 2 rozptylovače (jen probrané položky)
}

export const REVIEW_SIZE = 5;
const ACT = { letter: 'A2', syllable: 'A4', word: 'A7' } as const;

/** Počet schválených lekcí, od kterého se Opakování nabízí. */
export const REVIEW_MIN_APPROVED = 2;

/**
 * Sestaví Opakování: REVIEW_SIZE různých položek jen ze schválených lekcí (zamčené a nedokončené se nepoužijí).
 * Váha = chyba v posledních 3 pokusech ×3, nikdy neprocvičeno ×2, dávno (>1 den) ×1,5, před chvílí (<10 min) ×0,3;
 * při výběru se tlumí stejný typ (×0,3 po dvou) a stejná lekce (×0,5 za každou už vybranou), aby se mísily lekce i aktivity.
 */
export function buildReview(content: Content, states: Record<string, LessonState | undefined>, attempts: Attempt[], now = Date.now()): ReviewItem[] {
  const order = content.orders[content.defaultOrderId];
  const oid = content.defaultOrderId;
  const approved = new Set(order.lessons.filter((l) => states[l.id]?.status === 'approved').map((l) => l.id));
  if (approved.size < REVIEW_MIN_APPROVED) return [];

  const cands: { kind: ReviewKind; id: string; lessonId: string }[] = [];
  for (const l of content.letters) { const lid = l.lessonByOrder[oid]; if (approved.has(lid)) cands.push({ kind: 'letter', id: l.id, lessonId: lid }); }
  for (const s of content.taskSyllables) { const lid = s.minLessonId[oid]; if (approved.has(lid)) cands.push({ kind: 'syllable', id: s.id, lessonId: lid }); }
  for (const w of content.words) { const lid = w.minLessonId[oid]; if (w.usableInPictureTasks && approved.has(lid)) cands.push({ kind: 'word', id: w.id, lessonId: lid }); }

  const weight = (c: { id: string }) => {
    const mine = attempts.filter((a) => a.itemId === c.id).sort((a, b) => a.at - b.at);
    let w = 1;
    if (mine.length === 0) w *= 2;
    else {
      if (mine.slice(-3).some((a) => !a.correct)) w *= 3;
      const age = now - mine[mine.length - 1].at;
      if (age < 10 * 60_000) w *= 0.3; else if (age > 86_400_000) w *= 1.5;
    }
    return w;
  };

  const chosen: typeof cands = [];
  const items: ReviewItem[] = [];
  const dead = new Set<string>(); // kandidáti bez dost rozptylovačů
  const distractors = (c: { kind: ReviewKind; id: string }): string[] => {
    if (c.kind === 'letter') {
      const t = content.letterById.get(c.id)!;
      return cands.filter((x) => x.kind === 'letter' && x.id !== c.id).map((x) => x.id)
        .filter((id) => { const o = content.letterById.get(id)!; return o.baseLetterId !== t.id && t.baseLetterId !== o.id; });
    }
    if (c.kind === 'syllable') {
      const t = content.syllableById.get(c.id)!;
      return cands.filter((x) => x.kind === 'syllable' && x.id !== c.id).map((x) => x.id).filter((id) => content.syllableById.get(id)!.audioId !== t.audioId);
    }
    return cands.filter((x) => x.kind === 'word' && x.id !== c.id).map((x) => x.id);
  };
  while (items.length < REVIEW_SIZE) {
    const pool = cands.filter((c) => !chosen.some((x) => x.id === c.id) && !dead.has(c.id));
    if (!pool.length) break;
    const last2 = chosen.slice(-2);
    const ws = pool.map((c) => {
      let w = weight(c);
      if (last2.length === 2 && last2.every((x) => x.kind === c.kind)) w *= 0.3;
      w *= 0.5 ** chosen.filter((x) => x.lessonId === c.lessonId).length;
      return w;
    });
    let r = Math.random() * ws.reduce((a, b) => a + b, 0), i = 0;
    while (i < ws.length - 1 && r >= ws[i]) { r -= ws[i]; i++; }
    const c = pool[i];
    const others = distractors(c);
    if (others.length < 2) { dead.add(c.id); continue; }
    chosen.push(c);
    items.push({ ...c, activity: ACT[c.kind], choiceIds: shuffle([c.id, ...shuffle(others).slice(0, 2)]) });
  }
  return items;
}

export const itemAudio = (content: Content, it: ReviewItem): string =>
  (it.kind === 'letter' ? content.letterById.get(it.id)!.audioId : it.kind === 'syllable' ? content.syllableById.get(it.id)!.audioId : content.wordById.get(it.id)!.audioId);
export const itemForms = (content: Content, id: string, kind: ReviewKind) =>
  (kind === 'letter' ? content.letterById.get(id)! : kind === 'syllable' ? content.syllableById.get(id)! : content.wordById.get(id)!).forms;
