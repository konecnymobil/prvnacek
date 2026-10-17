/** u) Plocha pro psaní perem: Pointer Events, ochrana před dlaní, prst jako náhrada (koridor ×1,6).
 *  Tahy zůstávají jen v paměti komponenty (penStrokes se neukládají). */
import { useEffect, useRef, useState } from 'react';
import type { StrokeTemplate } from '../math/strokes';
import { squeakOff, squeakOn } from '../audio/squeak';

type Kind = 'pen' | 'touch' | 'mouse';
interface Stroke { kind: Kind; pts: [number, number][]; width: number }
export interface TraceResult { ok: boolean; coverage: number; direction: boolean; usedFinger: boolean; outside: number }

const PALM_MS = 1500;

const SAMPLES = 60;
const MAX_OUTSIDE = 0.15;
const MIN_STROKE_PROGRESS = 0.85;

type Pt = [number, number];
/** Body šablony: pro každý tah SAMPLES+1 bodů po délce cesty (z vykreslených <path class="tpl-center">). */
export function sampleTemplate(svg: SVGSVGElement): Pt[][] {
  return Array.from(svg.querySelectorAll<SVGPathElement>('path.tpl-center')).map((p) => {
    const len = p.getTotalLength();
    return Array.from({ length: SAMPLES + 1 }, (_, k) => { const q = p.getPointAtLength((len * k) / SAMPLES); return [q.x, q.y] as Pt; });
  });
}
const tolOf = (t: StrokeTemplate, finger: boolean) => (t.corridor / 2) * (finger ? t.fingerFactor : 1);
export const distToTemplate = (samples: Pt[][], [x, y]: Pt) => Math.min(...samples.flat().map(([a, b]) => Math.hypot(x - a, y - b)));

/** Jak daleko tah došel po šabloně: kurzor se posouvá jen dopředu po bodech v koridoru (okno −3…+8),
 *  takže tah opačným směrem, od prostředka nebo jen kousek nedojde daleko. Vrací 0–1. */
export function strokeProgress(tpl: Pt[], pts: Pt[], tol: number): number {
  let c = -1;
  for (const [x, y] of pts) {
    let best = -1, bd = Infinity;
    for (let k = Math.max(0, c - 3); k <= Math.min(SAMPLES, c + 8); k++) {
      const d = Math.hypot(x - tpl[k][0], y - tpl[k][1]);
      if (d <= tol && d < bd) { bd = d; best = k; }
    }
    if (best > c) c = best;
  }
  return c < 0 ? 0 : c / SAMPLES;
}

/** Vyhodnocení podle 3a: stejný počet tahů, každý ve správném pořadí a směru a pokrytý z ≥ 85 %,
 *  nejvýš 15 % bodů mimo koridor. Myš se posuzuje jako pero, širší koridor má jen prst. */
export function evaluate(svg: SVGSVGElement, t: StrokeTemplate, strokes: Stroke[]): TraceResult {
  const real = strokes.filter((s) => s.pts.length >= 2);
  const usedFinger = real.some((s) => s.kind === 'touch');
  const tol = tolOf(t, usedFinger);
  const samples = sampleTemplate(svg);
  const progress = samples.map((tpl, i) => (real[i] ? strokeProgress(tpl, real[i].pts, tol) : 0));
  const pts = real.flatMap((s) => s.pts);
  const outside = pts.length ? pts.filter((p) => distToTemplate(samples, p) > tol).length / pts.length : 1;
  const coverage = progress.length ? Math.min(...progress) : 0;
  const direction = progress.every((p) => p >= MIN_STROKE_PROGRESS);
  const ok = real.length === samples.length && direction && outside <= MAX_OUTSIDE;
  return { ok, coverage, direction, usedFinger, outside };
}

