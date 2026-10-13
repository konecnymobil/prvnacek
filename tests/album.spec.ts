import { expect, test } from '@playwright/test';
import { SETS, nextSticker, type OwnedSticker } from '../src/album/album';

test('nextSticker: další nezískaná v pořadí sad, bez písmenek a duplicit', () => {
  const o = (id: string): OwnedSticker => ({ childId: 'default', stickerId: id as OwnedSticker['stickerId'], source: 'cviceni', earnedAt: '', seen: true });
  expect(nextSticker([])).toBe('t:1f41e');
  expect(nextSticker([o('t:1f41e'), o('L:M')])).toBe('t:1f98b');
  const all = SETS.filter((s) => !s.special).flatMap((s) => s.items.map((i) => o(i.id)));
  expect(nextSticker(all)).toBeNull();
});

test.describe('album', () => {
  test.use({ serviceWorkers: 'block' });
  test('nová nálepka přiletí, detail, prázdná místa, záloha obsahuje album', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('lesson-row')).toBeVisible();
    await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put([
        { childId: 'default', stickerId: 'L:M', source: 'lekce', earnedAt: '2026-10-01T10:00:00Z', seen: true },
        { childId: 'default', stickerId: 't:1f41e', source: 'cviceni', earnedAt: '2026-10-02T10:00:00Z', seen: false },
      ], 'album:owned');
      await new Promise((r) => { tx.oncomplete = r; });
      db.close();
    });
    await page.reload();
    await page.getByTestId('open-album').click();
    await expect(page.getByTestId('alb-new')).toBeVisible();
    await expect(page.getByTestId('alb-tab-zviratka')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('alb-new')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('[data-sticker="t:1f41e"]')).toHaveClass(/is-new/);
    await expect(page.locator('[data-state="empty"]').first()).toBeVisible();
    await expect(page.getByText(/\d+ ?\/ ?\d+/)).toHaveCount(0);
    await page.locator('[data-sticker="t:1f41e"]').click();
    await expect(page.getByTestId('alb-detail')).toContainText('za dokončené cvičení');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('alb-detail')).toHaveCount(0);
    await page.getByTestId('alb-tab-pismena').click();
    await expect(page.locator('[data-sticker="L:M"]')).toHaveAttribute('data-state', 'own');
    await expect(page.locator('[data-sticker="L:A"]')).toHaveAttribute('data-state', 'empty');
    const seen = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
      const v = await new Promise<{ seen: boolean }[]>((res) => { const q = db.transaction('settings').objectStore('settings').get('album:owned'); q.onsuccess = () => res(q.result); });
      db.close(); return v.every((x) => x.seen);
    });
    expect(seen).toBe(true);
  });

});
