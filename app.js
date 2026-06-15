'use strict';
/* BizRadar — strona główna (przegląd / ranking / trendy).
   Wersja statyczna: dane z BIZ (bizdata.js), bez backendu. */

// ---------- formatery ----------
const PLZ = ' zł';
function fmtPLN(v, withCur = true) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  let out;
  if (a >= 1e9) out = (v / 1e9).toFixed(2) + ' mld';
  else if (a >= 1e6) out = (v / 1e6).toFixed(2) + ' mln';
  else if (a >= 1e3) out = s + (a / 1e3).toFixed(0) + ' tys';
  else out = Math.round(v).toString();
  out = out.replace('.', ',');
  return withCur ? out + PLZ : out;
}
function fmtPct(v, signed = false) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const p = (v * 100);
  const sign = signed && p > 0 ? '+' : '';
  return sign + p.toFixed(1).replace('.', ',') + '%';
}
function fmtInt(v) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pl-PL');
}
function pkdClass(pkd) { return pkd === '93.12.Z' ? 'sport' : 'eventy'; }
function pkdColor(pkd) { return pkd === '93.12.Z' ? '#26d0a8' : '#c08bff'; }
function chip(branza, pkd) { return `<span class="chip ${pkdClass(pkd)}">${branza}</span>`; }
// kwota + rok w nawiasie (np. "5,41 mln zł (2024)") — używane w Trendach
function revYear(v, year) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return `${fmtPLN(v)}${year ? ` <span class="muted">(${year})</span>` : ''}`;
}
function yoyBadge(v) {
  if (v === null || v === undefined) return '<span class="badge neutral">b/d</span>';
  const cls = v > 0.001 ? 'up' : v < -0.001 ? 'down' : 'neutral';
  return `<span class="badge ${cls}">${fmtPct(v, true)}</span>`;
}

// ---------- stan ----------
const state = { pkd: 'all', woj: 'all', forma: 'all', opp: 'all', q: '',
                sort: 'przychody', dir: 'desc', tab: 'overview' };
const charts = {};
let META = null;

// ---------- init ----------
Chart.defaults.color = '#97a0bd';
Chart.defaults.font.family = '"Segoe UI",system-ui,sans-serif';
Chart.defaults.borderColor = '#2a3350';
Chart.defaults.plugins.legend.labels.boxWidth = 12;

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await BIZ.ready;
  } catch (e) {
    document.getElementById('sourceInfo').textContent = 'Błąd wczytywania danych.';
    return;
  }
  META = BIZ.meta();
  buildControls();
  bindEvents();
  refreshAll();
});

function buildControls() {
  const pkdSel = document.getElementById('ctlPkd');
  META.branze.forEach(b => {
    const o = document.createElement('option');
    o.value = b.pkd; o.textContent = `${b.short} — ${b.pkd} (${b.count})`;
    pkdSel.appendChild(o);
  });
  const wojSel = document.getElementById('ctlWoj');
  META.wojewodztwa.forEach(w => {
    const o = document.createElement('option');
    o.value = w.label; o.textContent = `${w.label} (${w.count})`;
    wojSel.appendChild(o);
  });
  const formaSel = document.getElementById('ctlForma');
  META.formy.forEach(f => {
    const o = document.createElement('option');
    o.value = f.label; o.textContent = `${f.label.length > 34 ? f.label.slice(0, 32) + '…' : f.label} (${f.count})`;
    formaSel.appendChild(o);
  });
  document.getElementById('sourceInfo').innerHTML =
    `${fmtInt(META.total)} firm · lata ${META.lata[0]}–${META.lata[META.lata.length - 1]}<br>źródło: bizraport.pl + API KRS`;
}

function bindEvents() {
  const map = { ctlPkd: 'pkd', ctlWoj: 'woj', ctlForma: 'forma', ctlOpp: 'opp' };
  Object.entries(map).forEach(([id, key]) =>
    document.getElementById(id).addEventListener('change', e => { state[key] = e.target.value; refreshAll(); }));
  let t;
  document.getElementById('ctlSearch').addEventListener('input', e => {
    clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); refreshAll(); }, 250);
  });
  document.querySelectorAll('.tabs button').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.querySelectorAll('#rankTable th[data-sort]').forEach(th =>
    th.addEventListener('click', () => {
      const s = th.dataset.sort;
      if (state.sort === s) state.dir = state.dir === 'desc' ? 'asc' : 'desc';
      else { state.sort = s; state.dir = s === 'nazwa' ? 'asc' : 'desc'; }
      loadRanking();
    }));
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + tab));
  if (tab === 'ranking') loadRanking();
  if (tab === 'trends') loadTrends();
}

function refreshAll() {
  loadOverview();
  if (state.tab === 'ranking') loadRanking();
  if (state.tab === 'trends') loadTrends();
}

// ---------- KPI + przegląd ----------
function loadOverview() {
  const o = BIZ.overview(state);
  const k = o.kpi;
  const kpis = [
    { label: 'Firmy', value: fmtInt(k.n_firm), sub: `${fmtInt(k.n_z_przychodem)} z danymi fin.` },
    { label: 'Suma przychodów', value: fmtPLN(k.suma_przychody), sub: 'ostatni rok / firma' },
    { label: 'Mediana przychodu', value: fmtPLN(k.mediana_przychody), sub: 'typowa firma' },
    { label: 'Zyskownych', value: k.n_z_przychodem ? fmtPct(k.n_zyskownych / k.n_z_przychodem) : '—',
      sub: `${fmtInt(k.n_zyskownych)} firm · zysk Σ ${fmtPLN(k.suma_zysk)}` },
    { label: 'Status OPP', value: k.pct_opp === null ? 'b/d' : fmtPct(k.pct_opp),
      sub: `${fmtInt(k.n_opp)} organizacji OPP` },
  ];
  document.getElementById('kpis').innerHTML = kpis.map(c =>
    `<div class="kpi"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`).join('');

  renderYearChart(o.by_year);
  renderBranzaChart(o.branze);
  renderHistChart(o.hist);
  renderBarList('formaList', o.formy);
  renderBarList('wojList', o.wojewodztwa);
}

