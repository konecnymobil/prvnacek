import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formText, formsList, type AppScriptSettings, type Forms, type ScriptFormId, type ScriptModeId } from '../content/types';
import { getSetting, setSetting } from '../storage/db';

/** Tvary písma: upperPrint = velké tiskací (výchozí), lowerPrint = malé tiskací, cursive = psací (Playwrite CZ). */
export const SCRIPT_FORMS: ScriptFormId[] = ['upperPrint', 'lowerPrint', 'cursive'];
export const SCRIPT_LABEL: Record<ScriptFormId, string> = { upperPrint: 'Velké tiskací', lowerPrint: 'Malé tiskací', cursive: 'Psací' };
export const ALL_LABEL = 'Všechny tvary';
export const modeLabel = (m: ScriptModeId) => (m === 'all' ? ALL_LABEL : SCRIPT_LABEL[m]);
const SCRIPT_PISMO: Record<ScriptModeId, string> = { all: 'vse', upperPrint: 'velke', lowerPrint: 'male', cursive: 'psaci' };

/** Nastavení rodiče (IndexedDB settings, klíč „script“): povolené tvary, výchozí a aktuální tvar dítěte. */
export interface ScriptConfig { allowed: Record<ScriptFormId, boolean>; def: ScriptModeId; current: ScriptModeId | null }
export const SCRIPT_KEY = 'script';
export const DEFAULT_SCRIPT_CONFIG: ScriptConfig = { allowed: { upperPrint: true, lowerPrint: true, cursive: true }, def: 'all', current: null };

/** Ošetří i poškozenou hodnotu (např. ze zálohy): aspoň jeden tvar zapnutý, výchozí vždy z povolených. */
export function normalizeScriptConfig(v: unknown): ScriptConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<ScriptConfig>;
  const allowed = { ...DEFAULT_SCRIPT_CONFIG.allowed };
  if (o.allowed && typeof o.allowed === 'object') for (const f of SCRIPT_FORMS) if (typeof o.allowed[f] === 'boolean') allowed[f] = o.allowed[f];
  if (!SCRIPT_FORMS.some((f) => allowed[f])) allowed.upperPrint = true;
  const first = SCRIPT_FORMS.find((f) => allowed[f])!;
  const many = SCRIPT_FORMS.filter((f) => allowed[f]).length > 1;
  const ok = (m: unknown): m is ScriptModeId => m === 'all' ? many : typeof m === 'string' && (SCRIPT_FORMS as string[]).includes(m) && allowed[m as ScriptFormId];
  // starší uložené nastavení bez „all“ (def upperPrint) zůstává; nové/neplatné → „all“ (nebo jediný povolený tvar)
  const def: ScriptModeId = ok(o.def) ? o.def : many ? 'all' : first;
  const current = ok(o.current) ? o.current : null;
  return { allowed, def, current };
}
export const effectiveMode = (c: ScriptConfig): ScriptModeId => c.current ?? c.def;
export const toSettings = (c: ScriptConfig): AppScriptSettings => ({ mode: effectiveMode(c), available: c.allowed });

interface Ctx { cfg: ScriptConfig; settings: AppScriptSettings; allowedList: ScriptFormId[]; modeList: ScriptModeId[]; reload: () => Promise<void>; saveConfig: (c: ScriptConfig) => Promise<void>; cycle: () => Promise<void> }
const ScriptCtx = createContext<Ctx | null>(null);

export function ScriptProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<ScriptConfig>(DEFAULT_SCRIPT_CONFIG);
  const reload = useCallback(async () => { setCfg(normalizeScriptConfig(await getSetting(SCRIPT_KEY).catch(() => undefined))); }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { document.documentElement.dataset.pismo = SCRIPT_PISMO[effectiveMode(cfg)]; }, [cfg]);
  const saveConfig = useCallback(async (c: ScriptConfig) => { const n = normalizeScriptConfig(c); await setSetting(SCRIPT_KEY, n); setCfg(n); }, []);
  const value = useMemo<Ctx>(() => {
    const allowedList = SCRIPT_FORMS.filter((f) => cfg.allowed[f]);
    const modeList: ScriptModeId[] = allowedList.length > 1 ? ['all', ...allowedList] : allowedList;
    return {
      cfg, settings: toSettings(cfg), allowedList, modeList, reload, saveConfig,
      cycle: async () => { const cur = effectiveMode(cfg); const next = modeList[(modeList.indexOf(cur) + 1) % modeList.length]; await saveConfig({ ...cfg, current: next }); },
    };
  }, [cfg, reload, saveConfig]);
  return <ScriptCtx.Provider value={value}>{children}</ScriptCtx.Provider>;
}

