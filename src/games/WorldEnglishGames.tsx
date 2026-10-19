/** Minihry prvouky (MP1–MP3) a angličtiny (ME1, ME2) v0.8. Klepnutím; ME2 kreslení perem i prstem.
 *  Anglické klipy zatím nejsou nahrané (english/audio-script.json → pending) → hry mlčí, text je na obrazovce. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MiniShell, useMiniRound } from './MiniRound';
import { getSetting } from '../storage/db';
import { say } from '../activities/common';
import { drawFresh, drawGenerated, drawRound, freshOrder, shuffle } from '../activities/fresh';
import { useWorldGames, type WorldGamesFile } from '../content/worldGames';

export type SubjGameId = 'mp1' | 'mp2' | 'mp3' | 'me1' | 'me2';
export const SUBJ_GAMES: { id: SubjGameId; subject: 'world' | 'english'; name: string; icon: string }[] = [
  { id: 'mp1', subject: 'world', name: 'Uklízíme', icon: '🧹' },
  { id: 'mp2', subject: 'world', name: 'Co bylo dřív?', icon: '🚂' },
  { id: 'mp3', subject: 'world', name: 'Bezpečná cesta', icon: '🚸' },
  { id: 'me1', subject: 'english', name: 'Megaboxy', icon: '📦' },
  { id: 'me2', subject: 'english', name: 'Colour it', icon: '🎨' },
];
const ROUND = 5;
/** Anglické hry se otevřou, až jsou v index.json všechny potřebné klipy (pokyn + slovíčka + barvy) – viz enGameNeeds.
 *  Do té doby je dlaždice „Brzy“ (didaktický audit A-01), takže se nikdy nežádá chybějící soubor. */
const en = (...ids: string[]): string[] => ids;
interface P { back: () => void; openAlbum: () => void }
export default function SubjGame({ id, ...p }: P & { id: SubjGameId }) {
  return id === 'mp1' ? <Sort {...p} /> : id === 'mp2' ? <Order {...p} /> : id === 'mp3' ? <Road {...p} /> : id === 'me1' ? <Boxes {...p} /> : <Colour {...p} />;
}
const W = { cls: 'subj--prv' }, E = { cls: 'subj--aj' };

type Item = WorldGamesFile['mp1']['items'][number];
type Box = WorldGamesFile['mp1']['boxes'][number];
/** MP1 (A-20): věci a krabice z world/games.json. 3. krabice od úrovně P2 = 2 kola P1 s ≥ 4 z 5 napoprvé. */
export const mp1Tasks = (items: readonly Item[], boxes: readonly Box[], n = ROUND) => {
  const ids = new Set(boxes.map((b) => b.id));
  const pool = items.filter((i) => ids.has(i.box));
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    const last2 = out.slice(-2).map((x) => x.box);
    const unused = pool.filter((x) => !out.includes(x));
    const cand = unused.filter((x) => !(last2.length === 2 && last2.every((b) => b === x.box)));
    out.push(drawFresh(`mp1:${[...ids].join('+')}`, cand.length ? cand : unused, (x) => x.id, n));
  }
  return out;
};
function Sort({ back, openAlbum }: P) {
  const g = useWorldGames();
  const p2 = useMp1Level2();
  const boxes = useMemo(() => g ? g.mp1.boxes.filter((b) => (g.mp1.levels.find((l) => l.id === (p2 ? 'p2' : 'p1'))!.boxIds).includes(b.id)) : [], [g, p2]);
  const tasks = useMemo(() => g ? mp1Tasks(g.mp1.items, boxes) : [], [g, boxes]);
  const r = useMiniRound(ROUND, 'mp1', 'world');
  if (!g || !tasks.length) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  const boxOf = (id: string) => boxes.find((b) => b.id === id)!;
  return (
    <MiniShell title="Uklízíme" subjCls={W.cls} round={r} count={ROUND} nameAudio={['snd-pv-p-game-uklizime']} prompt={['snd-pv-p-sort', t.audioId]} intro="Kam to patří? Ťukni na správnou krabici." back={back} openAlbum={openAlbum}>
      <div className="xg-col" data-testid="mp1" data-level={p2 ? 'p2' : 'p1'}>
        <button className="xg-item" data-testid="mp1-item" data-box={t.box} aria-label={t.label} onClick={() => void say([t.audioId])}>{t.emoji}<small>{t.label}</small></button>
        <div className="xg-row">{boxes.map((b) => <button key={b.id} className={`kbtn xg-box${r.api.calm && t.box === b.id ? ' is-hint' : ''}`} data-box={b.id} aria-label={b.label} onClick={() => (t.box === b.id ? r.api.ok([t.audioId, boxOf(b.id).audioId], 3500) : r.api.no())}>{b.icon}<small>{b.label}</small></button>)}</div>
      </div>
    </MiniShell>
  );
}

