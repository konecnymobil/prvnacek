import type { Forms } from './types';

const lc = (t: string) => t.toLocaleLowerCase('cs');
const uc = (t: string) => t.toLocaleUpperCase('cs');
const cap = (t: string) => uc(t.charAt(0)) + lc(t.slice(1));

/** Pravidlo velikosti písmen pro jeden tvar: velké tiskací celé velké, „S velkým“ jen první písmeno, ostatní malé. */
export function expectedCase(key: keyof Forms, value: string): string {
  return key === 'upperPrint' ? uc(value) : key === 'cursiveUpper' ? cap(value) : lc(value);
}

/** Pojistka aplikace: opraví tvary s chybnou velikostí písmen (např. „MeLe“) a vrátí seznam oprav pro hlášení obsahu. */
export function normalizeFormsCase<T extends { id: string; forms: Forms }>(items: T[]): string[] {
  const fixed: string[] = [];
  for (const it of items) {
    for (const k of Object.keys(it.forms) as (keyof Forms)[]) {
      const v = it.forms[k];
      if (typeof v !== 'string') continue;
      const e = expectedCase(k, v);
      if (e !== v) { fixed.push(`${it.id}.${k}: ${v} → ${e}`); (it.forms as unknown as Record<string, string>)[k] = e; }
    }
  }
  return fixed;
}
