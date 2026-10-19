/**
 * Opakování úloh: všechny generátory kol běží přes společný src/activities/fresh.ts.
 * Test v Node (bez prohlížeče) nahraje moduly aplikace přes Vite a odehraje mnoho kol:
 * v kole se úloha neopakuje (když zásoba stačí) a mezi koly nezačne tím, čím předchozí skončilo.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

test.describe.configure({ mode: 'serial' });
let vite: ViteDevServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (m: string): Promise<any> => vite.ssrLoadModule(m);
test.beforeAll(async () => {
  vite = await createServer({ configFile: false, base: '/prvnacek/', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' }, appType: 'custom', logLevel: 'error' });
  const orig = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL) => {
    const p = String(u).replace(/^\/prvnacek\//, '');
    if (!p.startsWith('content/')) return orig(u);
    return new Response(fs.readFileSync(path.resolve('public', p)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
});
test.afterAll(async () => { await vite?.close(); });

/** Projde kola a vrátí popis porušení. */
function check(name: string, rounds: string[][], roundSize: number): string[] {
  const bad: string[] = [];
  const pool = new Set(rounds.flat()).size;
  rounds.forEach((r, k) => {
    if (pool > roundSize + 1 && new Set(r).size !== r.length) bad.push(`${name}: kolo ${k} opakuje ${r.join(',')}`);
    for (let i = 1; i < r.length; i++) if (pool > 1 && r[i] === r[i - 1]) bad.push(`${name}: kolo ${k} 2× za sebou ${r[i]}`);
    if (k > 0 && pool > 1 && r[0] === rounds[k - 1].at(-1)) bad.push(`${name}: hranice kol ${k - 1}/${k} ${r[0]}`);
  });
  return bad;
}
const ROUNDS = 40;

test('společný výběr: drawRound / drawGenerated / freshOrder', async () => {
  const f = await load('/src/activities/fresh.ts');
  f.resetFresh();
  const pool = Array.from({ length: 10 }, (_, i) => `x${i}`);
  const a = Array.from({ length: ROUNDS }, () => f.drawRound('t1', pool, 6, String));
  expect(check('drawRound', a, 6)).toEqual([]);
  // přes hranici: stejná úloha nejdřív po 6 jiných (velikost kola), i když přechází mezi koly
  const b = Array.from({ length: ROUNDS }, () => f.drawRound('t2', Array.from({ length: 12 }, (_, i) => i), 6, String).map(String)).flat();
  for (let i = 0; i < b.length; i++) expect(b.slice(Math.max(0, i - 6), i), `pozice ${i}`).not.toContain(b[i]);
  const c = Array.from({ length: ROUNDS }, () => f.drawGenerated('t3', 5, () => Math.floor(Math.random() * 3), String, 3).map(String));
  expect(check('drawGenerated', c, 5)).toEqual([]);
  const d = Array.from({ length: ROUNDS }, () => f.freshOrder('t4', f.shuffle(pool), String));
  expect(check('freshOrder', d, 10)).toEqual([]);
  // Fisher–Yates: zhruba rovnoměrné
  const first: Record<string, number> = {};
  for (let i = 0; i < 6000; i++) { const s = f.shuffle(['a', 'b', 'c']); first[s[0]] = (first[s[0]] ?? 0) + 1; }
  for (const v of Object.values(first)) expect(v).toBeGreaterThan(1700);
});

