import type { Content } from '../content/load';
import type { Word } from '../content/types';
import { isLessonUnlocked, type LessonState } from '../storage/db';
import { shuffle } from './common';

export const PEX_LEVELS = [3, 6] as const; // počet dvojic (6 / 12 karet)
export const PEX_KEY = 'pexeso:games';
export interface PexGame { at: number; pairs: number; stars: number; flips: number }

/** Slova použitelná v pexesu z otevřených lekcí (včetně právě probírané). */
export function pexesoCandidates(content: Content, states: Record<string, LessonState | undefined>): Word[] {
  const oid = content.defaultOrderId;
  const lessons = content.orders[oid].lessons;
  const maxIdx = Math.max(0, ...lessons.filter((l) => isLessonUnlocked(lessons, l.id, states)).map((l) => l.index));
  return content.words.filter((w) => w.usableInMemoryGame && w.imageId && w.minLessonIndex[oid] <= maxIdx);
}

/** Počet dvojic s navzájem různou první slabikou. */
export function availablePairs(content: Content, states: Record<string, LessonState | undefined>): number {
  return new Set(pexesoCandidates(content, states).map((w) => w.firstSyllableId)).size;
}
export const levelsFor = (n: number): number[] => PEX_LEVELS.filter((l) => n >= l);

/** Vybere `pairs` slov s různými prvními slabikami (z konfliktních vždy jediné, náhodně). */
export function pickPairs(cands: Word[], pairs: number): Word[] {
  const seen = new Set<string>();
  const out: Word[] = [];
  for (const w of shuffle(cands)) {
    if (seen.has(w.firstSyllableId)) continue;
    seen.add(w.firstSyllableId);
    out.push(w);
    if (out.length === pairs) break;
  }
  return out;
}

export interface PexCard { key: string; wordId: string; face: 'picture' | 'syllable' }
export const buildCards = (words: Word[]): PexCard[] =>
  shuffle(words.flatMap((w): PexCard[] => [{ key: `${w.id}:p`, wordId: w.id, face: 'picture' }, { key: `${w.id}:s`, wordId: w.id, face: 'syllable' }]));

/** Hvězdičky podle počtu párů (3 páry: 3 hvězdy; 6 párů: 3 hvězdy). Bez trestů, nezávisí na chybách. */
export const starsFor = (pairs: number): number => (pairs >= 6 ? 3 : pairs >= 3 ? 2 : 1);