export default function PenSurface({ template, onDone, showMe }: { template: StrokeTemplate; onDone?: (r: TraceResult) => void; showMe?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const active = useRef<number | null>(null);
  const penDown = useRef(false);
  const lastPenUp = useRef(-Infinity);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [kind, setKind] = useState<Kind | null>(null);
  const [demo, setDemo] = useState(0);
  const [out, setOut] = useState(false);
  const samplesRef = useRef<Pt[][] | null>(null);
  useEffect(() => () => squeakOff(), []);
  useEffect(() => { samplesRef.current = null; }, [template]);
  const [w, h] = template.box;

  const toLocal = (e: { clientX: number; clientY: number }): [number, number] => {
    const svg = svgRef.current!; const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
  };
  const isPalm = (e: React.PointerEvent) => e.pointerType === 'touch' && (penDown.current || performance.now() - lastPenUp.current < PALM_MS || e.width >= 60);

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (isPalm(e) || active.current !== null) { if (e.pointerType === 'touch') setIgnored((n) => n + 1); return; }
    const k = (e.pointerType === 'pen' ? 'pen' : e.pointerType === 'mouse' ? 'mouse' : 'touch') as Kind;
    if (k === 'pen') penDown.current = true;
    active.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* syntetické události */ }
    setKind(k);
    const width = k === 'pen' ? 8 + 10 * (e.pressure || 0.5) : k === 'mouse' ? 14 : 26;
    setStrokes((s) => [...s, { kind: k, pts: [toLocal(e)], width }]);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerId !== active.current) return;
    e.preventDefault();
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const pts = (evs.length ? evs : [e]).map(toLocal);
    const svg = svgRef.current;
    if (svg) {
      samplesRef.current ??= sampleTemplate(svg);
      const isOut = distToTemplate(samplesRef.current, pts[pts.length - 1]) > tolOf(template, e.pointerType === 'touch');
      if (isOut) squeakOn(); else squeakOff();
      setOut(isOut);
    }
    setStrokes((s) => { const last = s[s.length - 1]; return [...s.slice(0, -1), { ...last, pts: [...last.pts, ...pts] }]; });
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'pen') { penDown.current = false; lastPenUp.current = performance.now(); }
    if (e.pointerId !== active.current) return;
    active.current = null;
    squeakOff(); setOut(false);
  };

  return (
    <div className="pen-wrap">
      <svg
        ref={svgRef} className="pen-surface" data-testid="pen-surface" viewBox={`0 0 ${w} ${h}`}
        data-strokes={strokes.length} data-ignored={ignored} data-input={kind ?? ''} data-out={out ? 'true' : 'false'}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onTouchStart={(e) => e.preventDefault()}
      >
        {template.strokes.map((d, i) => <path key={`c${i}`} d={d} className="tpl-corridor" style={{ strokeWidth: template.corridor }} />)}
        {template.strokes.map((d, i) => <path key={`l${i}`} d={d} className="tpl-center" />)}
        {template.strokes.map((d, i) => {
          const m = /M\s*([\d.]+)[ ,]([\d.]+)/.exec(d);
          return m ? <g key={`s${i}`}><circle cx={m[1]} cy={m[2]} r={6} className="tpl-start" /><text x={m[1]} y={Number(m[2]) + 3} className="tpl-num">{i + 1}</text></g> : null;
        })}
        {(showMe || demo > 0) && template.strokes.map((d, i) => <path key={`d${demo}-${i}`} d={d} className="tpl-demo" pathLength={1} style={{ animationDelay: `${i * 1.2}s` }} />)}
        {strokes.map((s, i) => <polyline key={i} points={s.pts.map((p) => p.join(',')).join(' ')} className={`ink ink-${s.kind}`} style={{ strokeWidth: s.width }} />)}
      </svg>
      {kind && <span className="small muted pen-kind" data-testid="pen-kind">{kind === 'pen' ? '✏️ pero' : '☝️ prst'}</span>}
      <div className="pen-actions">
        <button className="kbtn" aria-label="Smazat" data-testid="pen-clear" onClick={() => setStrokes([])}>🗑</button>
        <button className="kbtn" data-testid="pen-show" onClick={() => setDemo((n) => n + 1)}>✋ Ukaž mi</button>
        <button className="kbtn kbtn-primary kbtn-xl" data-testid="pen-done" onClick={() => { if (svgRef.current) onDone?.(evaluate(svgRef.current, template, strokes)); }}>✓ Hotovo</button>
      </div>
    </div>
  );
}
