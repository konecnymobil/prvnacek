/** Minihry v0.6 (design/handoff/minihry-ui.md, HANDOFF 10). Generátory kol jen z naučených písmen. */
import type { Content } from '../content/load';
import type { Forms, Word } from '../content/types';
import { wordImageUrl } from '../content/images';
import { isLessonUnlocked, type LessonState } from '../storage/db';
import { shuffle } from '../activities/common';

export type GameId = 'ztratilo' | 'detektiv' | 'bublinky' | 'domecky' | 'obchod';
export interface Opt { id: string; forms?: Forms; img?: string }
export interface GameTask {
  id: string; answer: string; options: Opt[];
  /** zobrazení úlohy: slovo s mezerou, slabika v lupě, nákupní lístek, obrázek pro domeček */
  show?: Forms; gapIndex?: number; img?: string;
  prompt: string[]; hint: string[]; ok: string[];
}
export interface GameDef { id: GameId; name: string; icon: string; text: string; minLesson: (c: Content) => number | null; build: (c: Content, maxIdx: number) => GameTask[] }

export const GAME_ROUND = 6;
const BANNED = new Set(['MÍSU', 'LETÍ', 'MÁSLO', 'MELOUN', 'LEV']);
const LONG = /[ÉÍÓÚŮ]/;
const oid = (c: Content) => c.defaultOrderId;

export function maxLessonIndex(c: Content, states: Record<string, LessonState | undefined>): number {
  const ls = c.orders[oid(c)].lessons;
  return Math.max(0, ...ls.filter((l) => isLessonUnlocked(ls, l.id, states)).map((l) => l.index));
}
const knownLetters = (c: Content, idx: number) => c.orders[oid(c)].lessons.filter((l) => l.index <= idx).flatMap((l) => l.letterIds).map((id) => c.letterById.get(id)!);
const picWords = (c: Content, idx: number) => c.words.filter((w) => w.minLessonIndex[oid(c)] <= idx && wordImageUrl(w) && !BANNED.has(w.text) && !LONG.test(w.text));
const sylls = (c: Content, idx: number) => c.taskSyllables.filter((s) => s.kind === 'CV' && s.minLessonIndex[oid(c)] <= idx);
const opt4 = <T,>(answer: T, pool: T[], n = 4): T[] => shuffle([answer, ...shuffle(pool.filter((x) => x !== answer)).slice(0, n - 1)]);
const letterOpt = (l: { id: string; forms: Forms }): Opt => ({ id: l.id, forms: l.forms });

/** Domečky: slabiky s ≥ 2 obrázky (usableInMemoryGame), každé slovo jednou. */
function houseGroups(c: Content, idx: number): Map<string, Word[]> {
  const g = new Map<string, Word[]>();
  for (const w of c.words) if (w.usableInMemoryGame && wordImageUrl(w) && w.minLessonIndex[oid(c)] <= idx) g.set(w.firstSyllableId, [...(g.get(w.firstSyllableId) ?? []), w]);
  for (const [k, v] of g) if (v.length < 2) g.delete(k);
  return g;
}
const housesFor = (idx: number) => (idx >= 8 ? 4 : idx >= 7 ? 3 : 2);

