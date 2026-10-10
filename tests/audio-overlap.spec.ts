import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

// Počítá zvuky, které hrají současně (Web Audio zdroje i <audio>), a ukládá maximum.
test('rychlé klepání: nikdy nehraje víc než jeden zvuk najednou', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __active: Set<object>; __max: number; __starts: number };
    w.__active = new Set();
    w.__max = 0;
    w.__starts = 0;
    const add = (o: object) => {
      w.__active.add(o);
      w.__starts++;
      w.__max = Math.max(w.__max, w.__active.size);
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...a: [number?]) {
      add(this);
      this.addEventListener('ended', () => w.__active.delete(this));
      return start.apply(this, a);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (this: AudioBufferSourceNode, ...a: [number?]) {
      w.__active.delete(this);
      return stop.apply(this, a);
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!this.src.startsWith('data:')) {
        add(this);
        this.addEventListener('ended', () => w.__active.delete(this), { once: true });
      }
      return play.call(this);
    };
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      w.__active.delete(this);
      return pause.call(this);
    };
  });
  await page.goto('./');
  await page.getByTestId('lesson-row').getByRole('button').filter({ has: page.locator('[data-script="upperPrint"]', { hasText: /^M$/ }) }).click();
  await page.getByRole('button', { name: /Najdi písmeno/ }).click();
  const act = page.getByTestId('letter-activity');
  for (let i = 0; i < 3; i++) {
    const target = await act.getAttribute('data-target');
    await page.locator(`[data-letter="${target}"]`).click();
    const dal = page.getByRole('button', { name: /Dál/ });
    await dal.click(); // hned po správné odpovědi, pochvala se utne
    await page.getByRole('button', { name: /Přehrát hlásku/ }).dblclick();
    await page.getByRole('button', { name: /Přehrát hlásku/ }).click();
    await page.waitForTimeout(300);
  }
  const r = await page.evaluate(() => {
    const w = window as unknown as { __max: number; __starts: number };
    return { max: w.__max, starts: w.__starts };
  });
  expect(r.max).toBeLessThanOrEqual(1);
});
