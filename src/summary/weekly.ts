/**
 * M4 – týdenní souhrn pro rodiče. Čisté funkce bez prohlížečových závislostí (testuje se i v Node).
 * Prahy: z weekly-summary.json (mastery, trend, doporučení) a konstanty níže (sezení/únava podle zadání M4).
 */
import {
  fillTemplate, isRecommendedForTest, pickWeeklyRecommendations,
  type WeeklyMetrics, type WeeklyRecommendationId, type WeeklySummaryFile, type AttemptMasteryRule,
} from '../content/types';

/** Nové sezení po 10 min nečinnosti. */
export const SESSION_GAP_MS = 10 * 60 * 1000;
/** Pauza delší než 60 s se nepočítá do aktivního času; uprostřed úlohy je to signál únavy. */
export const IDLE_MS = 60 * 1000;
/** Kolik chyb za sebou je signál únavy. */
export const ERROR_STREAK = 3;

export interface SAttempt { at: number; day: string; activity: string; lessonId: string; itemId: string; correct: boolean;
  chosenId?: string | null; reason?: string | null; confusedWith?: string | null }
export interface SEvent { at: number; day: string; kind: string; lessonId?: string }
export interface STest { at: number; lessonId: string; errors: { reason: string | null; refId?: string | null }[] }
export interface SLessonState { lessonId: string; status: string; approvedAt: number | null }
export interface SContent {
  lessons: { id: string; index: number; title: string; letterIds: string[] }[];
  letters: { id: string; upper: string; baseLetterId: string | null; visualConfusables: string[]; auditoryConfusables: string[] }[];
  syllables: { id: string; letterIds: string[]; usableInSyllableTasks: boolean }[];
  words: { id: string; letterIds: string[] }[];
  recommendation: { minRatedTasks: number; windowSize: number; minSuccessRatio: number; minDistinctDays: number };
}
export interface SData { attempts: SAttempt[]; events: SEvent[]; tests: STest[]; lessonStates: SLessonState[] }

