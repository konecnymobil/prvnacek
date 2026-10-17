import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { Limiter, Pairing } from './store.js';

const FID = 'a'.repeat(32);
const TOKEN = 't'.repeat(43);
async function start(pairTtlMs?: number) {
  const dir = mkdtempSync(join(tmpdir(), 'sync-'));
  const s = createApp({ dataDir: dir, allowedOrigins: ['https://app.example'], pairTtlMs });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  const call = (path: string, init: RequestInit = {}, token = TOKEN) => fetch(base + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: 'https://app.example', ...(init.headers ?? {}) } });
  return { s, dir, call, close: () => new Promise((r) => s.close(r)) };
}
const cipher = { iv: 'aXZpdml2aXZpdml2', ct: 'Y2lwaGVydGV4dA==' };

test('log: append-only se seq, čtení od since, token chrání rodinu', async () => {
  const { call, close } = await start();
  try {
    assert.equal((await call(`/v1/families/${FID}/log`)).status, 404); // neexistující rodina se čtením nezaloží
    assert.equal((await call(`/v1/families/${FID}/log`, { method: 'POST', body: JSON.stringify({ deviceId: 'd-a', ...cipher }) })).status, 201);
    const r2 = await call(`/v1/families/${FID}/log`, { method: 'POST', body: JSON.stringify({ deviceId: 'd-b', ...cipher }) });
    assert.deepEqual(await r2.json(), { seq: 2 });
    const all = await (await call(`/v1/families/${FID}/log?since=1`)).json() as { entries: { seq: number; deviceId: string }[] };
    assert.deepEqual(all.entries.map((e) => [e.seq, e.deviceId]), [[2, 'd-b']]);
    assert.equal((await call(`/v1/families/${FID}/log`, {}, 'x'.repeat(43))).status, 401);
    assert.equal((await call(`/v1/families/${FID}/log`, { method: 'POST', body: JSON.stringify({ deviceId: 'd-a', text: 'Matýsek' }) })).status, 400); // bez šifry neuloží
  } finally { await close(); }
});

test('bloby: PUT/GET jen šifrovaný obsah; na disku nic čitelného navíc', async () => {
  const { call, close, dir } = await start();
  try {
    assert.equal((await call(`/v1/families/${FID}/blobs/snapshot-1`, { method: 'PUT', body: JSON.stringify({ ...cipher, name: 'Dítě 1' }) })).status, 204);
    const b = await (await call(`/v1/families/${FID}/blobs/snapshot-1`)).json() as Record<string, unknown>;
    assert.equal(b.ct, cipher.ct);
    const stored = readFileSync(join(dir, 'families', FID, 'blobs', 'snapshot-1.json'), 'utf8');
    assert.ok(!stored.includes('Dítě'), 'neznámá pole se neukládají');
    assert.deepEqual(readdirSync(join(dir, 'families', FID)).sort(), ['auth.json', 'blobs']);
    assert.ok(!readFileSync(join(dir, 'families', FID, 'auth.json'), 'utf8').includes(TOKEN), 'token jen jako otisk');
  } finally { await close(); }
});

test('párování: jednou vyzvednout, vyprší, neplatné id', async () => {
  const { call, close } = await start(50);
  try {
    const id = 'b'.repeat(64);
    assert.equal((await call('/v1/pair', { method: 'POST', body: JSON.stringify({ id, blob: { ...cipher, salt: 'c2FsdA==' } }) })).status, 201);
    assert.equal((await call('/v1/pair', { method: 'POST', body: JSON.stringify({ id, blob: cipher }) })).status, 409);
    assert.equal((await call(`/v1/pair/${id}`)).status, 200);
    assert.equal((await call(`/v1/pair/${id}`)).status, 404); // jen jednou
    await call('/v1/pair', { method: 'POST', body: JSON.stringify({ id, blob: cipher }) });
    await new Promise((r) => setTimeout(r, 80));
    assert.equal((await call(`/v1/pair/${id}`)).status, 404); // vypršelo
    assert.equal((await call('/v1/pair', { method: 'POST', body: JSON.stringify({ id: 'KOT-482-LAMA', blob: cipher }) })).status, 400); // server nedostane kód, jen otisk
  } finally { await close(); }
});

test('CORS jen pro povolený původ; neplatné familyId', async () => {
  const { call, close } = await start();
  try {
    const r = await call('/health');
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://app.example');
    const bad = await call('/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    assert.equal((await call('/v1/families/../../etc/log')).status, 404);
  } finally { await close(); }
});

test('Pairing a Limiter (jednotky)', () => {
  let t = 0; const p = new Pairing(1000, () => t);
  assert.ok(p.put('x', cipher)); t = 999; assert.ok(p.take('x')); assert.equal(p.take('x'), null);
  const l = new Limiter(2, 1000, () => t); assert.ok(l.hit('ip')); assert.ok(l.hit('ip')); assert.equal(l.hit('ip'), false); t += 1001; assert.ok(l.hit('ip'));
});
