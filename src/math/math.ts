/** Matematika MVP – Matýskova matematika, 1. díl (content/predmety-plan.md kap. 1). Pokrok v DB aktivního dítěte. */
import { getSetting, setSetting } from '../storage/db';
import { drawFresh, shuffle } from '../activities/fresh';

export type MathKind = 'where' | 'count' | 'find' | 'find-group' | 'more' | 'same' | 'trace';
export type WherePos = 'top' | 'bottom' | 'middle' | 'left' | 'right';
export interface MathOptionRule { digitOptionsFrom: 'learned'; maxDigitOptions: number; groupSizesMax: number; answerPositionBalanced: boolean; text?: string }
/** Lekce z content/math/lessons.json (A-06, A-08, A-31). */
export interface MathLesson {
  id: string; index: number; title: string; nums: number[]; newDigit: number | null;
  tasks: { kinds: MathKind[]; promptIds: Partial<Record<string, string>>; positionsFirstRound?: WherePos[]; positionsLater?: WherePos[]; note?: string };
  optionRule: MathOptionRule | null;
}
export interface MathUnlockRule { minRounds: number; minFirstTryRatio: number; minDistinctDays: number; orParentTest: boolean; orParentManual: boolean; m0?: { minRounds: number } }
export interface MathLessonsFile {
  lessons: MathLesson[]; unlockRule: MathUnlockRule;
  parentTest: { itemCount: number; passScore: number; items: { type: 'showDigit' | 'buildSet'; count: number; text: string }[]; note: string };
  rangeByLesson: Record<string, number>;
}
export const MATH_PROGRESS_KEY = 'math:progress';
export type MathErr = 'count-off-by-one' | 'digit-confusion' | 'compare-wrong' | 'position-wrong';
export interface MathLessonProgress {
  rounds: number; correct: number; wrong: number; errors: Partial<Record<MathErr, number>>; traced: number;
  /** A-08: kola s ≥ minFirstTryRatio napoprvé a dny, kdy byla. Chybí = starší data (lekce se odemkla už po 1 kole). */
  goodRounds?: number; goodDays?: string[];
  /** A-08: lekci odemkl rodič ručně, nebo dítě prošlo zkouškou s rodičem (platí pro další lekci). */
  manual?: boolean; testPassed?: boolean;
}
export type MathProgress = Record<string, MathLessonProgress>;

export async function getMathProgress(): Promise<MathProgress> { return (await getSetting<MathProgress>(MATH_PROGRESS_KEY)) ?? {}; }
export const isGoodRound = (r: { correct: number }, rated: number, rule: Pick<MathUnlockRule, 'minFirstTryRatio'>) => rated > 0 && r.correct / rated >= rule.minFirstTryRatio;
/** A-08: lekce i je otevřená, když: je první; rodič ji odemkl; předchozí má zkoušku s rodičem; předchozí má
 *  minRounds dobrých kol v minDistinctDays dnech (m0 → m1 stačí 1 dokončené kolo); nebo už v ní či dál dítě hrálo (starší data). */
export function mathUnlocked(f: Pick<MathLessonsFile, 'lessons' | 'unlockRule'>, p: MathProgress, i: number): boolean {
  if (i <= 0) return true;
  const L = f.lessons, rule = f.unlockRule;
  if (p[L[i].id]?.manual) return true;
  if (L.slice(i).some((l) => (p[l.id]?.rounds ?? 0) > 0)) return true;
  const prev = p[L[i - 1].id];
  if (!prev) return false;
  if (rule.orParentTest && prev.testPassed) return true;
  if (L[i - 1].id === 'm0') return prev.rounds >= (rule.m0?.minRounds ?? 1);
  if (prev.goodDays === undefined) return prev.rounds > 0;
  return (prev.goodRounds ?? 0) >= rule.minRounds && new Set(prev.goodDays).size >= rule.minDistinctDays;
}
/** Úroveň pro minihry = počet otevřených číselných lekcí (m1–m6), jako dřív. */
export const mathLevel = (f: Pick<MathLessonsFile, 'lessons' | 'unlockRule'>, p: MathProgress) => f.lessons.filter((l, i) => l.nums.length > 0 && mathUnlocked(f, p, i)).length;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Rodič: ruční odemčení nebo výsledek zkoušky (A-08). */
export async function setMathLessonFlag(lessonId: string, flag: 'manual' | 'testPassed'): Promise<void> {
  const p = await getMathProgress();
  p[lessonId] = { ...(p[lessonId] ?? { rounds: 0, correct: 0, wrong: 0, errors: {}, traced: 0 }), [flag]: true };
  await setSetting(MATH_PROGRESS_KEY, p);
}
export function classifyError(answer: number, chosen: number): MathErr { return Math.abs(answer - chosen) === 1 ? 'count-off-by-one' : 'digit-confusion'; }

/** A-15: dokončená lekce matematiky jde i do games:rounds (gameId math-lesson) pro týdenní souhrn. */
export const ROUNDS_LOG_KEY = 'games:rounds';
export async function saveRound(lessonId: string, r: { correct: number; wrong: number; errors: Partial<Record<MathErr, number>>; traced: number }, rated: number, rule: Pick<MathUnlockRule, 'minFirstTryRatio'>, startedAt?: string): Promise<void> {
  const log = (await getSetting<unknown[]>(ROUNDS_LOG_KEY)) ?? [];
  await setSetting(ROUNDS_LOG_KEY, [...log, { gameId: 'math-lesson', subjectId: 'math', lessonId, startedAt: startedAt ?? new Date().toISOString(), finishedAt: new Date().toISOString(), rated, firstTry: Math.min(r.correct, rated), stickerId: null }]);
  const p = await getMathProgress();
  const o = p[lessonId] ?? { rounds: 0, correct: 0, wrong: 0, errors: {}, traced: 0 };
  const errors = { ...o.errors };
  for (const [k, v] of Object.entries(r.errors)) errors[k as MathErr] = (errors[k as MathErr] ?? 0) + (v ?? 0);
  const good = isGoodRound(r, rated, rule);
  p[lessonId] = { ...o, goodRounds: (o.goodRounds ?? 0) + (good ? 1 : 0), goodDays: [...new Set([...(o.goodDays ?? []), ...(good ? [today()] : [])])],
    rounds: o.rounds + 1, correct: o.correct + r.correct, wrong: o.wrong + r.wrong, errors, traced: o.traced + r.traced };
  await setSetting(MATH_PROGRESS_KEY, p);
}

