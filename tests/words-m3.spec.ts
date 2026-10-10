import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

const attempts = (page: Page) =>
  page.evaluate(() => new Promise<{ activity: string; itemId: string; correct: boolean }[]>((resolve) => {
    const open = indexedDB.open('prvnacek');
    open.onsuccess = () => { const r = open.result.transaction('attempts').objectStore('attempts').getAll(); r.onsuccess = () => resolve(r.result); };
  }));

const open = async (page: Page, testId: string) => {
  await unlockAll(page);
  await page.getByTestId('lesson-row').getByRole('button').filter({ hasText: /^I$/ }).click();
  await page.getByTestId(testId).click();
};

test('A7 Čti slovo: slovo s obloučky, výběr obrázku, zápis A7, zvuk až po odpovědi', async ({ page }) => {
  await open(page, 'open-readword');
  const act = page.getByTestId('readword-activity');
  await expect(act).toBeVisible();
  const words = await page.evaluate(async () => (await (await fetch('content/words.json')).json()).words);
  const total = Number(await act.getAttribute('data-total'));
  expect(total).toBeGreaterThanOrEqual(3);
  const target = (await act.getAttribute('data-target'))!;
  const w = words.find((x: { id: string }) => x.id === target);
  await expect(page.getByTestId('word-syll')).toHaveCount(w.syllablesText.length);
  await expect(page.locator('.word-arcs svg path')).toHaveCount(w.syllablesText.length);
  await expect(page.getByTestId('choices')).toHaveCount(0); // obrázky až po přečtení
  await page.getByTestId('read-done').click();
  await expect(page.locator('[data-word]')).toHaveCount(3);
  const wrong = page.locator(`[data-word]:not([data-word="${target}"])`).first();
  await wrong.click();
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'povzbuzeni');
  await page.locator(`[data-word="${target}"]`).click();
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'radost');
  await expect.poll(async () => (await attempts(page)).filter((a) => a.activity === 'A7').map((a) => [a.itemId, a.correct])).toEqual([[target, false], [target, true]]);
  await page.getByRole('button', { name: /Dál/ }).click();
  await expect(page.getByTestId('progress')).toHaveText(new RegExp(`^Úloha 2 z ${total + 1}$`)); // chybné slovo se zopakuje
});

test('nabídka: Čti slovo je v lekci M zamčená (málo slov s obrázkem)', async ({ page }) => {
  await unlockAll(page);
  await page.getByTestId('lesson-row').getByRole('button').filter({ hasText: /^M$/ }).click();
  await expect(page.getByTestId('open-readword')).toBeDisabled();
});
