import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

/** Falešný mikrofon + MediaRecorder: nahrávka = skutečné mp3 z aplikace (WebKit v CI nemá mikrofon). */
async function mockMic(page: Page) {
  await page.addInitScript(() => {
    const track = { stop() {} };
    const stream = { getTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => stream },
    });
    class FakeRecorder extends EventTarget {
      state = 'inactive';
      mimeType = 'audio/mpeg';
      static isTypeSupported(t: string) { return t === 'audio/mpeg' || t === 'audio/mp4'; }
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

async function recordTake(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Test zvuku a mikrofonu/ }).click();
  await page.getByTestId('mic-record').click();
  await page.getByTestId('mic-stop').click();
  await expect(page.getByTestId('mic-play')).toBeEnabled();
}

test('nahrávku jde přehrát a tlačítko se po přehrání znovu povolí', async ({ page }) => {
  await mockMic(page);
  await recordTake(page);
  await page.getByTestId('mic-play').click();
  await expect(page.getByTestId('mic-play')).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId('mic-error')).toHaveCount(0);
});

test('uložení nahrávky: Uloženo a záznam je v IndexedDB', async ({ page }) => {
  await mockMic(page);
  await recordTake(page);
  await page.getByTestId('save-take').click();
  await expect(page.getByTestId('save-status')).toContainText('Uloženo', { timeout: 10_000 });
  await expect(page.getByText('Ukázka teď hraje tvoji nahrávku')).toBeVisible();
  await expect(page.getByTestId('mic-play')).toBeEnabled({ timeout: 15_000 });
  const stored = await page.evaluate(
    () =>
      new Promise<boolean>((res, rej) => {
        const r = indexedDB.open('prvnacek');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const g = r.result.transaction('recordings').objectStore('recordings').get('snd-p-welcome');
          g.onsuccess = () => res(!!g.result);
          g.onerror = () => rej(g.error);
        };
      }),
  );
  expect(stored).toBe(true);
});

test('selhání IndexedDB při ukládání ukáže srozumitelnou chybu', async ({ page }) => {
  await mockMic(page);
  await recordTake(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
  });
  await page.getByTestId('save-take').click();
  await expect(page.getByTestId('save-status')).toContainText('nepodařilo uložit');
  await expect(page.getByTestId('save-take')).toBeEnabled();
});
