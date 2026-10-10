import { expect, test } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

const idbGet = (page: import('@playwright/test').Page, key: string) => page.evaluate(async (k) => {
  const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
  const v = await new Promise<unknown>((res) => { const r = db.transaction('settings').objectStore('settings').get(k); r.onsuccess = () => res(r.result); });
  db.close();
  return v;
}, key);

for (const [w, h] of [[1024, 768], [820, 1180], [768, 1024], [1180, 820]]) {
  test(`nabídka lekce se vejde bez rolování ${w}x${h} (všechny tvary)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await unlockAll(page);
    await page.getByTestId('lesson-row').getByRole('button').first().click();
    await expect(page.getByTestId('lesson-menu')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const last = [...document.querySelectorAll('[data-testid="lesson-menu"] .kbtn')].pop()!.getBoundingClientRect();
      return { scroll: de.scrollHeight, client: de.clientHeight, bottom: last.bottom, vh: window.innerHeight };
    });
    expect(m.scroll).toBeLessThanOrEqual(m.client + 1);
    expect(m.bottom).toBeLessThanOrEqual(m.vh);
  });
}

test('psací glyfy zůstanou uvnitř karty (hlavně s, á)', async ({ page }) => {
  await unlockAll(page);
  await page.evaluate(async () => { // jen psací
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key: 'script', value: { allowed: { upperPrint: false, lowerPrint: false, cursive: true }, def: 'cursive', current: null } }, 'script');
    await new Promise((r) => { tx.oncomplete = r; }); db.close();
  });
  await page.reload();
  await page.evaluate(() => document.fonts.load('400 40px "Playwrite CZ"'));
  const stones = page.getByTestId('lesson-row').getByRole('button');
  await expect(stones.first().locator('.glyph[data-script="cursive"]')).toBeVisible();
  // karta lekce se „S“ (psací s) a všechny kameny
  const n = await stones.count();
  for (let i = 0; i < n; i++) {
    const r = await stones.nth(i).evaluate((b) => { const g = b.querySelector('.glyph')!.getBoundingClientRect(), c = b.getBoundingClientRect(); return { l: g.left - c.left, r: c.right - g.right, t: g.top - c.top, b: c.bottom - g.bottom }; });
    expect(Math.min(r.l, r.r, r.t, r.b)).toBeGreaterThanOrEqual(-0.5);
  }
  await stones.nth(n - 1).click(); // lekce se „s“ je v řadě; i hero karta
  const hero = page.locator('.tile-hero');
  await expect(hero).toBeVisible();
  const r = await hero.evaluate((b) => { const g = b.querySelector('.glyph')!.getBoundingClientRect(), c = b.getBoundingClientRect(); return [g.left - c.left, c.right - g.right, g.top - c.top, c.bottom - g.bottom]; });
  for (const v of r) expect(v).toBeGreaterThanOrEqual(0);
});

test('„všechny tvary“ je výchozí, ukáže Aa + psací a uloží se po přepnutí', async ({ page }) => {
  await page.goto('./');
  const stone = page.getByTestId('lesson-row').getByRole('button').first();
  await expect(stone.locator('.glyph-all .glyph')).toHaveCount(4);
  await expect(stone.locator('.glyph[data-script="upperPrint"]')).toHaveText('M');
  await expect(stone.locator('.glyph[data-script="cursive"]')).toBeVisible();
  await page.getByTestId('script-switch').click(); // → malé tiskací
  await expect(stone.locator('.glyph-all')).toHaveCount(0);
  expect(((await idbGet(page, 'script')) as { current: string }).current).toBe('lower');
  for (let i = 0; i < 6; i++) await page.getByTestId('script-switch').click();
  await page.reload();
  await expect(page.getByTestId('lesson-row').getByRole('button').first().locator('.glyph-all')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.dataset.pismo)).toBe('all');
});

test('kombinované varianty se vejdou do karet na iPadu (bez přetečení)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await unlockAll(page);
  for (const v of ['all', 'cursiveBoth', 'printBoth']) {
    await page.evaluate(async (id) => {
      const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ allowed: Object.fromEntries(['lower', 'upper', 'cursive', 'cursiveUpper', 'printBoth', 'cursiveBoth', 'all'].map((k) => [k, true])), def: id, current: null }, 'script');
      await new Promise((r) => { tx.oncomplete = r; }); db.close();
    }, v);
    await page.reload();
    await page.evaluate(() => document.fonts.load('400 40px "Playwrite CZ"'));
    const stones = page.getByTestId('lesson-row').getByRole('button');
    await expect(stones.first().locator('.glyph-all')).toHaveAttribute('data-variant', v);
    const n = await stones.count();
    for (let i = 0; i < n; i++) {
      const r = await stones.nth(i).evaluate((b) => { const c = b.getBoundingClientRect(); return Math.min(...[...b.querySelectorAll('.glyph')].map((e) => { const g = e.getBoundingClientRect(); return Math.min(g.left - c.left, c.right - g.right, g.top - c.top, c.bottom - g.bottom); })); });
      expect(r).toBeGreaterThanOrEqual(-0.5);
    }
    await stones.nth(n - 1).click();
    const hero = page.locator('.tile-hero');
    await expect(hero).toBeVisible();
    const h = await hero.evaluate((b) => { const c = b.getBoundingClientRect(); return Math.min(...[...b.querySelectorAll('.glyph')].map((e) => { const g = e.getBoundingClientRect(); return Math.min(g.left - c.left, c.right - g.right, g.top - c.top, c.bottom - g.bottom); })); });
    expect(h).toBeGreaterThanOrEqual(-0.5);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
    await page.goto('./');
  }
});
