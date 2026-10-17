/** Sloučení dat dítěte ze dvou zařízení. Nic se neztrácí: pokusy a události se sjednotí, stav lekce vyhrává ten vyšší. */
import type { ChildData } from '../storage/backup';
import type { LessonState, LessonStatus } from '../storage/db';

const RANK: Record<LessonStatus, number> = { locked: 0, practicing: 1, recommended: 2, approved: 3 };

function unionBy<T>(a: T[], b: T[], key: (x: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of [...a, ...b]) { const k = key(x); if (!m.has(k)) m.set(k, x); }
  return [...m.values()];
}
const strip = <T extends { id?: number }>(x: T): T => { const { id: _id, ...rest } = x; return rest as T; };

export function mergeLesson(a: LessonState, b: LessonState): LessonState {
  if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] > RANK[b.status] ? a : b;
  return b.updatedAt > a.updatedAt ? b : a;
}

/** Nastavení: pole se sjednotí, čísla vezmou maximum, objekty se sloučí rekurzivně, jinak platí místní hodnota. */
export function mergeValue(local: unknown, remote: unknown): unknown {
  if (local === undefined) return remote;
  if (Array.isArray(local) && Array.isArray(remote)) return unionBy([...local, ...remote], [], (x) => JSON.stringify(x));
  if (typeof local === 'number' && typeof remote === 'number') return Math.max(local, remote);
  if (local && remote && typeof local === 'object' && typeof remote === 'object' && !Array.isArray(local) && !Array.isArray(remote)) {
    const out: Record<string, unknown> = { ...(remote as Record<string, unknown>) };
    for (const [k, v] of Object.entries(local as Record<string, unknown>)) out[k] = mergeValue(v, (remote as Record<string, unknown>)[k]);
    return out;
  }
  return local;
}

/** Nahrávky hlasu se nesynchronizují (zůstávají jen v zařízení). */
export function mergeChild(local: ChildData, remote: Omit<ChildData, 'recordings'>): ChildData {
  const ls = new Map<string, LessonState>();
  for (const s of [...local.lessonStates, ...remote.lessonStates]) { const cur = ls.get(s.key); ls.set(s.key, cur ? mergeLesson(cur, s) : s); }
  const settings = new Map<string, unknown>();
  for (const s of remote.settings) settings.set(s.key, s.value);
  for (const s of local.settings) settings.set(s.key, mergeValue(s.value, settings.get(s.key)));
  return {
    attempts: unionBy(local.attempts, remote.attempts, (a) => `${a.at}|${a.activity}|${a.itemId}`).map(strip).sort((x, y) => x.at - y.at),
    events: unionBy(local.events ?? [], remote.events ?? [], (e) => `${e.at}|${e.kind}`).map(strip).sort((x, y) => x.at - y.at),
    lessonStates: [...ls.values()],
    settings: [...settings].map(([key, value]) => ({ key, value })),
    recordings: local.recordings,
  };
}
