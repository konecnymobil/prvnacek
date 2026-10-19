import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { waitForChildDb } from './helpers';

async function openMath(page: Page, m0Done = true, extra: Record<string, unknown> = {}) {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await waitForChildDb(page);
  // A-31: m1 se otevře po 1 kole m0 „Kde to je?“
  if (m0Done) await page.evaluate((extra) => new Promise<void>((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => { const tx = r.result.transaction('settings', 'readwrite'); tx.objectStore('settings').put({ m0: { rounds: 1, correct: 5, wrong: 0, errors: {}, traced: 0, goodRounds: 1, goodDays: [] }, ...extra }, 'math:progress'); tx.oncomplete = () => { r.result.close(); res(); }; }; }), extra);
  const card = page.locator('.subj-card[data-subject="math"]');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('math-screen')).toHaveCount(0);
  await card.click();
  await expect(page.getByTestId('math-screen')).toBeVisible();
}

/** Vyřeší úlohy s automatickou kontrolou, dokud nepřijde obtahování. */
async function solveUntilTrace(page: Page) {
  for (let k = 0; k < 6; k++) {
    const task = page.getByTestId('math-task');
    const kind = await task.getAttribute('data-kind');
    if (kind === 'trace') return;
    const idx = await task.getAttribute('data-index');
    const n = kind === 'count' ? await page.locator('.m-scene .m-item').count() : Number(await page.getByTestId('math-digit').getAttribute('data-n'));
    await task.locator(`.m-opt[data-value="${n}"]`).click();
    await expect(page.getByTestId('math-task')).not.toHaveAttribute('data-index', idx!);
  }
}

/** Syntetické Pointer Events v souřadnicích šablony (viewBox). */
async function stroke(page: Page, pointerType: 'pen' | 'touch' | 'mouse', pts: [number, number][], opts: { id?: number; up?: boolean; width?: number } = {}) {
  await page.evaluate(({ pointerType, pts, id, up, width }) => {
    const svg = document.querySelector('[data-testid="pen-surface"]') as SVGSVGElement;
    const m = svg.getScreenCTM()!;
    const fire = (type: string, [x, y]: [number, number]) => {
      const p = new DOMPoint(x, y).matrixTransform(m);
      svg.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: p.x, clientY: p.y, pressure: pointerType === 'pen' ? 0.6 : 0.5, width, height: width, isPrimary: true }));
    };
    fire('pointerdown', pts[0]);
    for (const q of pts.slice(1)) fire('pointermove', q);
    if (up) fire('pointerup', pts[pts.length - 1]);
  }, { pointerType, pts, id: opts.id ?? 1, up: opts.up ?? true, width: opts.width ?? 1 });
}
/** Body po šabloně číslice 1 (M24 46 L64 10 L64 130), volitelně posunuté o dx. */
const one = (dx = 0): [number, number][] => {
  const out: [number, number][] = [];
  for (let t = 0; t <= 1; t += 0.05) out.push([24 + 40 * t + dx, 46 - 36 * t]);
  for (let y = 10; y <= 130; y += 4) out.push([64 + dx, y]);
  return out;
};

test('výběr předmětu na dvě klepnutí, matematika má lekce 1 až 0–5, další zamčené', async ({ page }) => {
  await openMath(page, false);
  await expect(page.locator('[data-lesson]')).toHaveCount(7);
  await expect(page.locator('[data-lesson="m0"]')).toHaveAttribute('data-locked', 'false');
  await expect(page.locator('[data-lesson="m1"]')).toHaveAttribute('data-locked', 'true');
  await expect(page.locator('[data-lesson="m2"]')).toHaveAttribute('data-locked', 'true');
});

test('Kolik jich je?: špatná odpověď = zkus znovu, správná = posun', async ({ page }) => {
  await openMath(page, true, { m2: { rounds: 0, correct: 0, wrong: 0, errors: {}, traced: 0, manual: true } });
  const instr = page.waitForRequest(/snd-m-p-count\.mp3/);
  await page.locator('[data-lesson="m2"]').click();
  await instr;
  const task = page.getByTestId('math-task');
  await expect(task).toHaveAttribute('data-kind', 'count');
  const n = await page.locator('.m-scene .m-item').count();
  await task.locator(`.m-opt:not([data-value="${n}"])`).first().click();
  await expect(page.getByTestId('math-try')).toBeVisible();
  await expect(task).toHaveAttribute('data-index', '0');
  const praise = page.waitForRequest(/snd-p-praise-\d\.mp3/);
  await task.locator(`.m-opt[data-value="${n}"]`).click();
  await expect(page.getByTestId('math-ok')).toBeVisible();
  await praise;
  await expect(task).toHaveAttribute('data-index', '1');
});

