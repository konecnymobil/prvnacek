/** Záloha a obnova všech dat do jednoho souboru JSON (nahrávky jako base64). Bez backendu. */
import { getDb, type Attempt, type LessonState } from './db';

export const BACKUP_FORMAT = 'prvnacek-backup';
export const BACKUP_VERSION = 1;

interface BackupRecording { audioId: string; mimeType: string; createdAt: number; base64: string }
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  attempts: Attempt[];
  lessonStates: LessonState[];
  settings: { key: string; value: unknown }[];
  recordings: BackupRecording[];
}
export interface BackupSummary { exportedAt: string; version: number; attempts: number; lessonStates: number; settings: number; tests: number; recordings: number }

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

export async function buildBackup(): Promise<BackupFile> {
  const db = await getDb();
  const keys = await db.getAllKeys('settings');
  const settings = [];
  for (const k of keys) settings.push({ key: String(k), value: await db.get('settings', k) });
  const recs = await db.getAll('recordings');
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    attempts: await db.getAll('attempts'),
    lessonStates: await db.getAll('lessonStates'),
    settings,
    recordings: recs.map((r) => ({ audioId: r.audioId, mimeType: r.mimeType, createdAt: r.createdAt, base64: toBase64(r.data) })),
  };
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `prvnacek-zaloha-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-v${BACKUP_VERSION}.json`;
}

export function summarize(b: BackupFile): BackupSummary {
  return {
    exportedAt: b.exportedAt,
    version: b.version,
    attempts: b.attempts.length,
    lessonStates: b.lessonStates.length,
    settings: b.settings.filter((s) => !s.key.startsWith('tests:')).length,
    tests: b.settings.filter((s) => s.key.startsWith('tests:')).reduce((n, s) => n + (Array.isArray(s.value) ? s.value.length : 0), 0),
    recordings: b.recordings.length,
  };
}

/** Přečte a zkontroluje soubor; při chybě vyhodí Error s českou zprávou. */
export async function parseBackup(file: File): Promise<BackupFile> {
  let data: unknown;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Soubor není platná záloha Prvňáčka (nejde přečíst).'); }
  const b = data as Partial<BackupFile> | null;
  if (!b || b.format !== BACKUP_FORMAT) throw new Error('Soubor není záloha Prvňáčka.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) throw new Error(`Záloha je z novější verze aplikace (formát ${String(b.version)}). Aktualizuj aplikaci a zkus to znovu.`);
  if (!Array.isArray(b.attempts) || !Array.isArray(b.lessonStates) || !Array.isArray(b.settings) || !Array.isArray(b.recordings) || typeof b.exportedAt !== 'string')
    throw new Error('Záloha je poškozená nebo neúplná.');
  for (const r of b.recordings) if (!r || typeof r.audioId !== 'string' || typeof r.base64 !== 'string') throw new Error('Záloha obsahuje poškozenou nahrávku.');
  for (const s of b.settings) if (!s || typeof s.key !== 'string') throw new Error('Záloha obsahuje poškozené nastavení.');
  return b as BackupFile;
}

/** Přepíše všechna data zálohou (v jedné transakci – při chybě zůstanou původní data). */
export async function restoreBackup(b: BackupFile): Promise<void> {
  const db = await getDb();
  const recs = b.recordings.map((r) => ({ audioId: r.audioId, mimeType: r.mimeType, createdAt: r.createdAt, data: fromBase64(r.base64) }));
  const tx = db.transaction(['attempts', 'lessonStates', 'recordings', 'settings'], 'readwrite');
  await Promise.all([tx.objectStore('attempts').clear(), tx.objectStore('lessonStates').clear(), tx.objectStore('recordings').clear(), tx.objectStore('settings').clear()]);
  for (const a of b.attempts) tx.objectStore('attempts').put(a);
  for (const s of b.lessonStates) tx.objectStore('lessonStates').put(s);
  for (const r of recs) tx.objectStore('recordings').put(r);
  for (const s of b.settings) tx.objectStore('settings').put(s.value, s.key);
  await tx.done;
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

/** Čistý začátek: smaže pokrok (pokusy), stavy/zamykání lekcí a výsledky zkoušek (settings „tests:*“).
 *  NEMAŽE vlastní nahrávky rodiče ani ostatní nastavení (např. tvary písma). Jedna transakce. */
export async function resetProgress(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['attempts', 'lessonStates', 'settings'], 'readwrite');
  tx.objectStore('attempts').clear();
  tx.objectStore('lessonStates').clear();
  const keys = await tx.objectStore('settings').getAllKeys();
  for (const k of keys) if (String(k).startsWith('tests:')) tx.objectStore('settings').delete(k);
  await tx.done;
}
