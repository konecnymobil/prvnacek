import { expect, test } from '@playwright/test';
import { unlockAll } from './helpers';

test.use({ serviceWorkers: 'block' });

test('Pexeso: poslední pár → slovo jednou, pak „hotovo“, nic dalšího', async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __prvPlayLog: string[] }).__prvPlayLog = []; });
  await unlockAll(page);
  const words = (await (await page.request.get('./content/words.json')).json()).words as { id: string; audioId: string }[];
  await page.getByTestId('open-pexeso').click();
  await page.getByTestId('pex-level-3').click();
  const ids = [...new Set(await page.locator('[data-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-word')!)))];
  for (const [i, id] of ids.entries()) {
    if (i === ids.length - 1) await page.evaluate(() => { (window as unknown as { __prvPlayLog: string[] }).__prvPlayLog.length = 0; });
    await page.locator(`[data-word="${id}"][data-face="syllable"]`).click();
    await page.locator(`[data-word="${id}"][data-face="picture"]`).click();
    if (i < ids.length - 1) await page.waitForTimeout(300);
  }
  await expect(page.getByTestId('pex-end')).toBeVisible();
  await page.waitForTimeout(4000); // případný opožděný zvuk by se už ozval
  const log = await page.evaluate(() => (window as unknown as { __prvPlayLog: string[] }).__prvPlayLog);
  const wordAudio = words.find((w) => w.id === ids[ids.length - 1])!.audioId;
  const tail = log.slice(log.indexOf(wordAudio));
  expect(tail).toEqual([wordAudio, 'snd-p-round-end']);
});
