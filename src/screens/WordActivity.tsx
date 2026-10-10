import type { Content } from '../content/load';
import type { Lesson, Word } from '../content/types';
import { wordImageUrl } from '../content/images';
import { learnedLetters } from '../activities/common';

/** Slova s obrázkem složená jen z probraných písmen. */
export function lessonPictureWords(content: Content, lesson: Lesson): Word[] {
  const known = new Set(learnedLetters(content, lesson).map((l) => l.id));
  return content.words.filter((w) => w.usableInPictureTasks && wordImageUrl(w) && w.letterIds.every((id) => known.has(id)));
}

