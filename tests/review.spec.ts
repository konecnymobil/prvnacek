import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const setStates = (page: Page, approved: string[]) =>
  page.evaluate(async (ids) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction('lessonStates', 'readwrite');
    for (const id of ids) tx.objectStore('lessonStates').put({ key: `duha:${id}`, orderId: 'duha', lessonId: id, status: 'approved', updatedAt: Date.now(), approvedAt: Date.now(), approvedBy: 'manual' });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  }, approved);

const attempts = (page: Page) =>
  page.evaluate(() => new Promise<{ activity: string; itemId: string; lessonId: string; correct: boolean; source?: string }[]>((resolve) => {
    const open = indexedDB.open('prvnacek');
    open.onsuccess = () => { const r = open.result.transaction('attempts').objectStore('attempts').getAll(); r.onsuccess = () => resolve(r.result); };
  }));

test('Opakování: skryté bez 2 schválených lekcí, jinak 5 úloh z více lekcí jen z probraného, pokrok se zapíše', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await expect(page.getByTestId('open-review')).toHaveCount(0);
  await setStates(page, ['duha-1', 'duha-2', 'duha-3', 'duha-4', 'duha-5', 'duha-6']);
  await page.reload();
  await page.getByTestId('open-review').click();

  const lessons = new Set<string>();
  const targets: string[] = [];
  for (let i = 0; i < 5; i++) {
    const act = page.getByTestId('review-activity');
    await expect(act).toBeVisible();
    await expect(act).toHaveAttribute('data-total', '5');
    lessons.add((await act.getAttribute('data-lesson'))!);
    const target = (await act.getAttribute('data-target'))!;
    targets.push(target);
    const wrongBtn = page.locator(`[data-choice]:not([data-choice="${target}"])`).first();
    if (i === 0) { await wrongBtn.click(); await expect(page.getByTestId('feedback')).toContainText('Skoro'); await expect(page.getByTestId('next')).toHaveCount(0); }
    await page.locator(`[data-choice="${target}"]`).click();
    await page.getByTestId('next').click();
  }
  await expect(page.getByTestId('round-end')).toBeVisible();
  expect(new Set(targets).size).toBe(5);
  expect(lessons.size).toBeGreaterThan(1);
  for (const l of lessons) expect(['duha-1', 'duha-2', 'duha-3', 'duha-4', 'duha-5', 'duha-6']).toContain(l);

  const at = await attempts(page);
  expect(at.length).toBe(6);
  expect(at.every((a) => a.source === 'review' && ['A2', 'A4', 'A7'].includes(a.activity))).toBe(true);
  expect(at.filter((a) => !a.correct).length).toBe(1);
});
