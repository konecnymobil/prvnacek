import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

const attempts = (page: Page) =>
  page.evaluate(() => new Promise<{ activity: string; itemId: string; chosenId: string; correct: boolean }[]>((resolve) => {
    const open = indexedDB.open('prvnacek');
    open.onsuccess = () => { const r = open.result.transaction('attempts').objectStore('attempts').getAll(); r.onsuccess = () => resolve(r.result); };
  }));

const start = async (page: Page) => {
  await unlockAll(page);
  await page.getByTestId('lesson-row').getByRole('button').filter({ has: page.locator('[data-script="upperPrint"]', { hasText: /^I$/ }) }).click();
  await page.getByTestId('open-compose').click();
  const act = page.getByTestId('compose-activity');
  await expect(act).toBeVisible();
  const words = await page.evaluate(async () => (await (await fetch('content/words.json')).json()).words);
  const target = (await act.getAttribute('data-target'))!;
  return { act, target, word: words.find((x: { id: string }) => x.id === target) as { syllableIds: string[]; text: string } };
};

test('Slož slovo: klepání – chyba bez trestu, správné složení ukáže obrázek a zapíše A5c', async ({ page }) => {
  const { word, target } = await start(page);
  await expect(page.getByTestId('picture')).toHaveCount(0);
  await expect(page.getByTestId('slot')).toHaveCount(word.syllableIds.length);
  // špatná slabika: žádný zápis do políčka, mascot povzbuzuje (jen když je rozptylovač; první úlohy ho nemají → vezmi druhou slabiku)
  const wrongId = word.syllableIds.find((s) => s !== word.syllableIds[0]);
  if (wrongId) {
    await page.locator(`[data-syllable="${wrongId}"]`).first().click();
    await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'povzbuzeni');
    await expect(page.getByTestId('slot').first()).toHaveAttribute('data-filled', '');
  }
  for (const sid of word.syllableIds) await page.locator(`[data-syllable="${sid}"]:not([disabled])`).first().click();
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'radost');
  await expect(page.getByTestId('picture')).toBeVisible();
  await expect(page.getByTestId('slots')).toContainText(word.text.replace(/\s/g, '').slice(0, 1));
  await expect.poll(async () => (await attempts(page)).filter((a) => a.activity === 'A5c' && a.correct).length).toBe(word.syllableIds.length);
  if (wrongId) expect((await attempts(page)).filter((a) => a.activity === 'A5c' && !a.correct).map((a) => a.itemId)).toEqual([target]);
  await page.getByRole('button', { name: /Dál/ }).click();
  await expect(page.getByTestId('progress')).toHaveText(/^Úloha 2 z \d+$/);
});

test('Slož slovo: rozptylovač (od 3. úlohy) se vrátí, správné složení se zapíše', async ({ page }) => {
  await start(page);
  for (let i = 0; i < 2; i++) {
    const t = (await page.getByTestId('compose-activity').getAttribute('data-target'))!;
    const w = (await page.evaluate(async () => (await (await fetch('content/words.json')).json()).words)).find((x: { id: string }) => x.id === t);
    for (const sid of w.syllableIds) await page.locator(`[data-syllable="${sid}"]:not([disabled])`).first().click();
    await page.getByRole('button', { name: /Dál/ }).click();
  }
  const t = (await page.getByTestId('compose-activity').getAttribute('data-target'))!;
  const w = (await page.evaluate(async () => (await (await fetch('content/words.json')).json()).words)).find((x: { id: string }) => x.id === t);
  const cards = await page.locator('[data-syllable]').evaluateAll((els) => els.map((e) => e.getAttribute('data-syllable')!));
  expect(cards.length).toBeGreaterThan(w.syllableIds.length);
  const distractor = cards.find((c) => !w.syllableIds.includes(c))!;
  await page.locator(`[data-syllable="${distractor}"]`).click();
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'povzbuzeni');
  await expect(page.getByTestId('slot').first()).toHaveAttribute('data-filled', '');
  for (const sid of w.syllableIds) await page.locator(`[data-syllable="${sid}"]:not([disabled])`).first().click();
  await expect(page.getByTestId('picture')).toBeVisible();
  await expect.poll(async () => (await attempts(page)).some((a) => a.activity === 'A5c' && a.chosenId === distractor && !a.correct)).toBe(true);
});

test('Slož slovo: přetažení karty do políčka (pointer events)', async ({ page }) => {
  const { word } = await start(page);
  for (const sid of word.syllableIds) {
    const card = page.locator(`[data-syllable="${sid}"]:not([disabled])`).first();
    const cb = (await card.boundingBox())!;
    const sb = (await page.getByTestId('slots').boundingBox())!;
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await page.mouse.down();
    await page.mouse.move(cb.x + cb.width / 2 + 30, cb.y + cb.height / 2 - 30, { steps: 4 });
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.getByTestId('picture')).toBeVisible();
  await expect.poll(async () => (await attempts(page)).filter((a) => a.activity === 'A5c' && a.correct).length).toBe(word.syllableIds.length); // žádné dvojité započtení (drag + click)
});

test('Slož slovo: kolo skončí a lze ho opakovat; A5 historie se počítá v tabulce', async ({ page }) => {
  await start(page);
  const total = Number(await page.getByTestId('compose-activity').getAttribute('data-total'));
  const words = await page.evaluate(async () => (await (await fetch('content/words.json')).json()).words);
  for (let i = 0; i < total; i++) {
    const t = (await page.getByTestId('compose-activity').getAttribute('data-target'))!;
    const w = words.find((x: { id: string }) => x.id === t);
    for (const sid of w.syllableIds) await page.locator(`[data-syllable="${sid}"]:not([disabled])`).first().click();
    await page.getByRole('button', { name: /Dál/ }).click();
  }
  await expect(page.getByTestId('round-end')).toBeVisible();
  await page.getByTestId('again').click();
  await expect(page.getByTestId('compose-activity')).toBeVisible();
});
