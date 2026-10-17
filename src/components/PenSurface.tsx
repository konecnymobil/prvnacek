/** u) Plocha pro psaní perem: Pointer Events, ochrana před dlaní, prst jako náhrada (koridor ×1,6).
 *  Tahy zůstávají jen v paměti komponenty (penStrokes se neukládají). */
import { useRef, useState } from 'react';
import type { StrokeTemplate } from '../math/strokes';

type Kind = 'pen' | 'touch' | 'mouse';
interface Stroke { kind: Kind; pts: [number, number][]; width: number }
export interface TraceResult { ok: boolean; coverage: number; direction: boolean; usedFinger: boolean }

const PALM_MS = 1500;

/** Vyhodnocení podle 3a: pokrytí šablony v koridoru a směr (start každého tahu blíž začátku šablony než konci). */
export function evaluate(svg: SVGSVGElement, t: StrokeTemplate, strokes: Stroke[]): TraceResult {
  const usedFinger = strokes.some((s) => s.kind !== 'pen');
  const tol = (t.corridor / 2) * (usedFinger ? t.fingerFactor : 1);
  const pts = strokes.flatMap((s) => s.pts);
  const paths = Array.from(svg.querySelectorAll<SVGPathElement>('path.tpl-center'));
  let hit = 0, all = 0, direction = true;
  paths.forEach((p, i) => {
    const len = p.getTotalLength();
    for (let k = 0; k <= 40; k++) {
      const q = p.getPointAtLength((len * k) / 40); all++;
      if (pts.some(([x, y]) => Math.hypot(x - q.x, y - q.y) <= tol)) hit++;
    }
    const s = strokes[i]; const a = p.getPointAtLength(0), b = p.getPointAtLength(len);
    if (s && Math.hypot(a.x - b.x, a.y - b.y) > tol) {
      const [x, y] = s.pts[0];
      if (Math.hypot(x - a.x, y - a.y) > Math.hypot(x - b.x, y - b.y)) direction = false;
    }
  });
  const coverage = all ? hit / all : 0;
  return { ok: strokes.length > 0 && coverage >= t.minCoverage && direction, coverage, direction, usedFinger };
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
    const width = k === 'pen' ? 8 + 10 * (e.pressure || 0.5) : 26;
    setStrokes((s) => [...s, { kind: k, pts: [toLocal(e)], width }]);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerId !== active.current) return;
    e.preventDefault();
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const pts = (evs.length ? evs : [e]).map(toLocal);
    setStrokes((s) => { const last = s[s.length - 1]; return [...s.slice(0, -1), { ...last, pts: [...last.pts, ...pts] }]; });
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'pen') { penDown.current = false; lastPenUp.current = performance.now(); }
    if (e.pointerId !== active.current) return;
    active.current = null;
  };

  return (
    <div className="pen-wrap">
      <svg
        ref={svgRef} className="pen-surface" data-testid="pen-surface" viewBox={`0 0 ${w} ${h}`}
        data-strokes={strokes.length} data-ignored={ignored} data-input={kind ?? ''}
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
