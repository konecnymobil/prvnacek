/**
 * Prvňáček – TypeScript typy obsahu (content/*.json), schemaVersion 1.
 * Generováno ručně k výstupu tools/content/build_content.py; JSON Schema jsou v content/schema/.
 *
 * Zásady: stabilní ASCII string id (a-z0-9 a pomlčky), ploché pole objektů, odkazy jen přes id
 * a jen jedním směrem (dítě → rodič, např. PictureWord.letterId), žádné cyklické reference.
 */

export const SCHEMA_VERSION = 1 as const;

// ---------- id (aliasy pro čitelnost; za běhu obyčejný string) ----------
export type OrderId = "duha" | "agata";
export type LetterId = string;     // "l-m", "l-aa" (= Á)
export type LessonId = string;     // "duha-1" … "agata-10"
export type SyllableId = string;   // "s-ma", "s-maa" (= MÁ), "s-a" (samotná samohláska), "s-pes" (zavřená)
export type WordId = string;       // "w-maama" (= MÁMA)
export type PictureWordId = string;// "pw-mys" (= MYŠ)
export type PromptId = string;     // "p-praise-1"
export type ImageId = string;      // "img-w-lupa", "img-pw-sova"
export type AudioId = string;      // "snd-l-m", "snd-s-ma", "snd-w-maama", "snd-p-a2"
export type ClipId = string;       // "c-l-m-v1", "c-s-ma"

export type Familiarity = "high" | "medium" | "low";
export type PerOrder<T> = Record<OrderId, T>;

interface FileHeader<K extends string> {
  schemaVersion: typeof SCHEMA_VERSION;
  kind: K;
}

// ---------- manifest.json ----------
export interface ManifestFile extends FileHeader<"manifest"> {
  contentVersion: string;
  defaultOrderId: OrderId;
  files: { path: string; kind: string; schema: string }[];
  scripts: ScriptsDeclaration;
}

// ---------- order.duha.json / order.agata.json ----------
export interface Lesson {
  id: LessonId;
  index: number;              // 1-based
  letterIds: LetterId[];      // nová písmena lekce (Duhová řada: lekce 2 = A + Á)
  primaryLetterId: LetterId;  // písmeno na dlaždici
  title: string;              // "A + Á"
  verified: boolean;          // false = zařazení písmen do lekce není ověřené (Duhová řada: Á v lekci A)
  verificationNote: string | null;
}
export interface OrderFile extends FileHeader<"order"> {
  id: OrderId;
  title: string;
  isDefault: boolean;
  verification: {
    status: "verified" | "partly-verified" | "unverified";
    verified: string;
    unverified: string;
    sources: string[];
  };
  lessons: Lesson[];
}

// ---------- tvary písma ----------
export type ScriptFormId = "upperPrint" | "lowerPrint" | "cursive"; // velká tiskací, malá tiskací, psací
export interface ScriptFormDecl {
  id: ScriptFormId;
  label: string;
  fontRequired: boolean;       // psací = potřebuje font (jen text, žádné obrázky)
  introducedAtLesson: PerOrder<number | null>; // konfigurace: od které lekce; null = neurčeno (neověřeno)
  verified: boolean;
  note: string;
}
export interface ScriptsDeclaration { defaultMode: ScriptFormId; forms: ScriptFormDecl[]; note: string }
/** Nastavení aplikace (rodičovská sekce, mimo data): aktivní forma a dostupnost fontů. */
export type ScriptModeId = ScriptFormId | "all"; // all = všechny povolené tvary najednou (Aa + psací)
export interface AppScriptSettings { mode: ScriptModeId; available: Record<ScriptFormId, boolean> }
/** Text pro zobrazení; cursive = malými písmeny pro psací font. Nedostupná forma → upperPrint. */
export type Forms = Record<ScriptFormId, string>;
/** Povolené tvary v pořadí velké, malé, psací (pro režim „all“). */
export function formsList(f: Forms, s: AppScriptSettings): [ScriptFormId, string][] {
  const o = (["upperPrint", "lowerPrint", "cursive"] as ScriptFormId[]).filter((x) => s.available[x]).map((x) => [x, f[x]] as [ScriptFormId, string]);
  return o.length ? o : [["upperPrint", f.upperPrint]];
}
export function formText(f: Forms, s: AppScriptSettings): string {
  if (s.mode === "all") return formsList(f, s).map(([, t]) => t).join(" ");
  return s.available[s.mode] ? f[s.mode] : f.upperPrint;
}