export type MathTask =
  | { kind: 'where'; pos: WherePos; cells: (string | null)[]; target: number; prompt: string }
  | { kind: 'count'; n: number; item: string; options: number[] }
  | { kind: 'find'; n: number; options: number[] }
  | { kind: 'find-group'; n: number; item: string; options: number[] }
  | { kind: 'more'; a: number; b: number; item: string }
  | { kind: 'same'; n: number; item: string; options: number[] }
  | { kind: 'trace'; digit: number };

export const ITEMS = ['🍎', '🐞', '⭐', '🎈', '🐟', '🌼', '🚗', '🧸'];
const rnd = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const range = (lo: number, hi: number) => Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
function combos<T>(a: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  return a.flatMap((x, i) => combos(a.slice(i + 1), k - 1).map((c) => [x, ...c]));
}
/** A-06: k možností (seřazených) z pool včetně n; pozice odpovědi se volí rovnoměrně mezi možnými. */
export function balancedOptions(pool: readonly number[], n: number, k: number): number[] {
  const others = [...new Set(pool)].filter((x) => x !== n);
  const kk = Math.min(k, others.length + 1);
  const byPos = new Map<number, number[][]>();
  for (const c of combos(others, kk - 1)) { const o = [...c, n].sort((a, b) => a - b); const pos = o.indexOf(n); byPos.set(pos, [...(byPos.get(pos) ?? []), o]); }
  return rnd(byPos.get(rnd([...byPos.keys()]))!);
}
/** Oblast pozice v mřížce 3×3 (design x-m0-kde.html): cíl je v oblasti, ostatní obrázky mimo ni. */
export const POS_ZONE: Record<WherePos, number[]> = { top: [0, 1, 2], bottom: [6, 7, 8], middle: [4], left: [0, 3, 6], right: [2, 5, 8] };

/** Kolo podle math/lessons.json: tasks.kinds v pořadí lekce; čísla se nevrací víc než 2× za sebou (drawFresh). */
export function buildRound(l: MathLesson, opts: { firstRound?: boolean } = {}): MathTask[] {
  const kinds = l.tasks.kinds;
  const per = (k: string) => Math.max(1, kinds.filter((x) => x === k).length);
  const rule = l.optionRule ?? { digitOptionsFrom: 'learned', maxDigitOptions: 3, groupSizesMax: 3, answerPositionBalanced: true };
  const digits = l.nums;
  const counts = digits.filter((x) => x > 0);
  const groupMax = Math.max(rule.groupSizesMax, 1);
  return kinds.map((k): MathTask => {
    if (k === 'where') {
      const positions = (opts.firstRound ? l.tasks.positionsFirstRound : l.tasks.positionsLater) ?? ['top', 'bottom', 'middle'];
      const pos = drawFresh(`math:${l.id}:where`, positions, String, per(k));
      const target = rnd(POS_ZONE[pos]);
      const free = shuffle(range(0, 8).filter((c) => !POS_ZONE[pos].includes(c))).slice(0, 2 + Math.floor(Math.random() * 2));
      const pics = shuffle(ITEMS);
      const cells: (string | null)[] = Array(9).fill(null);
      cells[target] = pics[0]; free.forEach((c, i) => { cells[c] = pics[i + 1]; });
      return { kind: 'where', pos, cells, target, prompt: l.tasks.promptIds[pos] ?? `snd-m-p-where-${pos}` };
    }
    if (k === 'trace') return { kind: 'trace', digit: l.newDigit ?? 0 };
    if (k === 'more') {
      const pairs = range(1, groupMax).flatMap((a) => range(1, groupMax).filter((b) => b !== a).map((b) => [a, b] as const)); // A-03: jen různé počty
      const [a, b] = drawFresh(`math:${l.id}:more`, pairs, (p) => p.join('-'), per(k));
      return { kind: 'more', a, b, item: rnd(ITEMS) };
    }
    if (k === 'same') {
      const n = drawFresh(`math:${l.id}:same`, range(1, groupMax), String, per(k));
      return { kind: 'same', n, item: rnd(ITEMS), options: shuffle([n, ...shuffle(range(1, groupMax).filter((x) => x !== n)).slice(0, 2)]) };
    }
    if (k === 'find-group') {
      const n = drawFresh(`math:${l.id}:find-group`, counts, String, per(k));
      return { kind: 'find-group', n, item: rnd(ITEMS), options: balancedOptions(range(1, groupMax + 1), n, 3) };
    }
    const n = drawFresh(`math:${l.id}:${k}`, k === 'count' ? counts : digits, String, per(k));
    // count: možnosti = číslice jen z probraných; find: skupiny puntíků (o 1 víc jen jako rozptylovač)
    return k === 'count' ? { kind: 'count', n, item: rnd(ITEMS), options: balancedOptions(digits, n, rule.maxDigitOptions) }
      : { kind: 'find', n, options: balancedOptions(range(0, groupMax).filter((x) => x > 0 || digits.includes(0)), n, 3) };
  });
}
