/** E2E šifrování synchronizace: klíč rodiny (AES-GCM 256) vzniká a zůstává jen v zařízeních rodiny. */
export interface Cipher { iv: string; ct: string; salt?: string }

const enc = new TextEncoder();
const dec = new TextDecoder();
export function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const randomHex = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
export const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => (c === '+' ? '-' : c === '/' ? '_' : ''));

export const generateFamilyKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']) as Promise<CryptoKey>;
export const exportKey = async (k: CryptoKey) => b64(await crypto.subtle.exportKey('raw', k));
export const importKey = (raw: string) => crypto.subtle.importKey('raw', unb64(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Cipher> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function decryptJson<T>(key: CryptoKey, c: Cipher): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(c.iv) }, key, unb64(c.ct));
  return JSON.parse(dec.decode(pt)) as T;
}

/* ---------- párovací kód: ZVÍŘE-123-ZVÍŘE (např. KOT-482-LAMA), platí 10 minut ---------- */
export const CODE_A = ['KOT', 'PES', 'LEV', 'SUP', 'LOS', 'RAK', 'HAD', 'SOB'];
export const CODE_B = ['LAMA', 'KOZA', 'OVCE', 'SOVA', 'ZUBR', 'PUMA', 'MULA', 'RYBA'];
export const CODE_RE = /^([A-Z]{3})-(\d{3})-([A-Z]{4})$/;
const pick = (a: string[]) => a[crypto.getRandomValues(new Uint32Array(1))[0] % a.length];
export function generatePairCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
  return `${pick(CODE_A)}-${String(n).padStart(3, '0')}-${pick(CODE_B)}`;
}
/** Velká písmena, bez diakritiky a mezer; pomlčky doplní. Vrací null, když kód nemá správný tvar. */
export function normalizePairCode(input: string): string | null {
  const s = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^([A-Z]{3})(\d{3})([A-Z]{4})$/.exec(s);
  if (!m || !CODE_A.includes(m[1]) || !CODE_B.includes(m[3])) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
/** Server dostane jen otisk kódu (jako id schránky), nikdy kód samotný. */
export const pairId = async (code: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(`prvnacek-pair:${code}`)));
async function codeKey(code: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function sealWithCode(code: string, value: unknown): Promise<Cipher> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { ...(await encryptJson(await codeKey(code, salt), value)), salt: b64(salt) };
}
export async function openWithCode<T>(code: string, c: Cipher): Promise<T> {
  return decryptJson<T>(await codeKey(code, unb64(c.salt ?? '')), c);
}
