# Návrh synchronizace a backendu (M5, jen návrh – bez implementace)

Stav k 2026-10-17. Navazuje na `docs/m5-rozhodnuti.md` a na PR „M5 krok 1: lokální profily dětí“ (každé dítě má vlastní IndexedDB, žádný server).

## Výchozí podmínky
- **GitHub Pages** hostuje jen statické soubory: žádný kód na serveru, žádná databáze, žádné tajné klíče. Pro synchronizaci je tedy nutný samostatný backend. Pages zůstává pro samotnou aplikaci (PWA).
- Rozhodnutí Jiřího: data zůstávají v zařízení dítěte; přenos přes QR jen na žádost rodiče; volitelná záloha na náš server; rodič bez účtu, k serverové záloze se dostane jen přes e-mail (na serveru jen zašifrovaný otisk adresy); nahrávky jen na výslovné přání (výchozí vypnuto); třída později, učitel jen souhrnná čísla; historie pokusů max. 1 rok.

## Doporučení
**Vlastní malý server na rodinném MiniPC (Home Assistant) za Tailscale Funnel nebo reverzní proxy, s end-to-end šifrováním klíčem rodiny.** Server ukládá jen zašifrované bloby a otisky; nic nečte.

Proč:
- Odpovídá rozhodnutí (data u nás, ne u třetí strany) a je nejlevnější pro jednu rodinu.
- Díky E2E šifrování nevadí, že server je „hloupý“; při přechodu jinam (cloud) se jen přenesou zašifrované bloby.
- Rozhraní navrhnout úzké (PUT/GET blob podle `familyId`, ověření e-mailem), aby šlo později beze změny klienta přesunout na Supabase nebo jiný hosting.

Rizika: dostupnost domácího připojení a MiniPC, zálohy serveru, aktualizace a zabezpečení – vše na Jiřím. Proto **druhá volba: Supabase** (spravovaný Postgres + úložiště), se stejným E2E modelem.

## Porovnání (ceny ověřeny na webu 2026-10-17, jinak odhad)
| Varianta | Měsíční náklad | Poznámka |
|---|---|---|
| MiniPC + Tailscale Funnel / reverzní proxy | **~0 Kč navíc** (odhad: elektřina už běžícího MiniPC; doména volitelně ~300 Kč/rok – odhad) | Plná kontrola; dostupnost a provoz na nás. Tailscale pro osobní použití je zdarma (neověřeno v tomto dokumentu – ověřit). |
| Supabase Free | 0 USD | 500 MB DB, 1 GB souborů, 5 GB egress; **projekt se pozastaví po týdnu nečinnosti** (ověřeno na supabase.com/pricing). Pro rodinu stačí kapacitou, pozastavení je nepříjemné. |
| Supabase Pro | od 25 USD (+ výpočet, 1× Micro v ceně) | 8 GB DB, 100 GB souborů, denní zálohy 7 dní, bez pozastavení (ověřeno). Rozumné pro víc rodin / třídu. |
| Firebase (Spark) | 0 USD | Firestore 1 GiB, 50k čtení a 20k zápisů denně; **Cloud Storage (nahrávky) jen na placeném Blaze** (ověřeno na firebase.google.com/pricing). Vázanost na Google, horší pro export/GDPR. |
| Firebase (Blaze) | podle spotřeby, pro 1 rodinu řádově 0–1 USD (odhad) | Úložiště s volnou kvótou jen v US regionech (ověřeno) – nevhodné pro data dětí z EU. |

## Šifrování (E2E, klíč rodiny)
- Při zapnutí zálohy se v zařízení rodiče vygeneruje **klíč rodiny** (AES-GCM 256, WebCrypto). Data dítěte se šifrují v zařízení, na server jde jen šifrovaný blob + metadata (verze, čas, `deviceId`).
- Klíč se mezi zařízeními předává **QR kódem** (spolu s párováním) – nikdy přes server.
- **Kód pro obnovu** (zobrazitelný v propojených zařízeních) = zašifrovaný klíč rodiny; při ztrátě všech zařízení ho server po ověření e-mailu pošle na zadanou adresu (adresu neukládá, porovná jen otisk HMAC). Bez e-mailu je záloha nenávratně ztracená – akceptováno.
- Důsledek: server ani správce data nepřečte; učitelská čísla (třída) se musí počítat v zařízení a posílat jen agregovaně.

## Konflikty (offline)
- Pokusy a události jsou **jen přidávané** (append-only, id = `deviceId` + čítač) → sjednocení bez konfliktů.
- Nastavení a profil: **poslední zápis vyhrává po polích** (časové razítko + `deviceId` jako rozhodčí).
- Stav lekce: „schváleno“ vždy vyhrává nad nižším stavem.
- Smazání dítěte: tombstone s časem; obnovu ze starší zálohy tombstone přebije.
- Dítě konflikty nikdy neřeší; nejasné případy (např. dvě různá jména) uvidí rodič.

## Nahrávky
- Výchozí stav **vypnuto**, zapíná rodič pro každé dítě zvlášť. Šifrované stejně jako ostatní data, ukládané po souborech (`[childId, audioId]`), ne v jednom bloku.
- Odhad velikosti: ~160 krátkých nahrávek × ~20 kB ≈ 3–4 MB na dítě (odhad).

## GDPR (data dětí)
- Správce: Jiří Konečný. Minimalizace: na serveru jen šifrované bloby, otisk e-mailu, technická metadata; žádná analytika.
- Souhlas rodiče (s verzí zásad) před zapnutím zálohy; možnost souhlas odvolat = smazat serverová data.
- Právo na výmaz a přenositelnost: export (JSON/ZIP) v aplikaci, smazání dítěte s tombstonem i na serveru.
- Hosting v EU (MiniPC doma; u Supabase zvolit EU region). Firebase Storage s volnou kvótou jen v US → nevhodné.
- Retence: pokusy nejdéle 1 rok, pak agregace (v zařízení i na serveru).
- Pro třídu/školu bude potřeba zpracovatelská smlouva a posouzení (DPIA) – až s M6.

## Výhled: víc rodin a třída
- Model `familyId` → `childId` počítá s více rodinami; server zůstává stejný (izolace podle `familyId`, E2E klíč na rodinu).
- Třída: rodič explicitně sdílí **jen agregovaná čísla** (zvládnuté lekce, počet úloh za týden) podepsaná v zařízení; učitel nevidí pokusy ani nahrávky. Pro školu je vhodnější spravovaný hosting (Supabase Pro v EU) než domácí MiniPC.

## Postup a odhad pracnosti (odhad)
1. Hotovo: lokální profily (M5 krok 1).
2. Export/import ZIP + přenos dítěte na druhé zařízení přes QR (bez serveru) – 2–3 dny.
3. Vrstva synchronizace nezávislá na backendu (outbox, sjednocení, LWW, tombstony) + testy – 3–5 dní.
4. Malý server na MiniPC (blob API, otisk e-mailu, odeslání kódu) + E2E šifrování + obrazovka souhlasu – 4–6 dní.
5. Synchronizace nahrávek (volitelná) – 1–2 dny.
6. Třída/učitel (agregace, sdílení, DPIA) – samostatná etapa, odhad 1–2 týdny.

Celkem pro rodinnou zálohu a synchronizaci (kroky 2–5) cca **10–16 dní práce** (odhad), provozní náklady ~0 Kč/měsíc na MiniPC, případně 25 USD/měsíc při přechodu na Supabase Pro.
