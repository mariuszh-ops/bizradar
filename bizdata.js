'use strict';
/* BizRadar — warstwa danych (wersja statyczna).
   Cała logika z dashboard/data.py przeniesiona do przeglądarki: wczytuje
   data/firmy.json raz i liczy filtry / KPI / rankingi / trendy po stronie klienta.
   Funkcje zwracają dokładnie te same kształty co dawne API /api/* . */

const BIZ = (() => {
  let FIRMY = [];            // lista znormalizowanych firm
  let BY_KRS = {};           // krs -> firma
  let BRANZE = {};           // pkd -> {pkd, short, name, count}

  const ready = fetch('data/firmy.json')
    .then(r => { if (!r.ok) throw new Error('firmy.json ' + r.status); return r.json(); })
    .then(d => { BY_KRS = d.firmy; FIRMY = Object.values(d.firmy); BRANZE = d.branze; });

  // ---- pomocnicze ----
  function branzaInfo(pkd) {
    const b = BRANZE[pkd];
    return { pkd, short: b ? b.short : pkd, name: b ? b.name : pkd };
  }
  function median(arr) {
    if (!arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  const sum = a => a.reduce((s, v) => s + v, 0);
  function counter(arr, keyfn) {
    const m = new Map();
    arr.forEach(f => { const k = keyfn(f); m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }
  // most_common(n): malejąco po liczbie, n=null => wszystkie
  function mostCommon(map, n) {
    const e = [...map.entries()].sort((a, b) => b[1] - a[1]);
    return n == null ? e : e.slice(0, n);
  }

  // ---- filtrowanie (odpowiednik _matches / _filtered) ----
  function matches(f, pkd, woj, forma, opp, q) {
    if (pkd !== 'all' && f.pkd !== pkd) return false;
    if (woj !== 'all' && (f.wojewodztwo || '—') !== woj) return false;
    if (forma !== 'all' && (f.forma_prawna || '—') !== forma) return false;
    if (opp === 'yes' && f.status_opp !== 'TAK') return false;
    if (opp === 'no' && f.status_opp === 'TAK') return false;
    if (q) {
      const ql = q.toLowerCase();
      const hay = ['nazwa', 'miejscowosc', 'nip', 'krs']
        .map(k => f[k] == null ? '' : String(f[k])).join(' ').toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  }
  function flt(s) {
    const pkd = s.pkd || 'all', woj = s.woj || 'all', forma = s.forma || 'all',
          opp = s.opp || 'all', q = (s.q || '').trim();
    return FIRMY.filter(f => matches(f, pkd, woj, forma, opp, q));
  }

  // ---- meta() ----
  function meta() {
    const woj = counter(FIRMY, f => f.wojewodztwo || '—');
    const forma = counter(FIRMY, f => f.forma_prawna || '—');
    const yearsSet = new Set();
    FIRMY.forEach(f => (f.lata || []).forEach(y => yearsSet.add(y)));
    const branze = Object.keys(BRANZE).sort().map(k => BRANZE[k]);
    const pairs = m => mostCommon(m, null).map(([label, count]) => ({ label, count }));
    return {
      total: FIRMY.length,
      branze,
      wojewodztwa: pairs(woj),
      formy: pairs(forma),
      lata: [...yearsSet].sort((a, b) => a - b),
    };
  }

  // ---- KPI ----
  function kpi(rows) {
    const rev = rows.map(f => f.przychody_akt).filter(v => v != null);
    const profit = rows.map(f => f.zysk_akt).filter(v => v != null);
    const nOpp = rows.filter(f => f.status_opp === 'TAK').length;
    const nOppKnown = rows.filter(f => f.status_opp === 'TAK' || f.status_opp === 'NIE').length;
    return {
      n_firm: rows.length,
      suma_przychody: rev.length ? sum(rev) : 0,
      mediana_przychody: rev.length ? median(rev) : 0,
      suma_zysk: profit.length ? sum(profit) : 0,
      n_zyskownych: profit.filter(p => p > 0).length,
      n_z_przychodem: rev.length,
      n_opp: nOpp,
      pct_opp: nOppKnown ? nOpp / nOppKnown : null,
    };
  }

  const BUCKETS = [
    [0, 1e5, '< 100 tys'],
    [1e5, 5e5, '100–500 tys'],
    [5e5, 1e6, '0,5–1 mln'],
    [1e6, 5e6, '1–5 mln'],
    [5e6, 2e7, '5–20 mln'],
    [2e7, Infinity, '> 20 mln'],
  ];

  // ---- overview() ----
  function overview(s) {
    const rows = flt(s);
    const revY = {}, profitY = {}, cntY = {};
    rows.forEach(f => {
      for (const [yk, v] of Object.entries(f.finanse || {})) {
        const y = +yk;
        if (v.przychody != null) { revY[y] = (revY[y] || 0) + v.przychody; cntY[y] = (cntY[y] || 0) + 1; }
        if (v.zysk_netto != null) { profitY[y] = (profitY[y] || 0) + v.zysk_netto; }
      }
    });
    const years = Object.keys(revY).map(Number).filter(y => y >= 2015).sort((a, b) => a - b);
    const by_year = years.map(y => ({ rok: y, przychody: revY[y], zysk: profitY[y] || 0, n: cntY[y] || 0 }));

    const formaC = counter(rows, f => f.forma_prawna || '—');
    const wojC = counter(rows, f => f.wojewodztwo || '—');
    const branzaC = counter(rows, f => f.pkd);

    const hist = BUCKETS.map(([lo, hi, label]) => ({
      label,
      count: rows.filter(f => f.przychody_akt != null && f.przychody_akt >= lo && f.przychody_akt < hi).length,
    }));

    return {
      kpi: kpi(rows),
      by_year,
      formy: mostCommon(formaC, 10).map(([label, count]) => ({ label, count })),
      wojewodztwa: mostCommon(wojC, 16).map(([label, count]) => ({ label, count })),
      branze: mostCommon(branzaC, null).map(([pkd, count]) => ({ ...branzaInfo(pkd), count })),
      hist,
    };
  }

  // ---- ranking / firms() ----
  const SORT_KEYS = {
    przychody: 'przychody_akt', zysk: 'zysk_akt', marza: 'marza', yoy: 'yoy',
    suma_bilansowa: 'suma_bilansowa', szac_wartosc: 'szac_wartosc',
    n_lat: 'n_lat', rok_rejestracji: 'rok_rejestracji', nazwa: 'nazwa',
  };
  const ROW_KEYS = ['krs', 'nazwa', 'pkd', 'branza', 'miejscowosc', 'wojewodztwo',
    'forma_prawna', 'status_opp', 'przychody_akt', 'zysk_akt', 'marza', 'yoy', 'cagr',
    'suma_bilansowa', 'szac_wartosc', 'n_lat', 'rok_ostatni', 'rok_rejestracji'];
  function row(f) { const o = {}; ROW_KEYS.forEach(k => o[k] = f[k] === undefined ? null : f[k]); return o; }

  function firms(s) {
    const rows = flt(s);
    const sort = s.sort || 'przychody', dir = s.dir || 'desc', limit = s.limit || 300;
    const key = SORT_KEYS[sort] || 'przychody_akt';
    const reverse = dir !== 'asc';
    if (key === 'nazwa') {
      // jak backend: porównanie po kodzie znaku na nazwie lowercase (nie locale)
      rows.sort((a, b) => {
        const x = (a.nazwa || '').toLowerCase(), y = (b.nazwa || '').toLowerCase();
        const r = x < y ? -1 : x > y ? 1 : 0;
        return reverse ? -r : r;
      });
    } else {
      const noneRank = reverse ? -Infinity : Infinity;
      rows.sort((a, b) => {
        let va = a[key], vb = b[key];
        va = (va == null) ? noneRank : va;
        vb = (vb == null) ? noneRank : vb;
        if (va < vb) return reverse ? 1 : -1;
        if (va > vb) return reverse ? -1 : 1;
        return 0;
      });
    }
    return { firmy: rows.slice(0, limit).map(row), total: rows.length };
  }

  // ---- trendy ----
  function trends(s) {
    const n = s.n || 20, minRev = s.min_rev != null ? s.min_rev : 200000,
          maxAge = s.max_age != null ? s.max_age : 1;
    let rows = flt(s).filter(f =>
      f.yoy != null && (f.przychody_akt || 0) >= minRev && (f.yoy_base || 0) >= minRev);
    if (rows.length) {
      const freshest = rows.reduce((m, f) => (f.yoy_year > m ? f.yoy_year : m), -Infinity);
      const cutoff = freshest - maxAge;
      rows = rows.filter(f => f.yoy_year >= cutoff && (f.yoy_year - f.yoy_prev_year) === 1);
    }
    const up = [...rows].sort((a, b) => b.yoy - a.yoy).slice(0, n).map(row);
    const down = [...rows].sort((a, b) => a.yoy - b.yoy).slice(0, n).map(row);
    return { up, down };
  }

  // ---- profil firmy ----
  function firm(krs) {
    const f = BY_KRS[krs];
    if (!f) return null;
    const out = { ...f, branza_full: branzaInfo(f.pkd) };
    const base = f.przychody_akt;
    const same = FIRMY.filter(g => g.pkd === f.pkd && g.krs !== krs && g.przychody_akt != null);
    if (base != null) same.sort((a, b) => Math.abs(a.przychody_akt - base) - Math.abs(b.przychody_akt - base));
    else same.sort((a, b) => (b.przychody_akt || 0) - (a.przychody_akt || 0));
    out.podobne = same.slice(0, 6).map(g => ({
      krs: g.krs, nazwa: g.nazwa, miejscowosc: g.miejscowosc, przychody_akt: g.przychody_akt,
    }));
    return out;
  }

  return { ready, meta, overview, firms, trends, firm, branzaInfo };
})();
