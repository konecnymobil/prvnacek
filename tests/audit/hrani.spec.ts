/**
 * Technický audit hraním (není součást CI; spuštění: AUDIT=1 PW_PORT=4193 npx playwright test tests/audit).
 * Odehraje každou minihru všech předmětů a lekce matematiky několikrát po sobě „opičím“ hráčem
 * (klepá na nabídku, po chybách použije zvýrazněnou nápovědu) a zapisuje nálezy do audit-out/hrani.json:
 * opakování úlohy v kole / za sebou / na hranici kol, zaseknutí, chybějící zvuky (404 / mimo index.json),
 * chybějící obrázky, chyby v konzoli, nálepky (žádná, duplicitní, špatný předmět).
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { waitForChildDb } from '../helpers';

test.skip(!process.env.AUDIT, 'audit jen na vyžádání (AUDIT=1)');
test.use({ reducedMotion: 'reduce', serviceWorkers: 'block' });
test.setTimeout(240_000);

const ROUNDS = Number(process.env.AUDIT_ROUNDS ?? 3);
const indexed = new Set((JSON.parse(fs.readFileSync('public/audio/tts/index.json', 'utf8')).sounds as { audioId: string }[]).map((s) => s.audioId));
type Finding = { cat: string; where: string; detail: string };
const findings: Finding[] = [];
test.afterAll(() => {
  fs.mkdirSync('audit-out', { recursive: true });
  const file = `audit-out/hrani-${test.info().workerIndex}.json`;
  fs.writeFileSync(file, JSON.stringify(findings, null, 2));
});

function watch(page: Page, where: () => string) {
  page.on('console', (m) => { if (m.type() === 'error') findings.push({ cat: 'konzole', where: where(), detail: m.text().slice(0, 200) }); });
  page.on('pageerror', (e) => findings.push({ cat: 'výjimka', where: where(), detail: e.message.slice(0, 200) }));
  page.on('response', (r) => {
    const u = r.url();
    const a = /audio\/tts\/([^/?]+)\.mp3/.exec(u);
    if (a && !indexed.has(decodeURIComponent(a[1]))) findings.push({ cat: 'zvuk mimo index', where: where(), detail: a[1] });
    if (r.status() >= 400) findings.push({ cat: a ? 'zvuk 404' : /\.(svg|png|webp)/.test(u) ? 'obrázek 404' : 'HTTP', where: where(), detail: `${r.status()} ${u.replace(/^.*\/prvnacek\//, '')}` });
  });
}
async function seedAll(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('lesson-row')).toBeVisible();
  await waitForChildDb(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); });
    const tx = db.transaction(['lessonStates', 'settings'], 'readwrite');
    for (let i = 1; i <= 9; i++) tx.objectStore('lessonStates').put({ key: `duha:duha-${i}`, orderId: 'duha', lessonId: `duha-${i}`, status: 'practicing', updatedAt: Date.now(), approvedAt: null, approvedBy: null });
    const p: Record<string, unknown> = {};
    for (const k of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']) p[k] = { rounds: 1, correct: 5, wrong: 0, errors: {}, traced: 1 };
    tx.objectStore('settings').put(p, 'math:progress');
    await new Promise((r) => { tx.oncomplete = r; });
    db.close();
  });
  await page.reload();
}
const owned = (page: Page) => page.evaluate(() => new Promise<{ stickerId: string; subjectId?: string }[]>((res) => {
  const r = indexedDB.open('prvnacek');
  r.onsuccess = () => { const q = r.result.transaction('settings').objectStore('settings').get('album:owned'); q.onsuccess = () => { r.result.close(); res(q.result ?? []); }; };
}));
/** Podpis úlohy: viditelný text a obrázky v herní ploše (bez tlačítek nahoře a bubliny). */
const signature = (page: Page) => page.getByTestId('game-round').evaluate((el) => {
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll('.topbar, .progress, .game-mascot, .game-hint, [data-testid="game-msg"]').forEach((x) => x.remove());
  const attrs = [...c.querySelectorAll('[data-order],[data-n],[data-target],[data-word],[data-shape]')].map((x) => [...x.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}=${a.value}`).join(' ')).join('|');
  return `${attrs}#${c.innerText.replace(/\s+/g, ' ').trim()}#${[...c.querySelectorAll('img')].map((i) => i.getAttribute('src')).sort().join(',')}`;
});

async function playRound(page: Page, where: string): Promise<string[]> {
  const sigs: string[] = [];
  let last: string | null = null, still = 0;
  for (let tap = 0; tap < 400; tap++) {
    if (await page.getByTestId('game-end').isVisible()) return sigs;
    const round = page.getByTestId('game-round');
    if (!(await round.isVisible())) { await page.waitForTimeout(150); continue; }
    const i = await round.getAttribute('data-index');
    if (i !== last) { last = i; still = 0; await page.waitForTimeout(200); sigs.push(await signature(page)); }
    if (++still > 60) { findings.push({ cat: 'zaseknutí', where, detail: `úloha ${i}: 60 klepnutí bez posunu` }); return sigs; }
    const hint = round.locator('.is-hint:not(:disabled)');
    const opts = round.locator('button:not(:disabled):not(.game-hint):not([data-testid="game-quit"]):not([data-testid="back"])').filter({ hasNot: page.locator('.topbar') });
    const target = (await hint.count()) ? hint.first() : opts.nth(Math.floor(Math.random() * Math.max(1, await opts.count())));
    if (!(await opts.count()) && !(await hint.count())) { await page.waitForTimeout(250); continue; }
    const box = await target.boundingBox();
    if (box && (await round.locator('canvas').count())) { // vybarvování: tah přes plátno
      const cv = (await round.locator('canvas').first().boundingBox())!;
      await target.click({ timeout: 2000 }).catch(() => {});
      await page.mouse.move(cv.x + 10, cv.y + 10); await page.mouse.down();
      for (let y = 10; y < cv.height; y += 18) await page.mouse.move(cv.x + (y % 36 ? cv.width - 10 : 10), cv.y + y, { steps: 3 });
      await page.mouse.up();
    }
    await target.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(120);
  }
  findings.push({ cat: 'zaseknutí', where, detail: 'kolo neskončilo po 400 klepnutích' });
  return sigs;
}

function checkRepeats(where: string, rounds: string[][]) {
  rounds.forEach((r, k) => {
    const seen = new Map<string, number>();
    r.forEach((s, i) => {
      if (seen.has(s)) findings.push({ cat: i - seen.get(s)! === 1 ? 'opakování za sebou' : 'opakování v kole', where, detail: `kolo ${k + 1}, úloha ${i + 1}: ${s.slice(0, 80)}` });
      seen.set(s, i);
    });
    if (k > 0 && r[0] && r[0] === rounds[k - 1].at(-1)) findings.push({ cat: 'opakování na hranici kol', where, detail: `kola ${k}/${k + 1}: ${r[0].slice(0, 80)}` });
  });
}

const GAMES: { subject: string; game: string; sticker: string }[] = [
  ...['ztratilo', 'detektiv', 'bublinky', 'domecky', 'obchod'].map((game) => ({ subject: 'cz-reading', game, sticker: 'cz-reading' })),
  ...['mm1', 'mm2', 'mm3'].map((game) => ({ subject: 'math', game, sticker: 'math' })),
  ...['mp1', 'mp2', 'mp3'].map((game) => ({ subject: 'world', game, sticker: 'world' })),
  ...['me1', 'me2'].map((game) => ({ subject: 'english', game, sticker: 'english' })),
];

for (const g of GAMES) {
  test(`audit: ${g.subject} / ${g.game}`, async ({ page }) => {
    const where = `${g.subject}/${g.game}`;
    watch(page, () => where);
    await seedAll(page);
    const rounds: string[][] = [];
    for (let k = 0; k < ROUNDS; k++) {
      await page.goto('./');
      await expect(page.getByTestId('lesson-row')).toBeVisible();
      if (g.subject === 'cz-reading') await page.getByTestId('open-games').click();
      else { const card = page.locator(`.subj-card[data-subject="${g.subject}"]`); await card.click(); await card.click(); }
      const tile = page.locator(`.game-tile[data-game="${g.game}"]`);
      if ((await tile.getAttribute('data-locked')) === 'true') { findings.push({ cat: 'zamčeno', where, detail: 'hra je zamčená i při odemčených lekcích' }); return; }
      await tile.click();
      if (!(await page.getByTestId('game-round').isVisible({ timeout: 4000 }).catch(() => false))) { findings.push({ cat: 'nespustí se', where, detail: 'po klepnutí na dlaždici se hra neotevřela' }); return; }
      const before = await owned(page);
      rounds.push(await playRound(page, where));
      if (await page.getByTestId('game-end').isVisible()) {
        await expect.poll(async () => (await owned(page)).length, { timeout: 4000 }).toBeGreaterThan(before.length).catch(() => {});
        const after = await owned(page);
        const fresh = after.slice(before.length);
        if (!fresh.length) findings.push({ cat: 'nálepka', where, detail: `kolo ${k + 1}: žádná nová nálepka` });
        for (const s of fresh) {
          if (s.subjectId !== g.sticker) findings.push({ cat: 'nálepka', where, detail: `subjectId ${s.subjectId} místo ${g.sticker}` });
          if (before.some((b) => b.stickerId === s.stickerId)) findings.push({ cat: 'nálepka', where, detail: `duplicitní ${s.stickerId}` });
        }
      }
    }
    checkRepeats(where, rounds);
  });
}

test('audit: matematika – lekce (úlohy před obtažením)', async ({ page }) => {
  const where = 'math/lekce';
  watch(page, () => where);
  await seedAll(page);
  for (let lesson = 0; lesson < 6; lesson++) {
    const rounds: string[][] = [];
    for (let k = 0; k < ROUNDS; k++) {
      await page.goto('./');
      const card = page.locator('.subj-card[data-subject="math"]'); await card.click(); await card.click();
      await page.getByTestId('math-lessons').locator('button').nth(lesson).click();
      const sigs: string[] = [];
      for (let tap = 0; tap < 120; tap++) {
        const task = page.getByTestId('math-task');
        if (!(await task.isVisible().catch(() => false))) { await page.waitForTimeout(150); continue; }
        if ((await task.getAttribute('data-kind')) === 'trace') break;
        const i = await task.getAttribute('data-index');
        if (sigs.length <= Number(i)) sigs.push(`${await task.getAttribute('data-kind')}#${(await task.innerText()).replace(/\s+/g, ' ').slice(0, 80)}`);
        const opts = task.locator('button:not(:disabled)');
        const n = await opts.count();
        if (n) await opts.nth(Math.floor(Math.random() * n)).click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(150);
      }
      rounds.push(sigs);
    }
    checkRepeats(`${where} m${lesson + 1}`, rounds);
  }
});
