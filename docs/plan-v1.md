# Prvňáček – plán první verze (v1 / MVP): čtení

*Verze 2, 7. 10. 2026. Zapracované odpovědi Jiřího. Pracovní název: „Prvňáček“.*

## 1. Cíl v1

Webová aplikace (PWA) na iPad pro prvňáka. Postup: **písmenka (hlásky) → otevřené slabiky (MA, ME…) → krátká slova s obrázkem**, podle učebnice **Živá abeceda, Duhová řada (Olga Nováčková, Nová škola, 7. vyd. 2025)**.
Dítě pracuje **samo**: aplikace odpovědi kontroluje sama. Na konci každé lekce (písmene) udělá s rodičem **krátkou živou zkoušku**: čte nahlas a rodič hodnotí ✓/✗. Rodič pak **schválí postup**. Teprve potom se odemkne další lekce.

**Mimo v1:** psaní (obtahování perem), počítání, malá písmena, rozpoznávání řeči, synchronizace přes MiniPC.

### Rozhodnuto
| Oblast | Rozhodnutí |
|---|---|
| Učebnice | Výchozí je **Duhová řada**. Řada **Agáta** je volitelný přepínač v nastavení. |
| Zvuk | **Předem vygenerovaný český syntetický hlas** pro všechny nahrávky. Rodič může kteroukoli nahrávku přehrát a nahradit vlastní (mikrofon iPadu). |
| Hosting | Jiří má účet na GitHubu: **veřejný repozitář + GitHub Pages**. |
| Používání | Procvičování samo s automatickou kontrolou. **Zkouška lekce živě s rodičem** (dítě čte nahlas, rodič hodnotí) a **schválení rodičem** odemyká další lekci. |

---

## 2. Pořadí písmen

**Výchozí – Duhová řada (Živá abeceda): M, A, L, E, S, O, P, U, I.**
Volitelně **Agáta:** A, Á, M, L, E, S, O, P, U, I. Nakladatel uvádí, že se od Duhové řady liší jen prohozením M a A.

- Používají se **velká tiskací bezpatková písmena**. Malá písmena se ve škole zavádějí až později (v řadě Agáta v únoru), proto nejsou ve v1.
- **Neověřeno:** obsah stránek 7. vydání Duhové řady online není. Nevím proto, jestli má samostatnou lekci pro Á a kdy zavádí malá písmena. Pořadí je **konfigurace** (`content/order.duha.json`) a rodič ho může v nastavení ručně upravit.
- **Navazující Slabikář (pro v2), orientačně:** T, J/Y, N, V, Z, D, K, Š, R, OU/AU/EU → malá písmena → C, H, B, Č, Ž, Ř, CH, F, G → ď/ť/ň, dě/tě/ně, bě/pě/vě/mě, slabikotvorné r/l/m, di/ti/ni → Q, W, X. U Duhové řady je potřeba pořadí ověřit podle Slabikáře, který dítě dostane.

Zdroje:
- NK ČR, Duhová řada, 7. vydání: https://nkp.knihovny.cz/Record/nkp.NKC01-003751511
- NK ČR, 6. vydání s popisem pořadí: https://nkp.knihovny.cz/Record/nkp.NKC01-003674764
- Rozdíl M/A oproti Agátě: https://nns.cz/agata/poznavame-abecedu/
- Tematický plán podle Duhové řady (2011): https://wiki.rvp.cz/Sborovna/3Tematicke_plany/2.Zpracovane_tematicke_plany/1.stupen/Cesky_jazyk_a_literatura/%c4%8cesk%c3%bd_jazyk_pro_1._ro%c4%8dn%c3%adk
- Časový plán celého roku (Agáta, metodický průvodce, s. 14–15): https://nns.cz/agata/wp-content/uploads/1A-06-Metodick%C3%BD-pr%C5%AFvodce-%C4%8Cteme-a-p%C3%AD%C5%A1eme-s-Ag%C3%A1tou_web.pdf

> Z učebnice bereme jen **pořadí a metodu**. Říkanky, ilustrace ani texty nekopírujeme.

---

