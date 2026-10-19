/** Minihry matematiky v0.8: MM1 Krmení zvířátek, MM2 Kolik vidíš?, MM3 Číselná cestička. Klepnutím, bez časomíry. */
import { useEffect, useMemo, useState } from 'react';
import { MiniShell, useMiniRound } from './MiniRound';
import { say } from '../activities/common';
import { drawGenerated, shuffle } from '../activities/fresh';
import { getSetting } from '../storage/db';

export type MathGameId = 'mm1' | 'mm2' | 'mm3';
export const MM2_MS_KEY = 'mm2:showMs';
export const MATH_GAMES: { id: MathGameId; name: string; icon: string; from: number }[] = [
  { id: 'mm1', name: 'Krmení zvířátek', icon: '🦔', from: 2 },
  { id: 'mm2', name: 'Kolik vidíš?', icon: '👀', from: 3 },
  { id: 'mm3', name: 'Číselná cestička', icon: '🐸', from: 4 },
];
const num = (n: number) => `snd-m-n-${n}`;
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const ROUND = 5;
// jídlo vždy jablko: hlas říká „jablek“ (A-04)
const ANIMALS = [{ a: '🦔', f: '🍎' }, { a: '🐰', f: '🍎' }, { a: '🐿️', f: '🍎' }, { a: '🐭', f: '🍎' }];

/** Generátory kol (exportované kvůli testu opakování). Stejná otázka se v kole ani na hranici kol neopakuje. */
export const mm1Tasks = (max: number) => drawGenerated(`mm1:${max}`, ROUND, (k) => ({ n: rnd(1, max), ...ANIMALS[k % ANIMALS.length] }), (t) => String(t.n), max);
/** MM2 rozsah podle lekce (didaktický audit A-07): do M3 1–2, M4 do 3, M5 do 4, od M6 do 5. */
export const mm2Max = (level: number) => (level >= 6 ? 5 : level === 5 ? 4 : level === 4 ? 3 : 2);
export const mm2Tasks = (max: number) => drawGenerated(`mm2:${max}`, ROUND, () => {
  const n = rnd(1, max);
  const o = shuffle([...new Set([n, ...shuffle([1, 2, 3, 4, 5].filter((x) => x !== n && Math.abs(x - n) <= 2))].slice(0, 3))]).sort((a, b) => a - b);
  return { n, o };
}, (t) => String(t.n), max);
/** MM3 rozsah podle probraných čísel: M4 1–4, M5 1–5, od M6 0–5 (dřív vždy 1-2-3). */
export const mm3Range = (level: number): [number, number] => (level >= 6 ? [0, 5] : [1, Math.min(5, Math.max(3, level))]);
export const mm3Tasks = (lo: number, hi: number) => drawGenerated(`mm3:${lo}-${hi}`, ROUND, () => {
  const s = rnd(lo, hi - 2); const row = [s, s + 1, s + 2]; const gap = rnd(0, 2); const n = row[gap];
  const range = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
  const o = shuffle([n, ...shuffle(range.filter((x) => x !== n)).slice(0, 2)]);
  return { row, gap, n, o };
}, (t) => `${t.row[0]}:${t.gap}`, (hi - lo - 1) * 3);

interface P { level: number; back: () => void; openAlbum: () => void }
export default function MathGame({ id, ...p }: P & { id: MathGameId }) {
  return id === 'mm1' ? <Feed {...p} /> : id === 'mm2' ? <Flash {...p} /> : <Path {...p} />;
}

/** MM1: klepnutí na jídlo = do misky (hlas počítá), klepnutí v misce = vrátit, ✓ potvrdit. */
function Feed({ level, back, openAlbum }: P) {
  const max = Math.min(5, Math.max(2, level));
  const tasks = useMemo(() => mm1Tasks(max), [max]);
  const r = useMiniRound(ROUND, 'mm1', 'math');
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  const [bowl, setBowl] = useState(0);
  useEffect(() => setBowl(0), [r.api.i]);
  return (
    <MiniShell title="Krmení zvířátek" subjCls="subj--mat" round={r} count={ROUND} nameAudio={['snd-m-p-game-krmeni']} prompt={['snd-m-p-feed-n', num(t.n)]} intro={`Dej do misky tolik: ${t.n}`} back={back} openAlbum={openAlbum}
      onHint={() => void say([num(t.n)])}>
      <div className="xg-row" data-testid="mm1" data-target={t.n}>
        <div className={`xg-animal${r.api.hintOn ? ' is-hint' : ''}`}>{t.a}<span className="num">{t.n}</span></div>
        <div className="xg-col">
          <div className="xg-bowl" data-testid="mm1-bowl" data-count={bowl} aria-label="miska">
            {Array.from({ length: bowl }, (_, k) => <button key={k} className="xg-in" aria-label="vrátit" onClick={() => setBowl((b) => b - 1)}>{t.f}</button>)}
          </div>
          <div className="xg-row xg-pile">{Array.from({ length: 6 - bowl }, (_, k) => <button key={k} className="xg-food" data-testid="mm1-food" aria-label="jídlo"
            onClick={() => { const b = bowl + 1; setBowl(b); if (b <= 5) void say([num(b)]); }}>{t.f}</button>)}</div>
        </div>
        <button className="kbtn kbtn-primary kbtn-xl" data-testid="mm1-go" aria-label="Hotovo" onClick={() => (bowl === t.n ? r.api.ok() : (bowl > t.n ? r.api.no('To je moc, jedno vrať.', ['snd-m-p-too-many']) : r.api.no('Ještě přidej.', ['snd-m-p-add-more'])))}>✓</button>
      </div>
    </MiniShell>
  );
}

