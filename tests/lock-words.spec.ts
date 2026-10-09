import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

const tile = (page: Page, letter: string) => page.getByTestId('lesson-row').getByRole('button').filter({ hasText: new RegExp(`^${letter}$`) });

async function passGate(page: Page) {
  await page.getByTestId('open-parent').click();
  await page.getByTestId('gate-hold').hover();
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  const q = (await page.getByTestId('gate-question').textContent())!;
  const [a, b] = q.split('=')[0].split('+').map((x) => parseInt(x, 10));
  await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${a + b}$`) }).click();
  await expect(page.getByTestId('parent-home')).toBeVisible();
}

const putSetting = (page: Page, key: string, value: unknown) =>
  page.evaluate(async ([k, v]) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(v, k as string);
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  }, [key, value] as const);

const attempts = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all: { activity: string; itemId: string; correct: boolean }[] = await new Promise((res) => { const q = db.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result); });
    db.close();
    return all;
  });

test('zamykání: další lekce je zamčená, rodič ji odemkne ručně', async ({ page }) => {
  await page.goto('./');
  await expect(tile(page, 'M')).toHaveAttribute('data-locked', 'false');
  await expect(tile(page, 'A')).toHaveAttribute('data-locked', 'true');
  await tile(page, 'A').click({ force: true });
  await expect(page.getByTestId('lock-hint')).toBeVisible();
  await expect(page.getByTestId('lesson-menu')).toHaveCount(0);
  await passGate(page);
  await expect(page.getByTestId('unlock-duha-1')).toHaveCount(0);
  await page.getByTestId('unlock-duha-2').click();
  await expect(page.getByTestId('unlock-duha-2')).toHaveCount(0);
  await page.getByRole('button', { name: /Konec rodičovské části/ }).click();
  await expect(tile(page, 'A')).toHaveAttribute('data-locked', 'false');
  await expect(tile(page, 'L')).toHaveAttribute('data-locked', 'true');
  await tile(page, 'A').click();
  await expect(page.getByTestId('lesson-menu')).toBeVisible();
});

test('chybné položky ze zkoušky se vracejí do procvičování', async ({ page }) => {
  await unlockAll(page);
  // dítě se ve zkoušce lekce L spletlo v písmenu M (z dřívější lekce) – v běžné lekci L by M nepadlo
  await putSetting(page, 'tests:duha:duha-3', [{ at: Date.now(), lessonId: 'duha-3', score: 4, total: 6, newLetterErrors: 0, recommendApprove: false, errors: [{ text: 'M', type: 'review', reason: 'confused', refId: 'l-m', reviewKind: 'letter' }] }]);
  await tile(page, 'L').click();
  await page.getByRole('button', { name: /Najdi písmeno/ }).click();
  await expect(page.getByTestId('letter-activity')).toHaveAttribute('data-target', 'l-m');
  // správná odpověď „odškrtne“ položku – příště už není přednostní
  await page.locator('[data-letter="l-m"]').click();
  await expect.poll(async () => (await attempts(page)).some((a) => a.itemId === 'l-m' && a.correct)).toBe(true);
});

test('Slovo k obrázku: poslech, kontrola odpovědi, pokrok do IndexedDB', async ({ page }) => {
  await unlockAll(page);
  await tile(page, 'L').click();
  await page.getByTestId('open-words').click();
  const act = page.getByTestId('word-activity');
  await expect(act).toBeVisible();
  const target = (await act.getAttribute('data-target'))!;
  const wrong = page.locator(`[data-word]:not([data-word="${target}"])`).first();
  await wrong.click();
  await expect(page.getByTestId('feedback')).toContainText('Skoro');
  await page.locator(`[data-word="${target}"]`).click();
  await expect(page.getByTestId('feedback')).toContainText('Správně');
  await expect.poll(async () => (await attempts(page)).filter((a) => a.activity === 'A5').map((a) => [a.itemId, a.correct])).toEqual([[target, false], [target, true]]);
  await page.getByRole('button', { name: /Dál/ }).click();
  await expect(page.getByTestId('progress')).toHaveText('Úloha 2 z 6');
});

test('lekce I: stejné aktivity fungují jen z obsahu', async ({ page }) => {
  await unlockAll(page);
  await tile(page, 'I').click();
  await expect(page.getByTestId('lesson-menu')).toBeVisible();
  await page.getByRole('button', { name: /Slož slabiku/ }).click();
  await expect(page.getByTestId('feedback')).toBeVisible();
  await page.getByRole('button', { name: 'Zpět' }).first().click();
  await page.getByTestId('open-words').click();
  await expect(page.getByTestId('word-activity')).toBeVisible();
  await page.getByRole('button', { name: 'Zpět' }).first().click();
  await page.getByRole('button', { name: /Najdi písmeno/ }).click();
  await expect(page.getByTestId('letter-activity')).toBeVisible();
});
