import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

const ALL = ['lower', 'upper', 'cursive', 'cursiveUpper', 'printBoth', 'cursiveBoth', 'all'];
async function setVariant(page: Page, id: string) {
  await page.evaluate(async ([v, ALL]) => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ allowed: Object.fromEntries(ALL.map((k) => [k, true])), def: v, current: null }, 'script');
    await new Promise((r) => { tx.oncomplete = r; }); db.close();
  }, [id, ALL] as [string, string[]]);
  await page.reload();
}

/** Projde 6 úloh „Najdi písmeno“ a vrátí formu na kartách + cíl každé úlohy. */
async function playRound(page: Page) {
  await page.getByTestId('lesson-row').getByRole('button').filter({ has: page.locator('.glyph', { hasText: /^i$/i }) }).first().click();
  await page.getByRole('button', { name: /Najdi písmeno/ }).click();
  const out: { forms: string[]; target: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const act = page.getByTestId('letter-activity');
    await expect(act).toBeVisible();
    const target = (await act.getAttribute('data-target'))!;
    const forms = await act.locator('[data-letter] .glyph').evaluateAll((els) => els.map((e) => e.getAttribute('data-script')!));
    const cards = await act.locator('[data-letter]').count();
    expect(forms.length).toBe(cards); // na každé kartě právě jeden glyf
    out.push({ forms, target });
    await act.locator(`[data-letter="${target}"]`).click();
    await page.getByRole('button', { name: /Dál|Zpět na lekci/ }).first().click();
  }
  return out;
}

test('Vše: v úloze mají všechny karty tutéž jedinou formu, formy se mezi úlohami střídají, cíl se neopakuje za sebou', async ({ page }) => {
  await unlockAll(page);
  await setVariant(page, 'all');
  const r = await playRound(page);
  const used = r.map((t) => { expect(new Set(t.forms).size).toBe(1); return t.forms[0]; });
  for (let i = 1; i < r.length; i++) { expect(used[i]).not.toBe(used[i - 1]); expect(r[i].target).not.toBe(r[i - 1].target); }
  expect(new Set(used).size).toBeGreaterThanOrEqual(3);
});

test('Kombinace tisk: jen formy varianty; jediná forma beze změny', async ({ page }) => {
  await unlockAll(page);
  await setVariant(page, 'printBoth');
  for (const t of await playRound(page)) expect(['upperPrint', 'lowerPrint']).toContain(t.forms[0]);
  await page.goto('./');
  await setVariant(page, 'lower');
  const r = await playRound(page);
  for (const t of r) expect(new Set(t.forms)).toEqual(new Set(['lowerPrint']));
});
