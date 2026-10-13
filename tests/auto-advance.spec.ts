import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

async function start(page: Page) {
  await unlockAll(page);
  await page.getByTestId('lesson-row').getByRole('button').first().click();
  await page.getByRole('button', { name: /Najdi písmeno/ }).click();
  const act = page.getByTestId('letter-activity');
  await expect(act).toBeVisible();
  return act;
}
const progress = (page: Page) => page.getByTestId('progress');
async function solve(page: Page) {
  const act = page.getByTestId('letter-activity');
  const target = (await act.getAttribute('data-target'))!;
  await act.locator(`[data-letter="${target}"]`).click();
  await expect(page.getByRole('button', { name: /Dál/ })).toBeVisible();
}

test('po pochvale se samo pokračuje bez klepnutí', async ({ page }) => {
  await start(page);
  await solve(page);
  await expect(progress(page)).toHaveText(/Úloha 1 z/);
  await expect(progress(page)).toHaveText(/Úloha 2 z/, { timeout: 6000 });
});

test('pojistka 3 s: pochvala, která nikdy nedohraje, posun nezablokuje', async ({ page }) => {
  await page.route('**/audio/tts/snd-p-praise*', () => { /* nikdy neodpoví */ });
  await start(page);
  await solve(page);
  await page.waitForTimeout(2500);
  await expect(progress(page)).toHaveText(/Úloha 1 z/);
  await expect(progress(page)).toHaveText(/Úloha 2 z/, { timeout: 3000 });
});

test('ruční Dál zruší čekající posun – žádný dvojitý skok', async ({ page }) => {
  await start(page);
  await solve(page);
  await page.getByRole('button', { name: /Dál/ }).click();
  await expect(progress(page)).toHaveText(/Úloha 2 z/);
  await page.waitForTimeout(4500);
  await expect(progress(page)).toHaveText(/Úloha 2 z/);
});

test('po chybě se neposouvá', async ({ page }) => {
  const act = await start(page);
  const target = (await act.getAttribute('data-target'))!;
  await act.locator(`[data-letter]:not([data-letter="${target}"])`).first().click();
  await page.waitForTimeout(4500);
  await expect(progress(page)).toHaveText(/Úloha 1 z/);
  await expect(page.getByRole('button', { name: /Dál/ })).toHaveCount(0);
});

test('po odchodu z aktivity se nic neposune', async ({ page }) => {
  await start(page);
  await solve(page);
  await page.getByRole('button', { name: /Zpět/ }).first().click();
  await expect(page.getByTestId('lesson-menu')).toBeVisible();
  await page.waitForTimeout(4500);
  await expect(page.getByTestId('lesson-menu')).toBeVisible();
  await expect(page.getByTestId('letter-activity')).toHaveCount(0);
  await expect(page.getByTestId('round-end')).toHaveCount(0);
});
