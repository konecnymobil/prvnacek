import { test, expect, type Page } from '@playwright/test';
import { waitForChildDb } from './helpers';

test.use({ reducedMotion: 'reduce' });

async function open(page: Page, subject: string, game: string) {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await waitForChildDb(page);
  const card = page.locator(`.subj-card[data-subject="${subject}"]`);
  await card.click(); await card.click();
  await page.locator(`.game-tile[data-game="${game}"]`).click();
  await expect(page.getByTestId('game-round')).toBeVisible();
}
const idx = (page: Page) => page.getByTestId('game-round').getAttribute('data-index');
async function next(page: Page, i: string | null) {
  await expect(page.getByTestId('game-end').or(page.locator(`[data-testid="game-round"]:not([data-index="${i}"])`))).toBeVisible({ timeout: 8000 });
}
async function wrongMsg(page: Page) { await expect(page.getByTestId('game-msg')).toContainText('Skoro! Zkus to znovu.'); }
async function album(page: Page, subject: string) {
  await expect(page.getByTestId('game-end')).toBeVisible();
  await page.getByTestId('game-album').click();
  await expect(page.getByTestId(`alb-subj-${subject}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-sticker^="e:"][data-state="own"]')).toHaveCount(1, { timeout: 8000 });
}

test('MP1 Uklízíme: špatná krabice = oprava, správná projde; konec → album Prvouka', async ({ page }) => {
  const pick = page.waitForRequest(/snd-p-subject-pick\.mp3/);
  await page.goto('./');
  await pick; // výběr předmětu se ozve po 1 s
  const subj = page.waitForRequest(/snd-subject-prv\.mp3/);
  const box = page.waitForRequest(/snd-pv-w-(do-skoly|hracky)\.mp3/);
  await open(page, 'world', 'mp1');
  await subj;
  for (let k = 0; k < 5; k++) {
    const i = await idx(page); const box = await page.getByTestId('mp1-item').getAttribute('data-box');
    if (k === 0) { await page.locator(`.xg-box:not([data-box="${box}"])`).click(); await wrongMsg(page); }
    await page.locator(`.xg-box[data-box="${box}"]`).click(); await next(page, i);
  }
  await box;
  await album(page, 'world');
});

test('MP2 Co bylo dřív?: špatné pořadí se vrátí, správné projde', async ({ page }) => {
  await open(page, 'world', 'mp2');
  for (let k = 0; k < 5; k++) {
    const i = await idx(page); const order = (await page.getByTestId('mp2').getAttribute('data-order'))!.split(' ');
    if (k === 0) {
      await page.locator(`.xg-pic[data-pic="${order[1]}"]`).click(); // špatný vagon se hned vrátí
      await wrongMsg(page);
      await expect(page.locator('.xg-pic:disabled')).toHaveCount(0);
      await expect(page.locator('.xg-wagon').first()).toHaveText('');
      await page.locator(`.xg-pic[data-pic="${order[0]}"]`).click(); await page.locator('.xg-wagon[data-k="0"]').click(); // vrátit vagon
      await expect(page.locator('.xg-pic:disabled')).toHaveCount(0);
    }
    for (const e of order) await page.locator(`.xg-pic[data-pic="${e}"]`).click();
    await next(page, i);
  }
  await album(page, 'world');
});

test('MP3 Bezpečná cesta: přechod mimo zebru = oprava, na zebře projde', async ({ page }) => {
  await open(page, 'world', 'mp3');
  for (let k = 0; k < 5; k++) {
    const i = await idx(page); const z = await page.getByTestId('mp3').getAttribute('data-zebra');
    if (k === 0) { await page.locator(`.xg-spot:not([data-x="${z}"])`).first().click(); await wrongMsg(page); }
    await page.locator(`.xg-spot[data-x="${z}"]`).click(); await next(page, i);
  }
  await album(page, 'world');
});

test('ME1 Megaboxes: špatná krabice se zavře, správná projde; konec → album Angličtina', async ({ page }) => {
  await open(page, 'english', 'me1');
  for (let k = 0; k < 5; k++) {
    const i = await idx(page); const w = await page.getByTestId('me1').getAttribute('data-word');
    if (k === 0) {
      const bad = page.locator(`.xg-mbox:not([data-w="${w}"])`).first();
      await bad.click(); await wrongMsg(page);
      await expect(bad).not.toHaveText('📦'); await expect(bad).toHaveText('📦', { timeout: 3000 });
    }
    await page.locator(`.xg-mbox[data-w="${w}"]`).click(); await next(page, i);
  }
  await album(page, 'english');
});

async function paint(page: Page, rows: number[], xs: [number, number]) {
  await page.evaluate(({ rows, xs }) => {
    const c = document.querySelector('[data-testid="me2-canvas"]') as HTMLCanvasElement; const b = c.getBoundingClientRect();
    const ev = (t: string, x: number, y: number) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', clientX: b.left + (x / 300) * b.width, clientY: b.top + (y / 300) * b.height }));
    for (const y of rows) { ev('pointerdown', xs[0], y); for (let x = xs[0]; x <= xs[1]; x += 10) ev('pointermove', x, y); ev('pointerup', xs[1], y); }
  }, { rows, xs });
}
test('ME2 Colour it: málo barvy neprojde, ≥ 50 % správnou barvou projde', async ({ page }) => {
  await open(page, 'english', 'me2');
  for (let k = 0; k < 5; k++) {
    const i = await idx(page); const col = await page.getByTestId('me2').getAttribute('data-colour');
    await page.locator(`.xg-paint[data-c="${col}"]`).click();
    if (k === 0) {
      await paint(page, [150], [140, 160]);
      await page.getByTestId('me2-done').click(); await wrongMsg(page);
      expect(Number(await page.getByTestId('me2').getAttribute('data-score'))).toBeLessThan(0.5);
      await page.getByTestId('me2-clear').click();
    }
    await paint(page, Array.from({ length: 22 }, (_, r) => 20 + r * 12), [20, 280]);
    await page.getByTestId('me2-done').click(); await next(page, i);
  }
  await album(page, 'english');
});
