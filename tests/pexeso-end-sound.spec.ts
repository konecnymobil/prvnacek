import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });
type W = { __prvPlayLog: string[] };

// Log skutečně spuštěných zvuků (player) + značka 'END' při objevení koncové obrazovky.
async function setup(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as W;
    w.__prvPlayLog = [];
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="pex-end"]') && !w.__prvPlayLog.includes('END')) w.__prvPlayLog.push('END');
    }).observe(document, { childList: true, subtree: true });
  });
  await unlockAll(page);
  const words = (await (await page.request.get('./content/words.json')).json()).words as { id: string; audioId: string }[];
  await page.getByTestId('open-pexeso').click();
  await page.getByTestId('pex-level-3').click();
  const ids = [...new Set(await page.locator('[data-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-word')!)))];
  const lastId = ids[ids.length - 1];
  return { ids, lastId, lastAudio: words.find((w) => w.id === lastId)!.audioId };
}
async function solveAllButLast(page: Page, ids: string[]) {
  for (const id of ids.slice(0, -1)) {
    await page.locator(`[data-word="${id}"][data-face="syllable"]`).click();
    await page.locator(`[data-word="${id}"][data-face="picture"]`).click();
    await page.waitForTimeout(300);
  }
  await page.locator(`[data-word="${ids[ids.length - 1]}"][data-face="syllable"]`).click();
  await page.evaluate(() => { (window as unknown as W).__prvPlayLog.length = 0; });
}
const log = (page: Page) => page.evaluate(() => (window as unknown as W).__prvPlayLog);

test('Pexeso konec: karta vidět, slovo dohraje, pak obrazovka Hotovo a „hotovo“, nic dalšího', async ({ page }) => {
  const { ids, lastId, lastAudio } = await setup(page);
  await solveAllButLast(page, ids);
  await page.locator(`[data-word="${lastId}"][data-face="picture"]`).click();
  await expect(page.locator(`[data-word="${lastId}"][data-face="picture"]`)).toHaveAttribute('data-state', 'matched');
  await expect(page.getByTestId('pex-end')).toHaveCount(0);
  await expect.poll(() => log(page)).toContain(lastAudio);
  expect(await page.getByTestId('pex-end').count()).toBe(0); // slovo hraje, konec ještě ne
  await expect(page.getByTestId('pex-end')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(4000);
  expect(await log(page)).toEqual([lastAudio, 'END', 'snd-p-round-end']);
});

test('Pexeso konec: když zvuk nikdy neskončí, pojistka 3 s přepne na Hotovo', async ({ page }) => {
  const { ids, lastId, lastAudio } = await setup(page);
  await page.route(`**/audio/tts/${lastAudio}.mp3`, () => { /* nikdy neodpoví */ });
  await solveAllButLast(page, ids);
  const t0 = Date.now();
  await page.locator(`[data-word="${lastId}"][data-face="picture"]`).click();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('pex-end')).toHaveCount(0);
  await expect(page.getByTestId('pex-end')).toBeVisible({ timeout: 4000 });
  expect(Date.now() - t0).toBeLessThan(5500);
  await expect.poll(async () => (await log(page)).slice(-2)).toEqual(['END', 'snd-p-round-end']);
  expect(await log(page)).not.toContain(lastAudio);
});

test('Pexeso konec: Hrát znovu během čekání zruší přechod i „hotovo“', async ({ page }) => {
  const { ids, lastId } = await setup(page);
  await solveAllButLast(page, ids);
  await page.locator(`[data-word="${lastId}"][data-face="picture"]`).click();
  await page.getByTestId('pex-wait-restart').click();
  await expect(page.getByTestId('pex-progress')).toHaveText(/Páry 0 z 3/);
  await page.waitForTimeout(4000);
  await expect(page.getByTestId('pex-end')).toHaveCount(0);
  expect(await log(page)).not.toContain('snd-p-round-end');
  expect(await log(page)).not.toContain('END');
});
