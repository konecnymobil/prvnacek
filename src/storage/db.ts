/**
 * IndexedDB vrstva (knihovna idb). Data zůstávají jen v iPadu.
 * Úložiště:
 *  - attempts:     hodnocené úlohy procvičování (pro doporučení ke zkoušce, přehled pro rodiče)
 *  - lessonStates: stav lekce (zamčeno / procvičuje / doporučeno / schváleno)
 *  - recordings:   vlastní nahrávky rodiče, klíč = audioId (stejné id jako syntetický zvuk)
 *  - settings:     klíč–hodnota
 * Id položek obsahu se po vydání nemění, proto na ně lze navázat pokrok.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AudioId, LessonId, OrderId } from '../content/types';

export type LessonStatus = 'locked' | 'practicing' | 'recommended' | 'approved';

export interface Attempt {
  id?: number;
  orderId: OrderId;
  lessonId: LessonId;
  activity: string; // "A1" … "A7"
  itemId: string; // id písmene/slabiky/slova
  correct: boolean;
  chosenId: string | null; // záměna (co dítě vybralo)
  at: number; // Date.now()
  day: string; // YYYY-MM-DD v místním čase
}

export interface LessonState {
  key: string; // `${orderId}:${lessonId}`
  orderId: OrderId;
  lessonId: LessonId;
  status: LessonStatus;
  updatedAt: number;
  approvedAt: number | null;
  approvedBy: 'test' | 'manual' | null;
}

/** Uloženo jako ArrayBuffer (ne Blob): WebKit v některých režimech Blob do IndexedDB neuloží. */
interface StoredRecording {
  audioId: AudioId;
  data: ArrayBuffer;
  mimeType: string;
  createdAt: number;
}

export interface Recording {
  audioId: AudioId;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

interface PrvnacekDB extends DBSchema {
  attempts: { key: number; value: Attempt; indexes: { byLesson: [OrderId, LessonId] } };
  lessonStates: { key: string; value: LessonState };
  recordings: { key: AudioId; value: StoredRecording };
  settings: { key: string; value: unknown };
}

export const DB_NAME = 'prvnacek';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PrvnacekDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<PrvnacekDB>> {
  dbPromise ??= openDB<PrvnacekDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const attempts = db.createObjectStore('attempts', { keyPath: 'id', autoIncrement: true });
        attempts.createIndex('byLesson', ['orderId', 'lessonId']);
        db.createObjectStore('lessonStates', { keyPath: 'key' });
        db.createObjectStore('recordings', { keyPath: 'audioId' });
        db.createObjectStore('settings');
      }
    },
  });
  return dbPromise;
}

export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- pokrok ----------
export async function addAttempt(a: Omit<Attempt, 'id' | 'at' | 'day'> & Partial<Pick<Attempt, 'at' | 'day'>>): Promise<number> {
  const at = a.at ?? Date.now();
  return (await getDb()).add('attempts', { ...a, at, day: a.day ?? localDay(new Date(at)) });
}

export async function getAttempts(orderId: OrderId, lessonId: LessonId): Promise<Attempt[]> {
  const all = await (await getDb()).getAllFromIndex('attempts', 'byLesson', [orderId, lessonId]);
  return all.sort((x, y) => x.at - y.at);
}

export async function getLessonState(orderId: OrderId, lessonId: LessonId): Promise<LessonState | undefined> {
  return (await getDb()).get('lessonStates', `${orderId}:${lessonId}`);
}

export async function setLessonStatus(
  orderId: OrderId,
  lessonId: LessonId,
  status: LessonStatus,
  approvedBy: LessonState['approvedBy'] = null,
): Promise<LessonState> {
  const now = Date.now();
  const state: LessonState = {
    key: `${orderId}:${lessonId}`,
    orderId,
    lessonId,
    status,
    updatedAt: now,
    approvedAt: status === 'approved' ? now : null,
    approvedBy: status === 'approved' ? approvedBy : null,
  };
  await (await getDb()).put('lessonStates', state);
  return state;
}

// ---------- vlastní nahrávky rodiče ----------
export async function saveRecording(audioId: AudioId, blob: Blob): Promise<void> {
  const data = await blob.arrayBuffer();
  await (await getDb()).put('recordings', { audioId, data, mimeType: blob.type, createdAt: Date.now() });
}

export async function getRecording(audioId: AudioId): Promise<Recording | undefined> {
  const r = await (await getDb()).get('recordings', audioId);
  if (!r) return undefined;
  return { audioId: r.audioId, blob: new Blob([r.data], { type: r.mimeType }), mimeType: r.mimeType, createdAt: r.createdAt };
}

export async function deleteRecording(audioId: AudioId): Promise<void> {
  await (await getDb()).delete('recordings', audioId);
}

export async function listRecordingIds(): Promise<AudioId[]> {
  return (await getDb()).getAllKeys('recordings');
}

// ---------- nastavení ----------
export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await getDb()).get('settings', key) as Promise<T | undefined>;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await (await getDb()).put('settings', value, key);
}

/** Požádá o trvalé úložiště, aby Safari data nesmazal. Vrací, zda je úložiště trvalé. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
