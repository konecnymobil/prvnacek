import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { SYNC_PORT } from '../playwright.config';

test.use({ serviceWorkers: 'block' });
const SERVER = `http://localhost:${SYNC_PORT}`;
const DATA = path.resolve('.sync-test-data');

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

/** Přidá pokus (a volitelně stav lekce a nahrávku) do DB prvního dítěte. */
const seed = (page: Page, itemId: string, extra: boolean) => page.evaluate(async ({ itemId, extra }) => {
  const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction(['attempts', 'lessonStates', 'recordings'], 'readwrite');
  tx.objectStore('attempts').add({ orderId: 'duha', lessonId: 'duha-1', activity: 'A2', itemId, correct: true, chosenId: itemId, at: Date.now(), day: '2026-10-17' });
  if (extra) {
    tx.objectStore('lessonStates').put({ key: 'duha:duha-2', orderId: 'duha', lessonId: 'duha-2', status: 'approved', updatedAt: Date.now(), approvedAt: Date.now(), approvedBy: 'manual' });
    tx.objectStore('recordings').put({ audioId: 'snd-l-m', data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'audio/mpeg', createdAt: 1 });
  }
  await new Promise((r) => { tx.oncomplete = r; });
  db.close();
}, { itemId, extra });

const read = (page: Page) => page.evaluate(async () => {
  const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = (s: string) => new Promise<unknown[]>((res) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); });
  const out = { attempts: ((await all('attempts')) as { itemId: string }[]).map((a) => a.itemId).sort(), states: ((await all('lessonStates')) as { key: string; status: string }[]).map((s) => `${s.key}=${s.status}`), recordings: (await all('recordings')).length };
  db.close(); return out;
});
const profileIds = (page: Page) => page.evaluate(async () => {
  const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek-device'); r.onsuccess = () => res(r.result); });
  const ids = await new Promise<string[]>((res) => { const r = db.transaction('profiles').objectStore('profiles').getAllKeys(); r.onsuccess = () => res(r.result as string[]); });
  db.close(); return ids;
});
function serverFiles(dir = DATA): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? serverFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

test('dvě zařízení si přes náš server předají pokrok; server ukládá jen šifru', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctxA = await browser.newContext(); const ctxB = await browser.newContext();
  const a = await ctxA.newPage(); const b = await ctxB.newPage();

  // A: ve výchozím stavu vypnuto, založí rodinu
  await passGate(a);
  await expect(a.getByTestId('sync-panel')).toContainText('Ve výchozím stavu je vypnuto');
  await expect(a.getByTestId('sync-status')).toHaveCount(0);
  await expect(a.getByTestId('sync-panel')).not.toContainText(/MiniPC|Home Assistant/i);
  await seed(a, 'l-m', true);
  await a.getByTestId('sync-url').fill(SERVER);
  await a.getByTestId('sync-create').click();
  await expect(a.getByTestId('sync-msg')).toContainText('Rodina založena', { timeout: 15000 });
  await a.getByTestId('sync-pair').click();
  const code = (await a.getByTestId('sync-code-value').textContent())!;
  expect(code).toMatch(/^[A-Z]{3}-\d{3}-[A-Z]{4}$/);
  await expect(a.getByTestId('sync-pair-code')).toContainText('10 minut');

  // server: jen šifra – žádná id lekcí/položek, jména ani párovací kód
  const files = serverFiles();
  expect(files.some((f) => f.endsWith('log.jsonl'))).toBe(true);
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    for (const plain of ['duha', 'l-m', 'approved', 'attempts', 'lessonStates', code]) expect(t, `${path.basename(f)} obsahuje ${plain}`).not.toContain(plain);
  }
  const entry = JSON.parse(fs.readFileSync(files.find((f) => f.endsWith('log.jsonl'))!, 'utf8').trim().split('\n')[0]);
  expect(Object.keys(entry).sort()).toEqual(['at', 'ct', 'deviceId', 'iv', 'seq']);

  // B: připojí se kódem a dostane pokrok (bez nahrávek), profil dítěte se spáruje
  await passGate(b);
  await b.getByTestId('sync-url').fill(SERVER);
  await b.getByTestId('sync-code').fill(code.toLowerCase().replace(/-/g, ' '));
  await b.getByTestId('sync-join').click();
  await expect(b.getByTestId('sync-msg')).toContainText('staženo ze zařízení: 1', { timeout: 20000 });
  expect(await read(b)).toEqual({ attempts: ['l-m'], states: ['duha:duha-2=approved'], recordings: 0 });
  expect(await profileIds(b)).toEqual(await profileIds(a));

  // kód jde použít jen jednou
  const again = await b.request.get(`${SERVER}/v1/pair/${createHash('sha256').update(`prvnacek-pair:${code}`).digest('hex')}`);
  expect(again.status()).toBe(404);

  // B pokračuje, A si to stáhne; nic se neztratí
  await seed(b, 's-ma', false);
  await b.getByTestId('sync-now').click();
  await expect(b.getByTestId('sync-msg')).toContainText('Hotovo', { timeout: 15000 });
  await a.getByTestId('sync-now').click();
  await expect(a.getByTestId('sync-msg')).toContainText('staženo ze zařízení: 1', { timeout: 15000 });
  expect(await read(a)).toEqual({ attempts: ['l-m', 's-ma'], states: ['duha:duha-2=approved'], recordings: 1 });

  await ctxA.close(); await ctxB.close();
});