## 3. Aktivity procvičování (dítě samo, kontrolují se automaticky)

Krátká kola po 5–8 úlohách, asi 5–10 minut. Zadání vždy říká hlas, takže dítě nemusí nic číst, aby se v aplikaci vyznalo.

| # | Aktivita | Jak se kontroluje | Fáze |
|---|---|---|---|
| A1 | **Písmenková karta**: klepnutí přehraje hlásku („mmm“) a slovo s obrázkem | (seznámení, nehodnotí se) | písmena |
| A2 | **Poslechni a najdi**: zazní hláska, dítě vybírá ze 2–4 písmen | výběr | písmena |
| A3 | **Čím to začíná?**: obrázek a vyslovené slovo, dítě vybere první písmeno | výběr | písmena |
| A4 | **Skládání slabik**: přetáhne M k A, objeví se oblouček a zazní „ma“ | správné složení podle zadání | slabiky |
| A5 | **Přečti a vyber**: (a) vidí slabiku **PI** a vybere obrázek, jehož název tak začíná (PILA); (b) slyší „le“ a vybere napsanou slabiku | výběr | slabiky |
| A6 | **Slovo a obrázek**: vidí slovo LU‿PA (bez zvuku) a vybere ze 2–3 obrázků | výběr = důkaz, že přečetlo | slova |
| A7 | **Slož slovo**: obrázek a zamíchané slabiky, dítě je seřadí | pořadí | slova |

- V procvičování se čtení nahlas nevyhodnocuje mikrofonem. To, že dítě přečetlo, ověřuje **výběr obrázku bez nápovědy zvukem** (A5a, A6). Zvuk slova zazní až **po** odpovědi. Čtení nahlas hodnotí rodič při **zkoušce lekce** (kap. 5.2).
- Obsah se skládá jen z odemčených písmen. Slova jsou jen z otevřených slabik (MÁMA, LUPA, PILA, MASO, POLE, PUSA, LAMA, SELE… seznam schválí didaktik).
- Při chybě aplikace netrestá: zazní znovu zadání a správná odpověď se jemně zvýrazní. Úloha se později vrátí. Ukládá se i **záměna** (např. vybralo L místo E) kvůli přehledu pro rodiče.

---

## 4. Zvuk: syntetický hlas a vlastní nahrávky rodiče

### 4.1 Doporučení: **Microsoft Azure Speech, hlas `cs-CZ-VlastaNeural`** (záloha `cs-CZ-AntoninNeural`)
Proč Azure:
- **Podporuje SSML `<phoneme alphabet="ipa">` i pro češtinu** (Azure má pro cs-CZ zdokumentovanou sadu hlásek). Výslovnost hlásek a slabik tak můžeme řídit přesně. Google Chirp 3 HD má víc českých hlasů a IPA obecně podporuje, ale pro češtinu jsem podporu výslovně zdokumentovanou nenašel. Proto je Google jen záloha k porovnání v M0.
- **Cena:** bezplatná úroveň F0 má **0,5 mil. znaků měsíčně**. Celá v1 (asi 150–250 krátkých nahrávek včetně SSML značek) má odhadem desítky tisíc znaků, takže se vejde **zdarma**. Placená úroveň stojí řádově 15 USD za 1 mil. znaků (aktuální cenu ověřit na stránce Azure). Platí se jednou při generování, ne za každé přehrání.
- **Licence:** vygenerované soubory se uloží do repozitáře a přehrávají offline. Podmínky použití výstupu (Microsoft Product Terms) je potřeba krátce zkontrolovat. U soukromé nekomerční aplikace nečekám problém, ale ověříme to.
- **Nevýhody:** založení účtu Azure vyžaduje platební kartu kvůli ověření (F0 je zdarma). Klíč k API je **heslo**: bude jen na počítači bota, **nikdy v repozitáři**. Limit F0 je 20 požadavků za minutu, takže generovací skript musí zpomalovat. Za značky v SSML se platí jako za znaky.
- Alternativa: Google Cloud TTS (`cs-CZ-Chirp3-HD-*` za 30 USD / 1 mil. znaků, 1 mil. měsíčně zdarma; `cs-CZ-Wavenet-B` levnější), účet s fakturací je nutný také.

