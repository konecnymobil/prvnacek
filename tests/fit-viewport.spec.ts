import { expect, test, type Page } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

const SIZES = [[1024, 768], [1180, 820], [1280, 800], [1920, 1080], [768, 1024], [820, 1180]];

/** Aktivity: tlačítko v nabídce lekce; výchozí varianta písma je „vše“ (4 tvary najednou). */
const ACTIVITIES: [string, string][] = [
  ['Najdi písmeno', 'letter-activity'],
  ['Slož slabiku', 'syllable-activity'],
  ['Čti slabiku', 'read-activity'],
  ['Slož slovo', 'compose-activity'],
  ['Čti slovo', 'readword-activity'],
];

async function fits(page: Page, what: string, w: number, h: number) {
  await page.evaluate(() => document.fonts.ready);
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    return { sh: Math.max(de.scrollHeight, document.body.scrollHeight), sw: de.scrollWidth, vh: window.innerHeight, vw: window.innerWidth };
  });
  expect(m.sh, `${what} ${w}x${h}: svislé rolování`).toBeLessThanOrEqual(m.vh);
  expect(m.sw, `${what} ${w}x${h}: vodorovné přetečení`).toBeLessThanOrEqual(m.vw);
}

for (const [w, h] of SIZES) {
  test(`vše se vejde bez rolování ${w}x${h} (varianta vše)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await unlockAll(page);
    await fits(page, 'domů', w, h);
    const row = page.getByTestId('lesson-row');
    const count = await row.getByRole('button').count();
    const idx = Math.min(count - 1, 5); // lekce s dostatkem obsahu (S)
    await row.getByRole('button').nth(idx).click();
    await expect(page.getByTestId('lesson-menu')).toBeVisible();
    await fits(page, 'nabídka lekce', w, h);
    for (const [label, id] of ACTIVITIES) {
      await page.getByTestId('lesson-menu').getByRole('button', { name: label }).click();
      await expect(page.getByTestId(id)).toBeVisible();
      await fits(page, label, w, h);
      await page.getByRole('button', { name: 'Zpět' }).first().click();
      await expect(page.getByTestId('lesson-menu')).toBeVisible();
    }
    await page.getByRole('button', { name: 'Zpět' }).first().click();
    await page.getByTestId('open-pexeso').click();
    await page.getByTestId('pex-level-6').click();
    await expect(page.getByTestId('pex-game')).toBeVisible();
    await fits(page, 'pexeso 12', w, h);
  });
}
