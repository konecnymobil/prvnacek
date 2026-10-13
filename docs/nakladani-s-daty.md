# Jak nakládáme s daty

Verze 1.0.0, platná od 2026-10-13.

<!-- Generováno z src/policy/data-policy.json příkazem `npm run gen:policy`. Neupravovat ručně. -->

Prvňáček je aplikace pro malé děti, proto s jejich daty zacházíme co nejopatrněji. Tady je přehled, co aplikace ukládá a jaká pravidla platí.

## Co aplikace ukládá dnes

- Vše je uložené jen v tomto zařízení (v úložišti prohlížeče IndexedDB).
- Pokusy v úlohách (co dítě řešilo, zda správně, jak dlouho) a události jako zkoušky, schválení lekcí nebo předčasné ukončení.
- Stav lekcí (odemčené a schválené).
- Nastavení, včetně tvaru písma a alba nálepek.
- Vlastní nahrávky hlasu rodiče.
- Nic se nikam neodesílá. Aplikace nemá účty, reklamy ani analytiku.
- Záloha je soubor JSON, který si rodič sám stáhne a sám uloží. Za jeho bezpečné uložení odpovídá rodič.

## Pravidla

1. **Data zůstávají v zařízení dítěte.** Data dítěte zůstávají v zařízení, na kterém si hraje. Na jiné zařízení se přenesou jen na žádost rodiče pomocí QR kódu. Volitelně je bude možné uložit na domácí MiniPC s Home Assistantem nebo do cloudu.
2. **Přihlášení bez účtu.** Rodič používá důvěryhodné zařízení a nepotřebuje žádný účet. Dítě si vybere svůj obrázek (avatar), obrázkový PIN je volitelný.
3. **Přezdívka a poznámky jen v zařízení, vždy šifrovaně.** Přezdívka dítěte a poznámky rodiče zůstávají jen v zařízení, dokud se rodič nerozhodne synchronizovat vše najednou na náš server. Za přenos přes QR kód odpovídá rodič. Data jsou vždy šifrovaná; na serveru jsou šifrovaná a přístup k nim mají jen rodiče přes e-mail.
4. **Nahrávky hlasu jen na výslovné přání.** Vlastní nahrávky hlasu se synchronizují jen tehdy, když si to rodič výslovně zapne. Ve výchozím stavu je synchronizace nahrávek vypnutá.
5. **Třída a učitel jen souhrnně.** Propojení se třídou a učitelem přijde později. Učitel uvidí jen souhrnná čísla, nikdy jednotlivé pokusy ani nahrávky.
6. **Historie nejdéle 1 rok.** Historie pokusů se uchovává nejdéle 1 rok. Starší pokusy se převedou na souhrnná čísla a jednotlivé záznamy se smažou.

Při každé změně pravidel zvýšíme číslo verze a tento dokument aktualizujeme.
