/** Minihry prvouky (MP1–MP3) a angličtiny (ME1, ME2) v0.8. Klepnutím; ME2 kreslení perem i prstem.
 *  Anglické klipy zatím nejsou nahrané (english/audio-script.json → pending) → hry mlčí, text je na obrazovce. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { MiniShell, useMiniRound } from './MiniRound';
import { say } from '../activities/common';

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
const shuffle = <T,>(a: readonly T[]) => [...a].sort(() => Math.random() - 0.5);
interface P { back: () => void; openAlbum: () => void }
export default function SubjGame({ id, ...p }: P & { id: SubjGameId }) {
  return id === 'mp1' ? <Sort {...p} /> : id === 'mp2' ? <Order {...p} /> : id === 'mp3' ? <Road {...p} /> : id === 'me1' ? <Boxes {...p} /> : <Colour {...p} />;
}
const W = { cls: 'subj--prv' }, E = { cls: 'subj--aj' };

/** MP1: věc → krabice (🎒 do školy / 🧸 hračky). Jen jednoznačné věci. */
const SORT_ITEMS: { e: string; name: string; box: 'school' | 'toys'; a: string }[] = [
  { e: '✏️', a: 'snd-pv-w-tuzka', name: 'tužka', box: 'school' }, { e: '📏', a: 'snd-pv-w-pravitko', name: 'pravítko', box: 'school' }, { e: '📕', a: 'snd-pv-w-kniha', name: 'kniha', box: 'school' }, { e: '✂️', a: 'snd-pv-w-nuzky', name: 'nůžky', box: 'school' }, { e: '🖍️', a: 'snd-pv-w-pastelka', name: 'pastelka', box: 'school' },
  { e: '🧸', a: 'snd-pv-w-medvidek', name: 'medvídek', box: 'toys' }, { e: '⚽', a: 'snd-pv-w-mic', name: 'míč', box: 'toys' }, { e: '🪀', a: 'snd-pv-w-jojo', name: 'jojo', box: 'toys' }, { e: '🚂', a: 'snd-pv-w-vlacek', name: 'vláček', box: 'toys' }, { e: '🪁', a: 'snd-pv-w-drak', name: 'drak', box: 'toys' },
];
function Sort({ back, openAlbum }: P) {
  const tasks = useMemo(() => shuffle(SORT_ITEMS).slice(0, ROUND), []);
  const r = useMiniRound(ROUND, 'mp1', 'world');
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  const box = (b: 'school' | 'toys', icon: string, label: string) => (
    <button className={`kbtn xg-box${r.api.calm && t.box === b ? ' is-hint' : ''}`} data-box={b} aria-label={label} onClick={() => (t.box === b ? r.api.ok([t.a, b === 'school' ? 'snd-pv-w-do-skoly' : 'snd-pv-w-hracky'], 3500) : r.api.no())}>{icon}<small>{label}</small></button>
  );
  return (
    <MiniShell title="Uklízíme" subjCls={W.cls} round={r} count={ROUND} nameAudio={['snd-pv-p-game-uklizime']} prompt={['snd-pv-p-sort', t.a]} intro="Kam to patří? Ťukni na správnou krabici." back={back} openAlbum={openAlbum}>
      <div className="xg-col" data-testid="mp1" data-answer-box={undefined}>
        <button className="xg-item" data-testid="mp1-item" data-box={t.box} aria-label={t.name} onClick={() => void say([t.a])}>{t.e}<small>{t.name}</small></button>
        <div className="xg-row">{box('school', '🎒', 'do školy')}{box('toys', '🧸', 'hračky')}</div>
      </div>
    </MiniShell>
  );
}

