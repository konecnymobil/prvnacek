import type { Content } from '../content/load';
import type { TestBlueprint, TestItem, TestItemType } from '../content/types';
import { shuffle } from '../activities/common';

const keyOf = (i: Pick<TestItem, 'type' | 'text'>) => (i.type === 'letterRow' || i.type === 'letterFind' ? 'row:' : '') + i.text;

function makeRow(len: number, newPool: string[], others: string[], tries = 50): string | null {
  const pool = others.length ? others : newPool;
  for (let t = 0; t < tries; t++) {
    const newCount = Math.min(len, Math.random() < 0.5 ? 1 : 2);
    const cells: string[] = shuffle([...Array(newCount).fill(0).map((_, i) => newPool[i % newPool.length]), ...Array(len - newCount).fill(0).map(() => pool[Math.floor(Math.random() * pool.length)])]);
    if (cells.some((c, i) => i > 0 && c === cells[i - 1]) && pool.length > 1) continue;
    return cells.join(' ');
  }
  return null;
}

/** Sestaví zkoušku podle test-rules.json (blueprint lekce): nic se neopakuje, začíná řádkem, typy se střídají. */
export function buildTest(content: Content, bp: TestBlueprint): TestItem[] {
  const up = (id: string) => content.letterById.get(id)!.upper;
  const used = new Set<string>();
  const add = (list: TestItem[], item: TestItem) => {
    const k = keyOf(item);
    if (used.has(k)) return false;
    used.add(k);
    list.push(item);
    return true;
  };
  const items: TestItem[] = [];
  const rows = (type: 'letterRow' | 'letterFind', n: number) => {
    const newPool = bp.pools.newLetterIds.map(up);
    const others = type === 'letterFind' ? bp.pools.shapeDistractors : bp.pools.rowLetterIds.filter((id) => !bp.pools.newLetterIds.includes(id)).map(up);
    for (let i = 0, guard = 0; i < n && guard < 200; guard++) {
      const text = makeRow(bp.rowLength, newPool, others);
      if (text && add(items, { type, reviewKind: null, refId: null, text, containsNewLetter: true })) i++;
    }
  };
  rows('letterFind', bp.slots.letterFind);
  rows('letterRow', bp.slots.letterRow);
  for (const id of shuffle(bp.pools.syllableIds).slice(0, bp.slots.syllable)) {
    add(items, { type: 'syllable', reviewKind: null, refId: id, text: content.syllableById.get(id)!.text, containsNewLetter: true });
  }
  for (const id of shuffle(bp.pools.wordIds).slice(0, bp.slots.word)) {
    add(items, { type: 'word', reviewKind: null, refId: id, text: content.wordById.get(id)!.text, containsNewLetter: true });
  }
  const rv = (kind: 'word' | 'syllable' | 'letter', ids: string[], n: number) => {
    for (const id of shuffle(ids).slice(0, n)) {
      const text = kind === 'word' ? content.wordById.get(id)!.text : kind === 'syllable' ? content.syllableById.get(id)!.text : up(id);
      add(items, { type: 'review', reviewKind: kind, refId: id, text, containsNewLetter: false });
    }
  };
  rv('word', bp.pools.reviewWordIds, bp.reviewSlots.word);
  rv('syllable', bp.pools.reviewSyllableIds, bp.reviewSlots.syllable);
  rv('letter', bp.pools.reviewLetterIds, bp.reviewSlots.letter);

  // pořadí: zamíchat, začít řádkem, nedávat stejné typy za sebou, kdyby to šlo
  const rest = shuffle(items);
  const firstIdx = rest.findIndex((i) => i.type === 'letterRow' || i.type === 'letterFind');
  const out: TestItem[] = firstIdx >= 0 ? [rest.splice(firstIdx, 1)[0]] : [];
  const sameType = (a?: TestItem, b?: TestItem) => !!a && !!b && (a.type as TestItemType) === b.type;
  while (rest.length) {
    const j = rest.findIndex((i) => !sameType(out[out.length - 1], i));
    out.push(rest.splice(j >= 0 ? j : 0, 1)[0]);
  }
  return out;
}