// ---------- letters.json ----------
export interface LetterSound {
  ipa: string;                 // symbol z fonetické sady Azure cs-CZ
  ipaSustained: string | null; // protažená varianta (mː, lː, sː), jinak null
  sustainable: boolean;        // lze protáhnout (P ne)
  schoolSound: string;         // jak zní ve škole: "mmm", "p (krátce, bez samohlásky)"
  letterNameToAvoid: string;   // název písmene, který NEchceme ("em", "pé", "á")
  articulation: string;        // popis pro rodiče
  hintForChild: string;        // krátká rada pro dítě
}
export interface Letter {
  id: LetterId;
  upper: string;               // "M" – ve v1 se zobrazují jen velká tiskací bezpatková
  lower: string;               // "m"
  forms: Forms & { cursiveUpper: string }; // cursive = malé psací, cursiveUpper = velké psací (font)
  kind: "vowel" | "consonant";
  isLong: boolean;             // Á
  baseLetterId: LetterId | null; // Á → l-a
  sound: LetterSound;
  lessonByOrder: PerOrder<LessonId>; // denormalizace pořadí (zdroj pravdy: order.*.json)
  visualConfusables: string[];   // podobné tvary (zobrazit jen ty, které už jsou probrané)
  auditoryConfusables: string[]; // podobně znějící hlásky
  shapeDistractors: string[];    // neprobrané tvary pro „najdi písmeno“ v první lekci
  audioId: AudioId;
}
export interface PictureWord {
  id: PictureWordId;
  letterId: LetterId;
  rank: number;                // pořadí na kartě písmene
  text: string;                // "MYŠ" (nemusí být čitelné – slouží k poslechu)
  textLower: string;
  gloss: string;               // význam / zadání obrázku
  familiarity: Familiarity;
  initialSound: boolean;       // true = začíná hláskou písmene → smí do A3 „Čím to začíná?“
  soundPosition: "initial" | "medial";
  imageId: ImageId;
  audioId: AudioId;
}
export interface LettersFile extends FileHeader<"letters"> {
  letters: Letter[];
  pictureWords: PictureWord[];
  avoidedPictureWords: { text: string; letter: string; reason: string }[];
}

// ---------- syllables.json ----------
export interface Syllable {
  id: SyllableId;
  text: string;                // "MA" (velká písmena)
  forms: Forms;                // {upperPrint:"MA", lowerPrint:"ma", cursive:"ma"}
  textLower: string;           // "ma" (pro TTS)
  /** CV = otevřená slabika; V = samotná samohláska jako slabika slova (O-SA, A-LE);
   *  CVC/VC = zavřená slabika – jen poslední slabika slov s difficulty 2 (PES, O-SEL, SA-LÁM). */
  kind: "CV" | "V" | "CVC" | "VC";
  consonantLetterId: LetterId | null; // počáteční souhláska
  vowelLetterId: LetterId;
  codaLetterId: LetterId | null;      // koncová souhláska zavřené slabiky
  closed: boolean;
  letterIds: LetterId[];       // unikátní, v pořadí výskytu
  /** true jen u otevřených CV. Slabikové úlohy (A4, A5 i jakékoli další se slabikami) smí brát JEN tyto slabiky.
   *  V a zavřené CVC/VC slabiky mají false: slouží jen ke čtení slov, dělení a zvuku. */
  usableInSyllableTasks: boolean;
  minLessonId: PerOrder<LessonId>;   // nejdřívější lekce, od které je čitelná
  minLessonIndex: PerOrder<number>;
  audioId: AudioId;            // V slabiky ukazují na zvuk hlásky (snd-l-a)
  ipa: string;
}
export interface SyllablesFile extends FileHeader<"syllables"> {
  syllables: Syllable[];
}

