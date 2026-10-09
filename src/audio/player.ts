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
  const c = audioCtx();
  if (c && c.state !== 'running') c.resume().catch(() => {});
  if (unlocked) return;
  const a = audioEl();
  a.src = silentWavUrl();
  a.play().then(() => (unlocked = true)).catch(() => {});
}

export function stopAudio(): void {
  playToken++;
  try {
    currentSrc?.stop();
  } catch {
    // už skončil
  }
  currentFinish?.();
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

/** Sdílený AudioContext (Web Audio je na iOS po nahrávání spolehlivější než <audio> s Blob URL). */
let ctx: AudioContext | null = null;
let currentSrc: AudioBufferSourceNode | null = null;
let currentFinish: (() => void) | null = null;

function audioCtx(): AudioContext | null {
  if (ctx) return ctx;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** iOS: po getUserMedia zůstává relace „play-and-record“ (tichý/slabý zvuk) → přepnout na „playback“. */
function preferPlaybackSession(): void {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    // není podporováno
  }
}

async function playViaWebAudio(blob: Blob, token: number): Promise<void> {
  const c = audioCtx();
  if (!c) throw new Error('Web Audio není k dispozici.');
  preferPlaybackSession();
  if (c.state !== 'running') await c.resume();
  const data = await blob.arrayBuffer();
  // starší Safari umí jen callback variantu decodeAudioData
  const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
    const r = c.decodeAudioData(data, resolve, reject);
    if (r && typeof r.then === 'function') r.then(resolve, reject);
  });
  if (token !== playToken) return;
  await new Promise<void>((resolve) => {
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(c.destination);
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      src.onended = null;
      if (currentSrc === src) currentSrc = null;
      if (currentFinish === finish) currentFinish = null;
      resolve();
    };
    currentSrc = src;
    currentFinish = finish;
    src.onended = finish;
    timer = window.setTimeout(finish, buffer.duration * 1000 + 1500); // pojistka
    src.start(0);
  });
}

async function playViaElement(blob: Blob, token: number): Promise<void> {
  const a = audioEl();
  a.pause();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(blob);
  a.src = currentUrl;
  preferPlaybackSession();
  await new Promise<void>((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      a.removeEventListener('ended', done);
      a.removeEventListener('error', fail);
      a.removeEventListener('loadedmetadata', arm);
    };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Zvuk se nepodařilo přehrát.')); };
    const arm = () => {
      window.clearTimeout(timer);
      const d = Number.isFinite(a.duration) ? a.duration : 30;
      timer = window.setTimeout(done, d * 1000 + 2000);
    };
    timer = window.setTimeout(done, 30_000);
    a.addEventListener('ended', done);
    a.addEventListener('error', fail);
    a.addEventListener('loadedmetadata', arm);
    a.play().catch((e: unknown) => {
      cleanup();
      if (token !== playToken) resolve();
      else reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

/**
 * Přehraje Blob (např. právě pořízenou nahrávku). Primárně přes Web Audio, při selhání
 * (dekódování, kontext) záložně přes <audio>. Vždy skončí (ended / chyba / časová pojistka).
 */
export async function playBlob(blob: Blob, token = ++playToken): Promise<void> {
  try {
    await playViaWebAudio(blob, token);
    return;
  } catch {
    if (token !== playToken) return;
  }
  try {
    await playViaElement(blob, token);
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)} Zkontroluj hlasitost a přepínač ztlumení.`);
  }
}
