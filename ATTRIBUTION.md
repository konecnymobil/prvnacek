# Cizí díla v aplikaci Prvňáček

| Dílo | Soubory | Autor | Licence | Úpravy |
|---|---|---|---|---|
| Písmo **Andika 7.000** (řezy 400, 600, 700) | `src/design/fonts/Andika-{Regular,SemiBold,Bold}.woff2` | © SIL Global | SIL Open Font License 1.1 – `src/design/fonts/OFL.txt` (v nasazené aplikaci `licenses/OFL.txt`), historie `FONTLOG.txt` | žádné (původní WOFF2; Vite jen přidá hash do názvu souboru) |
| Písmo **Playwrite CZ** (variabilní, používá se jen řez 400) | `src/design/fonts/PlaywriteCZ-wght.woff2` | © 2023 The Playwrite Project Authors (TypeTogether: V. Burian, J. Scaglione), https://github.com/TypeTogether/Playwrite | SIL Open Font License 1.1, bez Reserved Font Name – `src/design/fonts/OFL-PlaywriteCZ.txt` (v aplikaci `licenses/OFL-PlaywriteCZ.txt`) | žádné (soubor beze změny; v CSS se používá jen `font-weight: 400`) |

Reserved Font Names „Andika“ a „SIL“: písmo se nesmí upravovat (subset, převod) pod tímto názvem.

| Obrázky **Twemoji v17.0.3** (6 SVG: 1f999 LAMA, 1f969 MASO, 1f50d LUPA, 1fa9a PILA, 1f5fa MAPA, 1facf OSEL) | `src/assets/img/*.svg` | © 2014–2021 Twitter, Inc.; © 2022–dosud Jason Sofonia, Justine De Caires a přispěvatelé (https://github.com/jdecked/twemoji) | CC BY 4.0 – https://creativecommons.org/licenses/by/4.0/ (`LICENSE-GRAPHICS.txt`, v aplikaci `licenses/LICENSE-GRAPHICS.txt`) | žádné |

Vlastní obrázky slov `sele.svg`, `mama.svg`, `pole.svg` (autorka Pastelka) jsou pod licencí projektu. Atribuce Twemoji je také na obrazovce „O aplikaci“.

Zvuky v `public/audio/tts/` jsou vygenerované syntetickým hlasem Microsoft Azure (`cs-CZ-VlastaNeural`) z vlastních textů projektu.

Maskot Kulíšek (`src/assets/mascot/kulisek-{radost,povzbuzeni,premysli}.svg`) je vlastní dílo projektu (autorka Pastelka), bez atribuce.
