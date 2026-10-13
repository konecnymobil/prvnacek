import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });
type W = { id: string; text: string; syllableIds: string[]; forms: Record<string, string> };
const ALL = ['lower', 'upper', 'cursive', 'cursiveUpper', 'printBoth', 'cursiveBoth', 'all'];
const FORM: Record<string, string> = { upper: 'upperPrint', lower: 'lowerPrint', cursive: 'cursive', cursiveUpper: 'cursiveUpper' };

async function setVariant(page: Page, id: string) {
  await page.evaluate(async ([v, ALL]) => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ allowed: Object.fromEntries(ALL.map((k) => [k, true])), def: v, current: null }, 'script');
    await new Promise((r) => { tx.oncomplete = r; }); db.close();
  }, [id, ALL] as [string, string[]]);
  await page.reload();
}
async function openLesson(page: Page) {
  await page.getByTestId('lesson-row').getByRole('button').last().click();
  await expect(page.getByTestId('lesson-menu')).toBeVisible();
}
const words = async (page: Page) => (await (await page.request.get('./content/words.json')).json()).words as W[];
const glyphTexts = (page: Page, sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => ({ f: e.getAttribute('data-script')!, t: e.textContent!.trim() })));

for (const v of ['cursiveUpper', 'upper', 'lower']) {
  test(`Slož slovo (${v}): velké písmeno na úrovni slova, karty neprozradí první slabiku, zpětná vazba ve stejné formě`, async ({ page }) => {
    await unlockAll(page);
    await setVariant(page, v);
    const form = FORM[v];
    await openLesson(page);
    await page.getByTestId('open-compose').click();
    const act = page.getByTestId('compose-activity');
    await expect(act).toBeVisible();
    const tid = await act.getAttribute('data-target');
    const w = (await words(page)).find((x) => x.id === tid)!;
    // karty: jedna stejná forma, u „S velkým“ všechny malé
    const cards = await glyphTexts(page, '[data-syllable] .glyph');
    const cardForm = form === 'cursiveUpper' ? 'cursive' : form;
    for (const c of cards) {
      expect(c.f).toBe(cardForm);
      if (form !== 'upperPrint') expect(c.t).toBe(c.t.toLowerCase());
      else expect(c.t).toBe(c.t.toUpperCase());
    }
    for (const sid of w.syllableIds) await page.locator(`[data-syllable="${sid}"]:not([disabled])`).first().click();
    const expected = w.forms[form] ?? (form === 'cursiveUpper' ? w.forms.cursive.charAt(0).toUpperCase() + w.forms.cursive.slice(1) : '');
    await expect(page.getByTestId('slots')).toHaveText(expected); // Máma / MÁMA / máma, nikdy MáMa
    if (form === 'cursiveUpper') expect(expected.slice(1)).toBe(expected.slice(1).toLowerCase());
    if (form === 'upperPrint') expect(expected).toBe(expected.toUpperCase());
    const fb = page.getByTestId('feedback').locator('.glyph');
    await expect(fb).toHaveText(expected);
    await expect(fb).toHaveAttribute('data-script', form);
  });
}

test('Čti slovo (S velkým): jen první slabika s velkým písmenem', async ({ page }) => {
  await unlockAll(page);
  await setVariant(page, 'cursiveUpper');
  await openLesson(page);
  await page.getByTestId('open-readword').click();
  const sy = await glyphTexts(page, '[data-testid="word-syll"] .glyph');
  expect(sy.length).toBeGreaterThan(1);
  expect(sy[0].f).toBe('cursiveUpper');
  for (const s of sy.slice(1)) { expect(s.f).toBe('cursive'); expect(s.t).toBe(s.t.toLowerCase()); }
});
