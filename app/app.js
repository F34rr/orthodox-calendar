'use strict';

const API = window.APP_CONFIG.apiBase.replace(/\/$/, '');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FAST = {
  total:  { label: 'Total abstinence', desc: 'By monastic charter, no food is taken on this day.' },
  strict: { label: 'Strict fast', desc: 'Dry eating (xerophagy): bread, vegetables and fruit. No oil, wine, fish, dairy or meat.' },
  nooil:  { label: 'Food without oil', desc: 'Hot cooked food without oil. No wine, fish, dairy or meat.' },
  oil:    { label: 'Food with oil', desc: 'Hot food with vegetable oil. Wine is usually permitted. No fish, dairy or meat.' },
  caviar: { label: 'Caviar permitted', desc: 'Fish roe is allowed, together with oil and wine. No fish, dairy or meat.' },
  fish:   { label: 'Fish permitted', desc: 'Fish, oil and wine are allowed. No dairy or meat.' },
  dairy:  { label: 'Meat excluded', desc: 'Dairy, eggs and fish are allowed. No meat.' },
  fast:   { label: 'Fast day', desc: 'A day of fasting.' },
  free:   { label: 'Fast-free', desc: 'No fasting, including on Wednesday and Friday.' },
  none:   { label: 'No fast', desc: 'No fasting rule on this day.' },
};
const SEASONS = { lent: 'Great Lent', nativity: 'Nativity Fast', apostles: "Apostles' Fast", dormition: 'Dormition Fast', freeweek: 'Fast-free period' };

const $ = sel => document.querySelector(sel);
const views = { month: $('#month-view'), day: $('#day-view'), saint: $('#saint-view') };

// ------------------------------------------------------------------ dates

const pad = n => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const parseIso = iso => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
function addDays(iso, n) {
  const { y, m, d } = parseIso(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
const julianOf = iso => parseIso(addDays(iso, -13));
function todayIso() { const t = new Date(); return isoOf(t.getFullYear(), t.getMonth() + 1, t.getDate()); }
function weekday(iso) { const { y, m, d } = parseIso(iso); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
const short = m => MONTHS[m - 1].slice(0, 3);

// ------------------------------------------------------------------ data

const mem = new Map();
function api(path) {
  if (mem.has(path)) return mem.get(path);
  const p = fetch(API + path).then(async r => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
    return body;
  });
  mem.set(path, p);
  p.catch(() => mem.delete(path));
  return p;
}
const dayPath = iso => { const { y, m, d } = parseIso(iso); return `/day?y=${y}&m=${m}&d=${d}`; };
const monthPath = (y, m) => `/month?y=${y}&m=${m}`;

// ------------------------------------------------------------------ html helpers

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHEV = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';
const safeUrl = u => (/^https:\/\//.test(u || '') ? u : '');

function acc(title, sub, inner, open = false) {
  return `<div class="acc${open ? ' open' : ''}">
    <button aria-expanded="${open}"><div class="body"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>${CHEV}</button>
    <div class="panel"><div><div class="inner">${inner}</div></div></div>
  </div>`;
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.acc > button');
  if (!btn) return;
  const el = btn.parentElement;
  el.classList.toggle('open');
  btn.setAttribute('aria-expanded', el.classList.contains('open'));
});

function fastChip(fast) {
  const f = FAST[fast.level] || FAST.none;
  return `<span class="fast-chip"><span class="dot ${esc(fast.level)}"></span>${esc(f.label)}</span>`;
}

// ------------------------------------------------------------------ routing

let depth = 0;
function go(hash) { depth++; location.hash = hash; }
function back() {
  if (depth > 0) { depth--; history.back(); return; }
  const r = route();
  if (r.saint != null) location.replace(`#/d/${r.day}`);
  else if (r.day) location.replace(`#/m/${r.day.slice(0, 7)}`);
}

function route() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if (h[0] === 'd' && /^\d{4}-\d\d-\d\d$/.test(h[1])) return { day: h[1], saint: h[2] === 's' ? +h[3] : null };
  if (h[0] === 'm' && /^\d{4}-\d\d$/.test(h[1])) return { month: h[1] };
  return { month: todayIso().slice(0, 7) };
}

let shownMonth = null;
function render() {
  const r = route();
  const month = r.month || (r.day && r.day.slice(0, 7));
  if (month !== shownMonth) renderMonth(month);

  views.month.classList.toggle('behind', !!r.day);
  views.day.classList.toggle('active', !!r.day);
  views.day.classList.toggle('behind', r.saint != null);
  views.saint.classList.toggle('active', r.saint != null);

  if (r.day) renderDay(r.day);
  if (r.saint != null) renderSaint(r.day, r.saint);
}
window.addEventListener('hashchange', render);
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', back));

// Swipe from the left edge goes back (standalone iOS apps have no browser back gesture).
for (const v of [views.day, views.saint]) {
  let sx = null, sy = 0;
  v.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX < 28 ? t.clientX : null; sy = t.clientY; }, { passive: true });
  v.addEventListener('touchend', e => {
    if (sx == null) return;
    const t = e.changedTouches[0];
    if (t.clientX - sx > 70 && Math.abs(t.clientY - sy) < 60) back();
    sx = null;
  }, { passive: true });
}

