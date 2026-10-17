/**
 * Synchronizace přes náš server (etapa 1). Ve výchozím stavu VYPNUTÁ.
 * Na server jdou jen zašifrované snímky pokroku (bez nahrávek hlasu); klíč rodiny je jen v zařízeních.
 */
import { buildBackup, restoreBackup, type BackupFile, type ChildData } from '../storage/backup';
import { deviceDb, getActiveProfile, listProfiles } from '../storage/profiles';
import { decryptJson, encryptJson, exportKey, generateFamilyKey, generatePairCode, importKey, normalizePairCode, openWithCode, pairId, randomHex, randomToken, sealWithCode, type Cipher } from './crypto';
import { mergeChild } from './merge';

export interface SyncState {
  enabled: boolean;
  serverUrl: string;
  deviceId: string;
  familyId?: string;
  token?: string;
  key?: CryptoKey; // CryptoKey se v IndexedDB uloží jako objekt, nikam se neposílá
  lastSeq: number;
  lastSyncAt?: number;
  outbox: Cipher[];
  /** Po připojení kódem: profily dětí se poprvé spárují podle pořadí. */
  adoptIds?: boolean;
}
interface Snapshot { v: 1; deviceId: string; at: number; profiles: { profile: NonNullable<BackupFile['profiles']>[number]['profile']; data: Omit<ChildData, 'recordings'> }[] }
interface PairBundle { familyId: string; token: string; key: string }

const META = 'sync';
export const PAIR_TTL_MS = 10 * 60_000;

export async function getSyncState(): Promise<SyncState> {
  const s = (await (await deviceDb()).get('meta', META)) as SyncState | undefined;
  return s ?? { enabled: false, serverUrl: '', deviceId: `d-${randomHex(8)}`, lastSeq: 0, outbox: [] };
}
async function save(s: SyncState) { await (await deviceDb()).put('meta', s, META); }
export async function updateSyncState(patch: Partial<SyncState>): Promise<SyncState> { const s = { ...(await getSyncState()), ...patch }; await save(s); return s; }

export function normalizeServerUrl(u: string): string | null {
  try { const url = new URL(u.trim()); if (url.protocol !== 'https:' && url.protocol !== 'http:') return null; return url.href.replace(/\/+$/, ''); } catch { return null; }
}