### 4.2 Hlásky „mmm“ vs. názvy písmen „em“
Syntéza samotné písmeno „M“ přečte jako „em“. Postup po vrstvách:
1. **Slabiky a slova** se posílají **malými písmeny** („ma“, „lupa“), aby je hlas nečetl jako zkratky („em-á“).
2. **Hlásky** se generují přes **IPA s prodloužením**, např. `<phoneme alphabet="ipa" ph="mː">m</phoneme>`. Plynulé hlásky (M, L, S) se dají protáhnout, samohlásky jsou snadné (A = „a“, Á = „á“).
3. Když IPA nezní dobře, **vyřízne se hláska ze slabiky**. Vygeneruje se „ma“ a ffmpeg ponechá jen začátek „m“. Funguje to pro M, L, S. U **P** (krátká ražená hláska) se použije krátké „p“ s minimem samohlásky. To je nejtěžší případ.
4. Skript vygeneruje **2–3 varianty** každé hlásky, **Jiří je poslechne** v sekci Zvuky a vybere nejlepší. Kde žádná nesedí, **nahraje vlastní**.
- Úplně první krok projektu (M0) je zkušební sada: 9 hlásek, 10 slabik, 5 slov a 5 pokynů. Rozhodne, jestli Azure stačí, ještě před výrobou všeho ostatního.

### 4.3 Výrobní linka zvuků
`content/*.json` → skript `tools/tts` (Node) sestaví SSML → Azure → ffmpeg (ořez ticha, srovnání hlasitosti, mono AAC/MP3) → `public/audio/tts/<id>.m4a` + `audio-manifest.json` (id, text, hash). Znovu se generují **jen změněné** položky. Soubory se commitují a aplikace je ukládá do offline cache.

### 4.4 Vlastní nahrávky rodiče (v rodičovské sekci → **Zvuky**)
- Seznam všech nahrávek podle typu (hlásky, slabiky, slova, pokyny) s hledáním. U každé: ▶︎ **přehrát**, ● **nahrát vlastní**, ▶︎ porovnat, **Uložit**, **Vrátit syntetický hlas**. Odznak „vlastní“ / „syntetický“.
- **Technika:** `getUserMedia` + `MediaRecorder` funguje v Safari na iPadu **od iOS 14.5**. Formát je `audio/mp4` (AAC), od iOS 18.4 i `webm/opus`. Volí se přes `isTypeSupported` a `start()` je zabalený v try/catch. Nahrávka se ukládá jako **Blob do IndexedDB** pod stejným id. Přehrávač vždy hledá nejdřív **vlastní nahrávku, pak syntetickou**.
- **Úskalí iOS:**
  - funguje jen přes HTTPS (GitHub Pages ho má) a nahrávání musí spustit klepnutí;
  - **v aplikaci spuštěné z plochy se iOS může na mikrofon ptát znovu po každém spuštění** (známá chyba WebKitu, v iOS 26.x se znovu objevila). Stačí potvrdit;
  - změna `#hash` v URL dřív oprávnění resetovala, proto aplikace **nebude používat hash routing** (navigace jen ve stavu aplikace);
  - po nahrání se automaticky ořízne ticho a srovná hlasitost (Web Audio). Rodič si nahrávku před uložením poslechne.
- Vlastní nahrávky jsou **jen v iPadu** a jsou součástí exportu zálohy (ZIP se soubory a JSON). Smazání dat Safari by je odstranilo, proto aplikace žádá o trvalé úložiště (`navigator.storage.persist()`).

---

## 5. Pokrok, živá zkouška lekce a schválení rodičem

**Lekce** = jedno písmeno v pořadí učebnice (M, A, L…) spolu se slabikami a slovy, které s ním jdou poskládat.

Dva režimy:
- **Procvičování:** dítě samo, aplikace kontroluje automaticky.
- **Zkouška lekce:** živě s rodičem. Dítě čte nahlas a rodič hodnotí.