function onSwipe(el, fn) {
  let sx = null, sy = 0;
  el.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX > 28 ? t.clientX : null; sy = t.clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (sx == null) return;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) fn(dx < 0 ? 1 : -1);
    sx = null;
  }, { passive: true });
}

// ------------------------------------------------------------------ month view

function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

function renderMonth(ym) {
  shownMonth = ym;
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = isoOf(y, m, 1), last = isoOf(y, m, days);
  const j1 = julianOf(first), j2 = julianOf(last);
  $('#month-title').textContent = `${MONTHS[m - 1]} ${y}`;
  $('#month-sub').textContent = `${short(j1.m)} ${j1.d} – ${short(j2.m)} ${j2.d} old style`;

  const today = todayIso();
  const grid = $('#grid');
  let html = '';
  for (let i = 0; i < weekday(first); i++) html += '<div class="cell empty"></div>';
  for (let d = 1; d <= days; d++) {
    const iso = isoOf(y, m, d), j = julianOf(iso);
    const cls = ['cell', weekday(iso) === 0 ? 'sun' : '', iso === today ? 'today' : ''].join(' ');
    html += `<button class="${cls}" data-date="${iso}" aria-label="${MONTHS[m - 1]} ${d}">
      <span class="n">${d}</span><span class="os">${j.d === 1 ? short(j.m) + ' 1' : j.d}</span></button>`;
  }
  grid.innerHTML = html;
  grid.classList.add('fading');
  $('#month-status').textContent = '';

  api(monthPath(y, m)).then(data => {
    if (shownMonth !== ym) return;
    grid.classList.remove('fading');
    for (const day of data.days) {
      const el = grid.querySelector(`[data-date="${isoOf(y, m, day.d)}"]`);
      if (!el || day.error) continue;
      const lvl = day.fast.level;
      if (!['none', 'free'].includes(lvl)) el.insertAdjacentHTML('beforeend', `<span class="dot ${esc(lvl)}"></span>`);
      if (day.fast.season === 'freeweek') el.classList.add('freeweek');
      else if (day.fast.season) el.classList.add('season');
      if (day.greatFeast) el.classList.add('feast');
      if (day.pascha) el.classList.add('pascha', 'feast');
      const parts = [`${MONTHS[m - 1]} ${day.d}`, (FAST[lvl] || FAST.none).label, day.feast].filter(Boolean);
      el.setAttribute('aria-label', parts.join('. '));
    }
    if (data.partial) {
      mem.delete(monthPath(y, m));
      $('#month-status').textContent = 'Some days could not be loaded.';
    }
  }).catch(err => {
    if (shownMonth !== ym) return;
    grid.classList.remove('fading');
    $('#month-status').textContent = `Could not load fasting data — ${err.message}`;
  });

  // Warm the neighbours so paging feels instant.
  setTimeout(() => { for (const n of [-1, 1]) { const [a, b] = shiftMonth(ym, n).split('-').map(Number); api(monthPath(a, b)).catch(() => {}); } }, 1200);
}

$('#grid').addEventListener('click', e => { const c = e.target.closest('.cell[data-date]'); if (c) go(`#/d/${c.dataset.date}`); });
$('#prev-month').addEventListener('click', () => location.replace(`#/m/${shiftMonth(shownMonth, -1)}`));
$('#next-month').addEventListener('click', () => location.replace(`#/m/${shiftMonth(shownMonth, 1)}`));
$('#today-btn').addEventListener('click', () => location.replace(`#/m/${todayIso().slice(0, 7)}`));
onSwipe($('#grid'), dir => location.replace(`#/m/${shiftMonth(shownMonth, dir)}`));

