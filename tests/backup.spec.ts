import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.use({ serviceWorkers: 'block' });

async function passGate(page: Page) {
  await page.goto('./');
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

async function seed(page: Page) {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction(['attempts', 'recordings', 'settings'], 'readwrite');
    const at = Date.now();
    const att = (activity: string, itemId: string, chosenId: string | null, correct: boolean) =>
      tx.objectStore('attempts').add({ orderId: 'duha', lessonId: 'duha-1', activity, itemId, correct, chosenId, at, day: '2026-10-09' });
    att('A2', 'l-m', 'l-a', false);
    att('A4', 's-ma', 's-ma', true);
    att('A4', 's-ma', 's-la', false);
    att('A5', 'w-maama', 'w-maama', true);
    att('A6', 's-ma', 's-ma', true);
    att('A6', 's-ma', 's-maa', false);
    tx.objectStore('recordings').put({ audioId: 'snd-l-m', data: new Uint8Array([1, 2, 3, 250, 251]).buffer, mimeType: 'audio/mpeg', createdAt: 1 });
    tx.objectStore('settings').put([{ at: 1, lessonId: 'duha-1', score: 5, total: 6 }], 'tests:duha:duha-1');
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  });
}

async function clearAll(page: Page) {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
    const names = ['attempts', 'recordings', 'settings', 'lessonStates'];
    const tx = db.transaction(names, 'readwrite');
    for (const n of names) tx.objectStore(n).clear();
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  });
}

const counts = (page: Page) => page.evaluate(async () => {
  const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
  const out: Record<string, number> = {};
  for (const n of ['attempts', 'recordings', 'settings']) out[n] = await new Promise((res) => { const r = db.transaction(n).objectStore(n).count(); r.onsuccess = () => res(r.result); });
  const rec = await new Promise<{ data: ArrayBuffer } | undefined>((res) => { const r = db.transaction('recordings').objectStore('recordings').get('snd-l-m'); r.onsuccess = () => res(r.result); });
  out.bytes = rec ? [...new Uint8Array(rec.data)].join(',').length : 0;
  db.close();
  return out;
});

test('tabulka počítá A2, A4 slabiky i A5 slova', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await seed(page);
  await passGate(page);
  const row = page.locator('[data-letter="l-m"]');
  await expect(row.locator('[data-col="A2"]')).toHaveText('0 / 1');
  await expect(row.locator('[data-col="A4"]')).toHaveText('1 / 2');
  await expect(row.locator('[data-col="A5"]')).toHaveText('1 / 1');
  await expect(row.locator('[data-col="A6"]')).toHaveText('1 / 2');
  await expect(row.locator('[data-col="all"]')).toHaveText('3 / 6');
});

test('záloha: export → smazání → import včetně nahrávky, s potvrzením', async ({ page }, info) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await seed(page);
  const before = await counts(page);
  await passGate(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()]);
  expect(dl.suggestedFilename()).toMatch(/^prvnacek-zaloha-\d{4}-\d{2}-\d{2}-v1\.json$/);
  const path = info.outputPath('backup.json');
  await dl.saveAs(path);
  await clearAll(page);
  expect((await counts(page)).attempts).toBe(0);

  await page.getByTestId('backup-file').setInputFiles(path);
  await expect(page.getByTestId('import-confirm')).toContainText('6 pokusů');
  await expect(page.getByTestId('import-confirm')).toContainText('1 nahrávek');
  expect((await counts(page)).attempts).toBe(0); // dokud nepotvrdím, nic se nepřepíše
  await page.getByTestId('import-confirm-yes').click();
  await expect(page.getByTestId('backup-msg')).toContainText('obnovena');
  expect(await counts(page)).toEqual(before);
  await expect(page.locator('[data-letter="l-m"] [data-col="A5"]')).toHaveText('1 / 1'); // stav aplikace se obnovil
});

test('import: zrušení a neplatné soubory', async ({ page }, info) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await seed(page);
  await passGate(page);
  const bad = info.outputPath('bad.json');
  fs.writeFileSync(bad, 'not json');
  await page.getByTestId('backup-file').setInputFiles(bad);
  await expect(page.getByTestId('backup-msg')).toContainText('nejde přečíst');
  fs.writeFileSync(bad, JSON.stringify({ format: 'prvnacek-backup', version: 99, exportedAt: 'x', attempts: [], lessonStates: [], settings: [], recordings: [] }));
  await page.getByTestId('backup-file').setInputFiles(bad);
  await expect(page.getByTestId('backup-msg')).toContainText('novější verze');
  fs.writeFileSync(bad, JSON.stringify({ format: 'prvnacek-backup', version: 1, exportedAt: '2026-10-09T10:00:00Z', attempts: [], lessonStates: [], settings: [], recordings: [] }));
  await page.getByTestId('backup-file').setInputFiles(bad);
  await page.getByTestId('import-confirm-no').click();
  await expect(page.getByTestId('import-confirm')).toHaveCount(0);
  expect((await counts(page)).attempts).toBe(6);
});

for (const persisted of [false, true]) {
  test(`trvalé úložiště: ${persisted ? 'OK' : 'varování'}`, async ({ page }) => {
    await page.addInitScript((p) => {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: async () => p, persist: async () => p, estimate: async () => ({ usage: 2097152, quota: 1073741824 }) } });
    }, persisted);
    await passGate(page);
    await expect(page.getByTestId(persisted ? 'persist-ok' : 'persist-warning')).toBeVisible();
    await expect(page.getByTestId(persisted ? 'persist-warning' : 'persist-ok')).toHaveCount(0);
    if (!persisted) await expect(page.getByTestId('persist-warning')).toContainText('Přidej aplikaci na plochu');
  });
}
