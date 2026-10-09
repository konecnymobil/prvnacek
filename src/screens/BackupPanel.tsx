import { useEffect, useState } from 'react';
import { buildBackup, downloadBackup, parseBackup, restoreBackup, summarize, type BackupFile } from '../storage/backup';
import { requestPersistentStorage } from '../storage/db';

export function StoragePanel() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [est, setEst] = useState<string | null>(null);
  useEffect(() => {
    requestPersistentStorage().then(setPersisted);
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage != null) setEst(`${(e.usage / 1048576).toFixed(1)} MB${e.quota ? ` z ${Math.round(e.quota / 1048576)} MB` : ''}`);
    }, () => {});
  }, []);
  return (
    <div data-testid="storage-panel">
      {persisted === false && (
        <p className="notice is-error" role="alert" data-testid="persist-warning">
          ⚠ Úložiště není trvalé – Safari může data (pokrok, nahrávky) po čase smazat. Přidej aplikaci na plochu (Sdílet → Přidat na plochu) a pravidelně si dělej zálohu.
        </p>
      )}
      {persisted === true && <p className="notice" data-testid="persist-ok">✓ Úložiště je trvalé, data by se neměla sama smazat. Zálohu si přesto čas od času udělej.</p>}
      {est && <p className="small muted">Využito v úložišti: {est}</p>}
    </div>
  );
}

export default function BackupPanel({ onRestored }: { onRestored: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true); setMsg(null);
    try {
      const how = await downloadBackup(await buildBackup());
      setMsg({ ok: true, text: how === 'share' ? 'Záloha je připravená ke sdílení – ulož ji do Souborů nebo pošli sobě.' : 'Záloha byla stažena (zkontroluj složku Stažené / aplikaci Soubory).' });
    } catch (e) { setMsg({ ok: false, text: `Zálohu se nepodařilo vytvořit: ${(e as Error).message}` }); }
    setBusy(false);
  };
  const onFile = async (f: File | undefined) => {
    setMsg(null); setPending(null);
    if (!f) return;
    try { setPending(await parseBackup(f)); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const doImport = async () => {
    if (!pending) return;
    setBusy(true);
    try { await restoreBackup(pending); setPending(null); setMsg({ ok: true, text: 'Záloha byla obnovena. Data v aplikaci jsou aktualizovaná.' }); onRestored(); }
    catch (e) { setMsg({ ok: false, text: `Obnova selhala, původní data zůstala beze změny: ${(e as Error).message}` }); }
    setBusy(false);
  };
  const s = pending ? summarize(pending) : null;

  return (
    <section className="card" data-testid="backup-panel">
      <h2>Záloha a obnova</h2>
      <StoragePanel />
      <p className="small muted">Záloha obsahuje pokrok, stavy lekcí, výsledky zkoušek, nastavení a tvoje nahrávky v jednom souboru.</p>
      <button className="kbtn kbtn-primary" disabled={busy} onClick={doExport} data-testid="backup-export">⬇ Stáhnout zálohu</button>
      <label className="kbtn" style={{ display: 'inline-block' }}>
        ⬆ Obnovit ze zálohy…
        <input type="file" accept="application/json,.json" data-testid="backup-file" style={{ display: 'none' }} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {s && (
        <div className="notice" role="alertdialog" data-testid="import-confirm">
          <p><strong>Záloha z {new Date(s.exportedAt).toLocaleString('cs-CZ')}</strong> (formát {s.version}): {s.attempts} pokusů, {s.lessonStates} stavů lekcí, {s.tests} výsledků zkoušek, {s.settings} nastavení, {s.recordings} nahrávek.</p>
          <p><strong>Obnovením se přepíšou všechna současná data v tomto zařízení.</strong></p>
          <button className="kbtn kbtn-primary" disabled={busy} onClick={doImport} data-testid="import-confirm-yes">Přepsat a obnovit</button>
          <button className="kbtn" onClick={() => setPending(null)} data-testid="import-confirm-no">Zrušit</button>
        </div>
      )}
      {msg && <p className={`notice ${msg.ok ? '' : 'is-error'}`} role={msg.ok ? 'status' : 'alert'} data-testid="backup-msg">{msg.text}</p>}
    </section>
  );
}
