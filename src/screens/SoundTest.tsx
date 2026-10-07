import { useEffect, useRef, useState } from 'react';
import type { Content } from '../content/load';
import type { Screen } from '../App';
import { playAudio, playBlob, stopAudio, unlockAudio, type AudioSource } from '../audio/player';
import { isRecordingSupported, micErrorMessage, pickMimeType, startRecording, type ActiveRecording } from '../audio/recorder';
import { deleteRecording, getRecording, saveRecording } from '../storage/db';

/** Ukázkový zvuk: pozdrav z prompts.json (skutečná mp3 z audio/tts). */
export const SAMPLE_PROMPT_ID = 'p-welcome';
const FALLBACK_AUDIO_ID = 'snd-p-welcome';

type PlayState = { kind: 'idle' } | { kind: 'playing'; source?: AudioSource } | { kind: 'done'; source: AudioSource } | { kind: 'error'; msg: string };
type MicState = 'idle' | 'starting' | 'recording' | 'stopping';

function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

const fmtSec = (ms: number) => `${Math.floor(ms / 1000)} s`;

export default function SoundTest({ content, persisted, go }: { content: Content | null; persisted: boolean | null; go: (s: Screen) => void }) {
  const prompt = content?.promptById.get(SAMPLE_PROMPT_ID);
  const audioId = prompt?.audioId ?? FALLBACK_AUDIO_ID;

  const [play, setPlay] = useState<PlayState>({ kind: 'idle' });
  const [mic, setMic] = useState<MicState>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Blob | null>(null);
  const [takePlaying, setTakePlaying] = useState(false);
  const [hasOwn, setHasOwn] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const recRef = useRef<ActiveRecording | null>(null);

  useEffect(() => {
    getRecording(audioId).then((r) => setHasOwn(!!r), () => setHasOwn(false));
  }, [audioId]);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
      recRef.current?.cancel();
      stopAudio();
    };
  }, []);

  useEffect(() => {
    if (mic !== 'recording') return;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - t0), 250);
    return () => window.clearInterval(id);
  }, [mic]);

  const onPlaySample = () => {
    setPlay({ kind: 'playing' });
    playAudio(audioId).then(
      (source) => setPlay({ kind: 'done', source }),
      (e: unknown) => setPlay({ kind: 'error', msg: e instanceof Error ? e.message : String(e) }),
    );
  };

  const onRecord = async () => {
    setMicError(null);
    setTake(null);
    stopAudio();
    unlockAudio(); // ať jde nahrávka později přehrát
    setMic('starting');
    try {
      recRef.current = await startRecording();
      setElapsed(0);
      setMic('recording');
    } catch (e) {
      recRef.current = null;
      setMic('idle');
      setMicError(micErrorMessage(e));
    }
  };

  const onStop = async () => {
    const r = recRef.current;
    if (!r) return;
    setMic('stopping');
    try {
      setTake(await r.stop());
    } catch (e) {
      setMicError(micErrorMessage(e));
    } finally {
      recRef.current = null;
      setMic('idle');
    }
  };

  const onPlayTake = () => {
    if (!take) return;
    unlockAudio();
    setTakePlaying(true);
    playBlob(take)
      .catch((e: unknown) => setMicError(`Nahrávku se nepodařilo přehrát: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setTakePlaying(false));
  };

  const onSaveTake = async () => {
    if (!take) return;
    await saveRecording(audioId, take);
    setHasOwn(true);
  };

  const onRestoreTts = async () => {
    await deleteRecording(audioId);
    setHasOwn(false);
  };

  return (
    <main className="screen sound-test">
      <header className="topbar">
        <button className="back" onClick={() => go('home')} aria-label="Zpět">
          ‹ Zpět
        </button>
        <h1>Test zvuku a mikrofonu</h1>
      </header>

      <section className="card" aria-labelledby="h-sound">
        <h2 id="h-sound">1. Zvuk</h2>
        <p className="muted">Klepni na velké tlačítko. Měl(a) bys slyšet: „{prompt?.text ?? 'Ahoj!'}“</p>
        <button className="kbtn kbtn-primary kbtn-xl" onClick={onPlaySample} data-testid="play-sample">
          🔊 Přehrát ukázku
        </button>
        <p className="status" aria-live="polite" data-testid="play-status">
          {play.kind === 'playing' && 'Hraje…'}
          {play.kind === 'done' &&
            (play.source === 'parent' ? 'Přehrála se tvoje vlastní nahrávka.' : 'Přehrál se syntetický hlas. Slyšel(a) jsi ho?')}
          {play.kind === 'error' && (
            <span className="is-error">Zvuk se nepřehrál: {play.msg} Zkontroluj hlasitost a přepínač ztlumení.</span>
          )}
        </p>
      </section>

      <section className="card" aria-labelledby="h-mic">
        <h2 id="h-mic">2. Mikrofon</h2>
        {!isRecordingSupported() ? (
          <p className="notice is-error" data-testid="mic-unsupported">Tento prohlížeč neumí nahrávat zvuk. Na iPadu je potřeba iPadOS 14.5 nebo novější.</p>
        ) : (
          <>
            <p className="muted">Klepni na Nahrát, řekni pár slov a klepni na Zastavit. iPad se může zeptat na povolení mikrofonu – potvrď ho.</p>
            <div className="row">
              {mic === 'recording' || mic === 'stopping' ? (
                <button className="kbtn kbtn-record" onClick={onStop} disabled={mic === 'stopping'} data-testid="mic-stop">
                  ■ Zastavit ({fmtSec(elapsed)})
                </button>
              ) : (
                <button className="kbtn kbtn-record" onClick={onRecord} disabled={mic === 'starting'} data-testid="mic-record">
                  ● Nahrát
                </button>
              )}
              <button className="kbtn" onClick={onPlayTake} disabled={!take || takePlaying} data-testid="mic-play">
                ▶ Přehrát nahrávku
              </button>
            </div>
            {mic === 'recording' && <p className="status rec-dot">Nahrávám…</p>}
            {take && (
              <>
                <p className="status small">
                  Nahráno: {(take.size / 1024).toFixed(0)} kB, formát {take.type || 'neznámý'}.
                </p>
                <button className="kbtn" onClick={onSaveTake}>
                  💾 Použít nahrávku místo ukázky
                </button>
              </>
            )}
            {hasOwn && (
              <p className="small">
                Ukázka teď hraje tvoji nahrávku (uloženou v iPadu).{' '}
                <button className="link" onClick={onRestoreTts}>
                  Vrátit syntetický hlas
                </button>
              </p>
            )}
            {micError && (
              <p className="notice is-error" role="alert" data-testid="mic-error">
                {micError}
              </p>
            )}
          </>
        )}
      </section>

      <section className="card small" aria-labelledby="h-info">
        <h2 id="h-info">Informace pro kontrolu</h2>
        <ul className="info" data-testid="diag">
          <li>Spuštěno: {isStandalone() ? 'z plochy (aplikace)' : 'v prohlížeči'}</li>
          <li>Připojení: {online ? 'online' : 'offline (letadlový režim)'}</li>
          <li>Offline režim: {'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'připraven' : 'zatím ne (načti stránku ještě jednou)'}</li>
          <li>Trvalé úložiště: {persisted === null ? '…' : persisted ? 'ano' : 'ne'}</li>
          <li>Formát nahrávání: {pickMimeType() ?? 'výchozí prohlížeče'}</li>
          {content && <li>Verze obsahu: {content.version}</li>}
        </ul>
      </section>
    </main>
  );
}
