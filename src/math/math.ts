/** Matematika MVP – Matýskova matematika, 1. díl (content/predmety-plan.md kap. 1). Pokrok v DB aktivního dítěte. */
import { getSetting, setSetting } from '../storage/db';
import { drawFresh, shuffle } from '../activities/fresh';

export interface MathLesson { id: string; title: string; nums: number[]; newDigit: number }
export const MATH_LESSONS: MathLesson[] = [
  { id: 'm1', title: '1', nums: [1], newDigit: 1 },
  { id: 'm2', title: '1–2', nums: [1, 2], newDigit: 2 },
  { id: 'm3', title: '1–3', nums: [1, 2, 3], newDigit: 3 },
  { id: 'm4', title: '1–4', nums: [1, 2, 3, 4], newDigit: 4 },
  { id: 'm5', title: '1–5', nums: [1, 2, 3, 4, 5], newDigit: 5 },
  { id: 'm6', title: '0–5', nums: [0, 1, 2, 3, 4, 5], newDigit: 0 },
];
export const MATH_PROGRESS_KEY = 'math:progress';
export type MathErr = 'count-off-by-one' | 'digit-confusion';
export interface MathLessonProgress { rounds: number; correct: number; wrong: number; errors: Partial<Record<MathErr, number>>; traced: number }
export type MathProgress = Record<string, MathLessonProgress>;

export async function getMathProgress(): Promise<MathProgress> { return (await getSetting<MathProgress>(MATH_PROGRESS_KEY)) ?? {}; }
export function mathUnlocked(p: MathProgress, i: number): boolean { return i === 0 || (p[MATH_LESSONS[i - 1].id]?.rounds ?? 0) > 0; }
export function classifyError(answer: number, chosen: number): MathErr { return Math.abs(answer - chosen) === 1 ? 'count-off-by-one' : 'digit-confusion'; }

export async function saveRound(lessonId: string, r: { correct: number; wrong: number; errors: Partial<Record<MathErr, number>>; traced: number }): Promise<void> {
  const p = await getMathProgress();
  const o = p[lessonId] ?? { rounds: 0, correct: 0, wrong: 0, errors: {}, traced: 0 };
  const errors = { ...o.errors };
  for (const [k, v] of Object.entries(r.errors)) errors[k as MathErr] = (errors[k as MathErr] ?? 0) + (v ?? 0);
  p[lessonId] = { rounds: o.rounds + 1, correct: o.correct + r.correct, wrong: o.wrong + r.wrong, errors, traced: o.traced + r.traced };
  await setSetting(MATH_PROGRESS_KEY, p);
}

export type MathTask =
  | { kind: 'count'; n: number; item: string; options: number[] }
  | { kind: 'find'; n: number; options: number[] }
  | { kind: 'compare'; a: number; b: number; item: string }
  | { kind: 'trace'; digit: number };

const ITEMS = ['🍎', '🐞', '⭐', '🎈', '🐟', '🌼', '🚗', '🧸'];
const rnd = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
function options(nums: number[], n: number): number[] {
  const pool = [...new Set([...nums, n - 1, n + 1].filter((x) => x >= 0 && x <= 5))];
  const others = shuffle(pool.filter((x) => x !== n)).slice(0, 3);
  return [n, ...others].sort((a, b) => a - b);
}

/** Kolo: 5 úloh s automatickou kontrolou + obtažení nové číslice na konci. */
export function buildRound(l: MathLesson): MathTask[] {
  const kinds: MathTask['kind'][] = l.nums.length > 1 ? ['count', 'find', 'compare', 'count', 'find'] : ['count', 'find', 'count', 'find', 'count'];
  const per = (k: string) => kinds.filter((x) => x === k).length;
  const pairs = l.nums.flatMap((a) => l.nums.map((b) => [a, b] as const));
  const tasks: MathTask[] = kinds.map((k) => {
    // stejná otázka (druh + číslo) se v kole ani hned v dalším kole neopakuje (zásoba je malá, hlídá se podle její velikosti)
    if (k === 'compare') { const [a, b] = drawFresh(`math:${l.id}:compare`, pairs, (p) => p.join('-'), per(k)); return { kind: 'compare', a, b, item: rnd(ITEMS) }; }
    const n = drawFresh(`math:${l.id}:${k}`, l.nums.filter((x) => k !== 'count' || x > 0), String, per(k));
    return k === 'count' ? { kind: 'count', n, item: rnd(ITEMS), options: options(l.nums, n) } : { kind: 'find', n, options: options(l.nums, n) };
  });
  return [...tasks, { kind: 'trace', digit: l.newDigit }];
}
