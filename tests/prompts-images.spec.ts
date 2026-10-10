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

  // nové obrázky: každé složené slovo musí ukázat načtený obrázek (Slož slovo)
  await page.getByTestId('open-compose').click();
  const total = Number(await page.getByTestId('compose-activity').getAttribute('data-total'));
  const loaded = new Set<string>();
  const words = await page.evaluate(async () => (await (await fetch('content/words.json')).json()).words);
  for (let i = 0; i < total; i++) {
    const t = (await page.getByTestId('compose-activity').getAttribute('data-target'))!;
    const w = words.find((x: { id: string }) => x.id === t);
    for (const sid of w.syllableIds) await page.locator(`[data-syllable="${sid}"]:not([disabled])`).first().click();
    const img = page.getByTestId('picture');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    loaded.add((await img.getAttribute('src'))!);
    await page.getByRole('button', { name: /Dál/ }).click();
  }
  expect(loaded.size).toBeGreaterThan(3);
});
