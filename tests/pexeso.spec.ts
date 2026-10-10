import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

const setApproved = (page: Page, upTo: number) =>
  page.evaluate(async (n) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction('lessonStates', 'readwrite');
    for (let i = 1; i <= n; i++) tx.objectStore('lessonStates').put({ key: `duha:duha-${i}`, orderId: 'duha', lessonId: `duha-${i}`, status: 'approved', updatedAt: Date.now(), approvedAt: Date.now(), approvedBy: 'manual' });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  }, upTo);

const games = (page: Page) =>
  page.evaluate(() => new Promise<{ pairs: number; stars: number }[]>((resolve) => {
    const open = indexedDB.open('prvnacek');
    open.onsuccess = () => { const r = open.result.transaction('settings').objectStore('settings').get('pexeso:games'); r.onsuccess = () => resolve(r.result ?? []); };
  }));

const firstSyl = async (page: Page, ids: string[]) => {
  const words = (await (await page.request.get('./content/words.json')).json()).words as { id: string; firstSyllableId: string }[];
  return ids.map((id) => words.find((w) => w.id === id)!.firstSyllableId);
};

test('Pexeso: skryté bez 3 dvojic, nabídka úrovní podle odemčených lekcí', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await expect(page.getByTestId('open-pexeso')).toHaveCount(0);
  await setApproved(page, 4); // odemčena lekce 5 (4 dvojice)
  await page.reload();
  await page.getByTestId('open-pexeso').click();
  await expect(page.getByTestId('pex-level-3')).toBeVisible();
  await expect(page.getByTestId('pex-level-6')).toHaveCount(0);
});

test('Pexeso: 6 dvojic, různé první slabiky, nepár se otočí zpět, shoda zůstane, konec se hvězdami a zápis', async ({ page }) => {
  await unlockAll(page);
  await page.getByTestId('open-pexeso').click();
  await page.getByTestId('pex-level-6').click();
  const cards = page.locator('[data-card]');
  await expect(cards).toHaveCount(12);
  const box = await cards.first().boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(88);
  expect(box!.height).toBeGreaterThanOrEqual(88);
  const wordIds = [...new Set(await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-word')!)))];
  expect(wordIds).toHaveLength(6);
  expect(new Set(await firstSyl(page, wordIds)).size).toBe(6);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);

  // nepár: obrázek prvního slova + slabika jiného slova
  const pic = page.locator(`[data-word="${wordIds[0]}"][data-face="picture"]`);
  const other = page.locator(`[data-word="${wordIds[1]}"][data-face="syllable"]`);
  await pic.click(); await other.click();
  await expect(pic).toHaveAttribute('data-state', 'open');
  await expect(pic).toHaveAttribute('data-state', 'back', { timeout: 4000 });
  await expect(other).toHaveAttribute('data-state', 'back');

  // shoda zůstane odkrytá
  await pic.click(); await page.locator(`[data-word="${wordIds[0]}"][data-face="syllable"]`).click();
  await expect(pic).toHaveAttribute('data-state', 'matched');
  await expect(page.getByTestId('pex-progress')).toContainText('1 z 6');

  for (const id of wordIds.slice(1)) {
    await page.locator(`[data-word="${id}"][data-face="picture"]`).click();
    await page.locator(`[data-word="${id}"][data-face="syllable"]`).click();
  }
  await expect(page.getByTestId('pex-end')).toBeVisible();
  await expect(page.getByTestId('pex-stars')).toHaveAttribute('data-stars', '3');
  await expect.poll(async () => (await games(page)).length).toBe(1);
  expect((await games(page))[0]).toMatchObject({ pairs: 6, stars: 3 });
  // nezapočítává se jako pokus
  const attempts = await page.evaluate(() => new Promise<number>((resolve) => { const o = indexedDB.open('prvnacek'); o.onsuccess = () => { const r = o.result.transaction('attempts').objectStore('attempts').count(); r.onsuccess = () => resolve(r.result); }; }));
  expect(attempts).toBe(0);
});

test('Pexeso: 3 dvojice = 6 karet a nikdy dvě slova se stejnou první slabikou (opakovaně)', async ({ page }) => {
  await unlockAll(page);
  for (let i = 0; i < 8; i++) {
    await page.getByTestId('open-pexeso').click();
    await page.getByTestId('pex-level-3').click();
    const ids = [...new Set(await page.locator('[data-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-word')!)))];
    expect(ids).toHaveLength(3);
    expect(new Set(await firstSyl(page, ids)).size).toBe(3);
    await page.getByRole('button', { name: 'Zpět' }).click();
  }
});