function mkChart(id, cfg) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), cfg);
}

function renderYearChart(rows) {
  const labels = rows.map(r => r.rok);
  mkChart('chartYear', {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Przychody', data: rows.map(r => r.przychody),
          backgroundColor: '#5b8cff', borderRadius: 4, yAxisID: 'y', order: 2 },
        { type: 'line', label: 'Zysk netto', data: rows.map(r => r.zysk),
          borderColor: '#26d0a8', backgroundColor: '#26d0a8', tension: .25,
          pointRadius: 2, yAxisID: 'y', order: 1 },
      ],
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' },
        tooltip: { callbacks: {
          label: c => `${c.dataset.label}: ${fmtPLN(c.parsed.y)}`,
          footer: items => `firm w roku: ${rows[items[0].dataIndex].n}` } } },
      scales: { y: { ticks: { callback: v => fmtPLN(v, false) } } },
    },
  });
}

function renderBranzaChart(rows) {
  mkChart('chartBranza', {
    type: 'doughnut',
    data: { labels: rows.map(r => `${r.short} (${r.count})`),
      datasets: [{ data: rows.map(r => r.count),
        backgroundColor: rows.map(r => pkdColor(r.pkd)), borderColor: '#171c2e', borderWidth: 2 }] },
    options: { maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'bottom' } } },
  });
}

function renderHistChart(rows) {
  mkChart('chartHist', {
    type: 'bar',
    data: { labels: rows.map(r => r.label),
      datasets: [{ label: 'liczba firm', data: rows.map(r => r.count),
        backgroundColor: '#5b8cff', borderRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { ticks: { precision: 0 } } } },
  });
}

function renderBarList(id, rows) {
  const max = Math.max(1, ...rows.map(r => r.count));
  document.getElementById(id).innerHTML = rows.map(r =>
    `<div class="barrow"><div class="lbl" title="${r.label}">${r.label}</div>
      <div class="track"><div class="fill" style="width:${(r.count / max * 100).toFixed(1)}%"></div></div>
      <div class="val">${fmtInt(r.count)}</div></div>`).join('');
}

// ---------- ranking ----------
function loadRanking() {
  const res = BIZ.firms({ ...state, sort: state.sort, dir: state.dir, limit: 500 });
  document.getElementById('rankHint').textContent =
    `${fmtInt(res.total)} firm w filtrze · pokazano ${res.firmy.length}`;
  const tb = document.querySelector('#rankTable tbody');
  tb.innerHTML = res.firmy.map((f, i) => `
    <tr onclick="openFirm('${f.krs}')">
      <td class="num">${i + 1}</td>
      <td class="name">${f.nazwa || '—'}${f.status_opp === 'TAK' ? '<span class="chip opp">OPP</span>' : ''}
        <div class="muted">${f.miejscowosc || ''}${f.wojewodztwo && f.wojewodztwo !== '—' ? ' · ' + f.wojewodztwo : ''}</div></td>
      <td>${chip(f.branza, f.pkd)}</td>
      <td class="num">${f.rok_ostatni || '—'}</td>
      <td class="num">${fmtPLN(f.przychody_akt)}</td>
      <td class="num ${(f.zysk_akt ?? 0) < 0 ? 'down-txt' : ''}">${fmtPLN(f.zysk_akt)}</td>
      <td class="num">${fmtPct(f.marza)}</td>
      <td class="num">${yoyBadge(f.yoy)}</td>
      <td class="num">${fmtPLN(f.suma_bilansowa)}</td>
      <td class="num">${fmtPLN(f.szac_wartosc)}</td>
      <td class="num">${f.n_lat || '—'}</td>
    </tr>`).join('');
  document.querySelectorAll('#rankTable th[data-sort]').forEach(th => {
    th.classList.toggle('sorted', th.dataset.sort === state.sort);
    th.classList.toggle('asc', th.dataset.sort === state.sort && state.dir === 'asc');
  });
}

// ---------- trendy ----------
function loadTrends() {
  const t = BIZ.trends({ ...state, n: 20, min_rev: 200000 });
  const row = f => `
    <tr onclick="openFirm('${f.krs}')">
      <td class="name">${f.nazwa || '—'} ${chip(f.branza, f.pkd)}
        <div class="muted">${f.miejscowosc || ''}</div></td>
      <td class="num">${revYear(f.yoy_base, f.yoy_prev_year)}</td>
      <td class="num">${revYear(f.yoy_cur, f.yoy_year)}</td>
      <td class="num">${yoyBadge(f.yoy)}</td>
    </tr>`;
  const empty = '<tr><td class="muted" colspan="4">brak danych</td></tr>';
  document.querySelector('#trUp tbody').innerHTML = t.up.map(row).join('') || empty;
  document.querySelector('#trDown tbody').innerHTML = t.down.map(row).join('') || empty;
}

function openFirm(krs) { window.open('firma.html?krs=' + encodeURIComponent(krs), '_blank'); }
