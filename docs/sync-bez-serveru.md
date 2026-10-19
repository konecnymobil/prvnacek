# Synchronizace bez vlastního serveru – návrh (jen dokument, nic se nestaví)

Stav k 2026-10-19. Alternativa k `docs/sync-navrh.md` a k etapě 1 serverové synchronizace (PR #40, `server/`, `src/sync/`). Fakta o Safari/iPadOS jsou ověřená na webu k tomuto datu (odkazy u každého tvrzení); **všechny odhady pracnosti a velikostí jsou odhady** a jsou tak označené.

## Výchozí stav, se kterým počítáme
- Aplikace je PWA na GitHub Pages, hlavní zařízení je iPad (Safari / „Přidat na plochu“, režim standalone).
- Data: jedna IndexedDB na dítě + DB zařízení (profily). Záloha **v3** (`src/storage/backup.ts`) obsahuje všechny profily; export už na iPadu nabízí **sdílecí list** (`navigator.share({ files })`), import je přes `<input type="file">` (`BackupPanel.tsx`).
- `restoreBackup()` dnes data dítěte **přepisuje**. Slučování už ale existuje: `mergeChild()` v `src/sync/merge.ts` (sjednocení pokusů a událostí, vyšší stav lekce vyhrává, nastavení po polích) a `applyRemote()` v `src/sync/client.ts` (sloučí cizí snímek a teprve pak zapíše). Šifrování AES-GCM 256 klíčem rodiny a `sealWithCode()` (PBKDF2, 250 000 iterací) je v `src/sync/crypto.ts`.
- Nahrávky hlasu se nesynchronizují (stejně jako v #40).
- Pozor na izolaci úložiště: aplikace na ploše má **jiné úložiště než stejná stránka v Safari** a je vyjmutá ze 7denního mazání ITP ([OpenPWA – Home Screen storage isolation](https://openpwa.net/reference/storage/home-screen-storage-isolation/), [WebKit – Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)). Soubor proto musí jít importovat přímo v aplikaci na ploše, ne „otevřením v Safari“.

## Varianty

### (a) WebRTC peer-to-peer s párováním přes QR
Obě zařízení musí být **současně online a s aplikací v popředí**; data jdou přímo přes `RTCDataChannel` (šifrované DTLS, navíc klíčem rodiny).
- **Signalizace.** WebRTC potřebuje vyměnit offer/answer (SDP) a ICE kandidáty.
  - *Ruční výměna QR:* A ukáže QR s offerem, B ho naskenuje a ukáže QR s answerem, A ho naskenuje. Bez jakéhokoli serveru, ale dvě skenování kamerou a SDP mívá 1–3 kB (odhad), takže QR je husté. Safari nemá `BarcodeDetector`, takže je potřeba knihovna na dekódování QR (+ knihovna na generování; dnes v projektu žádná není). Pro rodiče nejméně pohodlné.
  - *Veřejný signalizační server:* přes něj jdou jen zašifrované SDP zprávy, žádná data dítěte. Viz (c).
- **NAT, STUN/TURN.** Ve stejné Wi-Fi se zařízení spojí napřímo (mDNS/host kandidáti). Přes různé sítě je potřeba STUN (zdarma, např. Google) a u symetrického NAT (typicky mobilní data) **TURN relé**, jinak spojení selže ([PeerJS FAQ](https://peerjs.com/client/faq)). Bezplatné TURN: Open Relay (Metered, 20 GB/měsíc, vyžaduje účet a klíč) ([metered.ca](https://www.metered.ca/tools/openrelay/)), Cloudflare Realtime TURN (1 000 GB/měsíc zdarma, pak 0,05 USD/GB; vyžaduje účet a vydávání krátkých přihlašovacích údajů) ([Cloudflare](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)). Klíč k TURN ve statické aplikaci na Pages nejde utajit.
- **iPadOS a PWA.** `RTCDataChannel` v Safari funguje i v aplikaci na ploše, ale jakmile se aplikace přepne do pozadí nebo zamkne obrazovka, iOS ji pozastaví a **veškerá síťová komunikace se zastaví** ([Apple Developer Forums, DTS](https://developer.apple.com/forums/thread/799259)); po návratu je nutné spojení vytvořit znovu ([příklad chování PWA](https://github.com/AndrewWayne/oh-my-warp/issues/22)). Synchronizace na pozadí tedy neexistuje, jen „teď, obě zařízení otevřená“.
- **Pohodlí:** střední (doma ve stejné Wi-Fi), nízké s ruční výměnou QR. **Spolehlivost:** dobrá na jedné Wi-Fi, horší přes mobilní data bez TURN. **Soukromí:** výborné, data neopustí zařízení (kromě TURN relé, které vidí jen šifrovaný provoz). **Pracnost (odhad):** 4–6 dní s veřejnou signalizací, 5–7 dní s ruční výměnou QR (skener, rozdělení SDP, testy na dvou iPadech).
- **Znovupoužití:** `snapshot()` + `applyRemote()` + `mergeChild()` beze změny (přenese se stejný šifrovaný snímek jako v #40), `encryptJson/decryptJson`, párovací kód z `crypto.ts` na odvození id místnosti.

### (b) Zašifrovaný soubor přes sdílecí list / AirDrop / iCloud Drive / Soubory
Rodič na zařízení A klepne **„Poslat pokrok“**, aplikace vytvoří zašifrovaný soubor (snímek v3 bez nahrávek) a otevře sdílecí list; rodič zvolí AirDrop, Uložit do Souborů (iCloud Drive) nebo Zprávy. Na zařízení B v aplikaci klepne **„Načíst pokrok“**, vybere soubor a aplikace ho **sloučí** (ne přepíše).
- **Podpora v Safari (ověřeno):** `navigator.share` se soubory a `navigator.canShare({ files })` funguje v Safari na iOS/iPadOS od 15 (s příznakem od 14) ([caniuse – canShare files](https://caniuse.com/mdn-api_navigator_canshare_data_files_parameter), [caniuse – Web Share](https://caniuse.com/web-share), [Apple Developer Forums](https://developer.apple.com/forums/thread/133310)). Volání musí přijít z gesta uživatele a přes HTTPS ([MDN canShare](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare)). Aplikace to už dnes používá u zálohy.
- **Import:** `<input type="file">` otevře výběr ze Souborů (včetně iCloud Drive a stažených AirDrop souborů). Vlastní přípony (např. `.prvnacek`) bývají na iOS ve výběru **zašedlé**; bezpečné je ponechat `application/json` nebo `accept` vynechat a kontrolovat obsah ([WebKit bug 279606](https://bugs.webkit.org/show_bug.cgi?id=279606), [Stack Overflow](https://stackoverflow.com/questions/79960720/input-type-file-accept-fails-on-uncommon-file-extensions-on-ios)).
- **Omezení:** PWA v Safari neumí být cílem sdílení (Web Share Target) ani obsluhou souborů (File Handling API) ([caniuse – Share targets](https://caniuse.com/wf-app-share-targets)), takže AirDrop soubor neotevře přímo aplikaci – uloží se do Stažených souborů a rodič ho vybere v aplikaci. To je jeden krok navíc.
- **Šifrování a párování:** soubor šifrovat **klíčem rodiny** (stejný jako v #40). Klíč se předá jednou: (1) QR kódem s klíčem naskenovaným kamerou druhého zařízení, nebo jednodušeji (2) prvním „párovacím“ souborem zapečetěným `sealWithCode()` a delším jednorázovým kódem, který rodič opíše z obrazovky A (kód nesmí putovat stejným kanálem jako soubor). Dnešní kód `KOT-482-LAMA` (~16 bitů) je pro soubor, který lze zkoušet offline, **příliš slabý**; pro tento účel ho prodloužit na ≥ 60 bitů (např. 5–6 slov z většího seznamu; odhad).
- **Slučování místo přepisu:** import projde `applyRemote()` (stejné id dítěte = sloučit přes `mergeChild()`, nové dítě = přidat). Soubor nese `deviceId` a čas; opakovaný nebo starší import nic nepoškodí, protože slučování je idempotentní. Nahrávky zůstávají v zařízení.
- **Pohodlí:** střední – 2–4 klepnutí na každé straně, ale rodič to zná (jako poslat fotku). **Spolehlivost:** nejvyšší – nezávisí na síti, NAT ani na tom, jestli jsou obě zařízení zapnutá; AirDrop funguje i bez internetu. **Soukromí:** výborné; přes iCloud Drive leží jen šifrovaný soubor (Apple vidí jen šifrovaná data a metadata souboru). **Pracnost (odhad):** 2–3 dny (formát souboru, šifrování, sloučení při importu, párování kódem, testy Playwright na WebKitu); QR párování kamerou +1–2 dny.
- **Znovupoužití:** `buildBackup()`/`downloadBackup()` (sdílecí list), `parseBackup()` (kontrola formátu), `snapshot()` a `applyRemote()` z `client.ts`, `mergeChild()`, `encryptJson`, `sealWithCode`, `generateFamilyKey`. Nový kód je hlavně obálka souboru a dvě tlačítka v rodičovské sekci.

### (c) Veřejná signalizace nebo relé bez ukládání dat (PeerJS Cloud, ntfy)
Server třetí strany jen přepošle zprávy; obsah je E2E šifrovaný klíčem rodiny.
- **PeerJS Cloud** (`0.peerjs.com`): zdarma, slouží jen k signalizaci WebRTC, data jdou mezi zařízeními ([PeerJS FAQ](https://peerjs.com/client/faq)). Komunitní služba **bez SLA**; v minulosti výpadky a hláška „Server has reached its concurrent user limit“, autoři doporučují pro produkci vlastní PeerServer ([PeerServer Cloud](https://peerjs.com/server/cloud), [issue #939](https://github.com/peers/peerjs/issues/939), [issue #671](https://github.com/peers/peerjs/issues/671)). Id si sdílí s ostatními uživateli – nutné náhodné id místnosti.
- **ntfy.sh** jako schránka: zprávy drží 12 h v mezipaměti, přílohy 3 h, zpráva max. 4 kB, příloha max. 15 MB, denní limity na návštěvníka; podmínky zakazují nepřiměřené využívání ([ntfy – privacy](https://docs.ntfy.sh/privacy/), [ntfy – config](https://ntfy.sh/docs/config/)). Díky 12h mezipaměti **zařízení nemusí být online současně** (A pošle, B si do 12 h vyzvedne) – to je jediná „asynchronní“ varianta bez vlastního serveru. Snímek nad 4 kB musí jít jako příloha (3 h) nebo rozdělený na části.
- **Rizika:** služba může kdykoli změnit podmínky, omezit nebo skončit; topic/id je veřejné (kdo ho zná, vidí šifrované zprávy a může posílat smetí – nutné ověřovat AES-GCM a ignorovat cizí). Technická metadata (IP adresa, čas) zpracovává třetí strana, u ntfy v USA ([ntfy – privacy](https://docs.ntfy.sh/privacy/)).
- **Pohodlí:** nejvyšší („Synchronizovat“ jedním klepnutím). **Spolehlivost:** závislá na cizí bezplatné službě, na iPadu jen v popředí (viz (a)). **Soukromí/GDPR:** obsah E2E šifrovaný, ale IP a časy u třetí strany mimo EU → zmínit v zásadách, u dat dětí opatrnost. **Pracnost (odhad):** 3–4 dny (ntfy relé), 4–6 dní (PeerJS + WebRTC).
- **Znovupoužití:** prakticky celý `client.ts` – výměna `api()` za ntfy topic odvozený z `familyId` je malá změna; outbox a slučování zůstávají.

### (d) File System Access API (sdílená složka v iCloud Drive)
Myšlenka: aplikace by si pamatovala soubor v iCloud Drive a sama ho četla/zapisovala. **Na iPadu nejde:** Safari nepodporuje `showOpenFilePicker`/`showSaveFilePicker`/`showDirectoryPicker` v žádné verzi, k dispozici je jen soukromé úložiště OPFS, které nevidí Soubory ani iCloud ([caniuse – showOpenFilePicker](https://caniuse.com/mdn-api_window_showopenfilepicker), [caniuse – File System Access](https://caniuse.com/native-filesystem-api)). Vyřazeno.

## Srovnání (pracnost = odhad)
| | Pohodlí pro rodiče | Spolehlivost na iPadu | Soukromí / GDPR | Pracnost | Současně online? |
|---|---|---|---|---|---|
| (a) WebRTC + ruční QR | nízké (2× skenovat) | dobrá ve stejné Wi-Fi, jen v popředí | výborné | 5–7 dní | ano |
| (a) WebRTC + veřejná signalizace | střední | závisí na NAT/TURN a cizí službě | velmi dobré | 4–6 dní | ano |
| **(b) šifrovaný soubor** | **střední** | **nejvyšší** (bez sítě, AirDrop i offline) | **výborné** | **2–3 dny** | **ne** |
| (c) ntfy relé | nejvyšší | cizí služba bez záruky, limity | dobré (metadata u třetí strany) | 3–4 dny | ne (okno 12 h) |
| (d) File System Access | – | nepodporováno | – | – | – |

## Doporučení
**Hlavní: (b) šifrovaný soubor přes sdílecí list (AirDrop / Soubory / iCloud Drive) se slučováním při importu.** Je to jediná varianta, která na iPadu spolehlivě funguje bez jakékoli služby třetí strany, nezávisí na síti ani na tom, zda jsou zařízení online současně, a staví téměř jen na hotovém kódu (záloha v3, sdílecí list, `applyRemote`/`mergeChild`, šifrování z #40). Nevýhodou je ruční krok na obou zařízeních – pro rodinu se dvěma až třemi zařízeními a synchronizací „jednou za čas“ přijatelný.

**Záložní: (a) WebRTC přímo mezi zařízeními ve stejné Wi-Fi** s párováním přes již spárovaný klíč rodiny; signalizaci řešit nejdřív přes PeerJS Cloud (jen šifrované SDP), a kdyby služba nebyla spolehlivá, ruční výměnou QR. Má smysl, až se ukáže, že ruční soubor rodičům vadí. Serverová synchronizace z #40 zůstává volitelnou možností pro automatické zálohování; varianty se nevylučují, protože sdílejí formát snímku a slučování.

## Etapy (odhad)
1. **Sloučení při importu** (0,5–1 den): import zálohy v3 i nového souboru nabídne „Sloučit“ (výchozí) vs. „Nahradit“; sloučení přes `applyRemote()`. Test Playwright: dvě zařízení → export → import → nic se neztratí, opakovaný import nic nezdvojí.
2. **Šifrovaný soubor a párování kódem** (1,5–2 dny): formát `prvnacek-sync` v1 (`deviceId`, čas, `Cipher`), klíč rodiny, párovací soubor zapečetěný delším jednorázovým kódem, tlačítka „Poslat pokrok“ / „Načíst pokrok“ v rodičovské sekci, `accept` bez vlastní přípony. Test na WebKitu + ruční test na dvou iPadech (AirDrop i iCloud Drive).
3. **Volitelně párování QR kamerou** (1–2 dny): knihovna pro generování a čtení QR, klíč rodiny se nezobrazí jako text.
4. **Volitelně WebRTC ve stejné Wi-Fi** (4–6 dní): jen pokud etapa 2 v praxi nestačí.

Celkem pro doporučenou variantu (etapy 1–2) **cca 2–3 dny práce (odhad)**, provozní náklady 0 Kč.