test('pero: přijato, dotyk při položeném peru ignorován, prst má širší koridor; kolo uloží pokrok', async ({ page }) => {
  await openMath(page);
  await page.locator('[data-lesson="m1"]').click();
  await solveUntilTrace(page);
  const surf = page.getByTestId('pen-surface');
  await expect(surf).toBeVisible();
  expect(await surf.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
  // pero dole → dlaň (touch) ignorovaná
  await stroke(page, 'pen', one(), { id: 5, up: false });
  await stroke(page, 'touch', [[10, 120], [20, 125]], { id: 9 });
  await expect(surf).toHaveAttribute('data-ignored', '1');
  await page.evaluate(() => { const svg = document.querySelector('[data-testid="pen-surface"]')!; svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5, pointerType: 'pen' })); });
  await expect(surf).toHaveAttribute('data-strokes', '1');
  await expect(page.getByTestId('pen-kind')).toContainText('pero');
  // hned po peru (do 1,5 s) je dotyk také ignorován, široký dotyk (dlaň) vždy
  await stroke(page, 'touch', [[10, 120], [20, 125]], { id: 10 });
  await expect(surf).toHaveAttribute('data-ignored', '2');
  // posunutý tah perem o 14 jednotek (mimo koridor pera 11) → nestačí
  await page.getByTestId('pen-clear').click();
  await stroke(page, 'pen', one(14), { id: 6 });
  await page.getByTestId('pen-done').click();
  await expect(page.getByTestId('math-try')).toBeVisible();
  // stejný posun prstem (koridor ×1,6) → stačí
  await page.getByTestId('pen-clear').click();
  await page.waitForTimeout(1600);
  await stroke(page, 'touch', one(14), { id: 11, width: 20 });
  await expect(surf).toHaveAttribute('data-strokes', '1');
  await expect(page.getByTestId('pen-kind')).toContainText('prst');
  await page.getByTestId('pen-done').click();
  await expect(page.getByTestId('math-end')).toBeVisible();
  await expect.poll(() => page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open('prvnacek');
    r.onsuccess = () => { const q = r.result.transaction('settings').objectStore('settings').get('math:progress'); q.onsuccess = () => { r.result.close(); res(q.result?.m1?.rounds ?? 0); }; };
  }))).toBe(1);
  await page.getByTestId('math-end-ok').click();
  await expect(page.locator('[data-lesson="m2"]')).toHaveAttribute('data-locked', 'true'); // A-08: odemkne až 2. úspěšné kolo
});

test('styl psacího písma: výchozí klasické, přepnutí na nespojované se uloží', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await page.getByTestId('open-parent').click();
  await page.getByTestId('gate-hold').hover();
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  const q = (await page.getByTestId('gate-question').textContent())!;
  const [a, b] = q.split('=')[0].split('+').map((x) => parseInt(x, 10));
  await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${a + b}$`) }).click();
  const panel = page.getByTestId('script-style');
  await expect(panel.locator('button[data-style="classic"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('script-style-preview')).toHaveAttribute('data-style', 'classic');
  await expect(panel).not.toContainText(/Comenia/i);
  await panel.locator('button[data-style="unjoined"]').click();
  await page.reload();
  await page.getByTestId('open-parent').click();
  await page.getByTestId('gate-hold').hover();
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  const q2 = (await page.getByTestId('gate-question').textContent())!;
  const [c, d] = q2.split('=')[0].split('+').map((x) => parseInt(x, 10));
  await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${c + d}$`) }).click();
  await expect(page.getByTestId('script-style').locator('button[data-style="unjoined"]')).toHaveAttribute('aria-pressed', 'true');
});

async function toTrace(page: Page) {
  await openMath(page);
  await page.locator('[data-lesson="m1"]').click();
  await solveUntilTrace(page);
  await expect(page.getByTestId('pen-surface')).toBeVisible();
}
async function attempt(page: Page, pts: [number, number][]) {
  await page.getByTestId('pen-clear').click();
  await stroke(page, 'mouse', pts, { id: 21 });
  await page.getByTestId('pen-done').click();
}

test('myš: špatná 1 (opačný směr, jen kus, mimo koridor) neprojde, správná projde', async ({ page }) => {
  await toTrace(page);
  const tries = page.getByTestId('math-try');
  await attempt(page, one().reverse());
  await expect(tries).toBeVisible();
  await attempt(page, one().slice(0, 25));
  await expect(tries).toBeVisible();
  const detour = one(); detour.splice(20, 0, ...Array.from({ length: 12 }, (_, k) => [95, 20 + k * 8] as [number, number]));
  await attempt(page, detour);
  await expect(tries).toBeVisible();
  await attempt(page, one(14)); // myš = koridor pera, posun o 14 neprojde
  await expect(tries).toBeVisible();
  await attempt(page, one());
  await expect(page.getByTestId('math-end')).toBeVisible({ timeout: 10000 });
});

