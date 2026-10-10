import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

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
const openParent = async (page: Page) => { await page.goto('./'); await expect(page.getByTestId('lesson-row')).toBeVisible(); await passGate(page); };
const form = (page: Page, f: string) => page.locator(`[data-testid="script-settings"] [data-form="${f}"]`);
const home = async (page: Page) => { await page.getByRole('button', { name: /Konec rodičovské části/ }).click(); await expect(page.getByTestId('lesson-row')).toBeVisible(); };

const idb = <T,>(page: Page, fn: string, arg?: unknown) => page.evaluate(async ([f, a]) => {
  const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
  const get = (store: string, key?: IDBValidKey) => new Promise<unknown>((res) => { const r = key === undefined ? db.transaction(store).objectStore(store).count() : db.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); });
  let out: unknown;
  if (f === 'count') out = await get(a as string);
  else if (f === 'get') out = await get('settings', a as string);
  else if (f === 'rec') out = await get('recordings', a as string);
  db.close();
  return out;
}, [fn, arg] as const) as Promise<T>;

test('písmo: aspoň jeden tvar zůstane, přepínač dítěte se skryje při jediném povoleném', async ({ page }) => {
  await openParent(page);
  await expect(form(page, 'cursive')).toHaveAttribute('aria-pressed', 'true');
  await form(page, 'lowerPrint').click();
  await form(page, 'cursive').click();
  await expect(form(page, 'upperPrint')).toHaveAttribute('aria-pressed', 'true');
  await form(page, 'upperPrint').click(); // poslední – nesmí jít vypnout
  await expect(form(page, 'upperPrint')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('script-msg')).toContainText('Aspoň jeden');
  await home(page);
  await expect(page.getByTestId('script-switch')).toHaveCount(0);
  // zapnu zpět psací → přepínač je vidět
  await page.getByTestId('open-parent').click();
  await page.getByTestId('gate-hold').hover();
  await page.mouse.down(); await page.waitForTimeout(3300); await page.mouse.up();
  const q = (await page.getByTestId('gate-question').textContent())!;
  const [a, b] = q.split('=')[0].split('+').map((x) => parseInt(x, 10));
  await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${a + b}$`) }).click();
  await form(page, 'cursive').click();
  await home(page);
  await expect(page.getByTestId('script-switch')).toBeVisible();
});

test('písmo: dítě přepíná tvary, vykreslí se malé tiskací a psací (Playwrite CZ), uloží se do IndexedDB', async ({ page }) => {
  await page.goto('./');
  const stone = page.getByTestId('lesson-row').getByRole('button').first();
  await expect(stone).toHaveText('M'); // výchozí = velké tiskací
  await page.getByTestId('script-switch').click(); // → malé tiskací
  await expect(stone).toHaveText('m');
  await page.getByTestId('script-switch').click(); // → psací
  await expect(stone).toHaveText('m');
  await expect(stone.locator('.glyph')).toHaveAttribute('data-script', 'cursive');
  expect(await stone.locator('.glyph').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Playwrite CZ');
  expect(await page.evaluate(() => document.documentElement.dataset.pismo)).toBe('psaci');
  const saved = await idb<{ current: string }>(page, 'get', 'script');
  expect(saved.current).toBe('cursive');
  await page.reload();
  await expect(page.getByTestId('lesson-row').getByRole('button').first().locator('.glyph')).toHaveAttribute('data-script', 'cursive');
  // psací tvar i v aktivitě (Á = velké psací písmeno bez rozbití) a ve slabikách
  await unlockAll(page);
  await page.getByTestId('lesson-row').getByRole('button').filter({ hasText: /^m$/ }).first().click();
  await expect(page.getByTestId('lesson-menu').locator('.glyph[data-script="cursive"]').first()).toHaveText('m');
});

test('písmo: výchozí tvar v nastavení rodiče platí hned a zkouška používá stejný tvar', async ({ page }) => {
  await openParent(page);
  await page.locator('[data-testid="script-settings"] [data-def="lowerPrint"]').click();
  await page.getByTestId('start-test-duha-1').click();
  await page.getByTestId('test-start').click();
  await expect(page.getByTestId('test-run')).toBeVisible();
  const t = page.getByTestId('test-text');
  const txt = (await t.textContent())!;
  expect(txt).toBe(txt.toLowerCase());
  await expect(t.locator('.glyph')).toHaveAttribute('data-script', 'lowerPrint');
});

async function seed(page: Page) {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
    const tx = db.transaction(['attempts', 'recordings', 'settings', 'lessonStates'], 'readwrite');
    tx.objectStore('attempts').add({ orderId: 'duha', lessonId: 'duha-1', activity: 'A2', itemId: 'l-m', correct: true, chosenId: 'l-m', at: Date.now(), day: '2026-10-10' });
    tx.objectStore('recordings').put({ audioId: 'snd-l-m', data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'audio/mpeg', createdAt: 1 });
    tx.objectStore('settings').put([{ at: 1, lessonId: 'duha-1', score: 5, total: 6 }], 'tests:duha:duha-1');
    tx.objectStore('settings').put({ allowed: { upperPrint: false, lowerPrint: true, cursive: true }, def: 'cursive', current: null }, 'script');
    tx.objectStore('lessonStates').put({ key: 'duha:duha-2', orderId: 'duha', lessonId: 'duha-2', status: 'practicing', updatedAt: 1, approvedAt: null, approvedBy: null });
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  });
}

test('reset: dvě potvrzení, smaže pokrok a zkoušky, nechá nahrávky a nastavení písma', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await seed(page);
  await page.reload();
  await passGate(page);
  await page.getByTestId('reset-start').click();
  await expect(page.getByTestId('reset-step1')).toBeVisible();
  expect(await idb<number>(page, 'count', 'attempts')).toBe(1);
  await page.getByTestId('reset-next').click();
  const confirm = page.getByTestId('reset-confirm');
  await expect(confirm).toBeDisabled(); // bez opsání slova nejde
  await page.getByTestId('reset-input').fill('smazat');
  await expect(confirm).toBeEnabled();
  expect(await idb<number>(page, 'count', 'attempts')).toBe(1); // pořád nic nesmazáno
  await confirm.click();
  await expect(page.getByTestId('reset-msg')).toContainText('Pokrok je smazaný');
  expect(await idb<number>(page, 'count', 'attempts')).toBe(0);
  expect(await idb<number>(page, 'count', 'lessonStates')).toBe(0);
  expect(await idb<unknown>(page, 'get', 'tests:duha:duha-1')).toBeUndefined();
  expect(await idb<unknown>(page, 'rec', 'snd-l-m')).toBeTruthy();
  const s = await idb<{ def: string; allowed: Record<string, boolean> }>(page, 'get', 'script');
  expect(s.def).toBe('cursive');
  expect(s.allowed.upperPrint).toBe(false);
});

test('reset: zrušení po prvním kroku nic nesmaže; záloha obsahuje nastavení písma', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await seed(page);
  await page.reload();
  await passGate(page);
  await page.getByTestId('reset-start').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('reset-backup').click();
  const file = await (await dl).createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of file) chunks.push(c as Buffer);
  const b = JSON.parse(Buffer.concat(chunks).toString());
  const sc = b.settings.find((x: { key: string }) => x.key === 'script');
  expect(sc.value.def).toBe('cursive');
  await page.getByTestId('reset-cancel').click();
  await expect(page.getByTestId('reset-step1')).toHaveCount(0);
  expect(await idb<number>(page, 'count', 'attempts')).toBe(1);
});
