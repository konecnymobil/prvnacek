/** HTTP API serveru synchronizace (bez závislostí). Viz server/README.md. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DEVICE_RE, FAMILY_RE, Limiter, NAME_RE, Pairing, Store, isCipher } from './store.js';

export interface Options { dataDir: string; allowedOrigins?: string[]; maxBody?: number; pairTtlMs?: number }

export function createApp(o: Options) {
  const store = new Store(o.dataDir);
  const pairing = new Pairing(o.pairTtlMs);
  const limiter = new Limiter();
  const maxBody = o.maxBody ?? 5 * 1024 * 1024;
  const origins = o.allowedOrigins ?? ['*'];

  const send = (req: IncomingMessage, res: ServerResponse, code: number, body?: unknown) => {
    const origin = req.headers.origin ?? '';
    const allow = origins.includes('*') ? '*' : origins.includes(origin) ? origin : '';
    if (allow) { res.setHeader('Access-Control-Allow-Origin', allow); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    if (body === undefined) { res.writeHead(code); res.end(); return; }
    res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
  };
  const readJson = (req: IncomingMessage) => new Promise<unknown>((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > maxBody) { reject(new Error('too-large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch { reject(new Error('bad-json')); } });
    req.on('error', reject);
  });
  const token = (req: IncomingMessage) => (req.headers.authorization ?? '').replace(/^Bearer /, '');

  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(req, res, 204);
      const url = new URL(req.url ?? '/', 'http://x');
      const p = url.pathname.split('/').filter(Boolean);
      if (req.method === 'GET' && url.pathname === '/health') return send(req, res, 200, { ok: true });

      // párování: /v1/pair  a  /v1/pair/:id   (id = SHA-256 kódu, hex)
      if (p[0] === 'v1' && p[1] === 'pair') {
        const ip = req.socket.remoteAddress ?? '?';
        if (req.method === 'POST' && p.length === 2) {
          const b = (await readJson(req)) as { id?: string; blob?: unknown };
          if (!b || typeof b.id !== 'string' || !/^[a-f0-9]{64}$/.test(b.id) || !isCipher(b.blob)) return send(req, res, 400, { error: 'bad-request' });
          return pairing.put(b.id, b.blob) ? send(req, res, 201, { ok: true }) : send(req, res, 409, { error: 'exists' });
        }
        if (req.method === 'GET' && p.length === 3) {
          if (!limiter.hit(ip)) return send(req, res, 429, { error: 'too-many' });
          const c = pairing.take(p[2]);
          return c ? send(req, res, 200, c) : send(req, res, 404, { error: 'not-found' });
        }
      }

      // rodina: /v1/families/:fid/log  a  /v1/families/:fid/blobs/:name
      if (p[0] === 'v1' && p[1] === 'families' && p[2] && FAMILY_RE.test(p[2])) {
        const fid = p[2];
        const write = req.method === 'POST' || req.method === 'PUT';
        if (!write && !store.exists(fid)) return send(req, res, 404, { error: 'not-found' }); // rodina zatím nic neuložila
        if (!store.auth(fid, token(req), write)) return send(req, res, 401, { error: 'unauthorized' });
        if (p[3] === 'log' && p.length === 4) {
          if (req.method === 'GET') return send(req, res, 200, { entries: store.read(fid, Number(url.searchParams.get('since') ?? 0) || 0) });
          if (req.method === 'POST') {
            const b = (await readJson(req)) as { deviceId?: string } & Record<string, unknown>;
            if (!b || typeof b.deviceId !== 'string' || !DEVICE_RE.test(b.deviceId) || !isCipher(b)) return send(req, res, 400, { error: 'bad-request' });
            return send(req, res, 201, { seq: store.append(fid, b.deviceId, b) });
          }
        }
        if (p[3] === 'blobs' && p[4] && NAME_RE.test(p[4]) && p.length === 5) {
          if (req.method === 'GET') { const c = store.getBlob(fid, p[4]); return c ? send(req, res, 200, c) : send(req, res, 404, { error: 'not-found' }); }
          if (req.method === 'PUT') { const b = await readJson(req); if (!isCipher(b)) return send(req, res, 400, { error: 'bad-request' }); store.putBlob(fid, p[4], b); return send(req, res, 204); }
        }
      }
      return send(req, res, 404, { error: 'not-found' });
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      return send(req, res, m === 'too-large' ? 413 : 400, { error: m || 'bad-request' });
    }
  });
}
