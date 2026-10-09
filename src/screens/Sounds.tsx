import { useEffect, useRef, useState } from 'react';
import type { Content } from '../content/load';
import type { Screen } from '../App';
import { playAudio, playBlob, stopAudio, unlockAudio } from '../audio/player';
import { isRecordingSupported, micErrorMessage, startRecording, type ActiveRecording } from '../audio/recorder';
import { deleteRecording, getRecording, listRecordingIds, saveRecording } from '../storage/db';

type Tab = 'letters' | 'syllables' | 'words' | 'prompts';
interface Entry { id: string; label: string; audioId: string }

function entries(content: Content, tab: Tab): Entry[] {
  const order = content.orders[content.defaultOrderId];
  if (tab === 'letters') {
    // písmena v pořadí lekcí; každé má velkou dlaždici
    return order.lessons.flatMap((l) => l.letterIds).map((id) => content.letterById.get(id)!).map((l) => ({ id: l.id, label: l.upper, audioId: l.audioId }));
  }
  if (tab === 'syllables') return content.syllables.map((s) => ({ id: s.id, label: s.text, audioId: s.audioId }));
  if (tab === 'words') return content.words.map((w) => ({ id: w.id, label: w.text, audioId: w.audioId }));
  return content.prompts.map((p) => ({ id: p.id, label: p.text, audioId: p.audioId }));
}

const TABS: [Tab, string][] = [['letters', 'Písmena'], ['syllables', 'Slabiky'], ['words', 'Slova'], ['prompts', 'Pokyny']];

