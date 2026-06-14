# BizRadar — wersja online (statyczna)

Dashboard profili firm wg PKD na podstawie danych z **bizraport.pl** + **API KRS**
(eventy, sport, kultura, targi, parki rozrywki itd.). Całość działa w przeglądarce —
bez serwera. Hostowane na GitHub Pages.

🔗 **Live:** https://mariuszh-ops.github.io/bizradar/

## Co to jest

Statyczny build dashboardu BizRadar. Cała logika (filtry, KPI, rankingi, trendy r/r,
profile firm) liczona po stronie klienta w [`bizdata.js`](bizdata.js) na podstawie
jednego pliku [`data/firmy.json`](data/firmy.json).

| Plik | Rola |
|---|---|
| `index.html` | strona główna (przegląd / ranking / trendy) |
| `firma.html` | profil pojedynczej firmy |
| `bizdata.js` | warstwa danych — filtry, KPI, rankingi, trendy (port logiki z backendu) |
| `app.js`, `firm.js` | widoki |
| `data/firmy.json` | dane (snapshot wygenerowany ze scrapera) |

## Jak odświeżyć dane

Dane to **snapshot** z konkretnego momentu researchu. Żeby je zaktualizować, w prywatnym
repo scrapera (`pkd-bizraport`):

```bash
python build_static.py          # regeneruje ../bizradar-web/data/firmy.json
cd ../bizradar-web
git add -A && git commit -m "refresh danych" && git push
```

GitHub Pages przebuduje stronę automatycznie (~1 min).

## Lokalnie

`fetch()` danych wymaga serwera HTTP (z `file://` nie zadziała):

```bash
python -m http.server 8000
# -> http://127.0.0.1:8000
```

---

Źródło danych: bizraport.pl + API KRS (publiczny rejestr). Scraper i surowe dane —
w osobnym, prywatnym repo.