test('pískání: začne mimo obrys a utichne po návratu (mock AudioContext)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __sq: { on: number; off: number }; AudioContext: unknown };
    w.__sq = { on: 0, off: 0 };
    class Node { connect(n: unknown) { return n; } disconnect() {} }
    class Osc extends Node { type = 'sine'; frequency = { value: 0 }; start() { w.__sq.on++; } stop() { w.__sq.off++; } }
    class Gain extends Node { gain = { value: 0 }; }
    w.AudioContext = class { destination = {}; state = 'running'; resume() { return Promise.resolve(); } createOscillator() { return new Osc(); } createGain() { return new Gain(); } };
  });
  await toTrace(page);
  const sq = () => page.evaluate(() => (window as unknown as { __sq: { on: number; off: number } }).__sq);
  const surf = page.getByTestId('pen-surface');
  await stroke(page, 'mouse', one().slice(0, 10), { id: 31, up: false });
  expect((await sq()).on).toBe(0);
  await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="pen-surface"]') as SVGSVGElement; const m = svg.getScreenCTM()!;
    const mv = (x: number, y: number) => { const p = new DOMPoint(x, y).matrixTransform(m); svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 31, pointerType: 'mouse', clientX: p.x, clientY: p.y })); };
    mv(95, 100);
  });
  await expect(surf).toHaveAttribute('data-out', 'true');
  expect(await sq()).toEqual({ on: 1, off: 0 });
  await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="pen-surface"]') as SVGSVGElement; const m = svg.getScreenCTM()!;
    const p = new DOMPoint(64, 60).matrixTransform(m);
    svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 31, pointerType: 'mouse', clientX: p.x, clientY: p.y }));
  });
  await expect(surf).toHaveAttribute('data-out', 'false');
  expect(await sq()).toEqual({ on: 1, off: 1 });
});

test.describe('A-06/A-08/A-31: lekce matematiky z math/lessons.json', () => {
  const f = JSON.parse(fs.readFileSync('public/content/math/lessons.json', 'utf8'));
  f.lessons.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
  const base = { correct: 0, wrong: 0, errors: {}, traced: 0 };
  test('odemykání: m0 po 1 kole, dál 2 dobrá kola ve 2 dnech, zkouška, ručně, stará data', async () => {
    const { mathUnlocked, isGoodRound } = await import('../src/math/math');
    const ids = f.lessons.map((l: { id: string }) => l.id);
    expect(ids[0]).toBe('m0');
    expect(mathUnlocked(f, {}, 0)).toBe(true);
    expect(mathUnlocked(f, {}, 1)).toBe(false);
    expect(mathUnlocked(f, { m0: { ...base, rounds: 1, goodRounds: 0, goodDays: [] } }, 1)).toBe(true);
    expect(isGoodRound({ correct: 3 }, 5, f.unlockRule)).toBe(false);
    expect(isGoodRound({ correct: 4 }, 5, f.unlockRule)).toBe(true);
    expect(mathUnlocked(f, { m1: { ...base, rounds: 3, goodRounds: 1, goodDays: ['2026-10-19'] } }, 2)).toBe(false);
    expect(mathUnlocked(f, { m1: { ...base, rounds: 3, goodRounds: 2, goodDays: ['2026-10-19'] } }, 2)).toBe(false); // jeden den
    expect(mathUnlocked(f, { m1: { ...base, rounds: 3, goodRounds: 2, goodDays: ['2026-10-18', '2026-10-19'] } }, 2)).toBe(true);
    expect(mathUnlocked(f, { m1: { ...base, rounds: 1, goodRounds: 0, goodDays: [], testPassed: true } }, 2)).toBe(true);
    expect(mathUnlocked(f, { m2: { ...base, rounds: 0, manual: true } }, 2)).toBe(true);
    expect(mathUnlocked(f, { m1: { ...base, rounds: 1 } }, 2)).toBe(true); // starší data bez goodDays
    expect(mathUnlocked(f, { m3: { ...base, rounds: 1 } }, 1)).toBe(true); // dítě už hrálo dál
  });
  test('možnosti jen z probraných čísel, pozice odpovědi se střídá, m0 bez čísel', async () => {
    const { buildRound, POS_ZONE } = await import('../src/math/math');
    for (const l of f.lessons) {
      const pos = new Map<string, Set<number>>();
      for (let k = 0; k < 60; k++) {
        const r = buildRound(l, { firstRound: k === 0 });
        expect(r.map((t) => t.kind)).toEqual(l.tasks.kinds);
        for (const t of r) {
          if (t.kind === 'count') { for (const o of t.options) expect(l.nums).toContain(o); expect(t.options.length).toBeLessThanOrEqual(l.optionRule.maxDigitOptions); const s = pos.get('count') ?? new Set(); s.add(t.options.indexOf(t.n)); pos.set('count', s); }
          if (t.kind === 'where') { expect(POS_ZONE[t.pos]).toContain(t.target); for (const [c, img] of t.cells.entries()) if (img && c !== t.target) expect(POS_ZONE[t.pos]).not.toContain(c); if (k === 0) expect(['top', 'bottom', 'middle']).toContain(t.pos); }
          if (t.kind === 'more') expect(t.a).not.toBe(t.b);
          if (t.kind === 'same') expect(t.options.filter((o) => o === t.n)).toHaveLength(1);
        }
      }
      if (l.optionRule && l.optionRule.maxDigitOptions >= 3) expect(pos.get('count')!.size, `${l.id}: odpověď není pořád na stejném místě`).toBeGreaterThan(1);
    }
  });
});
