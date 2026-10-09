import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function openLesson(page: Page, letter: string) {
  await page.goto('./');
  await page.getByTestId('lesson-row').getByRole('button').filter({ hasText: new RegExp(`^${letter}$`) }).click();
  await expect(page.getByTestId('lesson-menu')).toBeVisible();
}

const attempts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ activity: string; itemId: string; correct: boolean; lessonId: string }[]>((resolve, reject) => {
        const open = indexedDB.open('prvnacek');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const r = open.result.transaction('attempts').objectStore('attempts').getAll();
          r.onsuccess = () => resolve(r.result);
        };
      }),
  );

const lessonStatus = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('prvnacek');
        open.onsuccess = () => {
          const r = open.result.transaction('lessonStates').objectStore('lessonStates').getAll();
          r.onsuccess = () => resolve(r.result.map((s: { status: string }) => s.status));
        };
      }),
  );

test('A2: špatná odpověď povzbudí a nic netrestá, správná pochválí; pokrok se zapíše', async ({ page }) => {
  const url = (await page.goto('./'))!.url();
  await openLesson(page, 'E');
  await page.getByRole('button', { name: /Najdi písmeno/ }).click();
  const act = page.getByTestId('letter-activity');
  await expect(act).toBeVisible();
  const target = (await act.getAttribute('data-target'))!;
  expect(target).toBe('l-e');

  // špatně
  await act.locator(`[data-letter]:not([data-letter="${target}"])`).first().click();
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'povzbuzeni');
  await expect(page.getByTestId('feedback')).toContainText('zkus to znovu');
  await expect(page.getByRole('button', { name: /Dál/ })).toHaveCount(0);

  // správně
  await act.locator(`[data-letter="${target}"]`).click();
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'radost');
  await expect(page.getByTestId('feedback')).toContainText('Správně');
  await page.getByRole('button', { name: /Dál/ }).click();
  await expect(page.getByTestId('progress')).toHaveText('Úloha 2 z 6');

  await expect.poll(async () => (await attempts(page)).map((a) => [a.activity, a.itemId, a.correct])).toEqual([
    ['A2', 'l-e', false],
    ['A2', 'l-e', true],
  ]);
  expect(await lessonStatus(page)).toEqual(['practicing']);
  expect(page.url()).toBe(url); // URL se nemění
});

test('A2: celé kolo skončí obrazovkou Hotovo', async ({ page }) => {
  await openLesson(page, 'A');
  await page.getByRole('button', { name: /Najdi písmeno/ }).click();
  for (let i = 0; i < 6; i++) {
    const act = page.getByTestId('letter-activity');
    const target = (await act.getAttribute('data-target'))!;
    await act.locator(`[data-letter="${target}"]`).click();
    await page.getByRole('button', { name: /Dál/ }).click();
  }
  await expect(page.getByTestId('round-end')).toContainText('Napoprvé správně: 6 z 6');
  await page.getByRole('button', { name: 'Zpět na lekci' }).click();
  await expect(page.getByTestId('lesson-menu')).toBeVisible();
  expect((await attempts(page)).length).toBe(6);
});

test('A4: slabiky jsou zamčené v lekci M, v lekci A se skládá MA/MÁ', async ({ page }) => {
  await openLesson(page, 'M');
  await expect(page.getByRole('button', { name: /Slož slabiku/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Zpět' }).click();
  await openLessonByIndex(page, 'A');

  await page.getByRole('button', { name: /Slož slabiku/ }).click();
  const act = page.getByTestId('syllable-activity');
  const target = (await act.getAttribute('data-target'))!;
  expect(['s-ma', 's-maa']).toContain(target);
  const [c, v] = target === 's-ma' ? ['l-m', 'l-a'] : ['l-m', 'l-aa'];
  const wrongV = v === 'l-a' ? 'l-aa' : 'l-a';

  // špatně: správná souhláska, jiná samohláska
  await act.locator(`[data-letter="${c}"]`).click();
  await act.locator(`[data-letter="${wrongV}"]`).click();
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'povzbuzeni');
  await expect(page.locator('[data-slot="0"]')).toHaveText('', { timeout: 3000 }); // sloty se uvolní

  // správně
  await act.locator(`[data-letter="${c}"]`).click();
  await act.locator(`[data-letter="${v}"]`).click();
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-mood', 'radost');
  await expect(page.getByTestId('feedback')).toContainText('Správně');

  await expect.poll(async () => (await attempts(page)).map((a) => [a.activity, a.itemId, a.correct])).toEqual([
    ['A4', target, false],
    ['A4', target, true],
  ]);
});

async function openLessonByIndex(page: Page, letter: string) {
  await page.getByTestId('lesson-row').getByRole('button').filter({ hasText: new RegExp(`^${letter}$`) }).click();
}
