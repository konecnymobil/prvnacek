/**
 * Přehrávač zvuků. Pro každé audioId hledá nejdřív vlastní nahrávku rodiče v IndexedDB,
 * teprve potom syntetický zvuk public/audio/tts/<audioId>.mp3.
 *
 * iOS Safari: přehrávání musí začít v obsluze klepnutí. Proto playAudio() ještě synchronně
 * (před prvním await) „odemkne“ sdílený <audio> prvek tichým zvukem; po odemknutí smí stejný
 * prvek hrát i po asynchronním načtení. Zvuk se načítá přes fetch() → Blob URL, takže funguje
 * i offline ze service workeru (bez problémů s HTTP Range požadavky Safari).
 */
import type { AudioId } from '../content/types';
import { getRecording } from '../storage/db';

export type AudioSource = 'parent' | 'tts';

export function ttsUrl(audioId: AudioId): string {
  return `${import.meta.env.BASE_URL}audio/tts/${encodeURIComponent(audioId)}.mp3`;
}

let el: HTMLAudioElement | null = null;
let unlocked = false;
let currentUrl: string | null = null;
let playToken = 0;

function silentWavUrl(): string {
  // 0,05 s ticha, 8 kHz, 8 bit mono
  const n = 400;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (buf[o + i] = c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  w(36, 'data'); dv.setUint32(40, n, true); buf.fill(128, 44);
  let bin = '';
  buf.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function audioEl(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
  }
  return el;
}

/** Zavolat synchronně v obsluze klepnutí (playAudio to dělá samo). */
export function unlockAudio(): void {
  if (unlocked) return;
  const a = audioEl();
  a.src = silentWavUrl();
  a.play().then(() => (unlocked = true)).catch(() => {});
}

export function stopAudio(): void {
  playToken++;
  if (el) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

/** Najde zdroj zvuku: vlastní nahrávka rodiče, jinak syntetický hlas. */
export async function resolveAudio(audioId: AudioId): Promise<{ blob: Blob; source: AudioSource }> {
  try {
    const rec = await getRecording(audioId);
    if (rec) return { blob: rec.blob, source: 'parent' };
  } catch {
    // IndexedDB nedostupná (např. soukromé okno) → syntetický zvuk
  }
  const res = await fetch(ttsUrl(audioId));
  if (!res.ok) throw new Error(`Zvuk ${audioId} se nepodařilo načíst (HTTP ${res.status}).`);
  const blob = await res.blob();
  return { blob: blob.type ? blob : new Blob([blob], { type: 'audio/mpeg' }), source: 'tts' };
}

/** Přehraje zvuk. Volat přímo z obsluhy klepnutí. Resolves po skončení přehrávání. */
export async function playAudio(audioId: AudioId): Promise<AudioSource> {
  unlockAudio(); // synchronně, ještě v rámci gesta
  const token = ++playToken;
  const { blob, source } = await resolveAudio(audioId);
  if (token !== playToken) return source; // mezitím spuštěn jiný zvuk
  await playBlob(blob, token);
  return source;
}

/** Přehraje Blob (např. právě pořízenou nahrávku). */
export async function playBlob(blob: Blob, token = ++playToken): Promise<void> {
  const a = audioEl();
  a.pause();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(blob);
  a.src = currentUrl;
  await new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Zvuk se nepodařilo přehrát.')); };
    const cleanup = () => { a.removeEventListener('ended', done); a.removeEventListener('error', fail); };
    a.addEventListener('ended', done);
    a.addEventListener('error', fail);
    a.play().catch((e: unknown) => {
      cleanup();
      if (token !== playToken) resolve();
      else reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}
