import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });
type W = { id: string; syllableIds: string[]; forms: Record<string, string> };
const VARIANTS: Record<string, string[]> = {
  lower: ['lowerPrint'], upper: ['upperPrint'], cursive: ['cursive'], cursiveUpper: ['cursiveUpper'],
  printBoth: ['upperPrint', 'lowerPrint'], cursiveBoth: ['cursiveUpper', 'cursive'], all: ['upperPrint', 'lowerPrint', 'cursiveUpper', 'cursive'],
};
const hasUpper = (t: string) => t !== t.toLowerCase();

async function setVariant(page: Page, id: string) {
  await page.evaluate(async ([v, all]) => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ allowed: Object.fromEntries(all.map((k) => [k, true])), def: v, current: null }, 'script');
    await new Promise((r) => { tx.oncomplete = r; }); db.close();
  }, [id, Object.keys(VARIANTS)] as [string, string[]]);
  await page.reload();
}

for (const [variant, forms] of Object.entries(VARIANTS)) {
  test(`Slož slovo – ${variant}: karty, složené slovo i zpětná vazba na úrovni slova`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.route('**/audio/tts/snd-p-praise*', () => { /* pochvala nedohraje → posun až po pojistce, stihneme kontrolu */ });
    await unlockAll(page);
    await setVariant(page, variant);
    const words = (await (await page.request.get('./content/words.json')).json()).words as W[];
    await page.getByTestId('lesson-row').getByRole('button').last().click();
    await page.getByTestId('open-compose').click();
    const seen = new Set<string>();
    for (let task = 0; task < 8; task++) {
      if (await page.getByTestId('round-end').isVisible()) await page.getByTestId('again').click();
      const act = page.getByTestId('compose-activity');
      await expect(act).toHaveAttribute('data-done', 'false');
      const form = (await act.getAttribute('data-form'))!;
      expect(forms).toContain(form);
      seen.add(form);
      const tid = await act.getAttribute('data-target');
      const w = words.find((x) => x.id === tid)!;
      const cards = await act.locator('[data-syllable] .glyph').evaluateAll((els) => els.map((e) => e.textContent!.trim()));
      const capCards = cards.filter(hasUpper).length;
      if (form === 'upperPrint') expect(cards.every((t) => t === t.toUpperCase()), `karty ${cards}`).toBe(true);
      else expect(capCards, `karty ${cards} (${form}) nesmí mít velká písmena`).toBe(0);
      // špatné pořadí: nejdřív druhá slabika (odmítne se), pak správně
      const wrong = w.syllableIds.find((x) => x !== w.syllableIds[0]);
      if (wrong) { await act.locator(`[data-syllable="${wrong}"]:not([disabled])`).first().click(); await expect(act.getByTestId('slot').first()).toHaveAttribute('data-filled', ''); }
      for (const [i, sid] of w.syllableIds.entries()) {
        await act.locator(`[data-syllable="${sid}"]:not([disabled])`).first().click();
        if (i < w.syllableIds.length - 1) {
          const slots = await act.getByTestId('slot').evaluateAll((els) => els.map((e) => e.textContent!.trim()));
          slots.slice(1).forEach((t) => { if (form !== 'upperPrint') expect(hasUpper(t), `políčko ${t}`).toBe(false); });
        }
      }
      const expected = w.forms[form];
      await expect(act.getByTestId('composed-word')).toHaveText(expected); // slovo vcelku z vlastního tvaru
      await expect(act.getByTestId('composed-word').locator('.glyph')).toHaveAttribute('data-script', form);
      await expect(act.getByTestId('slots')).toHaveText(expected);
      if (form === 'cursiveUpper') expect(hasUpper(expected.slice(1))).toBe(false);
      const fb = act.getByTestId('feedback').locator('.glyph');
      await expect(fb).toHaveText(expected);
      await expect(fb).toHaveAttribute('data-script', form);
      await page.getByRole('button', { name: /Dál/ }).click();
    }
    expect([...seen].sort(), 'všechny formy varianty prošly').toEqual([...forms].sort());
  });
}
