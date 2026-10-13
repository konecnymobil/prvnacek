# M5 – rozhodnutí Jiřího (dodatek k design/profil-data.md)

Datum: 2026-10-13. Tento dokument doplňuje a v případě rozporu **má přednost** před `design/profil-data.md` (ten upravuje Slabikářka/Pastelka, ne repozitář aplikace). Pravidla pro uživatele jsou v `src/policy/data-policy.json` → obrazovka „Jak nakládáme s daty“ a `docs/nakladani-s-daty.md`.

1. **Umístění dat:** data dítěte zůstávají na zařízení dítěte. Přenos na další zařízení jen na požadavek rodiče přes QR kód. Volitelně uložení na MiniPC s Home Assistantem nebo v cloudu. → Sync vrstva (outbox) zůstává, ale je vypnutá, dokud ji rodič nezapne; primární přenos = QR.
2. **Přihlášení:** rodič na důvěryhodném zařízení bez účtu; dítě vybírá avatar; obrázkový PIN volitelný. → Žádné účty v M5; rodičovský PIN/brána lokálně.
3. **Přezdívka a poznámky rodiče** jen na zařízení, dokud je rodič nechce synchronizovat jako celek na náš server. Přenos přes QR je na odpovědnost rodiče. Data vždy šifrovaná; na serveru šifrovaná, přístup jen rodičů přes e-mail.
4. **Vlastní nahrávky hlasu** se synchronizují jen na výslovné přání; výchozí stav vypnuto (`syncEnabled: false`).
5. **Třída/učitel** později, architektura připravená (`SchoolClass`). Učitel vidí jen souhrnná čísla, žádné pokusy ani nahrávky.
6. **Retence:** historie pokusů max. 1 rok, poté agregace do souhrnných čísel.

**Povinné:** dokument o nakládání s daty je viditelný v aplikaci, generuje se z jedné konfigurace (`npm run gen:policy`) a test hlídá aktuálnost markdownu, výpis všech pravidel na obrazovce a zvýšení `policyVersion` při změně pravidel.

## Doplnění 2026-10-13 (policyVersion 1.1.0)

7. **Ztracený kód zálohy:** pokud ho rodič ztratí a nezobrazí na žádném propojeném zařízení, obnoví ho ověřením přes e-mail připojený k profilu. Při ztrátě i e-mailu je záloha nenávratně ztracená – akceptováno.
8. **E-mail jen jako propojovací klíč:** server ukládá jen zašifrovaný/hashovaný otisk, nikdy čitelnou adresu; správce k adrese nemá přístup. Při obnově rodič adresu zadá, server porovná otisk a pošle kód na zadanou adresu, aniž by ji uložil.
9. **Správce údajů:** Jiří Konečný.
10. **Server:** běží na Jiřího MiniPC s Home Assistantem.

Krátká poznámka (`backupNote` v `data-policy.json`) se zobrazuje i u Zálohy a obnovy v rodičovské sekci s označením, že platí pro budoucí zálohu na server (zatím neaktivní).
