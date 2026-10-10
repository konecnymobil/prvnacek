import type { Content } from '../content/load';
import type { Lesson, Word } from '../content/types';
import { learnedLetters, shuffle } from './common';
import { buildWordQueue, MAX_WORD_ROUND } from './wordQueue';

/** Slova pro „Slož slovo“: s obrázkem, 2+ slabiky, obtížnost 1 (jen otevřené slabiky), z probraných písmen. */
export function composeWords(content: Content, lesson: Lesson): Word[] {
  // Obrázek není povinný (ALE, MELE v lekci E ho nemají); chybějící obrázek se po složení jen nezobrazí.
  const known = new Set(learnedLetters(content, lesson).map((l) => l.id));
  return content.words.filter(
    (w) => w.usableInComposeTask && w.letterIds.every((id) => known.has(id)) && w.difficulty === 1 && w.syllableCount >= 2 && w.syllableIds.every((id) => content.syllableById.has(id)),
  );
}

/** Rozptylovače: probrané otevřené slabiky (usableInSyllableTasks), které nejsou ve slově
 *  a nevytvoří jiné platné slovo, když nahradí kteroukoli slabiku. Z obsahu (distractorSyllableIds), je-li. */
export function distractorsFor(content: Content, lesson: Lesson, word: Word, count: number): string[] {
  if (count <= 0) return [];
  const provided = word.distractorSyllableIds.filter((id) => content.syllableById.has(id));
  if (provided.length >= count) return shuffle(provided).slice(0, count);
  const known = new Set<string>();
  const order = content.orders[content.defaultOrderId];
  for (const l of order.lessons) if (l.index <= lesson.index) l.letterIds.forEach((id) => known.add(id));
  const texts = new Set(content.words.map((w) => w.text));
  const wordSyl = new Set(word.syllableIds);
  const okAll = content.syllables.filter((s) => s.usableInSyllableTasks && !wordSyl.has(s.id) && s.letterIds.every((id) => known.has(id)));
  const ok = okAll.filter((s) => !word.syllablesText.some((_, i) => {
    const t = word.syllablesText.map((x, j) => (j === i ? s.text : x)).join('');
    return texts.has(t);
  }));
  // nejdřív podobné (stejná souhláska nebo samohláska jako některá slabika slova)
  const sim = (s: (typeof ok)[number]) => word.syllableIds.some((id) => { const w = content.syllableById.get(id)!; return w.consonantLetterId === s.consonantLetterId || w.vowelLetterId === s.vowelLetterId; });
  const pool = [...shuffle(ok.filter(sim)), ...shuffle(ok.filter((s) => !sim(s)))];
  const extra = pool.map((s) => s.id).filter((id) => !provided.includes(id));
  return [...shuffle(provided), ...extra].slice(0, count);
}

/** Počet rozptylovačů: první dvě úlohy kola bez nich, pak 1 (2 slabiky) nebo 2 (3+ slabiky). */
export function distractorCount(word: Word, taskIndex: number): number {
  if (taskIndex < 2) return 0;
  return word.syllableCount >= 3 ? 2 : 1;
}

/** Kolo Slož slovo: běžná fronta + aspoň jedno nové slovo lekce (composeNewWordIds), je-li dostupné. */
export function composeQueue(all: Word[], lesson: Lesson, priority: Set<string>): Word[] {
  const q = buildWordQueue(all, lesson, priority);
  const news = new Set(lesson.composeNewWordIds ?? []);
  if (q.some((w) => news.has(w.id))) return q;
  const add = shuffle(all.filter((w) => news.has(w.id)))[0];
  if (!add) return q;
  const out = q.slice();
  if (out.length >= MAX_WORD_ROUND) out.splice(Math.floor(Math.random() * out.length), 1);
  out.splice(Math.floor(Math.random() * (out.length + 1)), 0, add);
  return out;
}