### 5.1 Stavy lekce
🔒 **zamčeno** → 🟡 **procvičuje** → 🟢 **doporučeno ke zkoušce** (podle procvičování) → ✅ **schváleno rodičem** po zkoušce. Teprve schválením se odemkne další lekce.

**Doporučení ke zkoušce** (jen upozornění pro rodiče, nastavitelné):
- aspoň 20 hodnocených úloh v lekci;
- úspěšnost **≥ 80 % v posledních 20**;
- procvičováno ve **2 různých dnech**.

Rodič může zkoušku spustit kdykoli, i bez doporučení.

### 5.2 Zkouška lekce (živě s rodičem)
- **Spuštění:** jen z rodičovské sekce (za rodičovskou bránou): **Lekce L → Spustit zkoušku**. iPad leží mezi dítětem a rodičem.
- **Obrazovka pro dítě:** jedna položka naráz, velkým písmem: písmeno, slabika, nebo slovo. **Bez zvuku a bez obrázku**, aby nebylo co uhodnout. Dítě **čte nahlas** (u písmene hlásku „mmm“, ne „em“).
- **Ovládání pro rodiče:** dole na kraji obrazovky malá, pro dítě nenápadná tlačítka:
  - **✓ správně**, **✗ chybně**, **↶ opravit předchozí**, **⏸ přerušit**;
  - u ✗ volitelně rychlý důvod: *zaměnil(a)*, *nevěděl(a)*, *hláskoval(a), nespojil(a)*.
  - Po hodnocení se u slova ukáže obrázek jako malá odměna a jde se dál.
- **Délka a složení** (generuje se automaticky a pokaždé jinak):
  - **Lekce M (první, jen písmeno): 6 položek.** M v různých pozicích v řádku s jinými tvary písmen; dítě ukáže a přečte M.
  - **Další lekce: 12 položek (asi 3–5 min):**
    - 3× nové písmeno, ukázané v řádku spolu s dříve probranými;
    - 5× slabiky s novým písmenem;
    - 2–3× slova (od lekce, kde už nějaká jdou poskládat);
    - 1–2× opakování z dřívějších lekcí.
- **Doporučená hranice:**
  - **≥ 80 % správně** (10/12, u M 5/6);
  - **a nejvýš 1 chyba u položek s novým písmenem.**
  - Při splnění aplikace ukáže „doporučeno schválit“. Rozhodnutí je ale vždy na rodiči. Hranici lze změnit v nastavení.
  - Proč 80 %: čtení nahlas nejde uhodnout, takže 10 z 12 je jasný doklad zvládnutí. Jedna dvě chyby z nervozity přitom neznamenají propadnutí.
- **Opakování:** bez omezení. Doporučuje se nejdřív **další den** po procvičení. Chybné položky aplikace automaticky zařadí do procvičování.
- **Pro dítě:** zkouška je „Výzva s rodičem“. Na konci dostane nálepku za snahu vždy, bez ohledu na výsledek. Po schválení přijde oslava „Máš nové písmenko!“.

### 5.3 Konec zkoušky a schválení
Souhrn hned po zkoušce:
- **skóre** (např. 10/12) a splnění doporučené hranice;
- **seznam chybných položek** s důvodem;
- **datum, čas, délka a kolikátý pokus** to byl.

Akce:
- **Schválit a odemknout další lekci**;
- **Zatím ne, procvičit**: lekce zůstává 🟡 a chybné položky jdou do procvičování;
- pole pro **poznámku**.

Schválení se uloží s datem a vazbou na pokus. Bez schválení se další lekce neodemkne. Výjimkou je **Odemknout ručně** v detailu lekce (např. když škola jede rychleji), s varováním a záznamem do historie.

Slabiky a slova v procvičování se skládají jen z písmen schválených lekcí a z aktuální lekce. Schválené lekce se dál občas vracejí v opakování.

