import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

// Playwright WebKit neumí spolehlivě simulovat offline navigaci se service workerem
// (setOffline / route.abort → interní chyba). Ověřujeme proto obsah precache v Cache Storage;
// skutečný offline test je na iPadu v letadlovém režimu (viz PR).
test('offline: service worker uloží aplikaci, obsah, písmo a všechny zvuky', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);

  const result = await page.evaluate(async () => {
    const keys: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) keys.push(new URL(req.url).pathname);
    }
    return keys;
  });
  for (const path of [
    '/prvnacek/index.html',
    '/prvnacek/manifest.webmanifest',
    '/prvnacek/content/manifest.json',
    '/prvnacek/content/letters.json',
    '/prvnacek/content/words.json',
    '/prvnacek/audio/tts/snd-p-welcome.mp3',
    '/prvnacek/icons/apple-touch-icon.png',
  ]) {
    expect(result, path).toContain(path);
  }
  expect(result.filter((p) => p.startsWith('/prvnacek/audio/tts/') && p.endsWith('.mp3')).length).toBe(157);
  expect(result.filter((p) => /\/assets\/Andika-.*\.woff2$/.test(p)).length).toBe(3);
});
