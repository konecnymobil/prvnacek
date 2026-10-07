// Generuje ../tokens.css z ../tokens.json a dopočítá kontrasty (WCAG 2.2).
// Spuštění: node tools/build-tokens.mjs   (z adresáře design/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const t = JSON.parse(fs.readFileSync(path.join(dir, 'tokens.json'), 'utf8'));

const lum = hex => { const n = hex.replace('#', ''); const c = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
  .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

let fail = 0;
t.contrastChecks = t.contrastPairs.map(([fg, bg, kind]) => {
  const r = Math.round(ratio(t.color[fg].value, t.color[bg].value) * 100) / 100;
  const need = kind === 'ui' ? 3 : 4.5;
  const pass = r >= need; if (!pass) fail++;
  return { fg, bg, kind, ratio: r, required: need, wcagAA: pass ? 'PASS' : 'FAIL', AAA: kind === 'text' ? (r >= 7 ? 'PASS' : '–') : '–' };
});
fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify(t, null, 2) + '\n');

const groups = { color: 'c', font: 'font', fontSize: 'fs', lineHeight: 'lh', letterSpacing: 'ls', space: 'sp', radius: 'r', shadow: 'sh', touch: 'touch', motion: 'm' };
let css = `/* Prvňáček – design tokens. VYGENEROVÁNO z tokens.json (tools/build-tokens.mjs). Neupravovat ručně. */\n\n`;
const faces = [['Regular', 400], ['SemiBold', 600], ['Bold', 700]];   // 3 řezy (rozhodnutí PM)
for (const [n, w] of faces) css += `@font-face { font-family: 'Andika'; src: url('fonts/Andika-${n}.woff2') format('woff2'); font-weight: ${w}; font-style: normal; font-display: swap; }\n`;
css += `\n:root {\n`;
for (const [g, p] of Object.entries(groups)) {
  css += `  /* ${g} */\n`;
  for (const [k, v] of Object.entries(t[g])) css += `  --${p}-${k}: ${v.value};${v.desc ? ` /* ${v.desc} */` : ''}\n`;
}
css += `}\n\n/* Globálně: Andika cv30 – velké I jako prostá čára */\nhtml { font-feature-settings: var(--font-feature-settings); }\n\n@media (prefers-reduced-motion: reduce) {\n  :root { --m-fast: 0ms; --m-base: 0ms; --m-slow: 0ms; --m-celebrate: 0ms; }\n}\n`;
fs.writeFileSync(path.join(dir, 'tokens.css'), css);
console.table(t.contrastChecks.map(c => ({ pair: `${c.fg} / ${c.bg}`, kind: c.kind, ratio: c.ratio, AA: c.wcagAA })));
if (fail) { console.error(`FAIL: ${fail} párů nesplňuje WCAG AA`); process.exit(1); }
