# Server synchronizace Prvňáčka (etapa 1)

Malý server bez závislostí (Node 22, TypeScript). V aplikaci se mu říká **náš server**.
Ukládá jen **šifrovaná data** – klíč rodiny vzniká v zařízení (WebCrypto) a na server se nikdy nedostane.

## Co server ukládá

```
DATA_DIR/families/<familyId>/
  auth.json      # jen SHA-256 otisk přístupového tokenu rodiny
  log.jsonl      # append-only log: {seq, deviceId, at, iv, ct} – ct je AES-GCM šifra snímku
  blobs/<name>.json   # šifrované bloby {iv, ct} (připraveno pro další etapy)
```

Párovací schránky jsou **jen v paměti**, 10 minut, vyzvednout jde jednou. Id schránky je SHA-256 kódu; server kód nezná.

## API

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/health` | `{ok:true}` |
| POST | `/v1/pair` | `{id, blob:{salt,iv,ct}}` – uloží zašifrovaný klíč rodiny na 10 min |
| GET | `/v1/pair/:id` | vyzvedne (jednou), limit 20 pokusů / 10 min na IP |
| POST | `/v1/families/:fid/log` | `{deviceId, iv, ct}` → `{seq}`; první zápis rodinu založí (Bearer token) |
| GET | `/v1/families/:fid/log?since=N` | `{entries:[…]}` |
| PUT/GET | `/v1/families/:fid/blobs/:name` | šifrovaný blob |

Proměnné: `PORT` (8787), `HOST` (0.0.0.0), `DATA_DIR` (./data), `ALLOWED_ORIGINS` (čárkou oddělené, výchozí `*`).

## Spuštění na domácím počítači (Docker)

```sh
cd server
docker build -t prvnacek-sync .
docker run -d --name prvnacek-sync --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  -e ALLOWED_ORIGINS=https://konecnymobil.github.io \
  -v prvnacek-sync-data:/data prvnacek-sync
curl http://127.0.0.1:8787/health
```

### Zveřejnění přes Tailscale Funnel (HTTPS zdarma)

```sh
sudo tailscale funnel --bg 8787
tailscale funnel status   # ukáže https://<stroj>.<tailnet>.ts.net
```

Tuto adresu `https://…ts.net` zadá rodič v aplikaci: Rodičovská sekce → Synchronizace přes náš server.

### Nebo za reverzní proxy (Caddy)

```
sync.example.cz {
  reverse_proxy 127.0.0.1:8787
}
```

Aplikace běží na HTTPS, takže i server musí být na HTTPS (jinak prohlížeč požadavky zablokuje).

## Záloha a údržba

Stačí zálohovat volume `/data`. Obsah je nečitelný bez klíče rodiny, který je jen v zařízeních.
Smazání rodiny = smazání složky `families/<familyId>`.

## Známá omezení etapy 1

- Párovací kód (`KOT-482-LAMA`) má jen ~64 000 kombinací. Chrání ho krátká platnost (10 min), jednorázové vyzvednutí a limit pokusů na IP.
  Kdo by ale získal zašifrovanou schránku (např. správce serveru během těch 10 minut), mohl by kód uhodnout zkoušením.
  V další etapě: delší kód nebo potvrzení párování na obou zařízeních.
- Synchronizují se celé snímky (pokrok bez nahrávek), ne jednotlivé změny. Log se zatím nepromazává.
- Žádná obnova klíče: když rodina ztratí všechna zařízení, data na serveru jsou nečitelná (zůstává ruční záloha do souboru).

## Vývoj

```sh
npm run server:test     # z kořene repa: build + unit testy (node:test)
```