export function useScript(): Ctx {
  const c = useContext(ScriptCtx);
  if (!c) throw new Error('useScript mimo ScriptProvider');
  return c;
}

/** Rejstřík text (velká tiskací) → forms; naplní se po načtení obsahu. */
let index = new Map<string, Forms>();
let capLetter = new Map<string, string>(); // malé psací písmeno → velké psací
let wordCursive = new Set<string>();
export function indexContent(c: { letters: { upper: string; forms: Forms & { cursiveUpper?: string } }[]; syllables: { text: string; forms: Forms }[]; words: { text: string; forms: Forms }[] }) {
  index = new Map<string, Forms>([...c.letters.map((l) => [l.upper, l.forms] as const), ...c.syllables.map((s) => [s.text, s.forms] as const), ...c.words.map((w) => [w.text, w.forms] as const)]);
  capLetter = new Map(c.letters.filter((l) => l.forms.cursiveUpper).map((l) => [l.forms.cursive, l.forms.cursiveUpper!] as const));
  const syl = new Set(c.syllables.map((x) => x.forms.cursive));
  wordCursive = new Set(c.words.map((w) => w.forms.cursive).filter((t) => !syl.has(t)));
}
const plain = (t: string): Forms => ({ upperPrint: t, lowerPrint: t.toLowerCase(), cursive: t.toLowerCase() });
const capInitial = (t: string) => { const c = [...t][0] ?? ''; return (capLetter.get(c) ?? c.toUpperCase()) + t.slice(c.length); };

/** Psací tvar: samostatné písmeno = velké psací (cursiveUpper), slovo s velkým počátečním písmenem, slabika malými.
 *  V režimu „všechny tvary“ u písmene „Mm“ (velké + malé psací). Slovo: velké počáteční z cursiveUpper písmene (obsah zatím nemá velkou psací formu slov). */
function cursiveText(f: Forms & { cursiveUpper?: string }, all: boolean): string {
  if (f.cursiveUpper) return all ? f.cursiveUpper + f.cursive : f.cursiveUpper;
  return wordCursive.has(f.cursive) ? capInitial(f.cursive) : f.cursive;
}
const withCursive = (f: Forms, all: boolean): Forms => ({ ...f, cursive: cursiveText(f, all) });

const cls = (c?: string) => `glyph${c ? ` ${c}` : ''}`;
function renderForms(f: Forms, s: AppScriptSettings, className?: string) {
  if (s.mode === 'all') {
    const l = formsList(withCursive(f, true), s);
    if (l.length > 1) return <span className={cls(`glyph-all${className ? ` ${className}` : ''}`)} data-script="all">{l.map(([k, t]) => <span key={k} className="glyph" data-script={k}>{t}</span>)}</span>;
    return <span className={cls(className)} data-script={l[0][0]}>{l[0][1]}</span>;
  }
  return <span className={cls(className)} data-script={s.available[s.mode] ? s.mode : 'upperPrint'}>{formText(withCursive(f, false), s)}</span>;
}

/** Jediné místo, kde se text písmen/slabik/slov vykresluje; tvar určuje nastavení rodiče. */
export default function Glyphs({ forms, className }: { forms: Forms; className?: string }) {
  const { settings } = useScript();
  return renderForms(forms, settings, className);
}

/** Text zadaný velkými písmeny (slabika, slovo, řada písmen „A M L“) ve zvoleném tvaru. */
export function GlyphText({ text, className }: { text: string; className?: string }) {
  const { settings } = useScript();
  const toks = text.split(' ');
  if (settings.mode === 'all') return <span className={cls(className)}>{toks.map((t, i) => <span key={i}>{i ? ' ' : ''}{renderForms(index.get(t) ?? plain(t), settings)}</span>)}</span>;
  return <span className={cls(className)} data-script={settings.mode}>{toks.map((t) => formText(withCursive(index.get(t) ?? plain(t), false), settings)).join(' ')}</span>;
}
