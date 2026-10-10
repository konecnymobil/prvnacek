import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type Forms } from '../content/types';
import { getSetting, setSetting } from '../storage/db';

/** Tvar glyfu: jednotlivé formy z obsahu (forms.*). cursiveUpper = velké psací (celý tvar tak, jak ho dává obsah). */
export type FormKey = 'upperPrint' | 'lowerPrint' | 'cursive' | 'cursiveUpper';
/** 7 variant písma; každá = uspořádaný seznam forem zobrazených vedle sebe. */
export type VariantId = 'lower' | 'upper' | 'cursive' | 'cursiveUpper' | 'printBoth' | 'cursiveBoth' | 'all';
export interface Variant { id: VariantId; label: string; example: string; forms: FormKey[] }
export const VARIANTS: Variant[] = [
  { id: 'lower', label: 'Malé tiskací', example: 'ma la', forms: ['lowerPrint'] },
  { id: 'upper', label: 'Velké tiskací', example: 'MA LA', forms: ['upperPrint'] },
  { id: 'cursive', label: 'Malé psací', example: 'ma la', forms: ['cursive'] },
  { id: 'cursiveUpper', label: 'Velké psací', example: 'Ma la', forms: ['cursiveUpper'] },
  { id: 'printBoth', label: 'Tiskací malé + velké', example: 'Ma la', forms: ['upperPrint', 'lowerPrint'] },
  { id: 'cursiveBoth', label: 'Psací malé + velké', example: 'Ma la', forms: ['cursiveUpper', 'cursive'] },
  { id: 'all', label: 'Vše', example: 'Ma la', forms: ['upperPrint', 'lowerPrint', 'cursiveUpper', 'cursive'] },
];
export const VARIANT_IDS = VARIANTS.map((v) => v.id);
export const variantById = (id: VariantId): Variant => VARIANTS.find((v) => v.id === id)!;
export const variantLabel = (id: VariantId) => variantById(id).label;
export const DEFAULT_VARIANT: VariantId = 'all';
const isVariant = (x: unknown): x is VariantId => typeof x === 'string' && (VARIANT_IDS as string[]).includes(x);
const isCursiveKey = (k: FormKey) => k === 'cursive' || k === 'cursiveUpper';

/** Nastavení rodiče (IndexedDB settings, klíč „script“): povolené varianty, výchozí a aktuální varianta dítěte.
 *  `current` je jediné místo „aktuální varianty“ (využije i budoucí režim psaní perem). */
export interface ScriptConfig { allowed: Record<VariantId, boolean>; def: VariantId; current: VariantId | null }
export const SCRIPT_KEY = 'script';
const allOn = () => Object.fromEntries(VARIANT_IDS.map((v) => [v, true])) as Record<VariantId, boolean>;
export const DEFAULT_SCRIPT_CONFIG: ScriptConfig = { allowed: allOn(), def: DEFAULT_VARIANT, current: null };

type Old = 'upperPrint' | 'lowerPrint' | 'cursive' | 'all';
const OLD_MAP: Record<Exclude<Old, 'all'>, VariantId> = { upperPrint: 'upper', lowerPrint: 'lower', cursive: 'cursive' };

/** Migrace starého modelu (allowed: upperPrint/lowerPrint/cursive, def vč. 'all') na 7 variant; nic se neztratí. */
function migrateOld(o: { allowed: Record<string, unknown>; def?: unknown; current?: unknown }): ScriptConfig {
  const on = (k: string) => o.allowed[k] !== false;
  const up = on('upperPrint'), lo = on('lowerPrint'), cu = on('cursive');
  const allowed = Object.fromEntries(VARIANT_IDS.map((v) => [v, false])) as Record<VariantId, boolean>;
  allowed.upper = up; allowed.lower = lo; allowed.cursive = cu; allowed.cursiveUpper = cu;
  allowed.printBoth = up && lo; allowed.cursiveBoth = cu; allowed.all = [up, lo, cu].filter(Boolean).length > 1;
  const conv = (m: unknown): VariantId | null => m === 'all' ? 'all' : typeof m === 'string' && m in OLD_MAP ? OLD_MAP[m as keyof typeof OLD_MAP] : null;
  return { allowed, def: conv(o.def) ?? DEFAULT_VARIANT, current: conv(o.current) };
}

/** Ošetří i poškozenou nebo starou hodnotu (např. ze zálohy): aspoň jedna varianta zapnutá, výchozí z povolených (jinak „Vše“). */
export function normalizeScriptConfig(v: unknown): ScriptConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const al = o.allowed && typeof o.allowed === 'object' ? (o.allowed as Record<string, unknown>) : null;
  let c: ScriptConfig;
  if (al && ('upperPrint' in al || 'lowerPrint' in al || ('cursive' in al && !('cursiveUpper' in al) && !('all' in al)))) c = migrateOld({ ...o, allowed: al });
  else {
    const allowed = allOn();
    if (al) for (const id of VARIANT_IDS) if (typeof al[id] === 'boolean') allowed[id] = al[id] as boolean;
    c = { allowed, def: isVariant(o.def) ? o.def : DEFAULT_VARIANT, current: isVariant(o.current) ? o.current : null };
  }
  if (!VARIANT_IDS.some((id) => c.allowed[id])) c.allowed = allOn();
  const first = VARIANT_IDS.find((id) => c.allowed[id])!;
  const ok = (m: VariantId | null): m is VariantId => !!m && c.allowed[m];
  const def = ok(c.def) ? c.def : c.allowed[DEFAULT_VARIANT] ? DEFAULT_VARIANT : first;
  return { allowed: c.allowed, def, current: ok(c.current) ? c.current : null };
}
export const effectiveVariant = (c: ScriptConfig): VariantId => c.current ?? c.def;
export const allowedVariants = (c: ScriptConfig): VariantId[] => VARIANT_IDS.filter((id) => c.allowed[id]);

