import { expect, test } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

test('Čti slabiku a Čti slovo: pokyn zazní na začátku úlohy, nové obrázky se zobrazí', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('.mp3')) urls.push(r.url()); });
  await unlockAll(page);
  const row = page.getByTestId('lesson-row').getByRole('button').filter({ hasText: /^I$/ });
  await row.click();
  await page.getByTestId('open-read').click();
  await expect(page.getByTestId('read-activity')).toBeVisible();
  await expect.poll(() => urls.some((u) => u.endsWith('snd-p-read-syllable.mp3'))).toBe(true);
  await expect(page.getByTestId('feedback')).toContainText('nahlas'); // text zůstává
  await page.getByRole('button', { name: 'Zpět' }).first().click();
  await page.getByTestId('open-readword').click();
  await expect(page.getByTestId('readword-activity')).toBeVisible();
  await expect.poll(() => urls.some((u) => u.endsWith('snd-p-read-word.mp3'))).toBe(true);
  await page.getByRole('button', { name: 'Zpět' }).first().click();

  // nové obrázky: slova s imageId z dávky 13 musí mít v Slovo k obrázku načtený <img>
  await page.getByTestId('open-words').click();
  const total = Number(await page.getByTestId('word-activity').getAttribute('data-total'));
  const loaded = new Set<string>();
  for (let i = 0; i < total; i++) {
    const t = (await page.getByTestId('word-activity').getAttribute('data-target'))!;
    for (const src of await page.locator('[data-word] img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src))) loaded.add(src);
    expect(await page.locator('[data-word] img').evaluateAll((els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.locator(`[data-word="${t}"]`).click();
    await page.getByRole('button', { name: /Dál/ }).click();
  }
  expect(loaded.size).toBeGreaterThan(9); // dřív bylo obrázků jen 9
});