type Seq = WorldGamesFile['mp2']['sequences'][number];
/** MP2 (A-19): 5 z 8 sekvencí z world/games.json, zamíchání nikdy není rovnou správné pořadí. */
export const mp2Tasks = (seqs: readonly Seq[], n = ROUND) => freshOrder('mp2', shuffle(seqs), (s) => s.id).slice(0, n).map((s) => { let shown = shuffle(s.steps); while (shown.join() === s.steps.join()) shown = shuffle(s.steps); return { s, shown }; });
function Order({ back, openAlbum }: P) {
  const g = useWorldGames();
  const tasks = useMemo(() => g ? mp2Tasks(g.mp2.sequences) : [], [g]);
  const r = useMiniRound(ROUND, 'mp2', 'world');
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  const [train, setTrain] = useState<string[]>([]);
  useEffect(() => setTrain([]), [r.api.i]);
  if (!t) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  const add = (e: string) => {
    if (e !== t.s.steps[train.length]) { r.api.no(); return; }
    const next = [...train, e]; setTrain(next);
    if (next.length === t.s.steps.length) r.api.ok([t.s.narrationAudioId], 4500);
  };
  return (
    <MiniShell title="Co bylo dřív?" subjCls={W.cls} round={r} count={ROUND} nameAudio={['snd-pv-p-game-drive']} prompt={['snd-pv-p-order']} intro="Ťukej na obrázky tak, jak jdou po sobě." back={back} openAlbum={openAlbum}>
      <div className="xg-col" data-testid="mp2" data-order={t.s.steps.join(' ')}>
        <div className="xg-train" data-testid="mp2-train">🚂{t.s.steps.map((_, k) => <button key={k} className="xg-wagon" data-k={k} aria-label="vagon" onClick={() => train[k] && setTrain(train.slice(0, k))}>{train[k] ?? ''}</button>)}</div>
        <div className="xg-row">{t.shown.map((e) => <button key={e} className={`kbtn xg-pic${r.api.calm && e === t.s.steps[train.length] ? ' is-hint' : ''}`} data-pic={e} disabled={train.includes(e)} onClick={() => add(e)}>{e}</button>)}</div>
      </div>
    </MiniShell>
  );
}