$('#legend-btn').addEventListener('click', e => {
  const lg = $('#legend');
  lg.hidden = !lg.hidden;
  e.currentTarget.setAttribute('aria-expanded', !lg.hidden);
});
$('#legend').innerHTML = [
  ...['strict', 'nooil', 'oil', 'fish', 'dairy', 'total', 'caviar'].map(k => `<div><span class="dot ${k}"></span>${FAST[k].label}</div>`),
  '<div><span class="sw season"></span>Fasting season</div>',
  '<div><span class="sw freeweek"></span>Fast-free period</div>',
  '<div><span class="sw feast"></span>Great Feast</div>',
  '<div><span class="sw today"></span>Today</div>',
].join('');

function renderTodayCard() {
  const iso = todayIso(), card = $('#today-card');
  const { y, m, d } = parseIso(iso), j = julianOf(iso);
  const head = `<p class="eyebrow">Today · ${short(m)} ${d} / ${short(j.m)} ${j.d} O.S.</p>`;
  card.innerHTML = `${head}<div class="skel lg"></div><div class="skel"></div>`;
  api(dayPath(iso)).then(day => {
    const saints = day.commemorations.filter(c => !c.note && !c.minor).slice(0, 3);
    card.innerHTML = `${head}
      <h2>${esc(titleLine(day))}</h2>
      <div class="line">${fastChip(day.fast)}</div>
      <ul>${saints.map(c => `<li>${esc(c.text)}</li>`).join('')}</ul>
      <p class="more">Open today ›</p>`;
  }).catch(() => { card.innerHTML = `${head}<p class="line">Tap to open today.</p>`; });
  card.onclick = () => go(`#/d/${iso}`);
  card.onkeydown = e => { if (e.key === 'Enter') go(`#/d/${iso}`); };
}

// ------------------------------------------------------------------ day view

let shownDay = null;
function renderDay(iso) {
  if (shownDay === iso) return;
  shownDay = iso;
  const box = $('#day-content');
  const { m } = parseIso(iso);
  $('#day-back-label').textContent = MONTHS[m - 1];
  box.scrollTop = 0;
  box.innerHTML = dayHead(iso, null) + '<div class="skel card"></div><div class="skel"></div><div class="skel"></div><div class="skel card"></div>';

  api(dayPath(iso)).then(day => {
    if (shownDay !== iso) return;
    box.innerHTML = dayHtml(iso, day);
    for (const n of [-1, 1]) api(dayPath(addDays(iso, n))).catch(() => {});
  }).catch(err => {
    if (shownDay !== iso) return;
    box.innerHTML = dayHead(iso, null) + `<div class="error">Could not load this day.<br>${esc(err.message)}<br><button class="pill" id="retry">Try again</button></div>`;
    $('#retry').onclick = () => { shownDay = null; renderDay(iso); };
  });
}

// "17th Week after Pentecost. Tone seven." → "17th Week after Pentecost · Tone 7"
function titleLine(day) {
  return [day.title.replace(/\.?\s*Tone \w+\.?$/i, '').replace(/\.$/, ''), day.tone ? `Tone ${day.tone}` : ''].filter(Boolean).join(' · ');
}

function dayHead(iso, day) {
  const { y, m, d } = parseIso(iso), j = julianOf(iso);
  const title = day ? titleLine(day) : '';
  return `<div class="day-head">
    <p class="wd">${WEEKDAYS[weekday(iso)]}</p>
    <h2>${MONTHS[m - 1]} ${d}, ${y}</h2>
    <p class="os">${MONTHS[j.m - 1]} ${j.d}${j.y !== y ? ', ' + j.y : ''} · Old Style</p>
    ${title ? `<p class="title">${esc(title)}</p>` : ''}
  </div>`;
}

