'use strict';
/* BizRadar — profil pojedynczej firmy (wersja statyczna, dane z BIZ).
   Wszystkie kwoty w tys. zł, bez części dziesiętnej (separator tysięcy = spacja). */

// liczba w tysiącach, zaokrąglona do pełnych tysięcy (bez przecinka dziesiętnego)
function kInt(v) { return Math.round(v / 1000); }
function fmtK(v, withCur = true) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return kInt(v).toLocaleString('pl-PL') + (withCur ? ' tys zł' : '');
}
function fmtPct(v, signed = false) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const p = v * 100, s = signed && p > 0 ? '+' : '';
  return s + p.toFixed(1).replace('.', ',') + '%';
}
function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function hexA(hex, a) {
  const n = parseInt((hex || '#97a0bd').slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// plugin: rysuje wartość (w tys., bez przecinka) bezpośrednio na słupkach
const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = '600 11px "Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8ecf6';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const v = ds.data[i];
        if (v === null || v === undefined || isNaN(v)) return;
        const k = kInt(v);
        if (k === 0) return;                       // nie zaśmiecaj zerami
        ctx.fillText(k.toLocaleString('pl-PL'), el.x, el.y + (v < 0 ? 13 : -5));
      });
    });
    ctx.restore();
  },
};

window.addEventListener('DOMContentLoaded', async () => {
  const krs = new URLSearchParams(location.search).get('krs');
  if (!krs) { document.getElementById('content').textContent = 'Brak parametru KRS.'; return; }
  let f;
  try {
    await BIZ.ready;
    f = BIZ.firm(krs);
    if (!f) throw new Error('not found');
  } catch (e) {
    document.getElementById('content').innerHTML = '<div class="loading">Nie znaleziono firmy.</div>'; return;
  }
  document.title = 'BizRadar · ' + (f.nazwa || krs);
  document.getElementById('crumb').textContent = f.nazwa || krs;
  render(f);
});

