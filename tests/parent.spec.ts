import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function mockMic(page: Page) {
  await page.addInitScript(() => {
    const track = { stop() {} };
    const stream = { getTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => stream } });
    class FakeRecorder extends EventTarget {
      state = 'inactive';
      mimeType = 'audio/mpeg';
      static isTypeSupported(t: string) { return t === 'audio/mpeg'; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        fetch('audio/tts/snd-l-m.mp3').then((r) => r.blob()).then((b) => {
          const ev = new Event('dataavailable') as Event & { data: Blob };
          ev.data = b;
          this.dispatchEvent(ev);
          this.dispatchEvent(new Event('stop'));
        });
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  });
}

async function passGate(page: Page) {
  await page.goto('./');
  await page.getByTestId('open-parent').click();
  const hold = page.getByTestId('gate-hold');
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  const q = (await page.getByTestId('gate-question').textContent())!;
  const [a, b] = q.split('=')[0].split('+').map((x) => parseInt(x, 10));
  await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${a + b}$`) }).click();
  await expect(page.getByTestId('parent-home')).toBeVisible();
}

const dbGet = (page: Page, store: string) =>
  page.evaluate(
    (s) => new Promise<{ status?: string; lessonId?: string; audioId?: string }[]>((resolve) => {
      const open = indexedDB.open('prvnacek');
      open.onsuccess = () => {
        const r = open.result.transaction(s).objectStore(s).getAll();
        r.onsuccess = () => resolve(r.result);
      };
    }),
    store,
  );

test('brána: krátké podržení nestačí, špatný součet nepustí, URL se nemění', async ({ page }) => {
  const url = (await page.goto('./'))!.url();
  await page.getByTestId('open-parent').click();
  await page.getByTestId('gate-hold').hover();
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.getByTestId('gate-sum')).toHaveCount(0);
  await page.getByTestId('gate-hold').hover();
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  const q = (await page.getByTestId('gate-question').textContent())!;
  const [a, b] = q.split('=')[0].split('+').map((x) => parseInt(x, 10));
  await page.getByTestId('gate-answer').filter({ hasNotText: new RegExp(`^${a + b}$`) }).first().click();
  await expect(page.getByTestId('gate-wrong')).toBeVisible();
  await expect(page.getByTestId('parent-home')).toHaveCount(0);
  await page.getByTestId('gate-answer').filter({ hasText: new RegExp(`^${a + b}$`) }).click();
  await expect(page.getByTestId('parent-home')).toBeVisible();
  expect(page.url()).toBe(url);
});

test('zkouška: ✓/✗, zpět, pauza, důvod; schválení odemkne další lekci', async ({ page }) => {
  await passGate(page);
  await expect(page.getByTestId('letter-progress')).toContainText('M');
  await page.getByTestId('start-test-duha-1').click();
  await page.getByTestId('test-start').click();
  await expect(page.getByTestId('test-progress')).toHaveText('1 / 6');
  await page.getByTestId('rate-ok').click();
  await expect(page.getByTestId('test-progress')).toHaveText('2 / 6');
  await page.getByTestId('test-undo').click(); // vrátí ✓ u první položky
  await expect(page.getByTestId('test-progress')).toHaveText('1 / 6');
  await page.getByTestId('test-pause').click();
  await expect(page.getByTestId('test-paused')).toBeVisible();
  await page.getByTestId('test-resume').click();
  await page.getByTestId('rate-ok').click();
  await page.getByTestId('rate-bad').click();
  await expect(page.getByTestId('reason-pick')).toBeVisible();
  await page.getByTestId('test-undo').click(); // zruší výběr důvodu
  await expect(page.getByTestId('reason-pick')).toHaveCount(0);
  await expect(page.getByTestId('test-progress')).toHaveText('2 / 6');
  await page.getByTestId('rate-bad').click();
  await page.locator('[data-reason="confused"]').click();
  for (let i = 0; i < 4; i++) await page.getByTestId('rate-ok').click();
  // 5/6, 1 chyba u nového písmene → doporučeno
  await expect(page.getByTestId('test-score')).toHaveText('5 / 6');
  await expect(page.getByTestId('test-result')).toHaveAttribute('data-recommend', 'true');
  await expect(page.getByTestId('test-errors')).toContainText('zaměnil');
  await page.getByTestId('approve').click();
  await expect(page.getByTestId('approved-msg')).toContainText('Odemčena lekce 2');
  const st = await dbGet(page, 'lessonStates');
  expect(st.find((s) => s.lessonId === 'duha-1')!.status).toBe('approved');
  expect(st.find((s) => s.lessonId === 'duha-2')!.status).toBe('practicing');
});

test('zkouška: 2 chyby = nedoporučeno', async ({ page }) => {
  await passGate(page);
  await page.getByTestId('start-test-duha-1').click();
  await page.getByTestId('test-start').click();
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('rate-bad').click();
    await page.locator('[data-reason="unknown"]').click();
  }
  for (let i = 0; i < 4; i++) await page.getByTestId('rate-ok').click();
  await expect(page.getByTestId('test-result')).toHaveAttribute('data-recommend', 'false');
});

test('Zvuky: nahrát vlastní hlásku L, uložit a vrátit původní hlas', async ({ page }) => {
  await mockMic(page);
  await passGate(page);
  await page.getByTestId('open-sounds').click();
  await page.locator('[data-sound="l-l"]').click();
  await expect(page.getByTestId('sound-edit')).toHaveAttribute('data-audio', 'snd-l-l');
  await page.getByTestId('snd-record').click();
  await page.getByTestId('snd-stop').click();
  await expect(page.getByTestId('snd-save')).toBeVisible();
  await page.getByTestId('snd-save').click();
  await expect(page.getByTestId('snd-msg')).toContainText('Uloženo');
  expect((await dbGet(page, 'recordings')).map((r) => r.audioId)).toContain('snd-l-l');
  await expect(page.getByTestId('snd-restore')).toBeVisible();
  await page.getByTestId('snd-restore').click();
  await expect(page.getByTestId('snd-msg')).toContainText('Vrácen původní hlas');
  await expect(page.getByTestId('snd-restore')).toHaveCount(0);
  expect((await dbGet(page, 'recordings')).length).toBe(0);
});
