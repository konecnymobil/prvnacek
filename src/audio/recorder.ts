/**
 * Nahrávání z mikrofonu (MediaRecorder). Safari na iPadu: od iOS 14.5, formát audio/mp4 (AAC),
 * od iOS 18.4 i webm/opus. Formát se volí přes isTypeSupported, start() je v try/catch.
 * getUserMedia se musí volat z obsluhy klepnutí a jen přes HTTPS (nebo localhost).
 */
const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export function isRecordingSupported(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

export class RecorderError extends Error {}

/** Česká hláška pro chyby mikrofonu. */
export function micErrorMessage(e: unknown): string {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Mikrofon není povolený. Klepni na Nahrát znovu a povol přístup. Když se iPad už neptá, zapni mikrofon v Nastavení › Aplikace › Safari › Mikrofon (nebo ve volbách webu v Safari).';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenašel jsem žádný mikrofon.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Mikrofon teď používá jiná aplikace. Zavři ji a zkus to znovu.';
    default:
      return e instanceof RecorderError ? e.message : `Nahrávání se nepovedlo${e instanceof Error && e.message ? `: ${e.message}` : '.'}`;
  }
}

export interface ActiveRecording {
  mimeType: string;
  /** Ukončí nahrávání a vrátí výsledný zvuk. */
  stop(): Promise<Blob>;
  /** Zruší nahrávání bez výsledku. */
  cancel(): void;
}

export async function startRecording(): Promise<ActiveRecording> {
  if (!window.isSecureContext) throw new RecorderError('Mikrofon funguje jen přes zabezpečené připojení (https).');
  if (!isRecordingSupported()) throw new RecorderError('Tento prohlížeč neumí nahrávat zvuk (chybí MediaRecorder).');

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
  const preferred = pickMimeType();
  let rec: MediaRecorder;
  try {
    rec = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
  } catch {
    try {
      rec = new MediaRecorder(stream);
    } catch (e) {
      stopTracks();
      throw e;
    }
  }
  const chunks: Blob[] = [];
  rec.addEventListener('dataavailable', (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  });
  try {
    rec.start();
  } catch (e) {
    stopTracks();
    throw e;
  }
  const mimeType = rec.mimeType || preferred || 'audio/mp4';

  return {
    mimeType,
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        rec.addEventListener(
          'stop',
          () => {
            stopTracks();
            const blob = new Blob(chunks, { type: mimeType });
            if (blob.size === 0) reject(new RecorderError('Nahrávka je prázdná. Zkus to znovu a mluv aspoň chvilku.'));
            else resolve(blob);
          },
          { once: true },
        );
        if (rec.state !== 'inactive') rec.stop();
        else rec.dispatchEvent(new Event('stop'));
      }),
    cancel: () => {
      if (rec.state !== 'inactive') rec.stop();
      stopTracks();
    },
  };
}