type Mp3Type = WorldGamesFile['mp3']['taskTypes'][number];
export interface Mp3Task { type: Mp3Type; variant: 'green' | 'red' | null; zebra: number }
/** MP3 (A-17): 5 úloh, aspoň 1 z každého typu, nikdy 3× stejný typ za sebou. */
export const mp3Tasks = (types: readonly Mp3Type[], n = ROUND): Mp3Task[] => {
  const out: Mp3Task[] = [];
  for (let i = 0; i < n; i++) {
    const last = out.slice(-2).map((t) => t.type.id);
    let cand = types.filter((t) => !(last.length === 2 && last[0] === t.id && last[1] === t.id));
    const missing = types.filter((t) => !out.some((x) => x.type.id === t.id) && n - i <= types.length - new Set(out.map((x) => x.type.id)).size);
    if (missing.length) cand = missing;
    const type = shuffle(cand)[0];
    out.push({ type, variant: type.id === 'light' ? (i % 2 ? 'red' : 'green') : null, zebra: shuffle([20, 50, 80])[0] });
  }
  return out;
};
function Road({ back, openAlbum }: P) {
  const g = useWorldGames();
  const tasks = useMemo(() => g ? mp3Tasks(g.mp3.taskTypes) : [], [g]);
  const r = useMiniRound(ROUND, 'mp3', 'world');
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  const [look, setLook] = useState(0);
  useEffect(() => setLook(0), [r.api.i]);
  if (!t) return <main className="screen activity"><p className="muted">Načítám…</p></main>;
  const dir = t.type.id === 'look' ? ['vlevo', 'vpravo', 'vlevo'][look] : null;
  const step = (d: 'vlevo' | 'vpravo') => {
    if (d !== dir) { r.api.no(); setLook(0); return; }
    const k = look + 1; setLook(k);
    void say([t.type.stepAudioIds![k - 1]]);
    if (k === 3) r.api.ok();
  };
  const light = (go: boolean) => {
    const ok = (t.variant === 'green') === go;
    ok ? r.api.ok([t.type.buttonAudioIds![go ? 'go' : 'wait'], t.type.feedbackAudioIds![t.variant!]]) : r.api.no(undefined, [t.type.buttonAudioIds![go ? 'go' : 'wait']]);
  };
  return (
    <MiniShell title="Bezpečná cesta" subjCls={W.cls} round={r} count={ROUND} nameAudio={['snd-pv-p-game-cesta']} prompt={[t.type.promptAudioId]} intro={t.type.text} back={back} openAlbum={openAlbum}>
      <div className="xg-street" data-testid="mp3" data-task={t.type.id} data-variant={t.variant ?? ''} data-zebra={t.zebra} data-look={look}>
        {t.type.id === 'crossing' && <>
          <div className="xg-side">🏠</div>
          <div className="xg-road"><div className="xg-zebra" style={{ left: `calc(${t.zebra}% - 40px)` }} />
            {[20, 50, 80].map((x) => <button key={x} className={`xg-spot${r.api.calm && x === t.zebra ? ' is-hint' : ''}`} data-x={x} style={{ left: `calc(${x}% - 30px)` }} aria-label="tady přejdu" onClick={() => (x === t.zebra ? r.api.ok([t.type.okAudioId!], 3500) : r.api.no())}>👣</button>)}
          </div><div className="xg-side">🏫</div></>}
        {t.type.id === 'look' && <div className="xg-row" data-testid="mp3-look"><button className={`kbtn${r.api.calm && dir === 'vlevo' ? ' is-hint' : ''}`} data-dir="vlevo" aria-label="vlevo" onClick={() => step('vlevo')}>👈 vlevo</button><button className={`kbtn${r.api.calm && dir === 'vpravo' ? ' is-hint' : ''}`} data-dir="vpravo" aria-label="vpravo" onClick={() => step('vpravo')}>vpravo 👉</button></div>}
        {t.type.id === 'light' && <div className="xg-row" data-testid="mp3-light" data-light={t.variant}><span className="xg-light" aria-hidden="true">{t.variant === 'green' ? '🟢' : '🔴'}</span><button className="kbtn" data-go="wait" onClick={() => light(false)}>Čekám</button><button className="kbtn" data-go="go" onClick={() => light(true)}>Jdu</button></div>}
      </div>
    </MiniShell>
  );
}