### 5.4 Rodičovská sekce (vstup: podržet 3 s a vyřešit příklad, např. 37 + 25)
- **Přehled lekcí:** řada dlaždic M A L E S O P U I se stavem, úspěšností v procvičování a výsledkem poslední zkoušky. Upozornění: „🟢 L je doporučeno ke zkoušce“.
- **Detail lekce:**
  - tlačítko **Spustit zkoušku**;
  - **historie zkoušek**: datum, skóre, pokus, chybné položky s důvody, schváleno ano/ne;
  - **procvičování**: úspěšnost podle aktivit, vývoj za 14 dní, **nejčastější záměny**, problémové slabiky a slova, čas;
  - akce **Odemknout ručně** a **Zamknout zpět**.
- **Poznámky:** volný text s datem u lekce i obecně (např. „12. 10. ve škole probrali S“).
- **Týdenní souhrn:** minuty, počet kol, zkoušky, schválené lekce, co se nedaří.
- **Nastavení:** učebnice (Duhová řada / Agáta), pořadí, doporučení ke zkoušce, délka a hranice zkoušky, délka kola, hlasitost, **Zvuky** (kap. 4.4), export a import zálohy.

### 5.5 Data
Data se ukládají jen v iPadu (IndexedDB): pokusy, úspěšnost, záměny, úroveň zvládnutí, **zkoušky** (každá položka, hodnocení rodiče ✓/✗ s důvodem, čas), stav lekce, schválení (kdy, po kterém pokusu, nebo ručně), poznámky a vlastní nahrávky. Nic se neposílá ven. Ve v2 přibude záloha na MiniPC přes Tailscale.

---

## 6. UX pro dítě

- Velké dotykové plochy (≥ 80 pt), max. 3–4 volby na obrazovce, iPad na šířku i na výšku.
- Ovládání bez čtení: ikony a hlas. Tlačítko 🔊 „zopakuj zadání“ je všude.
- Domovská obrazovka má 3 dlaždice: **Písmenka / Slabiky / Slova** (zamčené jsou šedé). Pod nimi je řada písmen se stavy jako „mapa cesty“.
- **Odměny:** nálepky do alba, hvězdičky u písmen, radující se průvodce (zvířátko). Bez časového tlaku, žebříčků a nákupů.
- Tip: v iPadu zapnout **Řízený přístup**, aby dítě z aplikace neodešlo.

---

## 7. Technologie

| Oblast | Volba |
|---|---|
| Kód | **TypeScript + React + Vite** |
| PWA a offline | **vite-plugin-pwa** (Workbox), předem uložené zvuky a obrázky |
| Úložiště | IndexedDB (`idb-keyval` nebo `idb`), `navigator.storage.persist()` |
| Obsah | JSON v `content/` (pořadí, písmena, slabiky, slova, pokyny) |
| Zvuk | Azure TTS (generuje se offline skriptem) + ffmpeg, přehrávání přes Web Audio, nahrávky přes MediaRecorder |
| Obrázky | Volně licencované sady (OpenMoji / Twemoji, uvést licenci) nebo vlastní ilustrace |
| Testy | Vitest (logika, kritéria zvládnutí) + **Playwright s WebKitem** + kontrolní seznam na skutečném iPadu |
| Hosting | **Veřejný repozitář na GitHubu + GitHub Pages**, nasazení přes GitHub Actions při merge do `main` |

---

## 8. Milníky

| Milník | Obsah | Hotovo, když… |
|---|---|---|
| **M0 – Základ a zkušební zvuk** (2–3 dny) | Repozitář, kostra PWA, nasazení na Pages, přidání na plochu iPadu. **Zkušební sada Azure** (hlásky přes IPA i vyříznutím). Test MediaRecorder z plochy. | Aplikace běží z plochy offline. Jiří schválí kvalitu hlásek nebo vybere náhradní postup. |
| **M1 – Písmenka** (1–2 týdny) | Obsah M…I, A1–A3, výroba všech zvuků, ukládání pokroku, **živá zkouška lekce s rodičem**, rodičovská sekce: přehled, detail s historií zkoušek, schvalování, poznámky. | Rodič spustí zkoušku M, ohodnotí položky, vidí souhrn, schválí ji a odemkne se A. |
| **M2 – Slabiky** (1 týden) | Generátor otevřených slabik, A4–A5, oblouček, zvuky slabik, slabiky v položkách zkoušky. | Slabiky jsou jen z povolených písmen a všechny mají zvuk. |
| **M3 – Slova** (1 týden) | Asi 30 slov s obrázky, A6–A7. | Všechna slova mají obrázek i zvuk. |
| **M4 – Zvuky rodiče, odměny, v1.0** (1 týden) | Sekce Zvuky (nahrát, nahradit, vrátit), album nálepek, týdenní souhrn, export a import, 2–3 testovací sezení s dítětem. | Rodič nahradí libovolnou nahrávku a vrátí ji zpět. Dítě aplikaci ovládá samo. |