export default function Sounds({ content, go }: { content: Content; go: (s: Screen) => void }) {
  const [tab, setTab] = useState<Tab>('letters');
  const [sel, setSel] = useState<Entry | null>(null);
  const [own, setOwn] = useState<Set<string>>(new Set());
  const [mic, setMic] = useState<'idle' | 'starting' | 'recording' | 'stopping'>('idle');
  const [take, setTake] = useState<Blob | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<ActiveRecording | null>(null);

  const refresh = () => listRecordingIds().then((ids) => setOwn(new Set(ids)), () => setMsg({ kind: 'error', text: 'Vlastní nahrávky se nepodařilo načíst z úložiště iPadu.' }));
  useEffect(() => {
    void refresh();
    return () => { recRef.current?.cancel(); stopAudio(); };
  }, []);

  const choose = (e: Entry) => {
    recRef.current?.cancel();
    recRef.current = null;
    setMic('idle');
    setTake(null);
    setMsg(null);
    setSel(e);
    void playAudio(e.audioId).catch(() => {});
  };

  const play = () => { if (sel) void playAudio(sel.audioId).catch((e: unknown) => setMsg({ kind: 'error', text: `Zvuk se nepřehrál: ${e instanceof Error ? e.message : String(e)}` })); };

  const record = async () => {
    setMsg(null); setTake(null); stopAudio(); unlockAudio(); setMic('starting');
    try { recRef.current = await startRecording(); setMic('recording'); } catch (e) { recRef.current = null; setMic('idle'); setMsg({ kind: 'error', text: micErrorMessage(e) }); }
  };
  const stop = async () => {
    const r = recRef.current;
    if (!r) return;
    setMic('stopping');
    try { setTake(await r.stop()); } catch (e) { setMsg({ kind: 'error', text: micErrorMessage(e) }); } finally { recRef.current = null; setMic('idle'); }
  };
  const playTake = () => { if (take) { unlockAudio(); playBlob(take).catch((e: unknown) => setMsg({ kind: 'error', text: `Nahrávku se nepodařilo přehrát: ${e instanceof Error ? e.message : String(e)}` })); } };

  const save = async () => {
    if (!take || !sel || busy) return;
    setBusy(true); unlockAudio();
    try {
      await saveRecording(sel.audioId, take);
    } catch {
      setBusy(false);
      return setMsg({ kind: 'error', text: 'Nahrávku se nepodařilo uložit do iPadu. Zkus to znovu.' });
    }
    setTake(null);
    await refresh();
    setMsg({ kind: 'ok', text: 'Uloženo ✓ Teď hraje tvoje nahrávka.' });
    try {
      const r = await getRecording(sel.audioId);
      if (!r) throw new Error('chybí');
      await playBlob(r.blob);
    } catch {
      setMsg({ kind: 'error', text: 'Nahrávka je uložená, ale nepodařilo se ji přehrát. Zkontroluj hlasitost.' });
    }
    setBusy(false);
  };

  const restore = async () => {
    if (!sel || busy) return;
    setBusy(true);
    try {
      await deleteRecording(sel.audioId);
      await refresh();
      setMsg({ kind: 'ok', text: 'Vrácen původní hlas ✓' });
      void playAudio(sel.audioId).catch(() => {});
    } catch {
      setMsg({ kind: 'error', text: 'Původní hlas se nepodařilo vrátit (chyba úložiště iPadu).' });
    }
    setBusy(false);
  };

  const list = entries(content, tab);
  return (
    <main className="screen parent sounds" data-testid="sounds">
      <header className="topbar"><button className="back" onClick={() => go('parent')}>‹ Zpět</button><h1>Zvuky</h1></header>
      <div className="row tabs" role="tablist">
        {TABS.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`kbtn${tab === t ? ' kbtn-primary' : ''}`} onClick={() => setTab(t)} data-testid={`tab-${t}`}>{l}</button>
        ))}
      </div>

      {sel && (
        <section className="card sound-edit" data-testid="sound-edit" data-audio={sel.audioId}>
          <h2>{sel.label} {own.has(sel.audioId) ? <span className="small">(tvoje nahrávka)</span> : <span className="small muted">(původní hlas)</span>}</h2>
          <div className="row">
            <button className="kbtn kbtn-xl" onClick={play} data-testid="snd-play">▶ Přehrát</button>
            {isRecordingSupported() ? (mic === 'recording' || mic === 'stopping' ? (
              <button className="kbtn kbtn-record kbtn-xl" onClick={() => void stop()} disabled={mic === 'stopping'} data-testid="snd-stop">■ Zastavit</button>
            ) : (
              <button className="kbtn kbtn-record kbtn-xl" onClick={() => void record()} disabled={mic === 'starting' || busy} data-testid="snd-record">● Nahrát vlastní</button>
            )) : <span className="notice is-error">Tento prohlížeč neumí nahrávat.</span>}
          </div>
          {take && (
            <div className="row">
              <button className="kbtn" onClick={playTake} data-testid="snd-play-take">▶ Poslechnout nahrávku</button>
              <button className="kbtn kbtn-primary" onClick={() => void save()} disabled={busy} data-testid="snd-save">💾 Použít nahrávku</button>
            </div>
          )}
          {own.has(sel.audioId) && <button className="kbtn" onClick={() => void restore()} disabled={busy} data-testid="snd-restore">↺ Vrátit původní hlas</button>}
          {msg && <p className={`notice${msg.kind === 'error' ? ' is-error' : ''}`} role={msg.kind === 'error' ? 'alert' : 'status'} data-testid="snd-msg">{msg.text}</p>}
        </section>
      )}

      <section className="card">
        <div className={tab === 'letters' ? 'sound-grid letters' : 'sound-grid'} data-testid="sound-list">
          {list.map((e) => (
            <button key={e.id} className={`tile${tab === 'letters' ? '' : ' tile-wide'}${sel?.id === e.id ? ' is-right' : ''}`} onClick={() => choose(e)} data-sound={e.id} aria-label={`Zvuk ${e.label}${own.has(e.audioId) ? ', vlastní nahrávka' : ''}`}>
              {e.label}{own.has(e.audioId) && <span className="own-dot" aria-hidden="true">●</span>}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
