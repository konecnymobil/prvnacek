import type { Lesson, Word } from '../content/types';
import { freshOrder, shuffle } from './fresh';

export const MAX_WORD_ROUND = 12;

/** Kolo procvičování slov: každé dostupné slovo nejvýš jednou (max. MAX_WORD_ROUND).
 *  Nejdřív slova ze zkoušky (priorita) a s novým písmenem lekce, zbytek náhodně; pak se pořadí zamíchá po skupinách. */
export function buildWordQueue(all: Word[], lesson: Lesson, priority: Set<string>, kind = 'A5'): Word[] {
  const pri = all.filter((w) => priority.has(w.id));
  const fresh = all.filter((w) => !priority.has(w.id) && w.letterIds.some((id) => lesson.letterIds.includes(id)));
  const rest = all.filter((w) => !pri.includes(w) && !fresh.includes(w));
  // slova s obtížností 2 (zavřená slabika) až na konec kola
  const hard = (w: Word) => w.difficulty === 2;
  const ordered = [...shuffle(pri), ...shuffle(fresh), ...shuffle(rest)].slice(0, MAX_WORD_ROUND);
  // naposledy viděná slova až na konec skupiny, ať se na hranici kol neopakují
  const key = `${kind}:${lesson.id}`;
  const easy = freshOrder(key, shuffle(ordered.filter((w) => !hard(w))), (w) => w.id);
  return [...easy, ...freshOrder(key, shuffle(ordered.filter(hard)), (w) => w.id)];
}

export function pickChoices(all: Word[], target: Word, count = 3): Word[] {
  // rozptylovače stejné obtížnosti, ať zavřená slabika neprozradí odpověď
  const same = all.filter((w) => w.id !== target.id && w.difficulty === target.difficulty);
  const pool = same.length >= count - 1 ? same : all.filter((w) => w.id !== target.id);
  return shuffle([target, ...shuffle(pool).slice(0, count - 1)]);
}
