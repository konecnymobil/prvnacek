import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('aplikace se načte bez chyb', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./');
  await expect(page).toHaveTitle('Prvňáček');
  await expect(page.getByRole('heading', { level: 1, name: 'Prvňáček' })).toBeVisible();
  await expect(page.getByTestId('content-info')).toBeVisible();
  expect(errors).toEqual([]);
});

test('obsah se načte z JSON (pořadí Duhová řada)', async ({ page }) => {
  await page.goto('./');
  const row = page.getByTestId('lesson-row');
  await expect(row.getByRole('button')).toHaveText(['M', 'A', 'L', 'E', 'S', 'O', 'P', 'U', 'I']);
  await expect(page.getByTestId('content-version')).toContainText(/Obsah \d{4}-\d{2}-\d{2}\.\d+/);
  await expect(page.getByTestId('content-error')).toHaveCount(0);
});

test('přepínání obrazovek nemění URL ani historii', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('content-info')).toBeVisible();
  const url = page.url();
  const historyLength = await page.evaluate(() => history.length);

  await page.getByRole('button', { name: /Test zvuku a mikrofonu/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Test zvuku a mikrofonu' })).toBeVisible();
  expect(page.url()).toBe(url);

  await page.getByRole('button', { name: 'Zpět' }).click();
  await page.getByRole('button', { name: /O aplikaci/ }).click();
  await expect(page.getByTestId('attribution')).toContainText('Andika © SIL Global, SIL Open Font License 1.1');
  await page.getByRole('button', { name: 'Zpět' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Prvňáček' })).toBeVisible();

  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
});

test('testovací stránka: ukázkový zvuk se načte z audio/tts a mikrofon má tlačítka', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Test zvuku a mikrofonu/ }).click();
  await expect(page.getByRole('heading', { name: '2. Mikrofon' })).toBeVisible();
  // Linuxový WebKit v CI nemá MediaRecorder/getUserMedia → ukáže se česká hláška; na iPadu tlačítka.
  const supported = await page.evaluate(() => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
  if (supported) {
    await expect(page.getByTestId('mic-record')).toBeVisible();
    await expect(page.getByTestId('mic-play')).toBeDisabled();
  } else {
    await expect(page.getByTestId('mic-unsupported')).toBeVisible();
  }

  const mp3 = page.waitForResponse((r) => r.url().endsWith('/prvnacek/audio/tts/snd-p-welcome.mp3'));
  await page.getByTestId('play-sample').click();
  const res = await mp3;
  expect(res.status()).toBe(200);
  await expect(page.getByTestId('play-status')).not.toHaveText('');
});

test('přehrávač dá přednost nahrávce rodiče z IndexedDB', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Test zvuku a mikrofonu/ }).click();
  await expect(page.getByTestId('play-sample')).toBeVisible();
  // Vlastní nahrávka = jiný zvuk (hláska M) uložený pod audioId ukázky.
  await page.evaluate(async () => {
    const data = await (await fetch('audio/tts/snd-l-m.mp3')).arrayBuffer();
    // počkat, až aplikace databázi vytvoří (jinak bychom založili prázdnou v1)
    for (let i = 0; i < 50 && !(await indexedDB.databases()).some((d) => d.name === 'prvnacek'); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('prvnacek');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('recordings', 'readwrite');
      tx.objectStore('recordings').put({ audioId: 'snd-p-welcome', data, mimeType: 'audio/mpeg', createdAt: Date.now() });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error ?? new Error('abort'));
    });
    db.close();
  });
  let ttsRequested = false;
  page.on('request', (r) => {
    if (r.url().endsWith('/audio/tts/snd-p-welcome.mp3')) ttsRequested = true;
  });
  await page.getByTestId('play-sample').click();
  await expect(page.getByTestId('play-status')).toHaveText(/vlastní nahrávka|nepřehrál/, { timeout: 10_000 });
  expect(ttsRequested).toBe(false);
});

test('PWA: manifest, ikony a service worker', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/prvnacek/manifest.webmanifest');
  const manifest = await (await request.get(href!)).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/prvnacek/');
  for (const icon of manifest.icons) expect((await request.get(`/prvnacek/${icon.src}`)).ok()).toBe(true);
  expect((await request.get('/prvnacek/icons/apple-touch-icon.png')).ok()).toBe(true);
  const sw = await (await request.get('/prvnacek/sw.js')).text();
  expect(sw).toContain('content/letters.json');
  expect(sw).toContain('audio/tts/snd-p-welcome.mp3');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
});
