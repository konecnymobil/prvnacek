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

const VARS = ['lower', 'upper', 'cursive', 'cursiveUpper', 'printBoth', 'cursiveBoth', 'all'];
const putScript = async (page: Page, v: unknown) => {
  // počkat, až aplikace sama založí DB (jinak by open() vytvořil prázdnou DB bez storů)
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await page.waitForFunction(() => new Promise<boolean>((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => { const ok = r.result.objectStoreNames.contains('settings'); r.result.close(); res(ok); }; r.onerror = () => res(false); }));
  await putScriptRaw(page, v);
};
const putScriptRaw = (page: Page, v: unknown) => page.evaluate(async (val) => {
  const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
  const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(val, 'script');
  await new Promise((r) => { tx.oncomplete = r; }); db.close();
}, v);

test('písmo: 7 variant, výchozí „Vše“, aspoň jedna zůstane, přepínač dítěte se skryje při jediné povolené', async ({ page }) => {
  await openParent(page);
  await expect(page.locator('[data-testid="script-settings"] [data-form]')).toHaveCount(7);
  await expect(page.locator('[data-testid="script-settings"] [data-def="all"]')).toHaveAttribute('aria-pressed', 'true');
  for (const v of VARS) if (v !== 'upper') await form(page, v).click();
  await expect(form(page, 'upper')).toHaveAttribute('aria-pressed', 'true');
  await form(page, 'upper').click(); // poslední – nesmí jít vypnout
  await expect(form(page, 'upper')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('script-msg')).toContainText('Aspoň jedna');
  await home(page);
  await expect(page.getByTestId('script-switch')).toHaveCount(0);
  const stone = page.getByTestId('lesson-row').getByRole('button').first();
  await expect(stone).toHaveText('M'); // výchozí se opravil na jedinou povolenou
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

test('písmo: dítě cyklí jen povolené varianty, vykreslí velké psací a kombinace, uloží do IndexedDB', async ({ page }) => {
  await page.goto('./');
  const stone = page.getByTestId('lesson-row').getByRole('button').first();
  await expect(stone.locator('.glyph-all')).toHaveCount(1); // výchozí = vše
  const expected: [string, string][] = [['m', 'lowerPrint'], ['M', 'upperPrint'], ['m', 'cursive'], ['M', 'cursiveUpper']];
  for (const [t, k] of expected) {
    await page.getByTestId('script-switch').click();
    await expect(stone).toHaveText(t);
    await expect(stone.locator('.glyph')).toHaveAttribute('data-script', k);
  }
  expect(await stone.locator('.glyph').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Playwrite CZ');
  await page.getByTestId('script-switch').click(); // tiskací malé + velké
  await expect(stone.locator('.glyph-all .glyph')).toHaveText(['M', 'm']);
  await page.getByTestId('script-switch').click(); // psací malé + velké
  await expect(stone.locator('.glyph-all .glyph[data-script="cursiveUpper"]')).toHaveText('M');
  await expect(stone.locator('.glyph-all .glyph[data-script="cursive"]')).toHaveText('m');
  expect(await page.evaluate(() => document.documentElement.dataset.pismo)).toBe('cursiveBoth');
  expect(((await idb<{ current: string }>(page, 'get', 'script'))).current).toBe('cursiveBoth');
  await page.reload();
  await expect(page.getByTestId('lesson-row').getByRole('button').first().locator('.glyph-all')).toHaveAttribute('data-variant', 'cursiveBoth');
});

test('písmo: cyklus přeskočí zakázané varianty', async ({ page }) => {
  await page.goto('./');
  await putScript(page, { allowed: { lower: true, upper: false, cursive: false, cursiveUpper: true, printBoth: false, cursiveBoth: false, all: false }, def: 'lower', current: null });
  await page.reload();
  const stone = page.getByTestId('lesson-row').getByRole('button').first();
  await expect(stone).toHaveText('m');
  await page.getByTestId('script-switch').click();
  await expect(stone.locator('.glyph')).toHaveAttribute('data-script', 'cursiveUpper');
  await page.getByTestId('script-switch').click();
  await expect(stone.locator('.glyph')).toHaveAttribute('data-script', 'lowerPrint');
});

test('migrace starého nastavení (tvary + def) a poškozená hodnota', async ({ page }) => {
  await page.goto('./');
  await putScript(page, { allowed: { upperPrint: true, lowerPrint: false, cursive: true }, def: 'upperPrint', current: 'cursive' });
  await page.reload();
  const stone = page.getByTestId('lesson-row').getByRole('button').first();
  await expect(stone.locator('.glyph')).toHaveAttribute('data-script', 'cursive'); // starý current zachován
  await passGate(page);
  const on = async (v: string) => (await form(page, v).getAttribute('aria-pressed')) === 'true';
  expect(await on('upper')).toBe(true); expect(await on('lower')).toBe(false); expect(await on('cursive')).toBe(true);
  expect(await on('printBoth')).toBe(false); expect(await on('all')).toBe(true);
  await expect(page.locator('[data-testid="script-settings"] [data-def="upper"]')).toHaveAttribute('aria-pressed', 'true');
  await home(page);
  await putScript(page, { allowed: 'x', def: 42, current: 'zzz' });
  await page.reload();
  await expect(page.getByTestId('lesson-row').getByRole('button').first().locator('.glyph-all')).toHaveAttribute('data-variant', 'all');
});

test('import staré zálohy převede nastavení písma na nový model', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await seed(page); // staré nastavení: bez velkých tiskacích, def cursive
  await page.reload();
  await expect(page.getByTestId('lesson-row').getByRole('button').first().locator('.glyph')).toHaveAttribute('data-script', 'cursive');
  await passGate(page);
  expect(await form(page, 'upper').getAttribute('aria-pressed')).toBe('false');
  expect(await form(page, 'lower').getAttribute('aria-pressed')).toBe('true');
  await expect(page.locator('[data-testid="script-settings"] [data-def="cursive"]')).toHaveAttribute('aria-pressed', 'true');
});

test('písmo: výchozí tvar v nastavení rodiče platí hned a zkouška používá stejný tvar', async ({ page }) => {
  await openParent(page);
  await page.locator('[data-testid="script-settings"] [data-def="lower"]').click();
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

test('náhled v Nastavení ukazuje příklad každé varianty', async ({ page }) => {
  await openParent(page);
  await expect(form(page, 'cursiveUpper').locator('.glyph[data-script="cursiveUpper"]')).toHaveText('Ma la');
  await expect(form(page, 'all').locator('.glyph')).toHaveText(['MA LA', 'ma la', 'Ma la', 'ma la']);
  await expect(form(page, 'upper').locator('.glyph')).toHaveText('MA LA');
});
