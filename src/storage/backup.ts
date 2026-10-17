/** Záloha a obnova všech dat do jednoho souboru JSON (nahrávky jako base64). Bez backendu. */
import type { IDBPDatabase } from 'idb';
import { getDb, openChildDb, type ActivityEvent, type Attempt, type LessonState, type PrvnacekDB } from './db';
import { deviceDb, getActiveProfile, listProfiles, setActiveProfile, type ChildProfile } from './profiles';

export const BACKUP_FORMAT = 'prvnacek-backup';
export const BACKUP_VERSION = 3; // v3 = všechny profily dětí (M5); v2 = + events (M4); import v1/v2 do aktivního profilu zůstává

interface BackupRecording { audioId: string; mimeType: string; createdAt: number; base64: string }
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  attempts: Attempt[];
  lessonStates: LessonState[];
  settings: { key: string; value: unknown }[];
  recordings: BackupRecording[];
  /** Od verze 2 (týdenní souhrn). Ve v1 chybí. */
  events?: ActivityEvent[];
  /** v3: všechny profily (data každého dítěte ve stejném tvaru jako v1/v2). Horní pole jsou pak prázdná. */
  profiles?: { profile: Pick<ChildProfile, 'id' | 'name' | 'avatar' | 'createdAt'>; data: ChildData }[];
  activeChildId?: string;
}
export type ChildData = Pick<BackupFile, 'attempts' | 'lessonStates' | 'settings' | 'recordings' | 'events'>;
export interface BackupSummary { exportedAt: string; version: number; profiles: number; attempts: number; lessonStates: number; settings: number; tests: number; recordings: number }

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

async function childData(db: IDBPDatabase<PrvnacekDB>): Promise<ChildData> {
  const keys = await db.getAllKeys('settings');
  const settings = [];
  for (const k of keys) settings.push({ key: String(k), value: await db.get('settings', k) });
  const recs = await db.getAll('recordings');
  return {
    attempts: await db.getAll('attempts'),
    lessonStates: await db.getAll('lessonStates'),
    events: await db.getAll('events'),
    settings,
    recordings: recs.map((r) => ({ audioId: r.audioId, mimeType: r.mimeType, createdAt: r.createdAt, base64: toBase64(r.data) })),
  };
}

/** Záloha jedné databáze dítěte ve formátu v2 (snímek před migrací). */
export async function buildBackupFromDbName(name: string): Promise<BackupFile> {
  const db = await openChildDb(name);
  try { return { format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), ...(await childData(db)) }; } finally { db.close(); }
}

/** Záloha v3: všechny profily v zařízení. */
export async function buildBackup(): Promise<BackupFile> {
  await getDb(); // zajistí migraci
  const profiles = [];
  for (const p of await listProfiles()) {
    const db = await openChildDb(p.dbName);
    try { profiles.push({ profile: { id: p.id, name: p.name, avatar: p.avatar, createdAt: p.createdAt }, data: await childData(db) }); } finally { db.close(); }
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), attempts: [], lessonStates: [], settings: [], recordings: [], events: [], profiles, activeChildId: (await getActiveProfile())?.id };
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `prvnacek-zaloha-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-v${BACKUP_VERSION}.json`;
}

const childParts = (b: BackupFile): ChildData[] => (b.profiles ? b.profiles.map((p) => p.data) : [b]);
export function summarize(b: BackupFile): BackupSummary {
  const parts = childParts(b);
  const sum = (f: (d: ChildData) => number) => parts.reduce((n, d) => n + f(d), 0);
  return {
    exportedAt: b.exportedAt,
    version: b.version,
    profiles: b.profiles?.length ?? 1,
    attempts: sum((d) => d.attempts.length),
    lessonStates: sum((d) => d.lessonStates.length),
    settings: sum((d) => d.settings.filter((s) => !s.key.startsWith('tests:')).length),
    tests: sum((d) => d.settings.filter((s) => s.key.startsWith('tests:')).reduce((n, s) => n + (Array.isArray(s.value) ? s.value.length : 0), 0)),
    recordings: sum((d) => d.recordings.length),
  };
}

function validateChild(b: Partial<ChildData> | null | undefined): void {
  if (!b || !Array.isArray(b.attempts) || !Array.isArray(b.lessonStates) || !Array.isArray(b.settings) || !Array.isArray(b.recordings))
    throw new Error('Záloha je poškozená nebo neúplná.');
  for (const r of b.recordings) if (!r || typeof r.audioId !== 'string' || typeof r.base64 !== 'string') throw new Error('Záloha obsahuje poškozenou nahrávku.');
  for (const s of b.settings) if (!s || typeof s.key !== 'string') throw new Error('Záloha obsahuje poškozené nastavení.');
  if (b.events !== undefined && !Array.isArray(b.events)) throw new Error('Záloha je poškozená nebo neúplná.');
}

