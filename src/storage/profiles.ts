/**
 * M5 krok 1: lokální profily dětí. Bez cloudu a synchronizace.
 * Oddělení dat: každé dítě má vlastní databázi IndexedDB (dbName). Uvnitř jsou stejné stores jako dřív
 * (attempts, events, lessonStates, settings, recordings) → všechna data dítěte, včetně nahrávek
 * (klíč [childId, audioId] = databáze dítěte + audioId), jsou oddělená podle childId.
 * Zařízení (globálně, DB „prvnacek-device“): seznam profilů, aktivní dítě, příznak migrace, snímky před migrací.
 * Migrace v1: stávající DB „prvnacek“ se stane databází prvního profilu – data se nikam nekopírují, nic se neztratí.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type AvatarId = 'tucnak' | 'zelva' | 'los' | 'motyl' | 'vcelka' | 'lama' | 'pes' | 'puma';
export const AVATARS: { id: AvatarId; emoji: string; label: string }[] = [
  { id: 'tucnak', emoji: '🐧', label: 'tučňák' }, { id: 'zelva', emoji: '🐢', label: 'želva' },
  { id: 'los', emoji: '🦌', label: 'los' }, { id: 'motyl', emoji: '🦋', label: 'motýl' },
  { id: 'vcelka', emoji: '🐝', label: 'včelka' }, { id: 'lama', emoji: '🦙', label: 'lama' },
  { id: 'pes', emoji: '🐶', label: 'pes' }, { id: 'puma', emoji: '🐆', label: 'puma' },
];
export const avatarEmoji = (id: AvatarId) => AVATARS.find((a) => a.id === id)?.emoji ?? '🙂';

export interface ChildProfile { id: string; name: string; avatar: AvatarId; dbName: string; createdAt: number }
export interface Snapshot { id: string; at: number; json: string }

interface DeviceDB extends DBSchema {
  profiles: { key: string; value: ChildProfile };
  meta: { key: string; value: unknown };
  snapshots: { key: string; value: Snapshot };
}

export const DEVICE_DB = 'prvnacek-device';
export const LEGACY_DB = 'prvnacek';
export const PRE_MIGRATION_SNAPSHOT = 'pre-m5';
const ACTIVE = 'activeChildId';
const MIGRATED = 'migratedV1';

let devPromise: Promise<IDBPDatabase<DeviceDB>> | null = null;
export function deviceDb(): Promise<IDBPDatabase<DeviceDB>> {
  devPromise ??= openDB<DeviceDB>(DEVICE_DB, 1, {
    upgrade(db) {
      db.createObjectStore('profiles', { keyPath: 'id' });
      db.createObjectStore('meta');
      db.createObjectStore('snapshots', { keyPath: 'id' });
    },
  });
  return devPromise;
}

const newId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Snímek celé staré databáze jako JSON zálohy (formát v2) – bez otevírání/upgradu cizí verze. */
async function snapshotLegacy(): Promise<string | null> {
  const names = (await indexedDB.databases?.())?.map((d) => d.name) ?? null;
  if (names && !names.includes(LEGACY_DB)) return null; // čistá instalace
  const { buildBackupFromDbName } = await import('./backup');
  const b = await buildBackupFromDbName(LEGACY_DB);
  const empty = !b.attempts.length && !b.lessonStates.length && !b.settings.length && !b.recordings.length && !(b.events ?? []).length;
  return empty ? null : JSON.stringify(b);
}

/**
 * Idempotentní migrace. Kroky: (1) snímek do snapshots, pokud ještě není, (2) v JEDNÉ transakci profil + aktivní + příznak.
 * Přerušení po (1) → při dalším startu se (1) přeskočí a dokončí se (2). Po (2) se nic neopakuje.
 */
export async function ensureProfiles(): Promise<ChildProfile> {
  const dev = await deviceDb();
  if (!(await dev.get('meta', MIGRATED))) {
    if (!(await dev.get('snapshots', PRE_MIGRATION_SNAPSHOT))) {
      const json = await snapshotLegacy();
      if (json) await dev.put('snapshots', { id: PRE_MIGRATION_SNAPSHOT, at: Date.now(), json });
    }
    const tx = dev.transaction(['profiles', 'meta'], 'readwrite');
    const existing = await tx.objectStore('profiles').getAll();
    let first = existing.find((p) => p.dbName === LEGACY_DB);
    if (!first) { first = { id: newId(), name: 'Dítě 1', avatar: 'tucnak', dbName: LEGACY_DB, createdAt: Date.now() }; tx.objectStore('profiles').put(first); }
    if (!(await tx.objectStore('meta').get(ACTIVE))) tx.objectStore('meta').put(first.id, ACTIVE);
    tx.objectStore('meta').put(Date.now(), MIGRATED);
    await tx.done;
  }
  return (await getActiveProfile())!;
}

export async function listProfiles(): Promise<ChildProfile[]> {
  return (await (await deviceDb()).getAll('profiles')).sort((a, b) => a.createdAt - b.createdAt);
}
export async function getActiveProfile(): Promise<ChildProfile | undefined> {
  const dev = await deviceDb();
  const id = (await dev.get('meta', ACTIVE)) as string | undefined;
  const all = await listProfiles();
  return all.find((p) => p.id === id) ?? all[0];
}
export async function setActiveProfile(id: string): Promise<void> {
  await (await deviceDb()).put('meta', id, ACTIVE);
}
export async function addProfile(name: string, avatar: AvatarId): Promise<ChildProfile> {
  const id = newId();
  const p: ChildProfile = { id, name: name.trim() || 'Dítě', avatar, dbName: `prvnacek-${id}`, createdAt: Date.now() };
  await (await deviceDb()).put('profiles', p);
  return p;
}
export async function updateProfile(id: string, patch: Partial<Pick<ChildProfile, 'name' | 'avatar'>>): Promise<void> {
  const dev = await deviceDb();
  const p = await dev.get('profiles', id);
  if (p) await dev.put('profiles', { ...p, ...patch, name: (patch.name ?? p.name).trim() || p.name });
}
/** Smaže profil i celou jeho databázi (pokrok, nastavení, nahrávky). Poslední profil smazat nejde. */
export async function deleteProfile(id: string): Promise<void> {
  const dev = await deviceDb();
  const all = await listProfiles();
  if (all.length <= 1) throw new Error('Poslední profil nejde smazat.');
  const p = all.find((x) => x.id === id);
  if (!p) return;
  await dev.delete('profiles', id);
  if ((await dev.get('meta', ACTIVE)) === id) await dev.put('meta', all.find((x) => x.id !== id)!.id, ACTIVE);
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase(p.dbName); r.onsuccess = r.onerror = r.onblocked = () => res(); });
}
export async function getSnapshot(id = PRE_MIGRATION_SNAPSHOT): Promise<Snapshot | undefined> {
  return (await deviceDb()).get('snapshots', id);
}