// ---------- words.json ----------
export type PartOfSpeech = "noun" | "verb" | "adj" | "adv" | "function";
export interface Word {
  id: WordId;
  text: string;                // "MÁMA"
  forms: Forms;
  /** „Slož slovo“ (A5c): jen víceslabičná slova. */
  usableInComposeTask: boolean;
  firstSyllableId: SyllableId; // = syllableIds[0]
  /** Pexeso (obrázek ↔ první slabika); zatím se nepoužívá. */
  usableInMemoryGame: boolean;
  /** Chybné slabiky k poskládání: otevřené CV s usableInSyllableTasks, probrané v lekci slova, nikdy ne správné,
   *  ne lišící se jen délkou, nedávají jiné slovo. 0–3 (u nejranějších slov 0). */
  distractorSyllableIds: SyllableId[];
  textLower: string;
  syllableIds: SyllableId[];   // dělení na slabiky přes id
  syllablesText: string[];     // ["MÁ","MA"] – pohodlí pro UI (shodné se syllableIds)
  syllableCount: number;
  letterCount: number;
  letterIds: LetterId[];       // unikátní písmena v pořadí výskytu
  partOfSpeech: PartOfSpeech;
  picturable: boolean;         // má obrázek
  concrete: boolean;
  familiarity: Familiarity;
  gloss: string;
  closedFinalSyllable: boolean;  // poslední slabika je zavřená (PES, OSEL, SALÁM)
  /** 1 = jen otevřené slabiky; 2 = zavřená poslední slabika (vyšší obtížnost pro M3, řadit až po 1). */
  difficulty: 1 | 2;
  usableInPictureTasks: boolean; // A5a, A6, A7 (u difficulty 2 až po zvládnutí slov difficulty 1)
  usableInTest: boolean;         // ve zkoušce M0–M1 jen víceslabičná slova difficulty 1
  imageId: ImageId | null;
  audioId: AudioId;
  minLessonId: PerOrder<LessonId>;
  minLessonIndex: PerOrder<number>;
  ipa: string;
  pronunciationNote: string | null;
}
export interface WordsFile extends FileHeader<"words"> {
  words: Word[];
  rejected: { text: string; reason: string }[]; // dokumentace vyřazených slov
}

// ---------- prompts.json ----------
export interface Prompt {
  id: PromptId;
  category: "general" | "instruction" | "praise" | "retry" | "reward" | "test";
  activity: string | null;     // "A1"…"A7"
  text: string;
  audioId: AudioId;
}
export interface PromptsFile extends FileHeader<"prompts"> {
  prompts: Prompt[];
}

// ---------- image-briefs.json ----------
export interface ImageBrief {
  id: ImageId;
  refType: "word" | "pictureWord";
  refId: WordId | PictureWordId;
  label: string;
  brief: string;
  mustBeDistinctFrom: ImageId[]; // obrázky, které se nesmí plést (PUMA × LAMA × MULA)
}
export interface ImageBriefsFile extends FileHeader<"imageBriefs"> {
  licenseNote: string;
  images: ImageBrief[];
}

// ---------- audio-script.json ----------
export interface PostProcess {
  op: "keepHead";
  source: "this";
  until: "vowelOnset" | "burstEnd";
  approxKeepMs: number;
  fadeOutMs: number;
  note: string;
}
export interface AudioClip {
  id: ClipId;
  audioId: AudioId;            // výsledné id zvuku v aplikaci (i pro vlastní nahrávku rodiče)
  category: "letter" | "syllable" | "word" | "pictureWord" | "prompt";
  refId: string;               // id položky obsahu
  text: string;
  variant: number;             // 1…variantCount
  variantCount: number;
  method: "ipa" | "text" | "cut-from-syllable";
  ssmlBody: string;            // vkládá se do ssmlTemplate
  fallbackSsmlBody: string | null;
  postprocess: PostProcess | null;
  fileName: string;            // "<audioId>.mp3" nebo kandidát "<audioId>--vN.mp3"
  candidate: boolean;
  needsListening: boolean;
  risk: string | null;         // null i tehdy, když bylo riziko vyřešeno poslechem (viz listeningCheck)
  notes: string | null;
  billableChars: number;
  /** Ověřeno poslechem (z audio-selection.json → listeningChecks). resolvedRisk = původní riziko. */
  listeningCheck: { status: "verified"; verifiedBy: string; verifiedAt: string; resolvedRisk: string | null } | null;
}
export interface AudioScriptFile extends FileHeader<"audioScript"> {
  contentVersion: string;
  voice: { name: string; fallback: string; locale: string };
  ssmlTemplate: string;        // obsahuje {voice} a {body}
  phoneticAlphabet: { alphabet: "ipa"; note: string; phonesUsed: string[]; source: string };
  output: { dir: string; candidatesDir: string; format: string; selectionRule: string };
  listeningNote: string;
  totals: { clips: number; audioIds: number; billableChars: number };
  clips: AudioClip[];
}