/** Přečte a zkontroluje soubor; při chybě vyhodí Error s českou zprávou. */
export async function parseBackup(file: File): Promise<BackupFile> {
  let data: unknown;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Soubor není platná záloha Prvňáčka (nejde přečíst).'); }
  const b = data as Partial<BackupFile> | null;
  if (!b || b.format !== BACKUP_FORMAT) throw new Error('Soubor není záloha Prvňáčka.');
  if (typeof b.exportedAt !== 'string') throw new Error('Záloha je poškozená nebo neúplná.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new Error(`Záloha je z novější verze aplikace (formát ${String(b.version)}). Aktualizuj aplikaci a zkus to znovu.`);
  validateChild(b);
  if (b.profiles !== undefined) {
    if (!Array.isArray(b.profiles) || !b.profiles.length) throw new Error('Záloha je poškozená nebo neúplná.');
    for (const p of b.profiles) {
      if (!p?.profile || typeof p.profile.id !== 'string' || typeof p.profile.name !== 'string') throw new Error('Záloha obsahuje poškozený profil.');
      validateChild(p.data);
    }
  }
  return b as BackupFile;
}

async function writeChild(db: IDBPDatabase<PrvnacekDB>, b: ChildData): Promise<void> {
  const recs = b.recordings.map((r) => ({ audioId: r.audioId, mimeType: r.mimeType, createdAt: r.createdAt, data: fromBase64(r.base64) }));
  const tx = db.transaction(['attempts', 'lessonStates', 'recordings', 'settings', 'events'], 'readwrite');
  await Promise.all([tx.objectStore('attempts').clear(), tx.objectStore('lessonStates').clear(), tx.objectStore('recordings').clear(), tx.objectStore('settings').clear(), tx.objectStore('events').clear()]);
  for (const e of b.events ?? []) tx.objectStore('events').put(e);
  for (const a of b.attempts) tx.objectStore('attempts').put(a);
  for (const s of b.lessonStates) tx.objectStore('lessonStates').put(s);
  for (const r of recs) tx.objectStore('recordings').put(r);
  for (const s of b.settings) tx.objectStore('settings').put(s.value, s.key);
  await tx.done;
}

/** v1/v2: přepíše data AKTIVNÍHO dítěte (každá DB v jedné transakci).
 *  v3: obnoví všechny profily ze zálohy (stejné id = stejná DB), profily, které v záloze nejsou, nechá být. */
export async function restoreBackup(b: BackupFile): Promise<void> {
  if (!b.profiles) { await writeChild(await getDb(), b); return; }
  await getDb();
  const dev = await deviceDb();
  const existing = await listProfiles();
  for (const { profile, data } of b.profiles) {
    const cur = existing.find((p) => p.id === profile.id);
    const p: ChildProfile = { ...profile, avatar: profile.avatar ?? 'tucnak', createdAt: profile.createdAt ?? Date.now(), dbName: cur?.dbName ?? `prvnacek-${profile.id}` };
    const db = await openChildDb(p.dbName);
    try { await writeChild(db, data); } finally { db.close(); }
    await dev.put('profiles', p);
  }
  const want = b.activeChildId && b.profiles.some((x) => x.profile.id === b.activeChildId) ? b.activeChildId : b.profiles[0].profile.id;
  await setActiveProfile(want);
}

/** Stažení přes Blob + odkaz; na iPadu Safari, kde stažení nejde, nabídne sdílení. */
export async function downloadBackup(b: BackupFile): Promise<'download' | 'share'> {
  const name = backupFileName();
  const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && nav.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'share'; } catch (e) { if ((e as Error).name === 'AbortError') return 'share'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'download';
}

/** Čistý začátek: smaže pokrok (pokusy), stavy/zamykání lekcí, události a výsledky zkoušek (settings „tests:*“).
 *  NEMAŽE vlastní nahrávky rodiče ani ostatní nastavení (tvary písma, album:owned). Jedna transakce. */
export async function resetProgress(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['attempts', 'lessonStates', 'settings', 'events'], 'readwrite');
  tx.objectStore('attempts').clear();
  tx.objectStore('events').clear();
  tx.objectStore('lessonStates').clear();
  const keys = await tx.objectStore('settings').getAllKeys();
  for (const k of keys) if ((String(k).startsWith('tests:') || String(k).startsWith('pexeso:'))) tx.objectStore('settings').delete(k);
  await tx.done;
}
