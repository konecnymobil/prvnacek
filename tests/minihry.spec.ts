import { test, expect, type Page } from '@playwright/test';
import { unlockAll, waitForChildDb } from './helpers';

test.use({ reducedMotion: 'reduce' });

/** Projde kolo: u každé úlohy ťuká na možnosti, dokud nepřijde správná. Ověří automatickou kontrolu (chyba → „Skoro!“ + lupa). */
async function playRound(page: Page) {
  let sawWrong = false;
  for (let k = 0; k < 8; k++) {
    if (await page.getByTestId('game-end').isVisible()) break;
    const round = page.getByTestId('game-round');
    const idx = await round.getAttribute('data-index');
    const opts = round.locator('.game-opt');
    const n = await opts.count();
    for (let j = 0; j < n; j++) {
      await opts.nth(j).click();
      if (await round.locator('.game-opt.is-correct').count()) break;
      sawWrong = true;
      await expect(page.getByTestId('game-msg')).toContainText(/Skoro! Zkus to znovu|Zastavíme se a zkusíme to spolu/);
      await expect(page.getByTestId('game-hint')).toBeVisible();
    }
    await expect(page.getByTestId('game-end').or(page.locator(`[data-testid="game-round"]:not([data-index="${idx}"])`))).toBeVisible({ timeout: 10000 });
  }
  await expect(page.getByTestId('game-end')).toBeVisible();
  return sawWrong;
}

const rounds = (page: Page) => page.evaluate(() => new Promise<{ gameId: string }[]>((res) => {
  const r = indexedDB.open('prvnacek');
  r.onsuccess = () => { const q = r.result.transaction('settings').objectStore('settings').get('games:rounds'); q.onsuccess = () => { r.result.close(); res(q.result ?? []); }; };
}));

for (const id of ['ztratilo', 'detektiv', 'bublinky', 'domecky', 'obchod']) {
  test(`minihra ${id}: chybná volba = klidná oprava, kolo se dohraje a uloží`, async ({ page }) => {
    await unlockAll(page);
    await page.getByTestId('open-games').click();
    await page.locator(`.game-tile[data-game="${id}"]`).click();
    await expect(page.getByTestId('game-round')).toHaveAttribute('data-game', id);
    // automatická kontrola: první špatná možnost
    const round = page.getByTestId('game-round');
    const opts = round.locator('.game-opt');
    for (let j = 0; j < await opts.count(); j++) {
      await opts.nth(j).click();
      if (await round.locator('.game-opt.is-correct').count()) break;
      await expect(page.getByTestId('game-msg')).toContainText('Skoro');
      break;
    }
    await playRound(page);
    expect((await rounds(page)).map((r) => r.gameId)).toEqual([id]);
    await page.getByTestId('game-back').click();
    await expect(page.getByTestId('games')).toBeVisible();
  });
}

test('zamčená hra řekne, s kterým písmenkem přijde', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await waitForChildDb(page);
  await page.getByTestId('open-games').click();
  const tile = page.locator('.game-tile[data-game="obchod"]');
  await expect(tile).toHaveAttribute('data-locked', 'true');
  const snd = page.waitForRequest(/snd-p-mh-locked\.mp3/);
  await tile.click();
  await snd;
  await expect(page.getByTestId('game-lock-hint')).toContainText('Tahle hra přijde s písmenkem');
});