async function api(s: SyncState, path: string, init: RequestInit = {}) {
  const r = await fetch(`${s.serverUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(s.token ? { Authorization: `Bearer ${s.token}` } : {}), ...(init.headers ?? {}) } });
  if (!r.ok && r.status !== 404) throw new Error(`Náš server odpověděl chybou ${r.status}.`);
  return r;
}

/** Založí rodinu: nový klíč rodiny a přístupový token. Nic se zatím neposílá. */
export async function createFamily(serverUrl: string): Promise<SyncState> {
  const s = await getSyncState();
  return updateSyncState({ serverUrl, familyId: randomHex(16), token: randomToken(), key: await generateFamilyKey(), enabled: true, lastSeq: 0, outbox: [], adoptIds: false, deviceId: s.deviceId });
}

/** Vytvoří párovací kód (platí 10 minut) pro další zařízení rodiny. */
export async function startPairing(): Promise<{ code: string; expiresAt: number }> {
  const s = await getSyncState();
  if (!s.key || !s.familyId || !s.token) throw new Error('Nejdřív založ rodinu.');
  const code = generatePairCode();
  const bundle: PairBundle = { familyId: s.familyId, token: s.token, key: await exportKey(s.key) };
  const r = await api({ ...s, token: undefined }, '/v1/pair', { method: 'POST', body: JSON.stringify({ id: await pairId(code), blob: await sealWithCode(code, bundle) }) });
  if (!r.ok) throw new Error('Kód se nepodařilo připravit, zkus to znovu.');
  return { code, expiresAt: Date.now() + PAIR_TTL_MS };
}

/** Připojí toto zařízení k rodině podle kódu z jiného zařízení. */
export async function joinWithCode(serverUrl: string, input: string): Promise<SyncState> {
  const code = normalizePairCode(input);
  if (!code) throw new Error('Kód má tvar KOT-482-LAMA.');
  const s = await getSyncState();
  const r = await api({ ...s, serverUrl, token: undefined }, `/v1/pair/${await pairId(code)}`);
  if (r.status === 404) throw new Error('Kód neplatí nebo už vypršel. Vytvoř na druhém zařízení nový.');
  const b = await openWithCode<PairBundle>(code, (await r.json()) as Cipher);
  return updateSyncState({ serverUrl, familyId: b.familyId, token: b.token, key: await importKey(b.key), enabled: true, lastSeq: 0, outbox: [], adoptIds: true });
}

export async function disableSync(forget: boolean): Promise<SyncState> {
  const s = await getSyncState();
  return forget ? updateSyncState({ enabled: false, familyId: undefined, token: undefined, key: undefined, lastSeq: 0, outbox: [], lastSyncAt: undefined }) : updateSyncState({ enabled: false, serverUrl: s.serverUrl });
}

async function snapshot(deviceId: string): Promise<Snapshot> {
  const b = await buildBackup();
  return { v: 1, deviceId, at: Date.now(), profiles: (b.profiles ?? []).map(({ profile, data }) => ({ profile, data: { attempts: data.attempts, lessonStates: data.lessonStates, events: data.events, settings: data.settings } })) };
}

/** Přejmenuje id profilu (DB dítěte zůstává stejná), aby se zařízení shodla na dětech. */
async function renameProfile(from: string, to: string) {
  const dev = await deviceDb();
  const p = await dev.get('profiles', from); if (!p) return;
  const tx = dev.transaction(['profiles', 'meta'], 'readwrite');
  await tx.objectStore('profiles').delete(from);
  await tx.objectStore('profiles').put({ ...p, id: to });
  if ((await tx.objectStore('meta').get('activeChildId')) === from) await tx.objectStore('meta').put(to, 'activeChildId');
  await tx.done;
}

async function applyRemote(snaps: Snapshot[], adoptIds: boolean) {
  if (adoptIds && snaps.length) {
    const local = (await listProfiles()).sort((a, b) => a.createdAt - b.createdAt);
    const remote = [...snaps[0].profiles].sort((a, b) => (a.profile.createdAt ?? 0) - (b.profile.createdAt ?? 0));
    const remoteIds = new Set(remote.map((r) => r.profile.id));
    const free = local.filter((p) => !remoteIds.has(p.id));
    for (const r of remote) {
      if (local.some((p) => p.id === r.profile.id)) continue;
      const p = free.shift(); if (p) await renameProfile(p.id, r.profile.id);
    }
  }
  const mine = await buildBackup();
  const byId = new Map((mine.profiles ?? []).map((x) => [x.profile.id, x]));
  for (const snap of snaps) for (const rp of snap.profiles) {
    const cur = byId.get(rp.profile.id);
    byId.set(rp.profile.id, cur ? { profile: { ...rp.profile, ...cur.profile }, data: mergeChild(cur.data, rp.data) } : { profile: rp.profile, data: mergeChild({ attempts: [], lessonStates: [], events: [], settings: [], recordings: [] }, rp.data) });
  }
  await restoreBackup({ ...mine, profiles: [...byId.values()], activeChildId: (await getActiveProfile())?.id });
}

let running: Promise<SyncResult> | null = null;
export interface SyncResult { pushed: number; pulled: number; at: number }

/** Jedno kolo: stáhnout a sloučit cizí snímky, pak odeslat vlastní (přes outbox, takže výpadek nic neztratí). */
export function syncNow(): Promise<SyncResult> {
  running ??= (async () => {
    let s = await getSyncState();
    if (!s.enabled || !s.key || !s.familyId || !s.token || !s.serverUrl) throw new Error('Synchronizace je vypnutá.');
    const r = await api(s, `/v1/families/${s.familyId}/log?since=${s.lastSeq}`);
    const entries = r.ok ? ((await r.json()) as { entries: (Cipher & { seq: number; deviceId: string })[] }).entries : [];
    const latest = new Map<string, Cipher & { seq: number; deviceId: string }>();
    for (const e of entries) if (e.deviceId !== s.deviceId) latest.set(e.deviceId, e);
    const snaps: Snapshot[] = [];
    for (const e of latest.values()) snaps.push(await decryptJson<Snapshot>(s.key, e));
    if (snaps.length) await applyRemote(snaps, !!s.adoptIds);
    const lastSeq = entries.reduce((m, e) => Math.max(m, e.seq), s.lastSeq);
    s = await updateSyncState({ lastSeq, adoptIds: snaps.length ? false : s.adoptIds, outbox: [await encryptJson(s.key, await snapshot(s.deviceId))] });
    let pushed = 0;
    while (s.outbox.length) {
      const res = await api(s, `/v1/families/${s.familyId}/log`, { method: 'POST', body: JSON.stringify({ deviceId: s.deviceId, ...s.outbox[0] }) });
      if (!res.ok) throw new Error('Odeslání se nepovedlo, zkusíme to příště.');
      const { seq } = (await res.json()) as { seq: number };
      s = await updateSyncState({ outbox: s.outbox.slice(1), lastSeq: s.lastSeq + 1 === seq ? seq : s.lastSeq });
      pushed++;
    }
    const at = Date.now();
    await updateSyncState({ lastSyncAt: at });
    return { pushed, pulled: snaps.length, at };
  })().finally(() => { running = null; });
  return running;
}

/** Automatické kolo po startu a každou minutu, jen když je synchronizace zapnutá. */
export function startAutoSync() {
  const tick = async () => { try { if ((await getSyncState()).enabled) await syncNow(); } catch { /* offline: outbox počká */ } };
  setTimeout(tick, 3000);
  setInterval(tick, 60_000);
}
