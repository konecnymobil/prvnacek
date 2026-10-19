import { useEffect, useState } from 'react';
import { createFamily, disableSync, getSyncState, joinWithCode, normalizeServerUrl, startPairing, syncNow, updateSyncState, type SyncState } from '../sync/client';

/** Rodičovské nastavení synchronizace přes náš server. Ve výchozím stavu vypnuto. */
export default function SyncPanel({ onSynced }: { onSynced: () => void }) {
  const [s, setS] = useState<SyncState | null>(null);
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void getSyncState().then((x) => { setS(x); setUrl(x.serverUrl); }); }, []);
  if (!s) return null;
  const paired = !!(s.familyId && s.key);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setMsg(null);
    try { const t = await fn(); if (t) setMsg({ ok: true, text: t }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setS(await getSyncState()); setBusy(false);
  };
  const needUrl = () => { const u = normalizeServerUrl(url); if (!u) throw new Error('Zadej adresu našeho serveru (začíná https://).'); return u; };
  const sync = async () => { const r = await syncNow(); if (r.pulled) onSynced(); return `Hotovo – odesláno ${r.pushed}, staženo ze zařízení: ${r.pulled}.`; };

  return (
    <section className="card" data-testid="sync-panel">
      <h2>Synchronizace přes náš server</h2>
      <p className="small muted">Pokrok dětí se může přenášet mezi zařízeními rodiny. Data se šifrují klíčem, který je jen ve vašich zařízeních – náš server vidí jen nečitelná data. Nahrávky hlasu se nepřenáší. Ve výchozím stavu je vypnuto.</p>
      <label className="small">Adresa našeho serveru
        <input type="url" inputMode="url" data-testid="sync-url" value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} disabled={busy || paired} />
      </label>
      {!paired && (
        <>
          <p><button className="btn" data-testid="sync-create" disabled={busy} onClick={() => run(async () => { await createFamily(needUrl()); return `Rodina založena. ${await sync()}`; })}>Zapnout a založit rodinu</button></p>
          <p className="small muted">Nebo se připoj kódem z jiného zařízení rodiny:</p>
          <p>
            <input data-testid="sync-code" value={code} placeholder="KOT-482-LAMA" aria-describedby="sync-code-help" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} inputMode="text" onChange={(e) => setCode(e.target.value)} disabled={busy} />{' '}
            <button className="btn" data-testid="sync-join" disabled={busy} onClick={() => run(async () => { await joinWithCode(needUrl(), code); setCode(''); return `Připojeno. ${await sync()}`; })}>Připojit se kódem</button>
          </p>
          <p className="small muted" id="sync-code-help">Velikost písmen, mezery ani pomlčky nevadí.</p>
        </>
      )}
      {paired && (
        <>
          <p data-testid="sync-status">{s.enabled ? '✓ Synchronizace je zapnutá.' : 'Synchronizace je pozastavená.'} {s.lastSyncAt ? `Naposledy: ${new Date(s.lastSyncAt).toLocaleString('cs-CZ')}` : ''}</p>
          {s.enabled ? (
            <p>
              <button className="btn" data-testid="sync-now" disabled={busy} onClick={() => run(sync)}>Synchronizovat teď</button>{' '}
              <button className="btn" data-testid="sync-pair" disabled={busy} onClick={() => run(async () => { setPair(await startPairing()); })}>Spárovat další zařízení</button>{' '}
              <button className="btn" data-testid="sync-pause" disabled={busy} onClick={() => run(async () => { await disableSync(false); return 'Synchronizace je pozastavená.'; })}>Pozastavit</button>
            </p>
          ) : (
            <p><button className="btn" data-testid="sync-resume" disabled={busy} onClick={() => run(async () => { await updateSyncState({ enabled: true }); return sync(); })}>Znovu zapnout</button></p>
          )}
          {pair && pair.expiresAt > Date.now() && (
            <p className="notice" data-testid="sync-pair-code">Na druhém zařízení zadej kód <strong data-testid="sync-code-value">{pair.code}</strong>. Platí 10 minut (do {new Date(pair.expiresAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}) a jde použít jen jednou.</p>
          )}
          <p><button className="btn" data-testid="sync-forget" disabled={busy} onClick={() => { if (confirm('Vypnout synchronizaci a zapomenout klíč rodiny v tomto zařízení? Data v zařízení zůstanou.')) void run(async () => { await disableSync(true); setPair(null); return 'Synchronizace je vypnutá.'; }); }}>Vypnout a odpojit zařízení</button></p>
        </>
      )}
      {msg && <p className={msg.ok ? 'notice' : 'notice is-error'} role="status" data-testid="sync-msg">{msg.text}</p>}
    </section>
  );
}