function dayHtml(iso, day) {
  let h = dayHead(iso, day);

  const pascha = /Pascha of the Lord|Bright Resurrection/i.test(day.title);
  const feast = day.commemorations.find(c => c.rank >= 6);
  if (pascha) h += `<div class="feast-banner"><p class="eyebrow">Feast of Feasts</p><p>${esc(day.title.replace(/\.$/, ''))}</p></div>`;
  else if (feast) h += `<div class="feast-banner"><p class="eyebrow">Great Feast</p><p>${esc(feast.text.replace(/\.$/, ''))}</p></div>`;

  // Fasting
  const f = FAST[day.fast.level] || FAST.none;
  const season = day.fast.season && day.fast.season !== 'freeweek' ? SEASONS[day.fast.season] : '';
  h += `<h3 class="section-title">Fasting</h3>
    <div class="acc fast-card">
      <button aria-expanded="false"><div class="top body">
        <span class="glyph"><span class="dot ${esc(day.fast.level)}"></span></span>
        <div><div class="label">${esc(f.label)}</div><div class="src">${esc(day.fast.text || season || 'No fasting rule listed')}</div></div>
      </div>${CHEV}</button>
      <div class="panel"><div><div class="inner">
        <p>${esc(f.desc)}</p>
        ${season ? `<p class="credit">Season: ${esc(season)}</p>` : ''}
        <p class="credit">Rule as given by the Russian Orthodox typikon (Holy Trinity calendar). Follow the guidance of your priest or spiritual father.</p>
      </div></div></div>
    </div>`;

  // Commemorations
  const main = [], minor = [];
  day.commemorations.forEach((c, i) => (c.minor ? minor : main).push([c, i]));
  const row = ([c, i]) => {
    const open = c.links.length || (c.oca && c.oca.life);
    const icon = c.oca && safeUrl(c.oca.icon);
    const lead = icon ? `<img class="thumb" loading="lazy" src="${esc(icon)}" alt="">` : c.rank >= 4 ? '<span class="rank"></span>' : '';
    const cls = ['item', c.major || c.rank >= 4 ? 'major' : '', c.minor ? 'minor' : '', c.note ? 'note' : ''].join(' ');
    const body = `${lead}<div class="body"><div class="t">${esc(c.text)}</div></div>`;
    return open ? `<button class="${cls}" data-saint="${i}">${body}${CHEV}</button>` : `<div class="${cls}">${body}</div>`;
  };
  h += `<h3 class="section-title">Commemorations</h3><div class="list">${main.map(row).join('')}</div>`;
  if (minor.length) h += `<div style="height:8px"></div>` + acc('Also commemorated', `${minor.length} more`, `<div class="list" style="margin:0 -16px -16px">${minor.map(row).join('')}</div>`);

  // Scripture
  if (day.readings.length) {
    h += `<h3 class="section-title">Scripture readings</h3>`;
    h += day.readings.map(r => acc(esc(r.ref), esc(r.service.replace(/^\((.*)\)$/, '$1')), readingHtml(r))).join('');
  }

  // Hymns
  if (day.hymns.length) {
    h += `<h3 class="section-title">Troparia &amp; Kontakia</h3>`;
    h += day.hymns.map(x => acc(esc(x.title), '', `<div class="hymn">${hymnHtml(x.text)}</div>`)).join('');
  }

  // Details
  const o = day.orthocal;
  const rows = [
    ['Old Style', `${MONTHS[julianOf(iso).m - 1]} ${julianOf(iso).d}`],
    day.tone ? ['Tone', day.tone] : null,
    o && o.paschaDistance != null ? ['Pascha', o.paschaDistance === 0 ? 'Today' : `${Math.abs(o.paschaDistance)} days ${o.paschaDistance > 0 ? 'after' : 'before'}`] : null,
    season ? ['Season', season] : null,
    o && o.serviceNotes ? ['Service notes', Array.isArray(o.serviceNotes) ? o.serviceNotes.join('; ') : o.serviceNotes] : null,
  ].filter(Boolean);
  h += `<h3 class="section-title">Details</h3><div class="card"><dl class="details">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;

  h += `<h3 class="section-title">Sources</h3><div class="sources">
    <a href="${esc(day.sources.holyTrinity)}" target="_blank" rel="noopener">Holy Trinity Russian Orthodox Church calendar</a> — commemorations, fasting, readings, hymns<br>
    <a href="${esc(day.sources.oca)}" target="_blank" rel="noopener">Orthodox Church in America</a> — icons and lives<br>
    <a href="${esc(day.sources.orthocal)}" target="_blank" rel="noopener">orthocal.info</a> — scripture text (KJV)
  </div>`;
  return h;
}

function readingHtml(r) {
  if (!r.text || !r.text.verses.length) {
    const q = encodeURIComponent(r.ref);
    return `<p class="credit">Full text is not available for this reading. <a href="https://www.biblegateway.com/passage/?search=${q}&version=KJV" target="_blank" rel="noopener">Read on BibleGateway</a></p>`;
  }
  let chapter = null, out = '';
  const multi = new Set(r.text.verses.map(v => v.c)).size > 1;
  for (const v of r.text.verses) {
    if (multi && v.c !== chapter) out += `<span class="ch">Chapter ${v.c}</span>`;
    chapter = v.c;
    out += `<sup>${v.v}</sup>${esc(v.t)} `;
  }
  return `<div class="scripture">${out}</div><p class="credit">${esc(r.text.source)}</p>`;
}

function hymnHtml(text) {
  // Holy Trinity marks chant phrases with "/" and the final phrase with "//".
  return `<p>${esc(text).replace(/\s*\/\/\s*/g, ' //<br>').replace(/\s*(?<!\/)\/(?!\/)\s*/g, ' /<br>')}</p>`;
}

$('#day-content').addEventListener('click', e => {
  const b = e.target.closest('[data-saint]');
  if (b) go(`#/d/${shownDay}/s/${b.dataset.saint}`);
});
$('#prev-day').addEventListener('click', () => location.replace(`#/d/${addDays(shownDay, -1)}`));
$('#next-day').addEventListener('click', () => location.replace(`#/d/${addDays(shownDay, 1)}`));
onSwipe($('#day-content'), dir => location.replace(`#/d/${addDays(shownDay, dir)}`));

