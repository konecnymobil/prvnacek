import { expect, test, type Locator, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

/** Všechny glyfy na obrazovce úlohy: žádná kombinace forem a jen jedna forma. Vrací ji. */
async function oneForm(scope: Locator): Promise<string> {
  await expect(scope.locator('.glyph[data-script]').first()).toBeVisible();
  expect(await scope.locator('.glyph-all, [data-variant]').count(), 'žádný prvek nesmí ukazovat víc forem').toBe(0);
  const forms = new Set(await scope.locator('.glyph[data-script]').evaluateAll((els) => els.map((e) => e.getAttribute('data-script')!)));
  expect([...forms], 'v jedné úloze jen jedna forma').toHaveLength(1);
  return [...forms][0];
}

async function openLesson(page: Page) {
  await page.getByTestId('lesson-row').getByRole('button').last().click();
  await expect(page.getByTestId('lesson-menu')).toBeVisible();
}

const ACTS: { name: string; open: (p: Page) => Promise<void>; scope: string }[] = [
  { name: 'Najdi písmeno', open: async (p) => { await openLesson(p); await p.getByRole('button', { name: /Najdi písmeno/ }).click(); }, scope: 'main' },
  { name: 'Slož slabiku', open: async (p) => { await openLesson(p); await p.getByRole('button', { name: /Slož slabiku/ }).click(); }, scope: 'main' },
  { name: 'Čti slabiku', open: async (p) => { await openLesson(p); await p.getByTestId('open-read').click(); }, scope: 'main' },
  { name: 'Slož slovo / Slovo k obrázku', open: async (p) => { await openLesson(p); await p.getByTestId('open-compose').click(); }, scope: '[data-testid="compose-activity"]' },
  { name: 'Čti slovo', open: async (p) => { await openLesson(p); await p.getByTestId('open-readword').click(); }, scope: 'main' },
  { name: 'Opakování', open: async (p) => { await p.getByTestId('open-review').click(); }, scope: 'main' },
  { name: 'Pexeso', open: async (p) => {
    await p.getByTestId('open-pexeso').click(); await p.getByTestId('pex-level-3').click();
    await p.locator('[data-face="syllable"]').first().click(); await p.locator('[data-face="picture"]').first().click();
  }, scope: '.pex-grid' },
];

test.describe('Vše: jedna forma v každé úloze všude', () => {
  for (const a of ACTS) {
    test(a.name, async ({ page }) => {
      await unlockAll(page); // výchozí varianta je „Vše“
      if (a.name === 'Opakování') {
        await page.evaluate(async () => {
          const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
          const tx = db.transaction('lessonStates', 'readwrite');
          for (let i = 1; i <= 6; i++) tx.objectStore('lessonStates').put({ key: `duha:duha-${i}`, orderId: 'duha', lessonId: `duha-${i}`, status: 'approved', updatedAt: Date.now(), approvedAt: Date.now(), approvedBy: 'manual' });
          await new Promise((r) => { tx.oncomplete = r; }); db.close();
        });
        await page.reload();
      }
      const seen: string[] = [];
      await expect(page.getByTestId('lesson-row')).toBeVisible();
      for (let i = 0; i < 2; i++) {
        // bez reloadu: zpět v appce až na úvod, pak znovu (nová úloha ve stejném běhu)
        while (!(await page.getByTestId('lesson-row').isVisible())) await page.getByRole('button', { name: /Zpět|Domů/ }).first().click();
        await a.open(page);
        seen.push(await oneForm(page.locator(a.scope).first()));
      }
      expect(seen[1], 'nová úloha = jiná forma').not.toBe(seen[0]);
    });
  }

  test('Zkouška rodiče', async ({ page }) => {
    await unlockAll(page);
    await page.getByTestId('open-parent').click();
    await page.getByTestId('gate-hold').hover();
    await page.mouse.down(); await page.waitForTimeout(3300); await page.mouse.up();
    const q = (await page.getByTestId('gate-question').textContent())!;
    const [x, y] = q.split('=')[0].split('+').map((v) => parseInt(v, 10));
    await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${x + y}$`) }).click();
    await page.locator('[data-testid^="start-test-"]').first().click();
    await page.getByTestId('test-start').click();
    const first = await oneForm(page.getByTestId('test-text'));
    await page.getByTestId('rate-ok').click();
    await expect(page.getByTestId('test-run')).toHaveAttribute('data-index', '1');
    expect(await oneForm(page.getByTestId('test-text'))).not.toBe(first);
  });
});
