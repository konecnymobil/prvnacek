import { useState } from 'react';
import { VARIANTS, allowedVariants, normalizeScriptConfig, useScript, type VariantId } from '../components/Glyphs';
import { buildBackup, downloadBackup, resetProgress } from '../storage/backup';

const EX = { upperPrint: 'MA LA', lowerPrint: 'ma la', cursive: 'ma la', cursiveUpper: 'Ma la' };

/** Nastavení → Písmo: rodič zapíná/vypíná tvary (aspoň jeden zůstane) a volí výchozí. */
export function ScriptSettingsPanel() {
  const { cfg, saveConfig } = useScript();
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const save = (c: typeof cfg) => saveConfig(c).then(() => setErr(''), () => setErr('Nastavení písma se nepodařilo uložit.'));
  const toggle = (f: VariantId) => {
    if (cfg.allowed[f] && allowedVariants(cfg).length === 1) { setMsg('Aspoň jedna varianta písma musí zůstat zapnutý.'); return; }
    setMsg('');
    void save(normalizeScriptConfig({ ...cfg, allowed: { ...cfg.allowed, [f]: !cfg.allowed[f] } }));
  };
  return (
    <section className="card" data-testid="script-settings">
      <h2>Písmo pro dítě</h2>
      <p className="small muted">Zapni varianty písma, které dítě smí používat (7 možností). Aspoň jedna musí zůstat zapnutá, výchozí je „Vše“. Dítě uvidí jen povolené varianty (tlačítko „Aa Písmo“ na domovské obrazovce). Změny platí hned, i ve zkoušce.</p>
      <div className="pismo-grid" role="group" aria-label="Povolené tvary písma">
        {VARIANTS.map((v) => (
          <button key={v.id} className="pismo-opt" data-form={v.id} aria-pressed={cfg.allowed[v.id]} onClick={() => toggle(v.id)}>
            <span className="sample">{v.forms.map((k) => <span key={k} className="glyph" data-script={k}>{EX[k]}</span>)}</span>
            <span className="lab">{v.label}</span>
            <span className="check">{cfg.allowed[v.id] ? '✓ povoleno' : 'vypnuto'}</span>
          </button>
        ))}
      </div>
      <h3>Výchozí varianta</h3>
      <div className="seg pismo-def" role="group" aria-label="Výchozí varianta písma">
        {allowedVariants(cfg).map((id) => (
          <button key={id} className="kbtn" data-def={id} aria-pressed={cfg.def === id} onClick={() => void save({ ...cfg, def: id, current: null })}>{VARIANTS.find((v) => v.id === id)!.label}{cfg.def === id ? ' ✓' : ''}</button>
        ))}
      </div>
      <p className="small muted" role="status" data-testid="script-msg">{msg}</p>
      {err && <p className="notice is-error" role="alert">{err}</p>}
    </section>
  );
}

const CONFIRM_WORD = 'SMAZAT';

/** Resetovat pokrok: nabídka zálohy, dvoustupňové potvrzení (dialog + opsání slova SMAZAT). */
export function ResetPanel({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const close = () => { setStep(0); setTyped(''); };
  const backup = async () => {
    setBusy(true);
    try { const r = await downloadBackup(await buildBackup()); setMsg({ ok: true, text: r === 'share' ? 'Záloha je připravená ke sdílení.' : 'Záloha se stáhla do zařízení.' }); }
    catch { setMsg({ ok: false, text: 'Zálohu se nepodařilo vytvořit. Pokrok zatím nemazat.' }); }
    finally { setBusy(false); }
  };
  const doReset = async () => {
    setBusy(true);
    try { await resetProgress(); close(); setMsg({ ok: true, text: 'Pokrok je smazaný. Vlastní nahrávky a nastavení písma zůstaly.' }); onDone(); }
    catch { setMsg({ ok: false, text: 'Pokrok se nepodařilo smazat, nic se nezměnilo. Zkus to znovu.' }); }
    finally { setBusy(false); }
  };
  return (
    <section className="card" data-testid="reset-panel">
      <h2>Resetovat pokrok</h2>
      <p className="small muted">Čistý začátek: smaže pokrok, pokusy, výsledky zkoušek a stavy lekcí (lekce se znovu zamknou). Vlastní nahrávky a nastavení písma zůstanou.</p>
      {step === 0 && <button className="kbtn" data-testid="reset-start" onClick={() => { setMsg(null); setStep(1); }}>Resetovat pokrok…</button>}
      {step === 1 && (
        <div className="notice" role="alertdialog" data-testid="reset-step1">
          <p><strong>Krok 1 ze 2:</strong> Doporučuju nejdřív stáhnout zálohu, aby šel pokrok vrátit.</p>
          <button className="kbtn kbtn-primary" disabled={busy} onClick={backup} data-testid="reset-backup">⬇ Stáhnout zálohu</button>
          <button className="kbtn" onClick={() => setStep(2)} data-testid="reset-next">Pokračovat</button>
          <button className="kbtn" onClick={close} data-testid="reset-cancel">Zrušit</button>
        </div>
      )}
      {step === 2 && (
        <div className="notice is-error" role="alertdialog" data-testid="reset-step2">
          <p><strong>Krok 2 ze 2:</strong> Pokrok se nenávratně smaže. Pro potvrzení napiš slovo <strong>{CONFIRM_WORD}</strong>.</p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Potvrzení" data-testid="reset-input" autoCapitalize="characters" style={{ fontSize: 18 }} />
          <button className="kbtn kbtn-primary" disabled={busy || typed.trim().toUpperCase() !== CONFIRM_WORD} onClick={doReset} data-testid="reset-confirm">Smazat pokrok</button>
          <button className="kbtn" onClick={close} data-testid="reset-cancel2">Zrušit</button>
        </div>
      )}
      {msg && <p className={`notice ${msg.ok ? '' : 'is-error'}`} role={msg.ok ? 'status' : 'alert'} data-testid="reset-msg">{msg.text}</p>}
    </section>
  );
}