export const GAMES: GameDef[] = [
  {
    id: 'ztratilo', name: 'Co se ztratilo?', icon: '🔎', text: 'Najdi chybějící písmenko.', minLesson: () => 3,
    build: (c, idx) => {
      const known = knownLetters(c, idx).filter((l) => !l.isLong || l.upper === 'Á');
      return shuffle(picWords(c, idx).filter((w) => w.text.length >= 2)).slice(0, GAME_ROUND).map((w) => {
        const gap = Math.floor(Math.random() * w.text.length);
        const ans = known.find((l) => l.upper === w.text[gap]) ?? c.letters.find((l) => l.upper === w.text[gap])!;
        return { id: w.id, answer: ans.id, options: opt4(ans, known.filter((l) => l.upper !== w.text[gap]), 3).map(letterOpt), show: w.forms, gapIndex: gap, img: wordImageUrl(w)!, prompt: ['snd-p-mh-ztratilo'], hint: [w.audioId], ok: [w.audioId] };
      });
    },
  },
  {
    id: 'detektiv', name: 'Slabikový detektiv', icon: '🕵️', text: 'Najdi slabiku z lupy.', minLesson: () => 3,
    build: (c, idx) => {
      const pool = sylls(c, idx);
      return shuffle(pool).slice(0, GAME_ROUND).map((s) => {
        const similar = pool.filter((x) => x.id !== s.id && (x.consonantLetterId === s.consonantLetterId || x.vowelLetterId === s.vowelLetterId));
        const rest = pool.filter((x) => x.id !== s.id && !similar.includes(x));
        const opts = shuffle([s, ...shuffle(similar).slice(0, 3), ...shuffle(rest)].slice(0, 4));
        return { id: s.id, answer: s.id, options: opts.map((x) => ({ id: x.id, forms: x.forms })), show: s.forms, prompt: ['snd-p-mh-detektiv'], hint: [s.audioId], ok: [s.audioId] };
      });
    },
  },
  {
    id: 'bublinky', name: 'Bublinky', icon: '🫧', text: 'Ťukni na bublinu, kterou slyšíš.', minLesson: () => 2,
    build: (c, idx) => {
      if (idx < 3) { // kolo písmen (nikdy nemíchá)
        const ls = knownLetters(c, idx);
        return Array.from({ length: GAME_ROUND }, (_, i) => { const l = ls[i % ls.length]; return { id: `${l.id}-${i}`, answer: l.id, options: opt4(l, ls).map(letterOpt), prompt: ['snd-p-mh-bublinky', l.audioId], hint: [l.audioId], ok: [l.audioId] }; });
      }
      const pool = sylls(c, idx);
      return shuffle(pool).slice(0, GAME_ROUND).map((s) => ({ id: s.id, answer: s.id, options: opt4(s, pool).map((x) => ({ id: x.id, forms: x.forms })), prompt: ['snd-p-mh-bublinky', s.audioId], hint: [s.audioId], ok: [s.audioId] }));
    },
  },
  {
    id: 'domecky', name: 'Slabikové domečky', icon: '🏠', text: 'Dej obrázek do domečku jeho první slabiky.',
    minLesson: (c) => c.orders[oid(c)].lessons.find((l) => houseGroups(c, l.index).size >= 2)?.index ?? null,
    build: (c, idx) => {
      const groups = [...houseGroups(c, idx)].sort(() => Math.random() - 0.5).slice(0, housesFor(idx));
      const houses: Opt[] = groups.map(([sid]) => ({ id: sid, forms: c.syllableById.get(sid)!.forms }));
      const cards = shuffle(groups.flatMap(([sid, ws]) => shuffle(ws).slice(0, Math.max(2, Math.ceil(6 / groups.length))).map((w) => ({ w, sid })))).slice(0, 6);
      return cards.map(({ w, sid }) => ({ id: w.id, answer: sid, options: houses, img: wordImageUrl(w)!, prompt: ['snd-p-mh-domecky'], hint: houses.map((h) => c.syllableById.get(h.id)!.audioId), ok: [w.audioId] }));
    },
  },
  {
    id: 'obchod', name: 'Slabikový obchod', icon: '🧺', text: 'Přečti lístek a dej zboží do košíku.', minLesson: () => 6,
    build: (c, idx) => {
      const ws = picWords(c, idx).filter((w) => w.usableInPictureTasks);
      return shuffle(ws).slice(0, GAME_ROUND).map((w) => ({ id: w.id, answer: w.id, options: opt4(w, ws).map((x) => ({ id: x.id, img: wordImageUrl(x)! })), show: w.forms, prompt: ['snd-p-mh-obchod'], hint: [w.audioId], ok: [w.audioId] }));
    },
  },
];
export const gameById = (id: GameId) => GAMES.find((g) => g.id === id)!;
