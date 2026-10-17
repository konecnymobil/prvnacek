# Jak nakládáme s daty

Verze 1.2.0, platná od 2026-10-17.

<!-- Generováno z src/policy/data-policy.json příkazem `npm run gen:policy`. Neupravovat ručně. -->

Prvňáček je aplikace pro malé děti, proto s jejich daty zacházíme co nejopatrněji. Tady je přehled, co aplikace ukládá a jaká pravidla platí.

## Co aplikace ukládá dnes

- Vše je uložené jen v tomto zařízení (v úložišti prohlížeče IndexedDB).
- Každé dítě má v zařízení vlastní profil (jméno a zvířátko). Pokrok, nastavení, album i nahrávky jsou uložené odděleně pro každé dítě.
- Při přechodu na profily aplikace jednou uložila v zařízení zálohu původních dat; rodič si ji může stáhnout v rodičovské sekci.
- Pokusy v úlohách (co dítě řešilo, zda správně, jak dlouho) a události jako zkoušky, schválení lekcí nebo předčasné ukončení.
- Stav lekcí (odemčené a schválené).
- Nastavení, včetně tvaru písma a alba nálepek.
- Vlastní nahrávky hlasu rodiče.
- Nic se nikam neodesílá. Aplikace nemá účty, reklamy ani analytiku.
- Záloha je soubor JSON, který si rodič sám stáhne a sám uloží. Za jeho bezpečné uložení odpovídá rodič.

## Pravidla

1. **Data zůstávají v zařízení dítěte.** Data dítěte zůstávají v zařízení, na kterém si hraje. Na jiné zařízení se přenesou jen na žádost rodiče pomocí QR kódu. Volitelně je bude možné uložit na náš server.
2. **Přihlášení bez účtu.** Rodič používá důvěryhodné zařízení a nepotřebuje žádný účet. Dítě si vybere svůj obrázek (avatar), obrázkový PIN je volitelný.
3. **Přezdívka a poznámky jen v zařízení, vždy šifrovaně.** Přezdívka dítěte a poznámky rodiče zůstávají jen v zařízení, dokud se rodič nerozhodne synchronizovat vše najednou na náš server. Za přenos přes QR kód odpovídá rodič. Data jsou vždy šifrovaná; na serveru jsou šifrovaná a přístup k nim mají jen rodiče přes e-mail.
4. **Nahrávky hlasu jen na výslovné přání.** Vlastní nahrávky hlasu se synchronizují jen tehdy, když si to rodič výslovně zapne. Ve výchozím stavu je synchronizace nahrávek vypnutá.
5. **Třída a učitel jen souhrnně.** Propojení se třídou a učitelem přijde později. Učitel uvidí jen souhrnná čísla, nikdy jednotlivé pokusy ani nahrávky.
6. **Historie nejdéle 1 rok.** Historie pokusů se uchovává nejdéle 1 rok. Starší pokusy se převedou na souhrnná čísla a jednotlivé záznamy se smažou.
7. **Ztracený kód zálohy.** Když rodič ztratí kód pro obnovu zálohy a nezobrazí ho na žádném propojeném zařízení, obnoví ho ověřením přes e-mail připojený k profilu. Pokud ztratí i přístup k tomuto e-mailu, záloha je nenávratně ztracená a nikdo ji nedokáže obnovit.
8. **E-mail jen jako klíč k záloze.** E-mail rodiče slouží jen k propojení zálohy a obnovy. Server neukládá čitelnou adresu, ale jen její zašifrovaný otisk, takže ji správce (Jiří Konečný) nevidí a nemá k ní přístup. Při obnově rodič adresu zadá, server porovná otisk a pošle kód na zadanou adresu, aniž by ji uložil.
9. **Správce údajů a server.** Správcem údajů je Jiří Konečný. Zálohy ukládáme na náš server.

## Poznámka u zálohy

Pro budoucí zálohu na server (zatím není aktivní): e-mail rodiče se na serveru ukládá jen jako zašifrovaný otisk, nikdy jako čitelná adresa, a správce (Jiří Konečný) k němu nemá přístup. Když ztratíš kód zálohy i přístup k e-mailu, záloha je nenávratně ztracená.

Při každé změně pravidel zvýšíme číslo verze a tento dokument aktualizujeme.