const DICE: Record<number, [number, number][]> = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]] };
/** MM2: tečky svítí 2 s (rodič: 3 s), pak zhasnou; 👀 ukáže znovu. 3 číslice k ťuknutí. */
function Flash({ level, back, openAlbum }: P) {
  const max = mm2Max(level);
  const tasks = useMemo(() => mm2Tasks(max), [max]);
  const r = useMiniRound(ROUND, 'mm2', 'math');
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  const [ms, setMs] = useState(2000);
  const [on, setOn] = useState(true);
  const [run, setRun] = useState(0);
  useEffect(() => { void getSetting<number>(MM2_MS_KEY).then((v) => v && setMs(v)); }, []);
  useEffect(() => { setOn(true); const h = window.setTimeout(() => setOn(false), ms); return () => window.clearTimeout(h); }, [r.api.i, run, ms]);
  return (
    <MiniShell title="Kolik vidíš?" subjCls="subj--mat" round={r} count={ROUND} nameAudio={['snd-m-p-game-kolik']} prompt={['snd-m-p-dots']} intro="Podívej se pozorně. Kolik je tam teček?" back={back} openAlbum={openAlbum} onHint={() => setRun((n) => n + 1)}>
      <div className="xg-row" data-testid="mm2" data-ms={ms}>
        <div className="xg-col">
          <div className={`xg-flash${on || r.api.calm ? '' : ' is-off'}`} data-testid="mm2-dots" data-on={on ? 'true' : 'false'} data-n={t.n}>
            {DICE[t.n].map(([x, y], k) => <i key={k} style={{ left: `calc(${x}% - 22px)`, top: `calc(${y}% - 22px)` }} />)}
          </div>
          <button className="kbtn" data-testid="mm2-again" aria-label="Ukaž znovu" onClick={() => setRun((n) => n + 1)}>👀</button>
        </div>
        <div className="xg-row">{t.o.map((o) => <button key={o} className={`kbtn xg-num${r.api.calm && o === t.n ? ' is-hint' : ''}`} data-o={o} onClick={() => (o === t.n ? r.api.ok([num(o)]) : r.api.no())}>{o}</button>)}</div>
      </div>
    </MiniShell>
  );
}

/** MM3: kameny s čísly, jeden „?“, výběr ze 3; po správné odpovědi hlas přečte řadu a žabka skočí. */
function Path({ level, back, openAlbum }: P) {
  const [lo, hi] = mm3Range(level);
  const tasks = useMemo(() => mm3Tasks(lo, hi), [lo, hi]);
  const r = useMiniRound(ROUND, 'mm3', 'math');
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  return (
    <MiniShell title="Číselná cestička" subjCls="subj--mat" round={r} count={ROUND} nameAudio={['snd-m-p-game-cesticka']} prompt={['snd-m-p-missing-n']} intro="Které číslo chybí na cestičce?" back={back} openAlbum={openAlbum}
      onHint={() => void say(t.row.filter((_, k) => k !== t.gap).map(num))}>
      <div className="xg-col" data-testid="mm3">
        <div className={`xg-stones${r.api.solved ? ' is-jump' : ''}`}>
          {t.row.map((v, k) => <div key={k} className={`xg-stone${k === t.gap && !r.api.solved ? ' gap' : ''}`} data-gap={k === t.gap ? 'true' : undefined}>{k === 0 && <span className="xg-frog">🐸</span>}{k === t.gap && !r.api.solved ? '?' : v}</div>)}
          <div className="xg-flag">🏁</div>
        </div>
        <div className="xg-row">{t.o.map((o) => <button key={o} className={`kbtn xg-num${r.api.calm && o === t.n ? ' is-hint' : ''}`} data-o={o} onClick={() => (o === t.n ? r.api.ok(t.row.map(num), 2500) : r.api.no())}>{o}</button>)}</div>
      </div>
    </MiniShell>
  );
}
