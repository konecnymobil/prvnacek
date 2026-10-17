import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

test.use({ serviceWorkers: 'block' });

type Counts = Record<string, number>;
const STORES = ['attempts', 'events', 'lessonStates', 'settings', 'recordings'];

/** Stará DB v1 aplikace (verze 2) se vším: pokusy, události, lekce, nastavení (písmo, jméno, album, pexeso, zkoušky), nahrávka. */
async function seedLegacy(page: Page) {
  await page.goto('./licenses/OFL.txt'); // stejný origin, appka neběží
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('prvnacek', 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('attempts', { keyPath: 'id', autoIncrement: true }).createIndex('byLesson', ['orderId', 'lessonId']);
        d.createObjectStore('lessonStates', { keyPath: 'key' });
        d.createObjectStore('recordings', { keyPath: 'audioId' });
        d.createObjectStore('settings');
        d.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(['attempts', 'events', 'lessonStates', 'settings', 'recordings'], 'readwrite');
    const now = Date.now();
    for (let i = 0; i < 3; i++) tx.objectStore('attempts').add({ orderId: 'duha', lessonId: 'duha-1', activity: 'A2', itemId: 'l-m', correct: i > 0, chosenId: 'l-m', at: now - i * 1000, day: '2026-10-16' });
    tx.objectStore('events').add({ kind: 'test', at: now, day: '2026-10-16', lessonId: 'duha-1' });
    tx.objectStore('lessonStates').put({ key: 'duha:duha-1', orderId: 'duha', lessonId: 'duha-1', status: 'approved', updatedAt: now, approvedAt: now, approvedBy: 'manual' });
    tx.objectStore('lessonStates').put({ key: 'duha:duha-2', orderId: 'duha', lessonId: 'duha-2', status: 'practicing', updatedAt: now, approvedAt: null, approvedBy: null });
    tx.objectStore('settings').put({ allowed: { cursive: true }, def: 'cursive', current: null }, 'script');
    tx.objectStore('settings').put('Anička', 'childName');
    tx.objectStore('settings').put([{ id: 'beruska', at: now }], 'album:owned');
    tx.objectStore('settings').put([{ at: now, pairs: 3, stars: 3, flips: 6 }], 'pexeso:games');
    tx.objectStore('settings').put([{ at: now, lessonId: 'duha-1', score: 5, total: 5 }], 'tests:duha:duha-1');
    tx.objectStore('recordings').put({ audioId: 'snd-l-m', data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'audio/mp4', createdAt: now });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  });
}

const counts = (page: Page, name: string) => page.evaluate(async ([name, stores]) => {
  const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); });
  const out: Record<string, number> = {};
  for (const s of stores) {
    if (!db.objectStoreNames.contains(s)) { out[s] = -1; continue; }
    out[s] = await new Promise<number>((res) => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => res(q.result); });
  }
  db.close();
  return out;
}, [name, STORES] as [string, string[]]);

const device = (page: Page) => page.evaluate(async () => {
  const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek-device'); r.onsuccess = () => res(r.result); });
  const all = <T,>(s: string) => new Promise<T[]>((res) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result as T[]); });
  const get = (s: string, k: string) => new Promise<unknown>((res) => { const q = db.transaction(s).objectStore(s).get(k); q.onsuccess = () => res(q.result); });
  const r = {
    profiles: await all<{ id: string; dbName: string; name: string }>('profiles'),
    active: (await get('meta', 'activeChildId')) as string,
    migrated: !!(await get('meta', 'migratedV1')),
    snapshot: (await get('snapshots', 'pre-m5')) as { at: number; json: string } | undefined,
  };
  db.close();
  return r;
});

const LEGACY: Counts = { attempts: 3, events: 1, lessonStates: 2, settings: 5, recordings: 1 };