function render(f) {
  const adres = [f.ulica, [f.kod, f.miejscowosc].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const krsLink = `https://www.bizraport.pl/krs/${f.krs}/${f.slug || ''}`;
  const kpis = [
    { l: `Przychód ${f.rok_ostatni || ''}`, v: fmtK(f.przychody_akt) },
    { l: 'Zysk netto', v: fmtK(f.zysk_akt), cls: (f.zysk_akt ?? 0) < 0 ? 'down-txt' : 'up-txt' },
    { l: 'Marża netto', v: fmtPct(f.marza) },
    { l: 'Suma bilansowa', v: fmtK(f.suma_bilansowa) },
    { l: 'Szac. wartość', v: fmtK(f.szac_wartosc) },
    { l: 'Kapitał zakładowy', v: fmtK(f.kapital) },
  ];

  const fin = Object.entries(f.finanse || {})
    .map(([y, v]) => ({ rok: +y, ...v })).sort((a, b) => b.rok - a.rok);

  document.getElementById('content').innerHTML = `
  <div class="firmhdr">
    <h2>${esc(f.nazwa)} <span class="chip" style="color:${f.branza_full.color};background:${hexA(f.branza_full.color, .16)}">${esc(f.branza_full.short)}</span>
      ${f.status_opp === 'TAK' ? '<span class="chip opp">OPP</span>' : ''}</h2>
    <div class="firmmeta">
      <b>${esc(f.branza_full.name)}</b> · PKD ${esc(f.pkd)}<br>
      KRS <b>${esc(f.krs)}</b> · NIP ${esc(f.nip) || '—'} · REGON ${esc(f.regon) || '—'} · ${esc(f.forma_prawna) || '—'}<br>
      ${adres ? esc(adres) + (f.wojewodztwo && f.wojewodztwo !== '—' ? ' · woj. ' + esc(f.wojewodztwo) : '') + '<br>' : ''}
      <a href="${krsLink}" target="_blank">profil na bizraport.pl ↗</a>
      &nbsp;·&nbsp; <a href="https://wyszukiwarka-krs.ms.gov.pl/" target="_blank">KRS ↗</a>
    </div>
  </div>

  <div class="kpis kpis6" style="grid-template-columns:repeat(6,1fr)">
    ${kpis.map(c => `<div class="kpi"><div class="label">${c.l}</div><div class="value ${c.cls || ''}">${c.v}</div></div>`).join('')}
  </div>

  <div class="tab">
    <div class="grid2">
      <div class="card"><h3>Przychody wg roku <span class="muted">(tys zł)</span></h3><div class="chartbox"><canvas id="cRev"></canvas></div></div>
      <div class="card"><h3>Zysk netto wg roku <span class="muted">(tys zł)</span></h3><div class="chartbox"><canvas id="cProfit"></canvas></div></div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Rachunek wyników ${f.rok_ostatni || ''} <span class="muted">(P&L, tys zł)</span></h3>
        <table class="deftbl pnl">
          ${pnlRow('Przychody ze sprzedaży', f.przychody)}
          ${pnlRow('Pozostałe przychody', f.pozostale_przychody)}
          ${pnlRow('Przychody operacyjne (Σ)', f.przychody_op, true)}
          ${pnlRow('Koszty operacyjne', f.koszty_op === null ? null : -f.koszty_op)}
          ${pnlRow('Zysk operacyjny', f.zysk_op)}
          ${pnlRow('Podatek i pozostałe', f.podatek === null ? null : -f.podatek)}
          ${pnlRow('Zysk netto', f.zysk_akt, true)}
        </table>
      </div>
      <div class="card nopad">
        <table class="grid">
          <thead><tr><th>Rok</th><th class="num">Przychody (tys)</th><th class="num">Zysk netto (tys)</th><th class="num">Marża</th></tr></thead>
          <tbody>
          ${fin.map(r => `<tr>
            <td>${r.rok}</td>
            <td class="num">${fmtK(r.przychody, false)}</td>
            <td class="num ${(r.zysk_netto ?? 0) < 0 ? 'down-txt' : ''}">${fmtK(r.zysk_netto, false)}</td>
            <td class="num">${r.przychody ? fmtPct(r.zysk_netto / r.przychody) : '—'}</td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Dane rejestrowe</h3>
        <table class="deftbl">
          ${defRow('Data rejestracji KRS', f.data_rejestracji)}
          ${defRow('Data ostatniego wpisu', f.data_wpisu)}
          ${defRow('Forma własności', f.forma_wlasnosci)}
          ${defRow('PKD przeważające (KRS)', f.pkd_krs)}
          ${defRow('Status OPP', f.status_opp)}
          ${defRow('Organ reprezentujący', f.organ)}
          ${defRow('Sposób reprezentacji', f.sposob_repr)}
        </table>
      </div>
      <div class="card">
        <h3>Podobne firmy <span class="muted">(${esc(f.branza_full.short)}, zbliżony przychód)</span></h3>
        <table class="deftbl">
          ${(f.podobne || []).map(p => `<tr>
            <td class="k"><a href="firma.html?krs=${p.krs}">${esc(p.nazwa)}</a><br><span class="muted">${esc(p.miejscowosc) || ''}</span></td>
            <td class="v">${fmtK(p.przychody_akt)}</td></tr>`).join('') || '<tr><td class="muted">brak</td></tr>'}
        </table>
        ${f.dzialalnosc ? `<p class="note">${esc(f.dzialalnosc)}</p>` : ''}
      </div>
    </div>
  </div>`;

  drawBars('cRev', fin, 'przychody', '#5b8cff');
  drawBars('cProfit', fin, 'zysk_netto', null);
}

function pnlRow(label, val, total = false) {
  if (val === null || val === undefined) return '';
  const cls = total ? 'class="total"' : '';
  const vcls = val < 0 ? 'down-txt' : '';
  return `<tr><td class="k" ${cls}>${label}</td><td class="v ${vcls}" ${cls}>${fmtK(val, false)}</td></tr>`;
}
function defRow(label, val) {
  if (val === null || val === undefined || val === '') return '';
  return `<tr><td class="k">${label}</td><td class="v">${esc(val)}</td></tr>`;
}

function drawBars(id, fin, key, color) {
  const rows = [...fin].sort((a, b) => a.rok - b.rok);
  Chart.defaults.color = '#97a0bd';
  Chart.defaults.borderColor = '#2a3350';
  new Chart(document.getElementById(id), {
    type: 'bar',
    data: { labels: rows.map(r => r.rok),
      datasets: [{ data: rows.map(r => r[key]),
        backgroundColor: rows.map(r => color || ((r[key] ?? 0) < 0 ? '#ff6b7a' : '#26d0a8')),
        borderRadius: 4 }] },
    plugins: [valueLabels],
    options: { maintainAspectRatio: false,
      layout: { padding: { top: 20, bottom: 4 } },
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => fmtK(c.parsed.y) } } },
      scales: { y: { ticks: { callback: v => kInt(v).toLocaleString('pl-PL') } } } },
  });
}