interface Ctx { cfg: ScriptConfig; variant: VariantId; modeList: VariantId[]; reload: () => Promise<void>; saveConfig: (c: ScriptConfig) => Promise<void>; cycle: () => Promise<void> }
const ScriptCtx = createContext<Ctx | null>(null);

export function ScriptProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<ScriptConfig>(DEFAULT_SCRIPT_CONFIG);
  const reload = useCallback(async () => { setCfg(normalizeScriptConfig(await getSetting(SCRIPT_KEY).catch(() => undefined))); }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { document.documentElement.dataset.pismo = effectiveVariant(cfg); }, [cfg]);
  const saveConfig = useCallback(async (c: ScriptConfig) => { const n = normalizeScriptConfig(c); await setSetting(SCRIPT_KEY, n); setCfg(n); }, []);
  const value = useMemo<Ctx>(() => {
    const modeList = allowedVariants(cfg);
    return {
      cfg, variant: effectiveVariant(cfg), modeList, reload, saveConfig,
      cycle: async () => { const next = modeList[(modeList.indexOf(effectiveVariant(cfg)) + 1) % modeList.length]; await saveConfig({ ...cfg, current: next }); },
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
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const plain = (t: string): Forms => ({ upperPrint: t, lowerPrint: t.toLowerCase(), cursive: t.toLowerCase(), cursiveUpper: cap(t.toLowerCase()) });
const formOf = (f: Forms, k: FormKey) => (k === 'cursiveUpper' ? f.cursiveUpper ?? cap(f.cursive) : f[k]);

const cls = (c?: string) => `glyph${c ? ` ${c}` : ''}`;
/** Jediné místo vykreslení: jedna forma = jeden glyf, kombinace = glyfy vedle sebe (zalamují se). */
function renderForms(f: Forms, id: VariantId, className?: string, form?: FormKey) {
  const keys = form ? [form] : variantById(id).forms;
  if (keys.length === 1) return <span className={cls(className)} data-script={keys[0]}>{formOf(f, keys[0])}</span>;
  return <span className={cls(`glyph-all${className ? ` ${className}` : ''}`)} data-script={id} data-variant={id}>{keys.map((k) => <span key={k} className="glyph" data-script={k}>{formOf(f, k)}</span>)}</span>;
}

export default function Glyphs({ forms, className, form }: { forms: Forms; className?: string; form?: FormKey }) {
  const { variant } = useScript();
  return renderForms(forms, variant, className, form);
}

/** Text zadaný velkými písmeny (slabika, slovo, řada písmen „A M L“) ve zvolené variantě. */
export function GlyphText({ text, className, form }: { text: string; className?: string; form?: FormKey }) {
  const { variant } = useScript();
  const toks = text.split(' ');
  const keys = form ? [form] : variantById(variant).forms;
  if (keys.length === 1) return <span className={cls(className)} data-script={keys[0]}>{toks.map((t) => formOf(index.get(t) ?? plain(t), keys[0])).join(' ')}</span>;
  return <span className={cls(className)} data-variant={variant}>{toks.map((t, i) => <span key={i}>{i ? ' ' : ''}{renderForms(index.get(t) ?? plain(t), variant)}</span>)}</span>;
}
export const usesCursive = (id: VariantId) => variantById(id).forms.some(isCursiveKey);

/** Úlohy s výběrem: v jedné úloze jedna forma pro všechny karty, mezi úlohami se mění.
 *  Pytlík: zamíchané formy povolené varianty, nová úloha nikdy nezíská tutéž formu jako předchozí (u jediné formy beze změny). */
let bag: FormKey[] = [];
let lastForm: FormKey | null = null;
export function resetTaskForms() { bag = []; lastForm = null; }
export function pickTaskForm(variant: VariantId, last: FormKey | null = lastForm): FormKey {
  const forms = variantById(variant).forms;
  if (forms.length === 1) { lastForm = forms[0]; return forms[0]; }
  bag = bag.filter((f) => forms.includes(f));
  if (!bag.length) bag = [...forms].sort(() => Math.random() - 0.5);
  let i = bag.findIndex((f) => f !== last);
  if (i < 0) { bag = [...forms].sort(() => Math.random() - 0.5); i = bag.findIndex((f) => f !== last); }
  const f = bag.splice(i, 1)[0];
  lastForm = f;
  return f;
}
/** Forma pro aktuální úlohu; nový `taskKey` (nová úloha) = nová forma. */
export function useTaskForm(taskKey: unknown): FormKey {
  const { variant } = useScript();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => pickTaskForm(variant), [taskKey, variant]);
}
