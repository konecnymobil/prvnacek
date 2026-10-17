/** Úložiště serveru: jen šifrované bloby a append-only log na rodinu. Server nic nedešifruje a nezná obsah. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Cipher { iv: string; ct: string; salt?: string }
export interface LogEntry extends Cipher { seq: number; deviceId: string; at: number }

const B64 = /^[A-Za-z0-9+/=_-]+$/;
export const FAMILY_RE = /^[a-f0-9]{32}$/;
export const NAME_RE = /^[a-z0-9-]{1,64}$/;
export const DEVICE_RE = /^[a-z0-9-]{1,64}$/;
export const isCipher = (c: unknown): c is Cipher => {
  const x = c as Cipher;
  return !!x && typeof x.iv === 'string' && typeof x.ct === 'string' && B64.test(x.iv) && B64.test(x.ct) && (x.salt === undefined || (typeof x.salt === 'string' && B64.test(x.salt)));
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export class Store {
  constructor(private dir: string) { mkdirSync(join(dir, 'families'), { recursive: true }); }
  private fam(fid: string) { return join(this.dir, 'families', fid); }

  /** První zápis rodinu založí a uloží otisk tokenu; další požadavky musí token znát. */
  exists(fid: string): boolean { return FAMILY_RE.test(fid) && existsSync(join(this.fam(fid), 'auth.json')); }

  auth(fid: string, token: string, create: boolean): boolean {
    if (!FAMILY_RE.test(fid) || token.length < 32) return false;
    const f = this.fam(fid); const file = join(f, 'auth.json');
    if (!existsSync(file)) {
      if (!create) return false;
      mkdirSync(join(f, 'blobs'), { recursive: true });
      writeFileSync(file, JSON.stringify({ tokenHash: sha(token), createdAt: Date.now() }));
      return true;
    }
    const want = Buffer.from(JSON.parse(readFileSync(file, 'utf8')).tokenHash, 'hex');
    const got = Buffer.from(sha(token), 'hex');
    return want.length === got.length && timingSafeEqual(want, got);
  }

  append(fid: string, deviceId: string, c: Cipher): number {
    const file = join(this.fam(fid), 'log.jsonl');
    const seq = this.read(fid, 0).length + 1;
    const e: LogEntry = { seq, deviceId, at: Date.now(), iv: c.iv, ct: c.ct };
    appendFileSync(file, JSON.stringify(e) + '\n');
    return seq;
  }
  read(fid: string, since: number): LogEntry[] {
    const file = join(this.fam(fid), 'log.jsonl');
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as LogEntry).filter((e) => e.seq > since);
  }
  putBlob(fid: string, name: string, c: Cipher) { writeFileSync(join(this.fam(fid), 'blobs', `${name}.json`), JSON.stringify({ iv: c.iv, ct: c.ct, at: Date.now() })); }
  getBlob(fid: string, name: string): Cipher | null {
    const file = join(this.fam(fid), 'blobs', `${name}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Cipher) : null;
  }
}

/** Párování: zašifrovaný balíček (klíč rodiny zašifrovaný kódem) jen v paměti, 10 min, vyzvednout jde jednou. */
export class Pairing {
  private m = new Map<string, { c: Cipher; exp: number }>();
  constructor(private ttlMs = 10 * 60_000, private now = () => Date.now()) {}
  put(id: string, c: Cipher): boolean {
    this.gc();
    if (this.m.has(id)) return false;
    this.m.set(id, { c, exp: this.now() + this.ttlMs });
    return true;
  }
  take(id: string): Cipher | null {
    this.gc();
    const e = this.m.get(id); if (!e) return null;
    this.m.delete(id); return e.c;
  }
  private gc() { const t = this.now(); for (const [k, v] of this.m) if (v.exp <= t) this.m.delete(k); }
}

/** Jednoduchý limit pokusů na IP (proti hádání párovacích kódů). */
export class Limiter {
  private m = new Map<string, number[]>();
  constructor(private max = 20, private windowMs = 10 * 60_000, private now = () => Date.now()) {}
  hit(key: string): boolean {
    const t = this.now(); const a = (this.m.get(key) ?? []).filter((x) => x > t - this.windowMs);
    a.push(t); this.m.set(key, a); return a.length <= this.max;
  }
}