/** Pondělí 00:00 (místní čas) týdne, do kterého patří t. */
export function weekStartOf(t: number): number {
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
export function addDays(t: number, n: number): number { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }

/** Hotové týdny (po–ne) od prvního záznamu po minulý týden, nejnovější první. */
export function completedWeeks(data: SData, now: number): number[] {
  const times = [...data.attempts.map((a) => a.at), ...data.events.map((e) => e.at), ...data.tests.map((t) => t.at)];
  if (!times.length) return [];
  const cur = weekStartOf(now);
  const out: number[] = [];
  for (let w = addDays(cur, -7); w >= weekStartOf(Math.min(...times)); w = addDays(w, -7)) out.push(w);
  return out;
}

/** Sezení a aktivní čas z časů všech záznamů (pokusy + události). */
export function sessionStats(times: number[]): { sessions: number; activeMs: number } {
  const ts = [...times].sort((a, b) => a - b);
  let sessions = 0, activeMs = 0;
  ts.forEach((t, i) => {
    const gap = i ? t - ts[i - 1] : Infinity;
    if (gap > SESSION_GAP_MS) sessions++;
    else if (gap <= IDLE_MS) activeMs += gap;
  });
  return { sessions, activeMs };
}

/** Zvládnutí položky ke konci času `until` (pokusy seřazené od nejstarší). */
export function isMastered(att: SAttempt[], rule: AttemptMasteryRule): boolean {
  const ok = att.filter((a) => a.correct);
  if (ok.length < rule.minCorrect || new Set(ok.map((a) => a.day)).size < rule.minDistinctDays) return false;
  const lastN = att.slice(-rule.lastN);
  if (lastN.filter((a) => a.correct).length / lastN.length < rule.minRatioLastN - 1e-9) return false;
  // ztráta zvládnutí: 2 chyby z posledních 3
  return att.slice(-3).filter((a) => !a.correct).length < 2;
}

function masteredSets(data: SData, c: SContent, spec: WeeklySummaryFile, until: number) {
  const usable = new Set(c.syllables.filter((s) => s.usableInSyllableTasks).map((s) => s.id));
  const words = new Set(c.words.map((w) => w.id));
  const by = new Map<string, SAttempt[]>();
  for (const a of [...data.attempts].sort((x, y) => x.at - y.at)) if (a.at < until) {
    const l = by.get(a.itemId) ?? []; l.push(a); by.set(a.itemId, l);
  }
  const syl = new Set<string>(), wrd = new Set<string>();
  for (const [id, att] of by) {
    if (usable.has(id) && isMastered(att, spec.mastery.syllable)) syl.add(id);
    if (words.has(id) && isMastered(att, spec.mastery.word)) wrd.add(id);
  }
  const letters = new Set<string>();
  for (const s of data.lessonStates) if (s.status === 'approved' && (s.approvedAt ?? 0) < until)
    for (const id of c.lessons.find((l) => l.id === s.lessonId)?.letterIds ?? []) letters.add(id);
  return { syl, wrd, letters };
}

export type ErrorCategoryId = WeeklySummaryFile['errorCategories'][number]['id'];
/** Kategorie jedné chyby + dvojice písmen pro {pairs}. */
export function categorizeError(c: SContent, target: string | null | undefined, reason: string | null | undefined, confusedWith: string | null | undefined): { id: ErrorCategoryId; pair?: string } {
  if (reason === 'notBlended') return { id: 'notBlended' };
  if (reason !== 'confused' || !target || !confusedWith) return { id: reason === 'confused' ? 'otherConfusion' : 'unknown' };
  const lettersOf = (id: string): string[] | null => {
    if (id.startsWith('l-')) return [id];
    return c.syllables.find((s) => s.id === id)?.letterIds ?? c.words.find((w) => w.id === id)?.letterIds ?? null;
  };
  const t = lettersOf(target), x = lettersOf(confusedWith);
  if (!t || !x) return { id: 'otherConfusion' };
  const L = new Map(c.letters.map((l) => [l.id, l]));
  const base = (id: string) => L.get(id)?.baseLetterId ?? id;
  if (t.length === x.length) {
    const diff = t.map((id, i) => [id, x[i]] as const).filter(([a, b]) => a !== b);
    if (diff.length && diff.every(([a, b]) => base(a) === base(b))) return { id: 'vowelLength' };
    for (const [a, b] of diff) {
      const la = L.get(a), lb = L.get(b);
      if (la && lb && (la.visualConfusables.includes(lb.upper) || la.auditoryConfusables.includes(lb.upper))) return { id: 'letterConfusion', pair: `${la.upper} × ${lb.upper}` };
    }
  }
  return { id: 'otherConfusion' };
}

export interface WeekSummary {
  weekStart: number;
  metrics: WeeklyMetrics;
  errors: { id: ErrorCategoryId; count: number; label: string; tip: string }[];
  trend: { minutes: string; success: string; newly: string };
  recommendations: { id: WeeklyRecommendationId; text: string }[];
  lines: { headline: string; mastered: string; tests: string; trend: string; errors: string[]; praise: string };
  approvedLessons: string[];
}

function baseMetrics(data: SData, c: SContent, spec: WeeklySummaryFile, ws: number) {
  const we = addDays(ws, 7);
  const inW = <T extends { at: number }>(x: T[]) => x.filter((a) => a.at >= ws && a.at < we);
  const att = inW(data.attempts).sort((a, b) => a.at - b.at);
  const ev = inW(data.events);
  const tests = inW(data.tests);
  const { sessions, activeMs } = sessionStats([...att.map((a) => a.at), ...ev.map((e) => e.at)]);
  const minutesTotal = Math.round(activeMs / 60000);
  const m0 = masteredSets(data, c, spec, ws), m1 = masteredSets(data, c, spec, we);
  const newly = [...m1.syl].filter((x) => !m0.syl.has(x)).length + [...m1.wrd].filter((x) => !m0.wrd.has(x)).length + [...m1.letters].filter((x) => !m0.letters.has(x)).length;
  let streaks = 0, run = 0;
  for (const a of att) { if (a.correct) run = 0; else if (++run === ERROR_STREAK) streaks++; }
  const frustration = streaks + ev.filter((e) => e.kind === 'earlyExit' || e.kind === 'idle').length;
  const approved = data.lessonStates.filter((s) => s.status === 'approved' && s.approvedAt !== null && s.approvedAt >= ws && s.approvedAt < we);
  // aktuální lekce = nejvyšší lekce s pokusem nebo schválením do konce týdne
  const touched = new Set([...data.attempts.filter((a) => a.at < we && a.lessonId).map((a) => a.lessonId), ...data.lessonStates.filter((s) => s.status === 'approved' && (s.approvedAt ?? 0) < we).map((s) => s.lessonId)]);
  const lessons = [...c.lessons].sort((a, b) => a.index - b.index);
  const cur = [...lessons].reverse().find((l) => touched.has(l.id)) ?? lessons[0];
  const next = lessons.find((l) => l.index === cur.index + 1) ?? null;
  const curApproved = data.lessonStates.some((s) => s.lessonId === cur.id && s.status === 'approved' && (s.approvedAt ?? 0) < we);
  const curAll = data.attempts.filter((a) => a.lessonId === cur.id && a.at < we).sort((a, b) => a.at - b.at);
  const curWin = att.filter((a) => a.lessonId === cur.id).slice(-c.recommendation.windowSize);
  // chyby: procvičování (záměny) + zkoušky (důvod od rodiče)
  const counts = new Map<ErrorCategoryId, { n: number; pairs: Set<string> }>();
  const addErr = (r: { id: ErrorCategoryId; pair?: string }) => { const e = counts.get(r.id) ?? { n: 0, pairs: new Set() }; e.n++; if (r.pair) e.pairs.add(r.pair); counts.set(r.id, e); };
  for (const a of att) if (!a.correct) addErr(categorizeError(c, a.itemId, a.reason ?? (a.chosenId ? 'confused' : 'unknown'), a.confusedWith ?? a.chosenId));
  for (const t of tests) for (const e of t.errors) addErr(categorizeError(c, e.refId, e.reason, null));
  const errors = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, spec.maxErrorsShown).map(([id, v]) => {
    const cat = spec.errorCategories.find((x) => x.id === id)!;
    return { id, count: v.n, label: cat.label, tip: fillTemplate(cat.parentText, { pairs: [...v.pairs].slice(0, 3).join(', ') }) };
  });
  const metrics: WeeklyMetrics = {
    minutesTotal, sessions, activeDays: new Set(att.map((a) => a.day)).size,
    avgSessionMinutes: sessions ? minutesTotal / sessions : 0,
    ratedTasks: att.length, successRatio: att.length ? att.filter((a) => a.correct).length / att.length : 0,
    currentLessonSuccessRatio: curWin.length ? curWin.filter((a) => a.correct).length / curWin.length : NaN,
    lettersMastered: m1.letters.size, syllablesMastered: m1.syl.size, wordsMastered: m1.wrd.size, newlyMastered: newly,
    testsTaken: tests.length, lessonsApproved: approved.length,
    recommendedForTest: !curApproved && isRecommendedForTest(curAll, c.recommendation),
    currentLessonApproved: curApproved && !!next && !data.attempts.some((a) => a.lessonId === next.id && a.at < we),
    frustrationSignals: frustration, topErrorCount: errors[0]?.count ?? 0,
  };
  return { metrics, errors, cur, next, approved };
}

