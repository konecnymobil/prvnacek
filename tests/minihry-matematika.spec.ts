import { test, expect, type Page } from '@playwright/test';
import { waitForChildDb } from './helpers';

test.use({ reducedMotion: 'reduce' });

async function openGame(page: Page, id: string) {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await waitForChildDb(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
    const tx = db.transaction('settings', 'readwrite');
    const p: Record<string, unknown> = {};
    for (const k of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']) p[k] = { rounds: 1, correct: 5, wrong: 0, errors: {}, traced: 1 };
    tx.objectStore('settings').put(p, 'math:progress');
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  });
  await page.reload();
  const card = page.locator('.subj-card[data-subject="math"]');
  await card.click(); await card.click();
  await page.locator(`.game-tile[data-game="${id}"]`).click();
  await expect(page.getByTestId('game-round')).toBeVisible();
}
async function nextTask(page: Page, idx: string | null) {
  await expect(page.getByTestId('game-end').or(page.locator(`[data-testid="game-round"]:not([data-index="${idx}"])`))).toBeVisible({ timeout: 8000 });
}
async function endToAlbum(page: Page) {
  await expect(page.getByTestId('game-end')).toBeVisible();
  await page.getByTestId('game-album').click();
  await expect(page.getByTestId('alb-subj-math')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-sticker^="e:"][data-state="own"]')).toHaveCount(1, { timeout: 8000 });
}

test('MM1 Krmení: moc = „jedno vrať“, vrácení z misky, správný počet projde; konec → záložka Matematika v albu', async ({ page }) => {
  const feed = page.waitForRequest(/snd-m-p-feed-n\.mp3/);
  await openGame(page, 'mm1');
  await feed;
  for (let k = 0; k < 5; k++) {
    const idx = await page.getByTestId('game-round').getAttribute('data-index');
    const n = Number(await page.getByTestId('mm1').getAttribute('data-target'));
    for (let j = 0; j <= n; j++) await page.getByTestId('mm1-food').first().click();
    if (k === 0) {
      await page.getByTestId('mm1-go').click();
      await expect(page.getByTestId('game-msg')).toContainText('To je moc, jedno vrať.');
      await expect(page.locator('.xg-in').first()).toBeVisible();
      await expect(page.getByTestId('game-hint')).toBeVisible();
    }
    await page.locator('.xg-in').first().click();
    await expect(page.getByTestId('mm1-bowl')).toHaveAttribute('data-count', String(n));
    await page.getByTestId('mm1-go').click();
    await nextTask(page, idx);
  }
  await endToAlbum(page);
});

test('MM2 Kolik vidíš?: tečky po 2 s zhasnou, 👀 je ukáže, chyba i správná odpověď', async ({ page }) => {
  await openGame(page, 'mm2');
  await expect(page.getByTestId('mm2')).toHaveAttribute('data-ms', '2000');
  await expect(page.getByTestId('mm2-dots')).toHaveAttribute('data-on', 'false', { timeout: 4000 });
  await page.getByTestId('mm2-again').click();
  await expect(page.getByTestId('mm2-dots')).toHaveAttribute('data-on', 'true');
  for (let k = 0; k < 5; k++) {
    const idx = await page.getByTestId('game-round').getAttribute('data-index');
    const n = await page.getByTestId('mm2-dots').getAttribute('data-n');
    if (k === 0) {
      await page.locator(`.xg-num:not([data-o="${n}"])`).first().click();
      await expect(page.getByTestId('game-msg')).toContainText('Skoro');
    }
    await page.locator(`.xg-num[data-o="${n}"]`).click();
    await nextTask(page, idx);
  }
  await endToAlbum(page);
});

test('MM3 Cestička: chybějící číslo z řady, chyba i správná odpověď', async ({ page }) => {
  await openGame(page, 'mm3');
  for (let k = 0; k < 5; k++) {
    const idx = await page.getByTestId('game-round').getAttribute('data-index');
    const stones = await page.locator('.xg-stone').evaluateAll((els) => els.map((e) => ({ gap: e.getAttribute('data-gap') === 'true', v: e.textContent!.replace('🐸', '') })));
    const g = stones.findIndex((s) => s.gap); const j = g === 0 ? 1 : 0;
    const n = Number(stones[j].v) + (g - j);
    if (k === 0) {
      await page.locator(`.xg-num:not([data-o="${n}"])`).first().click();
      await expect(page.getByTestId('game-msg')).toContainText('Skoro');
    }
    await page.locator(`.xg-num[data-o="${n}"]`).click();
    await nextTask(page, idx);
  }
  await endToAlbum(page);
});

test('rodič nastaví tečky na 3 s; bez pokroku jsou hry zamčené', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  const card = page.locator('.subj-card[data-subject="math"]');
  await card.click(); await card.click();
  await expect(page.locator('.game-tile[data-game="mm1"]')).toHaveAttribute('data-locked', 'true');
  await page.getByRole('button', { name: '‹ Zpět' }).click();
  await page.getByTestId('open-parent').click();
  await page.getByTestId('gate-hold').hover();
  await page.mouse.down(); await page.waitForTimeout(3300); await page.mouse.up();
  const q = (await page.getByTestId('gate-question').textContent())!;
  const [a, b] = q.split('=')[0].split('+').map((x) => parseInt(x, 10));
  await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${a + b}$`) }).click();
  await expect(page.getByTestId('mm2-setting').locator('[data-ms="2000"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('mm2-setting').locator('[data-ms="3000"]').click();
  await expect.poll(() => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => { const g = r.result.transaction('settings').objectStore('settings').get('mm2:showMs'); g.onsuccess = () => { r.result.close(); res(g.result); }; }; }))).toBe(3000);
});
