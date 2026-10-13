import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { buildWeekSummary, categorizeError, currentLesson, masteryAttempts, completedWeeks, isMastered, sessionStats, trendLabel, weekStartOf, addDays, type SAttempt, type SContent, type SData } from '../src/summary/weekly';
import type { WeeklySummaryFile } from '../src/content/types';

const read = (f: string) => JSON.parse(fs.readFileSync(`public/content/${f}`, 'utf8'));
const spec: WeeklySummaryFile = read('weekly-summary.json');
const C: SContent = {
  lessons: read('order.duha.json').lessons, letters: read('letters.json').letters,
  syllables: read('syllables.json').syllables, words: read('words.json').words,
  recommendation: read('test-rules.json').recommendation,
};
const day = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const att = (at: number, itemId: string, correct: boolean, extra: Partial<SAttempt> = {}): SAttempt => ({ at, day: day(at), activity: 'A6', lessonId: 'duha-2', itemId, correct, ...extra });

test.describe('metriky souhrnu (logika)', () => {
  test('sezení a aktivní čas', () => {
    const t0 = 1_000_000_000_000;
    // 3 záznamy po 30 s, pauza 90 s (nepočítá se), pak po 11 min nové sezení
    const s = sessionStats([t0, t0 + 30e3, t0 + 60e3, t0 + 150e3, t0 + 150e3 + 11 * 60e3, t0 + 150e3 + 11 * 60e3 + 20e3]);
    expect(s.sessions).toBe(2);
    expect(s.activeMs).toBe(80e3);
  });
  test('zvládnutí slabiky, ztráta zvládnutí', () => {
    const d1 = new Date(2026, 9, 5, 10).getTime(), d2 = new Date(2026, 9, 6, 10).getTime();
    const ok = [att(d1, 's-ma', true), att(d1 + 1, 's-ma', true), att(d2, 's-ma', true)];
    expect(isMastered(ok, spec.mastery.syllable)).toBe(true);
    expect(isMastered(ok.slice(0, 2), spec.mastery.syllable)).toBe(false); // jen 2 správně
    expect(isMastered([att(d1, 's-ma', true), att(d1 + 1, 's-ma', true), att(d1 + 2, 's-ma', true)], spec.mastery.syllable)).toBe(false); // 1 den
    expect(isMastered([...ok, att(d2 + 1, 's-ma', false), att(d2 + 2, 's-ma', false)], spec.mastery.syllable)).toBe(false); // 2 chyby ze 3
  });
  test('do zvládnutí jen první pokus o položku v kole', () => {
    const d1 = new Date(2026, 9, 5, 10).getTime(), d2 = new Date(2026, 9, 6, 10).getTime();
    // kolo 1: chyba, pak oprava (oprava se nepočítá); kolo 2 a 3: správně → jen 2 správné první pokusy
    const a = [att(d1, 's-ma', false, { round: 1 }), att(d1 + 1, 's-ma', true, { round: 1 }), att(d1 + 2, 's-ma', true, { round: 2 }), att(d2, 's-ma', true, { round: 3 })];
    expect(masteryAttempts(a).map((x) => x.correct)).toEqual([false, true, true]);
    expect(isMastered(masteryAttempts(a), spec.mastery.syllable)).toBe(false);
  });
  test('aktuální lekce = nejvyšší odemčená (i ručně)', () => {
    expect(currentLesson(C, []).id).toBe('duha-1');
    expect(currentLesson(C, [{ lessonId: 'duha-1', status: 'approved', approvedAt: 1 }]).id).toBe('duha-2');
    expect(currentLesson(C, [{ lessonId: 'duha-5', status: 'practicing', approvedAt: null }]).id).toBe('duha-5');
  });
  test('kategorie chyb', () => {
    expect(categorizeError(C, 's-ma', 'confused', 's-maa').id).toBe('vowelLength');
    const lc = categorizeError(C, 'l-a', 'confused', 'l-e');
    expect(lc.id).toBe('letterConfusion');
    expect(lc.pair).toBe('A × E');
    expect(categorizeError(C, 'l-m', 'unknown', null).id).toBe('unknown');
    expect(categorizeError(C, 's-ma', 'notBlended', null).id).toBe('notBlended');
  });
  test('málo úloh → trendTooFew', () => {
    const ws = weekStartOf(new Date(2026, 9, 7).getTime());
    const t0 = addDays(ws, -6) + 9 * 3600e3, t1 = addDays(ws, 1) + 9 * 3600e3;
    const data: SData = { attempts: [att(t0, 's-ma', true), att(t1, 's-ma', true)], events: [], tests: [], lessonStates: [] };
    expect(buildWeekSummary(data, C, spec, ws, 'Ema').trend.success).toBe(spec.templates.trendTooFew);
  });
  test('trend ±10 %', () => {
    expect(trendLabel(spec, 111, 100, true)).toBe(spec.trend.labels.up);
    expect(trendLabel(spec, 105, 100, true)).toBe(spec.trend.labels.same);
    expect(trendLabel(spec, 89, 100, true)).toBe(spec.trend.labels.down);
    expect(trendLabel(spec, 5, 0, false)).toBe(spec.trend.labels.none);
  });
  test('celý týden: chyby, únava, doporučení', () => {
    const ws = weekStartOf(new Date(2026, 9, 7).getTime());
    const t = addDays(ws, 1) + 9 * 3600e3;
    const a: SAttempt[] = [];
    for (let i = 0; i < 12; i++) a.push(att(t + i * 20e3, 's-ma', i >= 4, i < 4 ? { reason: 'confused', confusedWith: 's-maa', chosenId: 's-maa' } : {}));
    const data: SData = { attempts: a, events: [{ at: t + 300e3, day: day(t), kind: 'earlyExit' }], tests: [], lessonStates: [] };
    const s = buildWeekSummary(data, C, spec, ws, 'Anička');
    expect(s.metrics.ratedTasks).toBe(12);
    expect(s.metrics.sessions).toBe(1);
    expect(s.metrics.frustrationSignals).toBe(2); // 1× 3+ chyb za sebou + předčasné ukončení
    expect(s.errors[0].id).toBe('vowelLength');
    expect(s.recommendations.length).toBeLessThanOrEqual(2);
    expect(s.lines.praise.startsWith('Anička')).toBe(true);
    expect(s.trend.success).toBe(spec.trend.labels.none); // minulý týden bez procvičování
    expect(spec.errorCategories.find((x) => x.id === 'unknown')!.label).toBe('Zatím neví');
    expect(completedWeeks(data, addDays(ws, 8))).toEqual([ws]);
  });
});

