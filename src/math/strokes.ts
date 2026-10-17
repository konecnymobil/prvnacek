/** Šablony tahů (vlastní kresba, kopie z design/data v0.7.3). Číslice: box 100×140, 7 se škrtem. */
import digitsJson from '../content/strokes/cislice.json';
import classicJson from '../content/strokes/pismo-klasicke.json';
import unjoinedJson from '../content/strokes/pismo-nespojene.json';

export type ScriptStyle = 'classic' | 'unjoined';
export const SCRIPT_STYLE_KEY = 'scriptStyle';
export const SCRIPT_STYLE_LABEL: Record<ScriptStyle, string> = { classic: 'Klasické', unjoined: 'Nespojované (vlastní šablony)' };

export interface StrokeTemplate { box: [number, number]; corridor: number; fingerFactor: number; minCoverage: number; strokes: string[] }

export function digitTemplate(d: number): StrokeTemplate {
  const j = digitsJson as unknown as { box: [number, number]; corridor: number; fingerFactor: number; minCoverage: number; digits: Record<string, { strokes: { d: string }[] }> };
  return { box: j.box, corridor: j.corridor, fingerFactor: j.fingerFactor, minCoverage: j.minCoverage, strokes: j.digits[String(d)].strokes.map((s) => s.d) };
}

interface LetterSet { box: [number, number]; corridor: number; fingerFactor: number; minCoverage: number; lower: Record<string, string[]>; upper: Record<string, string[]> }
export function letterTemplate(ch: string, style: ScriptStyle): StrokeTemplate | null {
  const j = (style === 'classic' ? classicJson : unjoinedJson) as unknown as LetterSet;
  const strokes = j.lower[ch] ?? j.upper[ch];
  return strokes ? { box: j.box, corridor: j.corridor, fingerFactor: j.fingerFactor, minCoverage: j.minCoverage, strokes } : null;
}