/** ME1: „Find the pencil!“ – 3–4 krabice; klepnutí otevře, špatná se po 1,2 s zavře. */
const VOCAB = [{ w: 'pencil', e: '✏️' }, { w: 'book', e: '📕' }, { w: 'bag', e: '🎒' }, { w: 'crayon', e: '🖍️' }, { w: 'ruler', e: '📏' }, { w: 'scissors', e: '✂️' }];
function Boxes({ back, openAlbum }: P) {
  const tasks = useMemo(() => me1Tasks(), []);
  const r = useMiniRound(ROUND, 'me1', 'english');
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => setOpen([]), [r.api.i]);
  const tap = (w: string) => {
    if (open.includes(w)) return;
    setOpen((o) => [...o, w]); if (en('x').length) void say(en(`snd-en-w-${w}`));
    if (w === t.v.w) r.api.ok(en(`snd-en-w-${w}`)); else { r.api.no(); window.setTimeout(() => setOpen((o) => o.filter((x) => x !== w)), 1200); }
  };
  return (
    <MiniShell title="Megaboxy" subjCls={E.cls} round={r} count={ROUND} nameAudio={en('snd-en-p-game-megaboxy')} prompt={en('snd-en-p-find-x', `snd-en-w-${t.v.w}`)} intro={`Find the ${t.v.w}!`} back={back} openAlbum={openAlbum}>
      <div className="xg-col" data-testid="me1" data-word={t.v.w}>
        <p className="xg-en" lang="en-GB">Find the {t.v.w}!</p>
        <div className="xg-row">{t.boxes.map((b) => <button key={b.w} className={`kbtn xg-mbox${r.api.calm && b.w === t.v.w ? ' is-hint' : ''}`} data-w={b.w} aria-label="box" onClick={() => tap(b.w)}>{open.includes(b.w) ? b.e : '📦'}</button>)}</div>
      </div>
    </MiniShell>
  );
}

/** ME2: „Colour the bag red.“ – paleta 4 barev, vybarvit perem/prstem; kontrola: ≥ 50 % vzorků (mřížka 6 px) v masce má cílovou barvu. */
const COLOURS: { id: string; name: string; hex: string; rgb: [number, number, number] }[] = [
  { id: 'red', name: 'red', hex: '#e03131', rgb: [224, 49, 49] }, { id: 'blue', name: 'blue', hex: '#1971c2', rgb: [25, 113, 194] },
  { id: 'yellow', name: 'yellow', hex: '#fcc419', rgb: [252, 196, 25] }, { id: 'green', name: 'green', hex: '#2f9e44', rgb: [47, 158, 68] },
];
const SHAPES: { w: string; d: string }[] = [
  { w: 'ball', d: 'M150 40 A110 110 0 1 1 149.9 40 Z' },
  { w: 'bag', d: 'M60 100 H240 V260 H60 Z M110 100 V70 Q150 30 190 70 V100 H170 V75 Q150 55 130 75 V100 Z' },
  { w: 'book', d: 'M50 60 H250 V250 H50 Z' },
  { w: 'apple', d: 'M150 90 C90 50 40 110 60 180 C80 250 130 270 150 250 C170 270 220 250 240 180 C260 110 210 50 150 90 Z' },
];
export const COLOUR_THRESHOLD = 0.5;
function Colour({ back, openAlbum }: P) {
  const tasks = useMemo(() => me2Tasks(), []);
  const r = useMiniRound(ROUND, 'me2', 'english');
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  const cv = useRef<HTMLCanvasElement>(null);
  const [colour, setColour] = useState(COLOURS[0]);
  const active = useRef<number | null>(null);
  const penDown = useRef(false);
  const last = useRef<[number, number] | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const clear = () => { const c = cv.current?.getContext('2d'); if (c) c.clearRect(0, 0, 300, 300); setScore(null); };
  useEffect(clear, [r.api.i]);
  const pt = (e: React.PointerEvent): [number, number] => { const b = cv.current!.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * 300, ((e.clientY - b.top) / b.height) * 300]; };
  const paint = (e: React.PointerEvent, from: [number, number] | null) => {
    const c = cv.current!.getContext('2d')!; const p = pt(e);
    c.strokeStyle = colour.hex; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = e.pointerType === 'touch' ? 34 : 20;
    c.beginPath(); c.moveTo(...(from ?? p)); c.lineTo(...p); c.stroke(); last.current = p;
  };
  const check = () => {
    const c = cv.current!.getContext('2d')!; const mask = new Path2D(t.s.d); const img = c.getImageData(0, 0, 300, 300).data;
    let n = 0, hit = 0;
    for (let y = 3; y < 300; y += 6) for (let x = 3; x < 300; x += 6) {
      if (!c.isPointInPath(mask, x, y)) continue; n++;
      const i = (y * 300 + x) * 4; const [R, G, B, A] = [img[i], img[i + 1], img[i + 2], img[i + 3]];
      if (A > 128 && Math.abs(R - t.c.rgb[0]) + Math.abs(G - t.c.rgb[1]) + Math.abs(B - t.c.rgb[2]) < 60) hit++;
    }
    const s = n ? hit / n : 0; setScore(s);
    if (s >= COLOUR_THRESHOLD) r.api.ok(); else r.api.no();
  };
  return (
    <MiniShell title="Colour it" subjCls={E.cls} round={r} count={ROUND} nameAudio={en('snd-en-p-game-colour')} prompt={en('snd-en-p-colour-x-y', `snd-en-w-${t.s.w}`, `snd-en-c-${t.c.id}`)} intro={`Colour the ${t.s.w} ${t.c.name}.`} back={back} openAlbum={openAlbum}>
      <div className="xg-row" data-testid="me2" data-shape={t.s.w} data-colour={t.c.id} data-score={score ?? ''}>
        <p className="xg-en" lang="en-GB">Colour the {t.s.w} {t.c.name}.</p>
        <div className="xg-canvas">
          <canvas ref={cv} width={300} height={300} data-testid="me2-canvas"
            onPointerDown={(e) => { e.preventDefault(); if (e.pointerType === 'touch' && penDown.current) return; if (active.current !== null) return; if (e.pointerType === 'pen') penDown.current = true; active.current = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* syntetické */ } paint(e, null); }}
            onPointerMove={(e) => { if (e.pointerId === active.current) paint(e, last.current); }}
            onPointerUp={(e) => { if (e.pointerType === 'pen') penDown.current = false; if (e.pointerId === active.current) { active.current = null; last.current = null; } }} />
          <svg viewBox="0 0 300 300" className="xg-outline"><path d={t.s.d} /></svg>
        </div>
        <div className="xg-col">
          {COLOURS.map((c) => <button key={c.id} className="xg-paint" data-c={c.id} aria-pressed={colour.id === c.id} style={{ background: c.hex }} aria-label={c.name} onClick={() => { setColour(c); void say(en(`snd-en-c-${c.id}`)); }} />)}
          <button className="kbtn" data-testid="me2-clear" aria-label="Smazat" onClick={clear}>🗑</button>
          <button className="kbtn kbtn-primary kbtn-xl" data-testid="me2-done" onClick={check}>✓</button>
        </div>
      </div>
    </MiniShell>
  );
}