---

## 9. Tým

Cloudové agenty Cursoru tento tarif nemá. **Kód se proto píše na počítači bota přes GitHub CLI** (`gh`), jakmile se Jiří jednou přihlásí (`gh auth login`). Vývojový bot pracuje ve větvích a otevírá pull requesty. New Bot je kontroluje a mergne, GitHub Actions pak nasadí aplikaci.

| Bot | Role | Odpovědnosti | Dodá | Komu předává |
|---|---|---|---|---|
| **New Bot** (stávající) | **Projektový manažer + QA koordinátor** | Plán a issues na GitHubu, zadání pro ostatní boty, kontrola PR, schvalování milníků, kontrolní seznam testů na iPadu, týdenní report Jiřímu. Pokrývá i **roli produktového vlastníka v zastoupení** a **testera** (automatické testy hlídá v PR). | Issues, milníky, review, poznámky k vydání, report | Jiřímu (rozhodnutí), ostatním botům (zadání) |
| **Slabikářka** (nový) | **Didaktik a obsah** | Obsah podle metody Duhové řady: pořadí, slova k písmenům, generátor otevřených slabik (pravidla), seznam slov, zadání obrázků, **scénář nahrávek s SSML/IPA** (hlásky, slabiky, pokyny, pochvaly), doporučení ke zkoušce a **složení a hranice živé zkoušky lekce** (včetně krátkého návodu pro rodiče, jak hodnotit). | PR s `content/*.json`, `content/audio-script.json`, seznam obrázků | Vývojáři (obsah), Jiřímu (seznam nahrávek k poslechu) |
| **Pastelka** (nový) | **UI/UX designér** | Drátěné modely a klikací HTML prototyp, barvy a písmo (velká bezpatková), výběr obrázků s licencemi, průvodce a nálepky, rodičovská sekce (přehled a detail písmene), pravidla přístupnosti. | `design/` (prototyp, design tokeny, SVG), `ATTRIBUTION.md` | Vývojáři |
| **Stavitel** (nový) | **Vývojář** | Kód PWA, offline cache, zvukový modul (TTS a vlastní nahrávky), IndexedDB, rodičovská sekce, skript `tools/tts`, testy Vitest a Playwright, GitHub Actions. Pracuje na počítači bota přes `gh`. | Pull requesty s funkčním a otestovaným kódem, nasazená verze | New Botovi (review) → Pages |

- **Úspornější varianta (3 boti celkem):** Pastelku sloučit se Stavitelem. Stavitel pak navrhuje UI podle stručných pravidel v tomto plánu.
- **Jiří:** schvaluje milníky, **poslouchá a vybírá hlasové varianty**, případně nahrává vlastní, testuje s dítětem a v aplikaci schvaluje písmena. Boti zvuk neslyší, proto je kvalita hlasu na Jiřím.

Tok práce: Slabikářka (obsah) a Pastelka (návrh) → Stavitel (PR) → New Bot (kontrola, nasazení) → Jiří (iPad, poslech, test s dítětem) → zpětná vazba v issues.

---

## 10. Otevřené otázky

1. **Azure:** založíš účet Azure a prostředek Speech (úroveň F0 zdarma, při registraci se ověřuje platební karta) a předáš klíč botovi? Po zkušební sadě vybereš hlas: **Vlasta** (ženský), nebo **Antonín** (mužský)?
2. **GitHub:** jak se jmenuje tvůj účet na GitHubu a souhlasíš s názvem repozitáře **`prvnacek`**? Pak se na počítači bota jednou přihlásíš přes `gh auth login`.