// ------------------------------------------------------------------ saint view

let shownSaint = null;
async function renderSaint(iso, idx) {
  const key = `${iso}/${idx}`;
  if (shownSaint === key) return;
  shownSaint = key;
  const box = $('#saint-content');
  box.scrollTop = 0;
  box.innerHTML = '<div class="skel card" style="height:260px;width:60%;margin:12px auto"></div><div class="skel lg"></div><div class="skel"></div><div class="skel"></div>';

  try {
    const day = await api(dayPath(iso));
    const c = day.commemorations[idx];
    if (!c) throw new Error('Commemoration not found');
    const q = new URLSearchParams();
    if (c.links.length) q.set('ht', c.links.map(l => l.url).join('|'));
    if (c.oca && c.oca.life) q.set('oca', c.oca.life);
    if (c.oca && c.oca.troparia) q.set('trop', c.oca.troparia);
    const s = await api(`/saint?${q}`);
    if (shownSaint !== key) return;
    box.innerHTML = saintHtml(c, s);
  } catch (err) {
    if (shownSaint !== key) return;
    box.innerHTML = `<div class="error">Could not load this life.<br>${esc(err.message)}<br><button class="pill" id="retry-s">Try again</button></div>`;
    $('#retry-s').onclick = () => { shownSaint = null; mem.clear(); renderSaint(iso, idx); };
  }
}

function saintHtml(c, s) {
  // OCA serves the same icon in several sizes; keep one (large) copy of each.
  const big = u => u.replace(/\/icons\/(xsm|sm)\//, '/icons/lg/');
  const images = [...new Set([s.icon, ...(s.images || []), c.oca && c.oca.icon].filter(u => safeUrl(u)).map(big))];
  const icon = images[0];
  let h = '<div class="saint-hero">';
  if (icon) h += `<img src="${esc(icon)}" alt="" data-zoom>`;
  if (images.length > 1) h += `<div class="gallery">${images.map(u => `<img src="${esc(u)}" alt="" loading="lazy" data-zoom>`).join('')}</div>`;
  h += `</div><h2 class="saint-title">${esc(c.text.replace(/\.$/, ''))}</h2>`;

  if (!s.lives.length) h += '<p class="saint-sub">No life is available from the sources for this commemoration.</p>';
  for (const life of s.lives) {
    h += `<h3 class="section-title">${esc(life.title || 'Life')}</h3>
      <div class="life">${life.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}</div>
      <p class="credit">Source: <a href="${esc(safeUrl(life.url))}" target="_blank" rel="noopener">${esc(life.source)}</a>${life.copyright ? ` · ${esc(life.copyright)}` : ''}</p>`;
  }
  if (s.hymns && s.hymns.length) {
    h += `<h3 class="section-title">Troparion &amp; Kontakion</h3>`;
    h += s.hymns.map(x => acc(esc(x.title), '', `<div class="hymn">${hymnHtml(x.text)}</div><p class="credit">Orthodox Church in America</p>`, true)).join('');
  }
  return h;
}

$('#saint-content').addEventListener('click', e => {
  const img = e.target.closest('[data-zoom]');
  if (!img) return;
  const lb = $('#lightbox');
  lb.querySelector('img').src = img.src.replace('/icons/sm/', '/icons/lg/');
  lb.hidden = false;
});
$('#lightbox').addEventListener('click', e => { e.currentTarget.hidden = true; });

// ------------------------------------------------------------------ start

renderTodayCard();
render();
document.addEventListener('visibilitychange', () => {
  // Coming back to the app on a new day should refresh "today".
  if (!document.hidden && $('#today-card').dataset.iso !== todayIso()) { $('#today-card').dataset.iso = todayIso(); renderTodayCard(); }
});
$('#today-card').dataset.iso = todayIso();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