// ---------- audio-selection.json ----------
/** Výběr varianty hlásky poslechem (Jiří). Build soubor nepřepisuje, jen doplní nové zvuky. */
export interface AudioSelectionEntry {
  audioId: AudioId;
  refId: LetterId | SyllableId;    // hláska, nebo riziková slabika (SOS)
  candidateClipIds: ClipId[];      // varianty z audio-script.json (candidate=true)
  status: "pending" | "selected" | "noneFits"; // noneFits = nahrát vlastní v sekci Zvuky
  selectedClipId: ClipId | null;   // jen při status "selected"; musí být v candidateClipIds
  decidedAt: string | null;        // YYYY-MM-DD
  note: string | null;
  /** Varianty přidané až po výběru: výběr platí, ale zvuk čeká na nový poslech (po poslechu vyprázdnit). */
  newCandidateClipIds: ClipId[];
  sourceFile: string | null;       // zdrojový soubor vybrané varianty, cesta od kořene repozitáře (např. audio-trial/…)
}
/** Klip ověřený poslechem – riziko (např. „zní jako slovo“) je vyřešené. */
export interface ListeningCheck {
  clipId: ClipId;
  audioId: AudioId;
  status: "verified";
  verifiedBy: string;
  verifiedAt: string;              // YYYY-MM-DD
  note: string | null;
}
export interface AudioSelectionFile extends FileHeader<"audioSelection"> {
  note: string;
  selections: AudioSelectionEntry[];
  listeningChecks: ListeningCheck[];
}

// ---------- test-rules.json ----------
export type TestItemType = "letterFind" | "letterRow" | "syllable" | "word" | "review";
export type ErrorReasonId = "confused" | "unknown" | "notBlended";
export interface TestBlueprint {
  id: string;                  // "tb-duha-3"
  orderId: OrderId;
  lessonId: LessonId;
  mode: "letterOnly" | "full"; // letterOnly = 6 položek (první lekce, Á u Agáty)
  itemCount: number;           // 6 nebo 12
  slots: Record<TestItemType, number>;
  /** Rozpis slots.review: kolik starších slov / slabik / samostatných písmen. */
  reviewSlots: { word: number; syllable: number; letter: number };
  rowLength: number;           // délka řádku písmen (u letterFind délka řádku tvarů)
  distinctRowsAvailable: number | null; // kolik různých řádků písmen jde sestavit (null u letterOnly)
  pools: {
    newLetterIds: LetterId[];
    rowLetterIds: LetterId[];
    shapeDistractors: string[];
    syllableIds: SyllableId[];
    wordIds: WordId[];
    reviewLetterIds: LetterId[];
    reviewSyllableIds: SyllableId[];
    reviewWordIds: WordId[];
  };
  passScore: number;           // ceil(0.8 * itemCount)
  newLetterItemCount: number;  // ≥ 3
  maxNewLetterErrors: number;
  compromiseNote: string | null; // vyplněno, když lekce potřebuje víc než 5 řádků písmen (málo slabik a slov)
  exampleItems: TestItem[];    // jedna ukázková zkouška; aplikace losuje vlastní podle stejných pravidel
}
/** Položka sestavené zkoušky. U řádků je text sekvence písmen oddělená mezerou („A M L A“). */
export interface TestItem {
  type: TestItemType;
  reviewKind: "word" | "syllable" | "letter" | null; // jen u type "review"
  refId: string | null;        // id slabiky/slova/písmene; null u řádků
  text: string;
  containsNewLetter: boolean;
}
/** Klíč pro kontrolu opakování napříč typy úloh (stejný text = stejná položka). */
export function testItemKey(item: Pick<TestItem, "type" | "text">): string {
  return (item.type === "letterRow" || item.type === "letterFind" ? "row:" : "") + item.text;
}
/** Vrátí klíče položek, které se ve zkoušce opakují (prázdné pole = v pořádku). */
export function findRepeatedTestItems(items: Pick<TestItem, "type" | "text">[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const it of items) {
    const k = testItemKey(it);
    if (seen.has(k)) dup.add(k);
    seen.add(k);
  }
  return [...dup];
}
export interface TestRulesFile extends FileHeader<"testRules"> {
  defaults: {
    itemsFull: number; itemsLetterOnly: number; passRatio: number; maxNewLetterErrors: number;
    baseNewLetterRows: number; baseSyllables: number; maxWords: number; minWordsIfAvailable: number;
    baseReview: number; maxReview: number; maxNewLetterRows: number; minNewLetterItems: number;
    allowRepeatedItems: false; letterFindLength: number;
  };
  recommendation: { minRatedTasks: number; windowSize: number; minSuccessRatio: number; minDistinctDays: number; note: string };
  passRule: { minRatio: number; maxNewLetterErrors: number; text: string };
  retake: { unlimited: boolean; recommendedMinGapDays: number; text: string };
  itemTypes: { id: TestItemType; label: string; countsAsNewLetter: boolean; display: string; correctWhen: string }[];
  errorReasons: { id: ErrorReasonId; label: string; hint: string }[];
  compositionAlgorithm: string[];
  parentGuideShort: string[];
  blueprints: TestBlueprint[];
}