export const me1Tasks = () => drawRound('me1', VOCAB, ROUND, (v) => v.w).map((v) => ({ v, boxes: shuffle([v, ...shuffle(VOCAB.filter((x) => x !== v)).slice(0, 3)]) }));
export const me2Tasks = () => drawGenerated('me2', ROUND, () => ({ s: shuffle(SHAPES)[0], c: shuffle(COLOURS)[0] }), (t) => t.s.w, SHAPES.length);
/** Klipy, bez kterých anglická hra nejde hrát poslechem (ME1: Find the + slovo, ME2: Colour the + slovo + barva). */
export function enGameNeeds(id: SubjGameId): string[] {
  if (id === 'me1') return ['snd-en-p-find-x', ...VOCAB.map((v) => `snd-en-w-${v.w}`)];
  if (id === 'me2') return ['snd-en-p-colour-x-y', ...SHAPES.map((s) => `snd-en-w-${s.w}`), ...COLOURS.map((c) => `snd-en-c-${c.id}`)];
  return [];
}

/** A-20: P2 (3. krabice) po 2 kolech P1 s ≥ 4 z 5 napoprvé. */
export function mp1Unlocked(rounds: { gameId: string; tasks?: { tries: number }[]; firstTry?: number }[]): boolean {
  const good = rounds.filter((r) => r.gameId === 'mp1' && ((r.firstTry ?? r.tasks?.filter((t) => t.tries <= 1).length ?? 0) >= 4));
  return good.length >= 2;
}
function useMp1Level2() {
  const [p2, setP2] = useState(false);
  useEffect(() => { void getSetting<{ gameId: string; tasks?: { tries: number }[]; firstTry?: number }[]>('games:rounds').then((r) => setP2(mp1Unlocked(r ?? []))); }, []);
  return p2;
}
