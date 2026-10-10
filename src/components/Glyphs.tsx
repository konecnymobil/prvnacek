import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formText, type AppScriptSettings, type Forms, type ScriptFormId } from '../content/types';
import { getSetting, setSetting } from '../storage/db';

/** Tvary písma: upperPrint = velké tiskací (výchozí), lowerPrint = malé tiskací, cursive = psací (Playwrite CZ). */
export const SCRIPT_FORMS: ScriptFormId[] = ['upperPrint', 'lowerPrint', 'cursive'];
export const SCRIPT_LABEL: Record<ScriptFormId, string> = { upperPrint: 'Velké tiskací', lowerPrint: 'Malé tiskací', cursive: 'Psací' };
const SCRIPT_PISMO: Record<ScriptFormId, string> = { upperPrint: 'velke', lowerPrint: 'male', cursive: 'psaci' };

/** Nastavení rodiče (IndexedDB settings, klíč „script“): povolené tvary, výchozí a aktuální tvar dítěte. */
export interface ScriptConfig { allowed: Record<ScriptFormId, boolean>; def: ScriptFormId; current: ScriptFormId | null }
export const SCRIPT_KEY = 'script';
export const DEFAULT_SCRIPT_CONFIG: ScriptConfig = { allowed: { upperPrint: true, lowerPrint: true, cursive: true }, def: 'upperPrint', current: null };

/** Ošetří i poškozenou hodnotu (např. ze zálohy): aspoň jeden tvar zapnutý, výchozí vždy z povolených. */
export function normalizeScriptConfig(v: unknown): ScriptConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<ScriptConfig>;
  const allowed = { ...DEFAULT_SCRIPT_CONFIG.allowed };
  if (o.allowed && typeof o.allowed === 'object') for (const f of SCRIPT_FORMS) if (typeof o.allowed[f] === 'boolean') allowed[f] = o.allowed[f];
  if (!SCRIPT_FORMS.some((f) => allowed[f])) allowed.upperPrint = true;
  const first = SCRIPT_FORMS.find((f) => allowed[f])!;
  const def = o.def && allowed[o.def] ? o.def : allowed.upperPrint ? 'upperPrint' : first;
  const current = o.current && allowed[o.current] ? o.current : null;
  return { allowed, def, current };
}
export const effectiveMode = (c: ScriptConfig): ScriptFormId => (c.current && c.allowed[c.current] ? c.current : c.def);
export const toSettings = (c: ScriptConfig): AppScriptSettings => ({ mode: effectiveMode(c), available: c.allowed });

interface Ctx { cfg: ScriptConfig; settings: AppScriptSettings; allowedList: ScriptFormId[]; reload: () => Promise<void>; saveConfig: (c: ScriptConfig) => Promise<void>; cycle: () => Promise<void> }
const ScriptCtx = createContext<Ctx | null>(null);

export function ScriptProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<ScriptConfig>(DEFAULT_SCRIPT_CONFIG);
  const reload = useCallback(async () => { setCfg(normalizeScriptConfig(await getSetting(SCRIPT_KEY).catch(() => undefined))); }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { document.documentElement.dataset.pismo = SCRIPT_PISMO[effectiveMode(cfg)]; }, [cfg]);
  const saveConfig = useCallback(async (c: ScriptConfig) => { const n = normalizeScriptConfig(c); await setSetting(SCRIPT_KEY, n); setCfg(n); }, []);
  const value = useMemo<Ctx>(() => {
    const allowedList = SCRIPT_FORMS.filter((f) => cfg.allowed[f]);
    return {
      cfg, settings: toSettings(cfg), allowedList, reload, saveConfig,
      cycle: async () => { const cur = effectiveMode(cfg); const next = allowedList[(allowedList.indexOf(cur) + 1) % allowedList.length]; await saveConfig({ ...cfg, current: next }); },
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
export function indexContent(c: { letters: { upper: string; forms: Forms }[]; syllables: { text: string; forms: Forms }[]; words: { text: string; forms: Forms }[] }) {
  index = new Map<string, Forms>([...c.letters.map((l) => [l.upper, l.forms] as const), ...c.syllables.map((s) => [s.text, s.forms] as const), ...c.words.map((w) => [w.text, w.forms] as const)]);
}
const plain = (t: string): Forms => ({ upperPrint: t, lowerPrint: t.toLowerCase(), cursive: t.toLowerCase() });

/** Jediné místo, kde se text písmen/slabik/slov vykresluje; tvar určuje nastavení rodiče. */
export default function Glyphs({ forms, className }: { forms: Forms; className?: string }) {
  const { settings } = useScript();
  return <span className={`glyph${className ? ` ${className}` : ''}`} data-script={settings.available[settings.mode] ? settings.mode : 'upperPrint'}>{formText(forms, settings)}</span>;
}

/** Text zadaný velkými písmeny (slabika, slovo, řada písmen „A M L“) ve zvoleném tvaru. */
export function GlyphText({ text, className }: { text: string; className?: string }) {
  const { settings } = useScript();
  const out = text.split(' ').map((t) => formText(index.get(t) ?? plain(t), settings)).join(' ');
  return <span className={`glyph${className ? ` ${className}` : ''}`} data-script={settings.mode}>{out}</span>;
}
