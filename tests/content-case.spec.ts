import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { expectedCase, normalizeFormsCase } from '../src/content/formCase';

const load = (f: string, k: string) => JSON.parse(fs.readFileSync(`public/content/${f}.json`, 'utf8'))[k] as { id: string; forms: Record<string, string> }[];

test('obsah: každý tvar má správnou velikost písmen (velké jen na začátku, nebo celé velké)', () => {
  const bad: string[] = [];
  for (const [f, k] of [['letters', 'letters'], ['syllables', 'syllables'], ['words', 'words']]) {
    for (const it of load(f, k)) for (const [key, v] of Object.entries(it.forms)) {
      const okShape = v === v.toLocaleUpperCase('cs') || v.slice(1) === v.slice(1).toLocaleLowerCase('cs');
      if (!okShape || expectedCase(key as never, v) !== v) bad.push(`${f}:${it.id}.${key}=${v}`);
    }
  }
  expect(bad, 'chybné tvary v obsahu (nahlásit Slabikářce)').toEqual([]);
});

test('pojistka aplikace opraví „MeLe“ a nahlásí to', () => {
  const items = [{ id: 'w-x', forms: { upperPrint: 'MeLE', lowerPrint: 'meLe', cursive: 'MeLe', cursiveUpper: 'MeLe' } }];
  const fixes = normalizeFormsCase(items as never);
  expect(items[0].forms).toEqual({ upperPrint: 'MELE', lowerPrint: 'mele', cursive: 'mele', cursiveUpper: 'Mele' });
  expect(fixes).toHaveLength(4);
});