/** MP2: klepání v pořadí → obrázky do vagonů zleva; klepnutí na vagon vrátí od něj dál. */
const SEQS: string[][] = [['🌱', '🌿', '🌻'], ['🥚', '🐣', '🐔'], ['🌅', '☀️', '🌙'], ['🍂', '⛄', '🌷', '🏖️'], ['🛏️', '🪥', '🎒', '🏫']];
function Order({ back, openAlbum }: P) {
  const tasks = useMemo(() => SEQS.map((s) => ({ s, shown: shuffle(s) })), []);
  const r = useMiniRound(ROUND, 'mp2', 'world');
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  const [train, setTrain] = useState<string[]>([]);
  useEffect(() => setTrain([]), [r.api.i]);
  const add = (e: string) => {
    const next = [...train, e]; setTrain(next);
    if (next.length === t.s.length) { if (next.join() === t.s.join()) r.api.ok(); else { r.api.no(); window.setTimeout(() => setTrain([]), 600); } }
  };
  return (
    <MiniShell title="Co bylo dřív?" subjCls={W.cls} round={r} count={ROUND} nameAudio={['snd-pv-p-game-drive']} prompt={['snd-pv-p-order']} intro="Ťukej na obrázky tak, jak jdou po sobě." back={back} openAlbum={openAlbum}>
      <div className="xg-col" data-testid="mp2" data-order={t.s.join(' ')}>
        <div className="xg-train" data-testid="mp2-train">🚂{t.s.map((_, k) => <button key={k} className="xg-wagon" data-k={k} aria-label="vagon" onClick={() => train[k] && setTrain(train.slice(0, k))}>{train[k] ?? ''}</button>)}</div>
        <div className="xg-row">{t.shown.map((e) => <button key={e} className={`kbtn xg-pic${r.api.calm && e === t.s[train.length] ? ' is-hint' : ''}`} data-pic={e} disabled={train.includes(e)} onClick={() => add(e)}>{e}</button>)}</div>
      </div>
    </MiniShell>
  );
}

/** MP3: ulice s přechodem; ťukni na místo, kde přejdeš (3 kandidáti, jen jeden na zebře). Semafor nepovinný. */
function Road({ back, openAlbum }: P) {
  const tasks = useMemo(() => Array.from({ length: ROUND }, () => { const pos = shuffle([20, 50, 80]); return { zebra: pos[0], spots: [20, 50, 80] }; }), []);
  const r = useMiniRound(ROUND, 'mp3', 'world');
  const t = tasks[Math.min(r.api.i, ROUND - 1)];
  return (
    <MiniShell title="Bezpečná cesta" subjCls={W.cls} round={r} count={ROUND} nameAudio={['snd-pv-p-game-cesta']} prompt={['snd-pv-p-route']} intro="Ťukni na místo, kde přejdeš silnici." back={back} openAlbum={openAlbum}>
      <div className="xg-street" data-testid="mp3" data-zebra={t.zebra}>
        <div className="xg-side">🏠</div>
        <div className="xg-road">
          <div className="xg-zebra" style={{ left: `calc(${t.zebra}% - 40px)` }} />
          <span className="xg-light" style={{ left: `calc(${t.zebra}% + 46px)` }}>🚦</span>
          {t.spots.map((x) => <button key={x} className={`xg-spot${r.api.calm && x === t.zebra ? ' is-hint' : ''}`} data-x={x} style={{ left: `calc(${x}% - 30px)` }} aria-label="tady přejdu"
            onClick={() => (x === t.zebra ? r.api.ok(['snd-pv-p-crossing'], 3500) : r.api.no())}>👣</button>)}
        </div>
        <div className="xg-side">🏫</div>
        {r.api.solved && <p className="notice">Tady přecházíme po přechodu, když svítí zelená.</p>}
      </div>
    </MiniShell>
  );
}

/** ME1: „Find the pencil!“ – 3–4 krabice; klepnutí otevře, špatná se po 1,2 s zavře. */
const VOCAB = [{ w: 'pencil', e: '✏️' }, { w: 'book', e: '📕' }, { w: 'bag', e: '🎒' }, { w: 'crayon', e: '🖍️' }, { w: 'ruler', e: '📏' }, { w: 'scissors', e: '✂️' }];
function Boxes({ back, openAlbum }: P) {
  const tasks = useMemo(() => shuffle(VOCAB).slice(0, ROUND).map((v) => ({ v, boxes: shuffle([v, ...shuffle(VOCAB.filter((x) => x !== v)).slice(0, 3)]) })), []);
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
  const tasks = useMemo(() => Array.from({ length: ROUND }, (_, k) => ({ s: SHAPES[k % SHAPES.length], c: shuffle(COLOURS)[0] })), []);
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

/** Klipy, bez kterých anglická hra nejde hrát poslechem (ME1: Find the + slovo, ME2: Colour the + slovo + barva). */
export function enGameNeeds(id: SubjGameId): string[] {
  if (id === 'me1') return ['snd-en-p-find-x', ...VOCAB.map((v) => `snd-en-w-${v.w}`)];
  if (id === 'me2') return ['snd-en-p-colour-x-y', ...SHAPES.map((s) => `snd-en-w-${s.w}`), ...COLOURS.map((c) => `snd-en-c-${c.id}`)];
  return [];
}
