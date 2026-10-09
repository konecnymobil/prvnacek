import { expect, type Page } from '@playwright/test';

/** Odemkne všechny lekce přímo v IndexedDB (pro testy aktivit, které nechtějí procházet schvalováním). */
export async function unlockAll(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const ids = ['duha-1','duha-2','duha-3','duha-4','duha-5','duha-6','duha-7','duha-8','duha-9'];
    const tx = db.transaction('lessonStates', 'readwrite');
    for (const id of ids) tx.objectStore('lessonStates').put({ key: `duha:${id}`, orderId: 'duha', lessonId: id, status: 'practicing', updatedAt: Date.now(), approvedAt: null, approvedBy: null });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  });
  await page.reload();
}
