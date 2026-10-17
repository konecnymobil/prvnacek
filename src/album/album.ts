/** M4 Album nálepek (HANDOFF 8 / M4-album-poznamky.md). Uloženo v IndexedDB (settings „album:owned“), součást zálohy. */
import { getSetting, setSetting } from '../storage/db';

export type Letter = 'M' | 'A' | 'L' | 'E' | 'S' | 'O' | 'P' | 'U' | 'I';
export type StickerId = `t:${string}` | `v:${string}` | `L:${string}` | `e:${string}`; // e: = emoji (předměty, zatím Twemoji/emoji)
export type StickerSource = 'cviceni' | 'snaha' | 'lekce' | 'pexeso' | 'opakovani' | 'matematika' | 'hra';
export type SubjectId = 'cz-reading' | 'math' | 'world' | 'english';
export const SUBJECT_TABS: { id: SubjectId; name: string; icon: string }[] = [{ id: 'cz-reading', name: 'Čtení', icon: '📖' }, { id: 'math', name: 'Matematika', icon: '🔢' }, { id: 'world', name: 'Prvouka', icon: '🌳' }, { id: 'english', name: 'Angličtina', icon: '🐶' }];
export interface StickerDef { id: StickerId; word: string; special?: boolean }
export interface StickerSet { id: string; name: string; icon: StickerId; special?: boolean; items: StickerDef[]; subject?: SubjectId }
export const setSubject = (s: StickerSet): SubjectId => s.subject ?? 'cz-reading';
export interface OwnedSticker { childId: string; stickerId: StickerId; source: StickerSource; earnedAt: string; refId?: string; seen: boolean; subjectId?: SubjectId }

export const ALBUM_KEY = 'album:owned';
export const CHILD_ID = 'default'; // profily přijdou v M5
export const LETTERS: Letter[] = ['M', 'A', 'L', 'E', 'S', 'O', 'P', 'U', 'I'];
const d = (items: [string, string][]): StickerDef[] => items.map(([id, word]) => ({ id: id as StickerId, word }));
export const SETS: StickerSet[] = [
  { id: 'pismena', name: 'Písmenka', icon: 'L:M', special: true, items: LETTERS.map((L) => ({ id: `L:${L}` as StickerId, word: L, special: true })) },
  { id: 'zviratka', name: 'Zvířátka', icon: 't:1f98b', items: d([['t:1f41e', 'beruška'], ['t:1f98b', 'motýl'], ['t:1f422', 'želva'], ['t:1f41d', 'včelka'], ['t:1f427', 'tučňák'], ['t:1f999', 'lama'], ['v:sele', 'selátko'], ['v:pes', 'pes'], ['v:los', 'los'], ['v:losos', 'losos'], ['v:puma', 'puma'], ['v:mula', 'mula']]) },
  { id: 'priroda', name: 'Příroda', icon: 't:1f33b', items: d([['t:1f33b', 'slunečnice'], ['t:1f308', 'duha'], ['t:2b50', 'hvězda'], ['v:lilie', 'lilie'], ['v:les', 'les'], ['v:pole', 'pole']]) },
  { id: 'dobroty', name: 'Dobroty', icon: 't:1f34e', items: d([['t:1f34e', 'jablko'], ['t:1f353', 'jahoda'], ['v:salam', 'salám'], ['t:1f963', 'mísa']]) },
  { id: 'cisla', name: 'Čísla', icon: 'e:🎲', subject: 'math', items: d([['e:🎲', 'kostka'], ['e:🧮', 'počítadlo'], ['e:🐸', 'žabka'], ['e:🦔', 'ježek'], ['e:📏', 'pravítko'], ['e:🔢', 'čísla']]) },
  { id: 'svet', name: 'Můj svět', icon: 'e:🍂', subject: 'world', items: d([['e:🍂', 'listí'], ['e:🌳', 'strom'], ['e:🍄', 'houba'], ['e:🎒', 'taška'], ['e:⛄', 'sněhulák'], ['e:🚦', 'semafor']]) },
  { id: 'hello', name: 'Hello!', icon: 'e:🐶', subject: 'english', items: d([['e:🐶', 'pejsek'], ['e:👋', 'hello'], ['e:🖍️', 'pastelka'], ['e:📦', 'krabice'], ['e:🎨', 'barvy'], ['e:🌈', 'duha']]) },
  { id: 'vylety', name: 'Výlety', icon: 't:1f680', items: d([['t:1f388', 'balónek'], ['t:1f680', 'raketa'], ['v:sup', 'paddleboard'], ['v:molo', 'molo'], ['t:1f5fa', 'mapa']]) },
];
export const SOURCE_TEXT: Record<StickerSource, string> = { cviceni: 'za dokončené cvičení', snaha: 'za snahu ve výzvě s rodičem', lekce: 'za schválené písmenko', pexeso: 'za pexeso', opakovani: 'za opakování', matematika: 'za matematiku', hra: 'za hru' };

export async function getOwned(): Promise<OwnedSticker[]> { return (await getSetting<OwnedSticker[]>(ALBUM_KEY)) ?? []; }

/** Další dosud nezískaná běžná nálepka v pořadí sad (bez duplicit); null = vše získáno. */
export function nextSticker(owned: OwnedSticker[], subject: SubjectId = 'cz-reading'): StickerId | null {
  const own = new Set(owned.map((o) => o.stickerId));
  for (const s of SETS) if (!s.special && setSubject(s) === subject) for (const it of s.items) if (!own.has(it.id)) return it.id;
  return null;
}

/** Udělí nálepku. Běžná: další v pořadí (když je vše, nic – dál jen hvězdičky). Speciální L:x jen za schválení lekce. */
export async function awardSticker(source: StickerSource, opts: { letter?: string; refId?: string; subjectId?: SubjectId } = {}): Promise<StickerId | null> {
  const owned = await getOwned();
  let id: StickerId | null;
  if (source === 'lekce') {
    const L = opts.letter?.toUpperCase();
    id = L && (LETTERS as string[]).includes(L) ? (`L:${L}` as StickerId) : null;
    if (id && owned.some((o) => o.stickerId === id)) id = null;
  } else id = nextSticker(owned, opts.subjectId ?? (source === 'matematika' ? 'math' : 'cz-reading'));
  if (!id) return null;
  await setSetting(ALBUM_KEY, [...owned, { childId: CHILD_ID, stickerId: id, source, earnedAt: new Date().toISOString(), refId: opts.refId, seen: false, subjectId: opts.subjectId ?? (source === 'matematika' ? 'math' : 'cz-reading') }]);
  return id;
}

export async function markSeen(): Promise<void> {
  const owned = await getOwned();
  if (owned.some((o) => !o.seen)) await setSetting(ALBUM_KEY, owned.map((o) => ({ ...o, seen: true })));
}
