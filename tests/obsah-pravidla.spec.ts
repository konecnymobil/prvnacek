/** Didaktická pravidla generátorů (A-02, A-16/A-27) – v Node přes Vite, bez prohlížeče. */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

test.describe.configure({ mode: 'serial' });
let vite: ViteDevServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (m: string): Promise<any> => vite.ssrLoadModule(m);
test.beforeAll(async () => {
  vite = await createServer({ configFile: false, base: '/prvnacek/', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' }, appType: 'custom', logLevel: 'error' });
  const orig = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL) => {
    const p = String(u).replace(/^\/prvnacek\//, '');
    if (!p.startsWith('content/')) return orig(u);
    return new Response(fs.readFileSync(path.resolve('public', p)), { status: 200 });
  }) as typeof fetch;
});
test.afterAll(async () => { await vite?.close(); });

test('A-02 Co se ztratilo?: žádný rozptylovač nedá jiné skutečné slovo', async () => {
  const c = await (await load('/src/content/load.ts')).loadContent();
  const { GAMES } = await load('/src/games/games.ts');
  const g = GAMES.find((x: { id: string }) => x.id === 'ztratilo');
  const texts = new Set(c.words.map((w: { text: string }) => w.text));
  const letter = (id: string) => c.letterById.get(id).upper;
  for (let idx = 3; idx <= 9; idx++) for (let k = 0; k < 60; k++) {
    for (const t of g.build(c, idx)) {
      const w = c.words.find((x: { id: string }) => x.id === t.id).text as string;
      expect(t.img, 'obrázek je k dispozici od začátku').toBeTruthy();
      for (const o of t.options) if (o.id !== t.answer) {
        const other = w.slice(0, t.gapIndex) + letter(o.id) + w.slice(t.gapIndex + 1);
        expect(texts.has(other), `${w}: ${letter(o.id)} dá slovo ${other}`).toBe(false);
      }
    }
  }
});

test('A-16/A-27 Pexeso: 3/4/6 párů, slučitelná slova, MA × MÁ jen z nouze', async () => {
  const c = await (await load('/src/content/load.ts')).loadContent();
  const { pickPairs, PEX_LEVELS } = await load('/src/activities/pexeso.ts');
  const { memoryPairCompatible } = await load('/src/content/types.ts');
  expect([...PEX_LEVELS]).toEqual([3, 4, 6]);
  const syl = [...c.syllableById.values()];
  const cands = c.words.filter((w: { usableInMemoryGame: boolean; imageId?: string }) => w.usableInMemoryGame && w.imageId);
  for (const pairs of PEX_LEVELS) for (let k = 0; k < 200; k++) {
    const ws = pickPairs(cands, pairs, syl);
    expect(ws.length).toBe(Math.min(pairs, ws.length));
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      expect(memoryPairCompatible(ws[i], ws[j], syl, false), `${ws[i].text} × ${ws[j].text}`).toBe(true);
      if (ws[i].similarImageGroup) expect(ws[i].similarImageGroup).not.toBe(ws[j].similarImageGroup);
    }
  }
  // dost slov → strict (žádné MA × MÁ)
  const strict = Array.from({ length: 100 }, () => pickPairs(cands, 3, syl));
  for (const ws of strict) for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) expect(memoryPairCompatible(ws[i], ws[j], syl, true)).toBe(true);
});