test('všechny generátory kol: bez opakování v kole i na hranici kol', async () => {
  const { loadContent } = await load('/src/content/load.ts');
  const c = await loadContent();
  (await load('/src/activities/fresh.ts')).resetFresh();
  const bad: string[] = [];
  const { GAMES, GAME_ROUND } = await load('/src/games/games.ts');
  const maxIdx = Math.max(...c.orders[c.defaultOrderId].lessons.map((l: { index: number }) => l.index));
  for (const g of GAMES) {
    const from = g.minLesson(c);
    if (from == null) continue;
    for (let idx = from; idx <= maxIdx; idx++) {
      const rounds = Array.from({ length: ROUNDS }, () => g.build(c, idx).map((t: { answer: string; id: string }) => (g.id === 'bublinky' ? t.answer : t.id)));
      bad.push(...check(`${g.id}@${idx}`, rounds, GAME_ROUND));
    }
  }
  const m = await load('/src/games/MathGames.tsx');
  for (const max of [2, 3, 4, 5]) {
    bad.push(...check(`mm1:${max}`, Array.from({ length: ROUNDS }, () => m.mm1Tasks(max).map((t: { n: number }) => String(t.n))), 5));
    bad.push(...check(`mm2:${max}`, Array.from({ length: ROUNDS }, () => m.mm2Tasks(max).map((t: { n: number }) => String(t.n))), 5));
  }
  for (let level = 1; level <= 6; level++) {
    const [lo, hi] = m.mm3Range(level);
    const rounds = Array.from({ length: ROUNDS }, () => m.mm3Tasks(lo, hi).map((t: { row: number[]; gap: number }) => `${t.row.join('')}:${t.gap}`));
    bad.push(...check(`mm3@${level}`, rounds, 5));
    if (level >= 4) expect(new Set(rounds.flat().map((x) => x.split(':')[0])).size, `MM3 v úrovni ${level} má víc řad než 1-2-3`).toBeGreaterThan(1);
  }
  const w = await load('/src/games/WorldEnglishGames.tsx');
  const wg = JSON.parse(fs.readFileSync('public/content/world/games.json', 'utf8'));
  for (const lv of wg.mp1.levels) {
    const boxes = wg.mp1.boxes.filter((x: { id: string }) => lv.boxIds.includes(x.id));
    const r1 = Array.from({ length: ROUNDS }, () => w.mp1Tasks(wg.mp1.items, boxes));
    bad.push(...check(`mp1:${lv.id}`, r1.map((r) => r.map((t: { id: string }) => t.id)), 5));
    for (const r of r1) {
      expect(r.every((t: { box: string }) => lv.boxIds.includes(t.box)), 'MP1 jen krabice úrovně').toBe(true);
      for (let i = 2; i < r.length; i++) expect(r[i].box === r[i - 1].box && r[i].box === r[i - 2].box, 'MP1 nejvýš 2× stejná krabice').toBe(false);
    }
  }
  const mp2 = Array.from({ length: ROUNDS }, () => w.mp2Tasks(wg.mp2.sequences));
  bad.push(...check('mp2', mp2.map((r) => r.map((t: { s: { id: string } }) => t.s.id)), 5));
  for (const r of mp2) { expect(r).toHaveLength(5); for (const t of r) expect(t.shown.join(), 'MP2 nikdy rovnou seřazené').not.toBe(t.s.steps.join()); }
  expect(new Set(mp2.map((r) => r[0].s.id)).size, 'MP2 nezačíná pořád stejně').toBeGreaterThan(1);
  for (let k = 0; k < ROUNDS; k++) {
    const r = w.mp3Tasks(wg.mp3.taskTypes).map((t: { type: { id: string } }) => t.type.id);
    expect(new Set(r).size, `MP3 aspoň 1 z každého typu: ${r}`).toBe(3);
    for (let i = 2; i < r.length; i++) expect(r[i] === r[i - 1] && r[i] === r[i - 2], 'MP3 nikdy 3× stejný typ').toBe(false);
  }
  bad.push(...check('me1', Array.from({ length: ROUNDS }, () => w.me1Tasks().map((t: { v: { w: string } }) => t.v.w)), 5));
  bad.push(...check('me2', Array.from({ length: ROUNDS }, () => w.me2Tasks().map((t: { s: { w: string } }) => t.s.w)), 5));

  const { buildRound } = await load('/src/math/math.ts');
  for (const l of JSON.parse(fs.readFileSync('public/content/math/lessons.json', 'utf8')).lessons) {
    const rounds = Array.from({ length: ROUNDS }, () => buildRound(l));
    for (const kind of ['count', 'find', 'find-group', 'same', 'where']) {
      const seq = rounds.map((r: { kind: string; n?: number; pos?: string }[]) => r.filter((t) => t.kind === kind).map((t) => String(t.n ?? t.pos)));
      bad.push(...check(`math ${l.id} ${kind}`, seq, kind === 'where' ? 5 : 3)); // m0: 5 úloh z 3–5 pozic
    }
  }
  // čtení: písmena (A2), slabiky (A6), slova (A5/A7)
  const { makeTask: letterTask } = await load('/src/screens/LetterActivity.tsx');
  const { makeTask: syllTask } = await load('/src/screens/ReadSyllable.tsx');
  const { lessonSyllables, allUsableSyllables } = await load('/src/screens/SyllableActivity.tsx');
  const { buildWordQueue } = await load('/src/activities/wordQueue.ts');
  const { composeQueue, composeWords } = await load('/src/activities/composeWord.ts');
  const { readWords } = await load('/src/screens/ReadWord.tsx').catch(() => ({ readWords: null }));
  for (const lesson of c.orders[c.defaultOrderId].lessons) {
    const none = new Set<string>();
    let prev: string | null = null;
    const a2 = Array.from({ length: ROUNDS }, (_, k) => Array.from({ length: 6 }, (_, i) => { const t = letterTask(c, lesson, prev, none, k === 0 && i === 0); prev = t.target.id; return t.target.id; }));
    // A2 záměrně střídá nové písmeno lekce s dříve probranými (nové se vrací ob jednu úlohu) → hlídá se jen „ne 2× za sebou“ a hranice kol
    bad.push(...check(`A2 ${lesson.id}`, a2, Infinity));
    const pool = allUsableSyllables(c, lesson); const cands = lessonSyllables(c, lesson);
    if (cands.length) {
      let p: string | undefined;
      const a6 = Array.from({ length: ROUNDS }, (_, k) => Array.from({ length: 6 }, (_, i) => { const t = syllTask(`A6:${lesson.id}`, pool, cands, none, k === 0 && i === 0, p); p = t.target.id; return t.target.id; }));
      bad.push(...check(`A6 ${lesson.id}`, a6, 6));
    }
    const words = readWords ? readWords(c, lesson) : c.words.filter((w: { minLessonIndex: Record<string, number> }) => w.minLessonIndex[c.defaultOrderId] <= lesson.index);
    if (words.length > 1) bad.push(...check(`A5 ${lesson.id}`, Array.from({ length: ROUNDS }, () => buildWordQueue(words, lesson, none).map((w: { id: string }) => w.id)), 12));
    const cw = composeWords(c, lesson);
    if (cw.length > 1) bad.push(...check(`A7 ${lesson.id}`, Array.from({ length: ROUNDS }, () => composeQueue(cw, lesson, none).map((w: { id: string }) => w.id)), 12));
  }
  expect(bad, bad.slice(0, 20).join('\n')).toEqual([]);
});