// ---------- pomocné funkce (čisté, bez závislostí) ----------
/** Je položka čitelná v dané lekci? (procvičování: lekce ≤ aktuální a schválené) */
export function isReadableAt(item: { minLessonIndex: PerOrder<number> }, order: OrderId, lessonIndex: number): boolean {
  return item.minLessonIndex[order] <= lessonIndex;
}

/** Přepočet nejdřívější lekce pro vlastní pořadí z nastavení (rodič přeházel písmena). */
export function minLessonForCustomOrder(item: { letterIds: LetterId[] }, lessons: Pick<Lesson, "index" | "letterIds">[]): number | null {
  const at = new Map<LetterId, number>();
  for (const l of lessons) for (const id of l.letterIds) at.set(id, l.index);
  let max = 0;
  for (const id of item.letterIds) {
    const i = at.get(id);
    if (i === undefined) return null;
    max = Math.max(max, i);
  }
  return max;
}

/** Vyhodnocení zkoušky podle passRule. */
export function evaluateTest(
  results: { correct: boolean; countsAsNewLetter: boolean }[],
  rule: { minRatio: number; maxNewLetterErrors: number },
): { score: number; total: number; newLetterErrors: number; recommendApprove: boolean } {
  const total = results.length;
  const score = results.filter((r) => r.correct).length;
  const newLetterErrors = results.filter((r) => !r.correct && r.countsAsNewLetter).length;
  const recommendApprove = score >= Math.ceil(rule.minRatio * total - 1e-9) && newLetterErrors <= rule.maxNewLetterErrors;
  return { score, total, newLetterErrors, recommendApprove };
}

/** Doporučení ke zkoušce z procvičování (attempts = hodnocené úlohy lekce, od nejstarší). */
export function isRecommendedForTest(
  attempts: { correct: boolean; day: string /* YYYY-MM-DD v místním čase */ }[],
  rec: { minRatedTasks: number; windowSize: number; minSuccessRatio: number; minDistinctDays: number },
): boolean {
  if (attempts.length < rec.minRatedTasks) return false;
  const last = attempts.slice(-rec.windowSize);
  const ratio = last.filter((a) => a.correct).length / last.length;
  const days = new Set(attempts.map((a) => a.day)).size;
  return ratio >= rec.minSuccessRatio && days >= rec.minDistinctDays;
}
