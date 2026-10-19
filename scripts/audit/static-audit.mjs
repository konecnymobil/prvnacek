#!/usr/bin/env node
/**
 * Statický audit (seznam, ne test): chybějící zvuky a obrázky, pravopis UI a obsahu (hunspell cs_CZ).
 * Spuštění: node scripts/audit/static-audit.mjs  → audit-out/static.md
 * Pravopis potřebuje `hunspell` a `hunspell-cs` (apt). Bez nich se jen přeskočí.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const out = path.join(root, 'audit-out');
fs.mkdirSync(out, { recursive: true });
const walk = (d, re) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), re) : re.test(e.name) ? [path.join(d, e.name)] : []));
const rel = (f) => path.relative(root, f);

// ---------- zvuky ----------
const index = JSON.parse(fs.readFileSync('public/audio/tts/index.json', 'utf8'));
const indexed = new Set(index.sounds.map((s) => s.audioId));
const files = new Set(fs.readdirSync('public/audio/tts').filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)));
const refs = new Map(); // audioId -> Set(zdroj)
const addRef = (id, src) => { if (!refs.has(id)) refs.set(id, new Set()); refs.get(id).add(src); };
const contentFiles = walk('public/content', /\.json$/);
for (const f of contentFiles) {
  if (f.includes('audio-script')) continue; // scénáře klipů = co se teprve nahraje
  const visit = (v, k) => {
    if (typeof v === 'string' && (k === 'audioId' || /^snd-[a-z0-9-]+$/.test(v))) addRef(v, rel(f));
    else if (Array.isArray(v)) v.forEach((x) => visit(x, k));
    else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) visit(vv, kk);
  };
  visit(JSON.parse(fs.readFileSync(f, 'utf8')));
}
const srcFiles = walk('src', /\.(ts|tsx)$/);
for (const f of srcFiles) for (const m of fs.readFileSync(f, 'utf8').matchAll(/(data-testid=|testid:\s*)?['"`](snd-[a-z0-9-]+)['"`]/g)) if (!m[1]) addRef(m[2], rel(f));
const missing = [...refs].filter(([id]) => !files.has(id)).map(([id, s]) => ({ id, inIndex: indexed.has(id), src: [...s].join(', ') }));
const notIndexed = [...files].filter((id) => !indexed.has(id));

// ---------- obrázky ----------
const imgDir = 'src/assets/img';
const imgs = new Set(fs.readdirSync(imgDir).map((f) => f.replace(/\.svg$/, '')));
const imageMap = Object.fromEntries([...fs.readFileSync('src/content/images.ts', 'utf8').matchAll(/'(img-[a-z0-9-]+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
const words = JSON.parse(fs.readFileSync('public/content/words.json', 'utf8'));
const wordList = words.words ?? words.items ?? [];
const missingImg = wordList.filter((w) => w.imageId && !imgs.has(imageMap[w.imageId] ?? '')).map((w) => `${w.id} → ${w.imageId}${imageMap[w.imageId] ? ` (soubor ${imageMap[w.imageId]}.svg chybí)` : ' (není v images.ts)'}`);
const noImage = wordList.filter((w) => !w.imageId).length;

// ---------- pravopis ----------
const texts = []; // {text, src}
const CZ = /[a-záčďéěíňóřšťúůýž]{3,}/i;
for (const f of srcFiles) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/>([^<>{}\n]*[A-Za-zÁ-ž][^<>{}\n]*)</g)) texts.push({ text: m[1], src: rel(f) });
  for (const m of s.matchAll(/'([^'\n]*\s[^'\n]*)'|"([^"\n]*\s[^"\n]*)"|`([^`\n$]*\s[^`\n$]*)`/g)) {
    const t = m[1] ?? m[2] ?? m[3];
    if (/[áčďéěíňóřšťúůýž]/i.test(t) || /\b(je|se|na|do|to)\b/.test(t)) texts.push({ text: t, src: rel(f) });
  }
}
for (const f of contentFiles) {
  const visit = (v, k) => {
    if (typeof v === 'string' && ['text', 'title', 'intro', 'heading', 'name', 'label', 'hint', 'description'].includes(k) && CZ.test(v)) texts.push({ text: v, src: rel(f) });
    else if (Array.isArray(v)) v.forEach((x) => visit(x, k));
    else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) visit(vv, kk);
  };
  visit(JSON.parse(fs.readFileSync(f, 'utf8')));
}
let spell = null;
try {
  const words = new Map();
  for (const t of texts) {
    if (t.src.includes('audio-script') ? false : !/[áčďéěíňóřšťúůýž]|\s(a|je|se|na|do|v|to|si|už)\s/i.test(` ${t.text} `)) continue; // jen české věty, ne kód
    for (const w of t.text.match(/[A-Za-zÁ-žĚŠČŘŽÝÁÍÉŮÚŇŤĎ]{3,}/g) ?? []) { if (/[a-z][A-Z]/.test(w)) continue; if (!words.has(w)) words.set(w, new Set()); words.get(w).add(t.src); }
  }
  const input = [...words.keys()].join('\n');
  let bad = execFileSync('hunspell', ['-d', 'cs_CZ', '-l'], { input, encoding: 'utf8' }).split('\n').filter(Boolean);
  try { const en = new Set(execFileSync('hunspell', ['-d', 'en_US', '-G'], { input: bad.join('\n'), encoding: 'utf8' }).split('\n')); bad = bad.filter((w) => !en.has(w)); } catch { /* bez en_US */ }
  spell = [...new Set(bad)].sort((a, b) => a.localeCompare(b, 'cs')).map((w) => ({ w, src: [...words.get(w)].slice(0, 3).join(', ') }));
} catch (e) { spell = null; }

const md = [
  '# Statický audit', '', `Obsah ${index.contentVersion}, zvuků v index.json: ${indexed.size}, souborů mp3: ${files.size}.`, '',
  `## Zvuky, na které aplikace odkazuje, ale soubor chybí (${missing.length})`, '', '| audioId | v index.json | kde |', '|---|---|---|',
  ...missing.map((m) => `| ${m.id} | ${m.inIndex ? 'ano' : 'ne'} | ${m.src} |`), '',
  `## Soubory mp3 mimo index.json (${notIndexed.length})`, '', ...notIndexed.map((x) => `- ${x}`), '',
  `## Slova s imageId bez obrázku (${missingImg.length}); slov bez imageId: ${noImage}`, '', ...missingImg.map((x) => `- ${x}`), '',
  spell ? `## Pravopis – slova, která hunspell cs_CZ nezná (${spell.length}), projít ručně` : '## Pravopis přeskočen (chybí hunspell cs_CZ)', '',
  ...(spell ?? []).map((s) => `- ${s.w} — ${s.src}`), '',
].join('\n');
fs.writeFileSync(path.join(out, 'static.md'), md);
console.log(`audit-out/static.md: ${missing.length} chybějících zvuků, ${missingImg.length} obrázků, ${spell ? spell.length : '–'} slov k pravopisu`);
