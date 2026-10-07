# Prvňáček

Webová aplikace (PWA) na iPad pro prvňáka: čtení písmen, slabik a slov podle Živé abecedy (Duhová řada / Agáta).
Plán: [`docs/plan-v1.md`](docs/plan-v1.md). Nasazená verze: https://konecnymobil.github.io/prvnacek/

## Vývoj

```bash
npm ci
npm run dev          # http://localhost:5173/prvnacek/
npm run typecheck
npm run build        # dist/ (base /prvnacek/ pro GitHub Pages)
npx playwright install --with-deps webkit
npm run test:e2e     # Playwright ve WebKitu proti produkčnímu buildu (vite preview)
```

## Struktura

| Cesta | Obsah |
|---|---|
| `src/App.tsx`, `src/screens/` | obrazovky; přepínají se jen stavem aplikace, **URL se nemění** (žádný hash/history routing kvůli oprávnění mikrofonu na iOS) |
| `src/content/` | `types.ts` (typy obsahu od Slabikářky), `load.ts` (načtení a minimální validace JSON) |
| `public/content/` | obsah z `content/*.json` (zdroj pravdy: `tools/content/build_content.py`, needitovat ručně) |
| `public/audio/tts/` | finální zvuky `<audioId>.mp3` + `index.json` (Azure TTS, hlas Vlasta) |
| `src/audio/player.ts` | přehrávač: nejdřív vlastní nahrávka rodiče z IndexedDB, potom `audio/tts/<audioId>.mp3` |
| `src/audio/recorder.ts` | MediaRecorder (iOS: `audio/mp4`, jinak webm/opus) |
| `src/storage/db.ts` | IndexedDB (`idb`): pokusy, stav lekcí, nahrávky rodiče (klíč `audioId`), nastavení |
| `src/design/` | design tokeny od Pastelky (`tokens.json` → `tokens.css`, `npm run tokens`), písmo Andika (OFL) |
| `scripts/make-icons.py` | zástupné ikony PWA (`npm run icons`) |
| `.github/workflows/` | `ci.yml` (PR: typecheck, build, Playwright WebKit), `deploy.yml` (push do `main` → GitHub Pages) |

Licence cizích děl: [`ATTRIBUTION.md`](ATTRIBUTION.md).
