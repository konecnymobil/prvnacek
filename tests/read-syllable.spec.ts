import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

async function openRead(page: Page, letter: string) {
  await unlockAll(page);
  await page.getByTestId('lesson-row').getByRole('button').filter({ has: page.locator('[data-script="upperPrint"]', { hasText: new RegExp(`^${letter}$`) }) }).click();
  await page.getByTestId('open-read').click();
  await expect(page.getByTestId('read-activity')).toBeVisible();
}

const attempts = (page: Page) =>
  page.evaluate(() => new Promise<{ activity: string; itemId: string; correct: boolean }[]>((resolve) => {
    const open = indexedDB.open('prvnacek');
    open.onsuccess = () => { const r = open.result.transaction('attempts').objectStore('attempts').getAll(); r.onsuccess = () => resolve(r.result); };
  }));

test('A6: slabika s obloučkem, špatně povzbudí, správně pochválí, zapíše se A6; jen použitelné slabiky', async ({ page }) => {
  await openRead(page, 'L');
  const usable = await page.evaluate(async () => (await (await fetch('content/syllables.json')).json()).syllables.filter((s: { usableInSyllableTasks: boolean }) => s.usableInSyllableTasks).map((s: { id: string }) => s.id));
  for (let i = 0; i < 3; i++) {
    const act = page.getByTestId('read-activity');
    const target = (await act.getAttribute('data-target'))!;
    expect(usable).toContain(target);
    await expect(page.getByTestId('syllable-arc')).toBeVisible();
    await expect(page.locator('.syll-arc svg path')).toHaveCount(1);
    await page.getByTestId('read-done').click();
    const ids = await page.getByTestId('opt-pick').evaluateAll((els) => els.map((e) => e.getAttribute('data-opt')));
    expect(ids).toHaveLength(3);
    for (const id of ids) expect(usable).toContain(id);
    expect(ids).toContain(target);
    if (i === 0) {
      const wrong = ids.find((id) => id !== target)!;
      await page.locator(`[data-opt="${wrong}"]`).click();
      await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'povzbuzeni');
    }
    await page.locator(`[data-opt="${target}"]`).click();
    await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'radost');
    await expect.poll(async () => (await attempts(page)).filter((a) => a.activity === 'A6' && a.correct).length).toBe(i + 1);
    await page.getByRole('button', { name: /Dál/ }).click();
  }
  const all = await attempts(page);
  expect(all.every((a) => a.activity === 'A6')).toBe(true);
  expect(all.filter((a) => !a.correct)).toHaveLength(1);
});

test('A6: nabídka je zamčená v lekci M (málo slabik)', async ({ page }) => {
  await unlockAll(page);
  await page.getByTestId('lesson-row').getByRole('button').filter({ has: page.locator('[data-script="upperPrint"]', { hasText: /^M$/ }) }).click();
  await expect(page.getByTestId('open-read')).toBeDisabled();
});

