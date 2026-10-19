import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
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

test('Domečky: po pokynu zazní slovo k obrázku a znovu po ťuknutí na obrázek; všechna slova mají klip', async ({ page }) => {
  test.setTimeout(120_000); // zvuky jdou za sebou (název hry, pokyn, slovo)
  const index = new Set((JSON.parse(fs.readFileSync('public/audio/tts/index.json', 'utf8')).sounds as { audioId: string }[]).map((s) => s.audioId));
  const words = (JSON.parse(fs.readFileSync('public/content/words.json', 'utf8')).words as { text: string; audioId: string; usableInMemoryGame?: boolean }[]).filter((w) => w.usableInMemoryGame);
  expect(words.length).toBeGreaterThan(0);
  for (const w of words) expect(index.has(w.audioId), `klip ${w.audioId} (${w.text}) chybí v index.json`).toBe(true);
  const requested: string[] = [];
  page.on('request', (r) => { const m = r.url().match(/audio\/tts\/(snd-[a-z0-9-]+)\.mp3/); if (m) requested.push(m[1]); });
  await unlockAll(page);
  await page.getByTestId('open-games').click();
  await page.locator('.game-tile[data-game="domecky"]').click();
  await expect(page.getByTestId('game-round')).toHaveAttribute('data-game', 'domecky');
  for (let k = 0; k < 3; k++) {
    const round = page.getByTestId('game-round');
    const idx = await round.getAttribute('data-index');
    const word = (await page.getByTestId('game-card').getAttribute('data-word'))!;
    expect(index.has(word)).toBe(true);
    // po pokynu: pokyn a hned slovo
    await expect.poll(() => requested.lastIndexOf(word) > requested.lastIndexOf('snd-p-mh-domecky') && requested.includes('snd-p-mh-domecky'), { timeout: 30000 }).toBe(true);
    const before = requested.length;
    await page.getByTestId('game-card').click();
    await expect.poll(() => requested.slice(before).includes(word), { timeout: 8000 }).toBe(true);
    const opts = round.locator('.game-opt');
    for (let j = 0; j < await opts.count(); j++) { await opts.nth(j).click(); if (await round.locator('.game-opt.is-correct').count()) break; }
    await expect(page.getByTestId('game-end').or(page.locator(`[data-testid="game-round"]:not([data-index="${idx}"])`))).toBeVisible({ timeout: 10000 });
  }
});

test('Detektiv: nejdřív jen zvuk slabiky, text v lupě až po chybě jiným písmem; rozptylovače se liší jednou hláskou', async ({ page }) => {
  test.setTimeout(120_000); // zvuky jdou za sebou (název hry, pokyn, slabika)
  const index = new Set((JSON.parse(fs.readFileSync('public/audio/tts/index.json', 'utf8')).sounds as { audioId: string }[]).map((s) => s.audioId));
  type Syl = { id: string; text: string; kind: string; usableInSyllableTasks: boolean; consonantLetterId: string | null; vowelLetterId: string; audioId: string };
  const syls = (JSON.parse(fs.readFileSync('public/content/syllables.json', 'utf8')).syllables as Syl[]).filter((s) => s.kind === 'CV' && s.usableInSyllableTasks);
  const byId = new Map(syls.map((s) => [s.id, s]));
  expect(syls.length).toBeGreaterThan(0);
  for (const s of syls) expect(index.has(s.audioId), `klip ${s.audioId} (${s.text}) chybí v index.json`).toBe(true);
  const oneSound = (a: Syl, b: Syl) => (a.consonantLetterId === b.consonantLetterId) !== (a.vowelLetterId === b.vowelLetterId);
  const cursive = (k: string | null) => k === 'cursive' || k === 'cursiveUpper';

  const requested: string[] = [];
  page.on('request', (r) => { const m = r.url().match(/audio\/tts\/(snd-[a-z0-9-]+)\.mp3/); if (m) requested.push(m[1]); });
  await unlockAll(page);
  await page.getByTestId('open-games').click();
  await page.locator('.game-tile[data-game="detektiv"]').click();
  const round = page.getByTestId('game-round');
  await expect(round).toHaveAttribute('data-game', 'detektiv');
  for (let k = 0; k < 3; k++) {
    const idx = await round.getAttribute('data-index');
    const lupa = page.getByTestId('game-target');
    const word = (await lupa.getAttribute('data-word'))!;
    const answer = syls.find((s) => s.audioId === word)!;
    expect(answer, `cílová slabika ${word}`).toBeTruthy();
    // na začátku jen zvuk: v lupě žádný text
    await expect(lupa).toHaveAttribute('data-revealed', 'false');
    await expect(lupa.locator('.lupa-text')).toHaveCount(0);
    // po pokynu hned zazní slabika
    await expect.poll(() => requested.includes('snd-p-mh-detektiv') && requested.lastIndexOf(word) > requested.lastIndexOf('snd-p-mh-detektiv'), { timeout: 30000 }).toBe(true);
    // rozptylovače: každý se od cíle liší právě jednou hláskou
    const ids = await round.locator('.game-opt').evaluateAll((els) => els.map((e) => e.getAttribute('data-opt')!));
    expect(ids).toContain(answer.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (const id of ids.filter((x) => x !== answer.id)) expect(oneSound(answer, byId.get(id)!), `${byId.get(id)?.text} vs ${answer.text}`).toBe(true);
    // Zopakuj 🔊 přehraje pokyn i slabiku
    const before = requested.length;
    await page.getByRole('button', { name: 'Zopakuj zadání' }).click();
    await expect.poll(() => requested.slice(before).includes(word), { timeout: 15000 }).toBe(true);
    // chybná volba → text v lupě jako nápověda, jiným písmem než karty
    const wrongId = ids.find((x) => x !== answer.id)!;
    await round.locator(`.game-opt[data-opt="${wrongId}"]`).click();
    await expect(page.getByTestId('game-msg')).toContainText(/Skoro|Zastavíme/);
    await expect(lupa).toHaveAttribute('data-revealed', 'true');
    const lupaText = lupa.locator('.lupa-text');
    await expect(lupaText).toHaveText(new RegExp(`^${answer.text}$`, 'i'));
    const cardScript = await round.locator(`.game-opt[data-opt="${answer.id}"] .glyph`).first().getAttribute('data-script');
    expect(cursive(await lupaText.getAttribute('data-script'))).not.toBe(cursive(cardScript));
    await round.locator(`.game-opt[data-opt="${answer.id}"]`).click();
    await expect(page.getByTestId('game-end').or(page.locator(`[data-testid="game-round"]:not([data-index="${idx}"])`))).toBeVisible({ timeout: 10000 });
  }
});