/** Trend podle spec.trend: „víc/podobně/méně“, nebo „none“ když minulý týden nebyl. */
export function trendLabel(spec: WeeklySummaryFile, cur: number, prev: number, prevHadPractice: boolean): string {
  const L = spec.trend.labels;
  if (!prevHadPractice) return L.none;
  if (prev === 0) return cur > 0 ? L.up : L.same;
  const rel = (cur - prev) / prev;
  return rel > spec.trend.upIfRelativeChange ? L.up : rel < spec.trend.downIfRelativeChange ? L.down : L.same;
}

const fmtDay = (t: number, withMonth: boolean) => { const d = new Date(t); return withMonth ? `${d.getDate()}. ${d.getMonth() + 1}.` : `${d.getDate()}.`; };

export function buildWeekSummary(data: SData, c: SContent, spec: WeeklySummaryFile, ws: number, childName: string): WeekSummary {
  const w = baseMetrics(data, c, spec, ws);
  const p = baseMetrics(data, c, spec, addDays(ws, -7)).metrics;
  const m = w.metrics;
  const prevHad = Number(p.ratedTasks) > 0 || Number(p.sessions) > 0;
  const minBase = spec.trend.minBaseForRatio;
  const trend = {
    minutes: trendLabel(spec, Number(m.minutesTotal), Number(p.minutesTotal), prevHad),
    success: !prevHad ? spec.trend.labels.none
      : Number(m.ratedTasks) >= minBase && Number(p.ratedTasks) >= minBase ? trendLabel(spec, Number(m.successRatio), Number(p.successRatio), true)
      : `málo úloh na porovnání (potřeba aspoň ${minBase} v obou týdnech)`,
    newly: trendLabel(spec, Number(m.newlyMastered), Number(p.newlyMastered), prevHad),
  };
  const we = addDays(ws, 6);
  const sameMonth = new Date(ws).getMonth() === new Date(we).getMonth();
  const top = w.errors[0];
  const vals: Record<string, string | number> = {
    childName, weekStart: fmtDay(ws, !sameMonth), weekEnd: fmtDay(we, true),
    minutesTotal: Number(m.minutesTotal), sessions: Number(m.sessions), activeDays: Number(m.activeDays),
    lettersMastered: Number(m.lettersMastered), syllablesMastered: Number(m.syllablesMastered), wordsMastered: Number(m.wordsMastered),
    newlyMastered: Number(m.newlyMastered), testsTaken: Number(m.testsTaken), lessonsApproved: Number(m.lessonsApproved),
    trendMinutes: trend.minutes, trendSuccess: trend.success,
    topErrorLabel: top?.label ?? '', topErrorTip: top?.tip ?? '',
    lessonTitle: w.cur.title, nextLessonTitle: w.next?.title ?? '',
  };
  const T = spec.templates;
  const recommendations = pickWeeklyRecommendations(spec, m).map((id) => ({ id, text: fillTemplate(spec.recommendations.find((r) => r.id === id)!.template, vals) }));
  return {
    weekStart: ws, metrics: m, errors: w.errors, trend, recommendations,
    approvedLessons: w.approved.map((s) => c.lessons.find((l) => l.id === s.lessonId)?.title ?? s.lessonId),
    lines: {
      headline: fillTemplate(T.headline, vals), mastered: fillTemplate(T.mastered, vals), tests: fillTemplate(T.tests, vals),
      trend: fillTemplate(T.trend, vals),
      errors: w.errors.length ? w.errors.map((e) => fillTemplate(T.errors, { ...vals, topErrorLabel: e.label, topErrorTip: e.tip })) : [T.noErrors],
      praise: fillTemplate(T.praise, vals),
    },
  };
}