async function passGate(page: Page) {
  await page.getByTestId('open-parent').click();
  await page.getByTestId('gate-hold').hover();
  await page.mouse.down(); await page.waitForTimeout(3300); await page.mouse.up();
  const q = (await page.getByTestId('gate-question').textContent())!;
  const [x, y] = q.split('=')[0].split('+').map((v) => parseInt(v, 10));
  await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${x + y}$`) }).click();
  await expect(page.getByTestId('parent-home')).toBeVisible();
}

test('migrace v1 → první profil: nic se neztratí, snímek, idempotence', async ({ page }) => {
  await seedLegacy(page);
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await expect.poll(async () => (await device(page)).migrated).toBe(true);
  const d = await device(page);
  expect(d.profiles).toHaveLength(1);
  expect(d.profiles[0].dbName).toBe('prvnacek');
  expect(d.active).toBe(d.profiles[0].id);
  expect(await counts(page, 'prvnacek')).toEqual(LEGACY);
  const snap = JSON.parse(d.snapshot!.json);
  expect([snap.attempts.length, snap.events.length, snap.lessonStates.length, snap.settings.length, snap.recordings.length]).toEqual([3, 1, 2, 5, 1]);
  await expect(page.locator('.lesson-row [data-locked="false"]')).toHaveCount(2); // schválená + odemčená lekce platí dál
  // idempotence: další starty nic nemění
  await page.reload(); await page.reload();
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  const d2 = await device(page);
  expect(d2.profiles).toEqual(d.profiles);
  expect(d2.snapshot!.at).toBe(d.snapshot!.at);
  expect(await counts(page, 'prvnacek')).toEqual(LEGACY);
  // snímek ke stažení v rodičovské sekci
  await passGate(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('snapshot-download').click()]);
  expect(dl.suggestedFilename()).toMatch(/pred-profily/);
});

test('přerušená migrace (snímek hotový, profil ne) se při startu dokončí', async ({ page }) => {
  await seedLegacy(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => {
      const r = indexedDB.open('prvnacek-device', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('profiles', { keyPath: 'id' }); r.result.createObjectStore('meta'); r.result.createObjectStore('snapshots', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
    });
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put({ id: 'pre-m5', at: 12345, json: '{"seeded":true}' });
    await new Promise((r) => { tx.oncomplete = r; }); db.close();
  });
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await expect.poll(async () => (await device(page)).migrated).toBe(true);
  const d = await device(page);
  expect(d.profiles).toHaveLength(1);
  expect(d.snapshot!.at).toBe(12345); // snímek se nepřepsal
  expect(await counts(page, 'prvnacek')).toEqual(LEGACY);
});

test('druhé dítě začíná prázdné, nahrávky a pokrok se nemíchají; výběr profilu', async ({ page }) => {
  await seedLegacy(page);
  await page.goto('./');
  await passGate(page);
  await page.getByTestId('profile-new-name').fill('Tonda');
  await page.getByTestId('profile-new-avatar').selectOption('pes');
  await page.getByTestId('profile-add').click();
  await expect(page.getByTestId('profile-row')).toHaveCount(2);
  await page.getByTestId('profile-switch-to').click();
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await expect(page.getByTestId('profile-switch')).toHaveText('🐶');
  await expect(page.locator('.lesson-row [data-locked="false"]')).toHaveCount(1); // nový profil: jen první lekce
  const d = await device(page);
  const tonda = d.profiles.find((p) => p.name === 'Tonda')!;
  expect(d.active).toBe(tonda.id);
  expect(await counts(page, tonda.dbName)).toEqual({ attempts: 0, events: 0, lessonStates: 0, settings: 0, recordings: 0 });
  expect(await counts(page, 'prvnacek')).toEqual(LEGACY);

  // výběr profilu při startu (víc dětí): nové spuštění = nová session
  const p2 = await page.context().newPage();
  await p2.goto('./');
  await expect(p2.getByTestId('profile-picker')).toBeVisible();
  await expect(p2.getByTestId('profile-tile')).toHaveCount(2);
  await p2.getByTestId('profile-tile').first().click();
  await expect(p2.getByTestId('lesson-row')).toBeVisible();
  await expect(p2.getByTestId('profile-switch')).toHaveText('🐧');
  await expect(p2.locator('.lesson-row [data-locked="false"]')).toHaveCount(2);
});

test('zálohy: import v1 a v2 do aktivního profilu, v3 tam a zpět se všemi profily, smazání ve 2 krocích', async ({ page }, info) => {
  await seedLegacy(page);
  await page.goto('./');
  await passGate(page);
  await page.getByTestId('profile-new-name').fill('Ema');
  await page.getByTestId('profile-add').click();
  await page.getByTestId('profile-switch-to').click();
  await passGate(page);
  const ema = (await device(page)).profiles.find((p) => p.name === 'Ema')!;
  // v1 (bez events) a v2 → do aktivního profilu (Ema), první dítě beze změny
  for (const v of [1, 2]) {
    const f = info.outputPath(`v${v}.json`);
    const b: Record<string, unknown> = { format: 'prvnacek-backup', version: v, exportedAt: new Date().toISOString(),
      attempts: [{ id: 1, orderId: 'duha', lessonId: 'duha-1', activity: 'A2', itemId: 'l-a', correct: true, chosenId: 'l-a', at: 1, day: '2026-10-01' }],
      lessonStates: [], settings: [{ key: 'childName', value: `V${v}` }], recordings: [] };
    if (v === 2) b.events = [{ id: 1, kind: 'test', at: 1, day: '2026-10-01' }];
    fs.writeFileSync(f, JSON.stringify(b));
    await page.getByTestId('backup-file').setInputFiles(f);
    await expect(page.getByTestId('import-confirm')).toContainText('aktuálního profilu');
    await page.getByTestId('import-confirm-yes').click();
    await expect(page.getByTestId('backup-msg')).toContainText('obnovena');
    expect((await counts(page, ema.dbName)).attempts).toBe(1);
    expect((await counts(page, ema.dbName)).events).toBe(v === 2 ? 1 : 0);
  }
  expect(await counts(page, 'prvnacek')).toEqual(LEGACY);
  // v3 export → smazat Emu (2 kroky) → import → Ema i její data zpět
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()]);
  const path = info.outputPath('v3.json'); await dl.saveAs(path);
  const v3 = JSON.parse(fs.readFileSync(path, 'utf8'));
  expect(v3.version).toBe(3);
  expect(v3.profiles).toHaveLength(2);
  const row = page.locator(`[data-testid="profile-row"][data-child="${ema.id}"]`);
  await row.getByTestId('profile-delete').click();
  await expect((await device(page)).profiles).toHaveLength(2); // první krok nic nemaže
  await row.getByTestId('profile-delete-yes').click();
  await expect(page.getByTestId('lesson-row')).toBeVisible(); // smazán aktivní → přepnuto na první dítě
  expect((await device(page)).profiles).toHaveLength(1);
  await passGate(page);
  await page.getByTestId('backup-file').setInputFiles(path);
  await expect(page.getByTestId('import-confirm')).toContainText('profilů: 2');
  await page.getByTestId('import-confirm-yes').click();
  await expect(page.getByTestId('lesson-row').or(page.getByTestId('backup-msg'))).toBeVisible();
  await expect.poll(async () => (await device(page)).profiles.length).toBe(2);
  expect((await counts(page, ema.dbName)).attempts).toBe(1);
  expect(await counts(page, 'prvnacek')).toEqual(LEGACY);
});
