/**
 * Jeden společný zdroj náhody pro všechna kola: míchání (Fisher–Yates) a ochrana proti opakování.
 * Každý generátor má vlastní klíč (např. `A2:duha-3`) a paměť naposledy zadaných úloh (přežije i nové kolo).
 * Ochrana N = min(velikost zásoby − 2, velikost kola): když je zásoba aspoň o 2 větší než kolo, v kole se nic neopakuje
 * a stejná úloha se vrátí nejdřív po N jiných (ani na hranici kol); malá zásoba se střídá, nikdy 2× za sebou.
 */
export function shuffle<T>(a: readonly T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
export const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

const HISTORY = 64;
const memory = new Map<string, string[]>();
/** Kolik posledních úloh je zakázaných. Nechává aspoň 2 možnosti (jinak by se pořadí točilo pořád stejně); u zásoby 2 se střídají. */
export const guardSize = (poolSize: number, round: number) => (poolSize <= 2 ? Math.max(0, poolSize - 1) : Math.min(poolSize - 2, round));
export function recentIds(key: string, n: number): Set<string> { return new Set(n > 0 ? (memory.get(key) ?? []).slice(-n) : []); }
export function remember(key: string, ...ids: string[]) {
  const h = memory.get(key) ?? [];
  h.push(...ids);
  memory.set(key, h.slice(-HISTORY));
}
/** Jen pro testy. */
export function resetFresh() { memory.clear(); }

/**
 * Vybere jednu úlohu, která nebyla mezi posledními N. `choose` může vybírat po svém (např. s prioritou), dostane jen povolené.
 */
export function drawFresh<T>(key: string, pool: readonly T[], idOf: (t: T) => string, round: number, choose: (allowed: readonly T[]) => T = pick): T {
  const unique = new Set(pool.map(idOf)).size;
  const recent = recentIds(key, guardSize(unique, round));
  const allowed = pool.filter((t) => !recent.has(idOf(t)));
  const t = choose(allowed.length ? allowed : pool);
  remember(key, idOf(t));
  return t;
}

/** Celé kolo `n` úloh ze zásoby (každá úloha je drawFresh, takže v kole ani na hranici se neopakují). */
export function drawRound<T>(key: string, pool: readonly T[], n: number, idOf: (t: T) => string): T[] {
  return Array.from({ length: Math.min(n, pool.length) }, () => drawFresh(key, pool, idOf, n));
}

/** Kolo z generátoru (např. náhodná čísla): úloha se losuje znovu, dokud neodpovídá ochraně (max. 40 pokusů). */
export function drawGenerated<T>(key: string, n: number, gen: (i: number) => T, idOf: (t: T) => string, poolSize: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const recent = recentIds(key, guardSize(poolSize, n));
    let t = gen(i);
    for (let k = 0; k < 40 && recent.has(idOf(t)); k++) t = gen(i);
    remember(key, idOf(t));
    out.push(t);
  }
  return out;
}

/** Hotovou frontu (každá položka jednou) přeuspořádá tak, aby naposledy viděné šly až na konec. */
export function freshOrder<T>(key: string, list: readonly T[], idOf: (t: T) => string): T[] {
  const recent = recentIds(key, guardSize(list.length, list.length));
  const out = [...list.filter((t) => !recent.has(idOf(t))), ...list.filter((t) => recent.has(idOf(t)))];
  remember(key, ...out.map(idOf));
  return out;
}
