/**
 * Načtení obsahu z public/content/*.json (kopie z content/ od Slabikářky) a minimální validace.
 * Plná validace (JSON Schema, odkazy, IPA…) běží u zdroje: tools/content/validate_content.py.
 */
import {
  SCHEMA_VERSION,
  type Letter,
  type Lesson,
  type LettersFile,
  type ManifestFile,
  type OrderFile,
  type OrderId,
  type Prompt,
  type PromptsFile,
  type Syllable,
  type SyllablesFile,
  type TestRulesFile,
  type Word,
  type WordsFile,
} from './types';

export interface Content {
  version: string;
  defaultOrderId: OrderId;
  orders: Record<OrderId, OrderFile>;
  letters: Letter[];
  pictureWords: LettersFile['pictureWords'];
  syllables: Syllable[];
  /** Jen otevřené CV slabiky (usableInSyllableTasks) – jediné povolené ve slabikových úlohách. */
  taskSyllables: Syllable[];
  words: Word[];
  prompts: Prompt[];
  testRules: TestRulesFile;
  letterById: Map<string, Letter>;
  syllableById: Map<string, Syllable>;
  wordById: Map<string, Word>;
  promptById: Map<string, Prompt>;
  /** Všechna audioId použitá v obsahu. */
  audioIds: Set<string>;
}

export class ContentError extends Error {}

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function fetchJson<T>(file: string, kind: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}content/${file}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ContentError(`Obsah ${file} se nepodařilo stáhnout.`);
  }
  if (!res.ok) throw new ContentError(`Obsah ${file}: HTTP ${res.status}.`);
  const data = (await res.json()) as { schemaVersion?: unknown; kind?: unknown };
  if (data.schemaVersion !== SCHEMA_VERSION) throw new ContentError(`${file}: nepodporovaná verze schématu ${String(data.schemaVersion)}.`);
  if (data.kind !== kind) throw new ContentError(`${file}: čekal jsem kind „${kind}“, je „${String(data.kind)}“.`);
  return data as T;
}

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ContentError(msg);
}

function indexById<T extends { id: string }>(items: T[], what: string, all: Set<string>): Map<string, T> {
  check(Array.isArray(items) && items.length > 0, `${what}: prázdný nebo chybějící seznam.`);
  const map = new Map<string, T>();
  for (const it of items) {
    check(typeof it.id === 'string' && ID_RE.test(it.id), `${what}: neplatné id „${String(it.id)}“.`);
    check(!all.has(it.id), `${what}: duplicitní id „${it.id}“.`);
    all.add(it.id);
    map.set(it.id, it);
  }
  return map;
}

export async function loadContent(): Promise<Content> {
  const manifest = await fetchJson<ManifestFile>('manifest.json', 'manifest');
  const [duha, agata, lettersFile, syllablesFile, wordsFile, promptsFile, testRules] = await Promise.all([
    fetchJson<OrderFile>('order.duha.json', 'order'),
    fetchJson<OrderFile>('order.agata.json', 'order'),
    fetchJson<LettersFile>('letters.json', 'letters'),
    fetchJson<SyllablesFile>('syllables.json', 'syllables'),
    fetchJson<WordsFile>('words.json', 'words'),
    fetchJson<PromptsFile>('prompts.json', 'prompts'),
    fetchJson<TestRulesFile>('test-rules.json', 'testRules'),
  ]);

  const allIds = new Set<string>();
  const letterById = indexById(lettersFile.letters, 'letters', allIds);
  indexById(lettersFile.pictureWords, 'pictureWords', allIds);
  const syllableById = indexById(syllablesFile.syllables, 'syllables', allIds);
  const wordById = indexById(wordsFile.words, 'words', allIds);
  const promptById = indexById(promptsFile.prompts, 'prompts', allIds);

  const orders = { duha, agata } as Record<OrderId, OrderFile>;
  for (const o of Object.values(orders)) {
    check(o.lessons.length > 0, `Pořadí ${o.id}: žádné lekce.`);
    o.lessons.forEach((l: Lesson, i) => {
      check(l.index === i + 1, `Pořadí ${o.id}: lekce ${l.id} má index ${l.index}, čekal jsem ${i + 1}.`);
      for (const id of l.letterIds) check(letterById.has(id), `Pořadí ${o.id}: neznámé písmeno ${id}.`);
    });
  }
  check(manifest.defaultOrderId in orders, `Neznámé výchozí pořadí ${manifest.defaultOrderId}.`);

  for (const s of syllablesFile.syllables) {
    check(typeof s.usableInSyllableTasks === 'boolean', `Slabika ${s.id}: chybí usableInSyllableTasks.`);
    for (const id of s.letterIds) check(letterById.has(id), `Slabika ${s.id}: neznámé písmeno ${id}.`);
  }
  for (const w of wordsFile.words) {
    for (const id of w.syllableIds) check(syllableById.has(id), `Slovo ${w.id}: neznámá slabika ${id}.`);
  }

  const audioIds = new Set<string>();
  for (const x of [...lettersFile.letters, ...lettersFile.pictureWords, ...syllablesFile.syllables, ...wordsFile.words, ...promptsFile.prompts]) {
    check(typeof x.audioId === 'string' && x.audioId.startsWith('snd-'), `Položka ${x.id}: neplatné audioId.`);
    audioIds.add(x.audioId);
  }

  return {
    version: manifest.contentVersion,
    defaultOrderId: manifest.defaultOrderId,
    orders,
    letters: lettersFile.letters,
    pictureWords: lettersFile.pictureWords,
    syllables: syllablesFile.syllables,
    taskSyllables: syllablesFile.syllables.filter((s) => s.usableInSyllableTasks),
    words: wordsFile.words,
    prompts: promptsFile.prompts,
    testRules,
    letterById,
    syllableById,
    wordById,
    promptById,
    audioIds,
  };
}