test.describe('obrazovka souhrnu', () => {
  test.use({ serviceWorkers: 'block' });
  async function passGate(page: Page) {
    await page.getByTestId('open-parent').click();
    await page.getByTestId('gate-hold').hover();
    await page.mouse.down();
    await page.waitForTimeout(3300);
    await page.mouse.up();
    const q = (await page.getByTestId('gate-question').textContent())!;
    const [x, y] = q.split('=')[0].split('+').map((v) => parseInt(v, 10));
    await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${x + y}$`) }).click();
    await expect(page.getByTestId('parent-home')).toBeVisible();
  }
  test('minulý týden v pořadí sekcí, listování', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('lesson-row')).toBeVisible();
    await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('prvnacek'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const tx = db.transaction(['attempts', 'events'], 'readwrite');
      const d = new Date(); d.setHours(10, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 6); // úterý minulého týdne
      const dd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      for (let i = 0; i < 6; i++) tx.objectStore('attempts').add({ orderId: 'duha', lessonId: 'duha-1', activity: 'A2', itemId: 'l-m', correct: i % 2 === 0, chosenId: i % 2 ? 'l-a' : 'l-m', reason: i % 2 ? 'confused' : null, confusedWith: i % 2 ? 'l-a' : null, at: d.getTime() + i * 20000, day: dd(d) });
      const older = new Date(d); older.setDate(d.getDate() - 14);
      tx.objectStore('attempts').add({ orderId: 'duha', lessonId: 'duha-1', activity: 'A2', itemId: 'l-m', correct: true, chosenId: 'l-m', at: older.getTime(), day: dd(older) });
      await new Promise((r) => { tx.oncomplete = r; });
      db.close();
    });
    await page.reload();
    await passGate(page);
    await page.getByTestId('open-summary').click();
    await expect(page.getByTestId('summary-headline')).toContainText('2 min');
    const order = await page.locator('[data-section]').evaluateAll((els) => els.map((e) => e.getAttribute('data-section')));
    expect(order).toEqual(['overview', 'mastered', 'tests', 'trend', 'errors', 'recommendations', 'praise']);
    await expect(page.locator('[data-rec]')).toHaveCount(1);
    await expect(page.locator('[data-rec="start"]')).toBeVisible();
    await page.getByTestId('week-older').click();
    await expect(page.getByTestId('week-newer')).toBeEnabled();
    await page.getByTestId('week-older').click();
    await expect(page.getByTestId('summary-headline')).toContainText('1×');
    await expect(page.getByTestId('week-older')).toBeDisabled();
  });
});
