// Generuje docs/nakladani-s-daty.md a hlídá zvýšení verze (src/policy/policy-lock.json).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY = join(root, 'src/policy/data-policy.json');
export const LOCK = join(root, 'src/policy/policy-lock.json');
export const MD = join(root, 'docs/nakladani-s-daty.md');

export function policyHash(p) {
  const { policyVersion: _v, effectiveDate: _d, ...rest } = p;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

export function renderMarkdown(p) {
  const l = [`# ${p.title}`, '', `Verze ${p.policyVersion}, platná od ${p.effectiveDate}.`, '', '<!-- Generováno z src/policy/data-policy.json příkazem `npm run gen:policy`. Neupravovat ručně. -->', '', p.intro, '', `## ${p.today.heading}`, ''];
  for (const i of p.today.items) l.push(`- ${i}`);
  l.push('', '## Pravidla', '');
  p.rules.forEach((r, n) => l.push(`${n + 1}. **${r.title}.** ${r.text}`));
  l.push('', '## Poznámka u zálohy', '', p.backupNote, '', p.changes, '');
  return l.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = JSON.parse(readFileSync(POLICY, 'utf8'));
  const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {};
  const h = policyHash(p);
  if (lock[p.policyVersion] && lock[p.policyVersion] !== h) {
    console.error(`Pravidla se změnila, ale policyVersion ${p.policyVersion} ne. Zvyš policyVersion a effectiveDate.`);
    process.exit(1);
  }
  lock[p.policyVersion] = h;
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
  writeFileSync(MD, renderMarkdown(p));
  console.log('OK', MD);
}
