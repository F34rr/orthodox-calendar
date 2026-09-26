// Orthodox Calendar API — a small read-only proxy that gathers each day's data from
//   holytrinityorthodox.com (Russian Church, Julian calendar): commemorations, fasting,
//                            reading references, troparia/kontakia, lives
//   orthocal.info           (Julian calendar API): full KJV scripture text
//   oca.org                 icons, and lives/troparia where Holy Trinity has none
// and returns clean JSON to the app.

const HT_CAL = 'https://www.holytrinityorthodox.com/htc/ocalendar/v2calendar.php';
const ORTHOCAL = 'https://orthocal.info/api/julian';
const OCA = 'https://www.oca.org';
const BIBLE_API = 'https://bible-api.com';
const SOURCE_HOSTS = ['www.holytrinityorthodox.com', 'holytrinityorthodox.com', 'www.oca.org', 'oca.org'];
// Calendar content for a date almost never changes, so cache generously.
const CACHE_SECONDS = 7 * 86400;
const UPSTREAM_CACHE_SECONDS = 30 * 86400;
const API_VERSION = '5';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);

    // Cache per API version so a redeploy never serves responses shaped by old code.
    const cache = caches.default;
    const keyUrl = new URL(url);
    keyUrl.searchParams.set('_v', API_VERSION);
    const cacheKey = new Request(keyUrl.toString());
    const cached = await cache.match(cacheKey);
    if (cached) return withHeaders(cached, cors);

    let res, cacheable = true;
    try {
      if (url.pathname === '/day') res = json(await getDay(dateParams(url)), 200, cors);
      else if (url.pathname === '/month') {
        const data = await getMonth(+url.searchParams.get('y'), +url.searchParams.get('m'));
        cacheable = !data.partial;
        res = json(data, 200, cors);
      }
      else if (url.pathname === '/saint') res = json(await getSaint(url.searchParams), 200, cors);
      else if (url.pathname === '/') res = json({ ok: true, endpoints: ['/day?y=&m=&d=', '/month?y=&m=', '/saint?ht=&oca='] }, 200, cors);
      else res = json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, err.status || 502, cors);
    }
    if (res.status === 200 && cacheable) {
      res.headers.set('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    return res;
  },
};

// ---------------------------------------------------------------- HTTP helpers

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  const origin = request.headers.get('Origin') || '';
  const allow = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin' };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function withHeaders(res, headers) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
  return r;
}

function httpError(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function dateParams(url) {
  const y = +url.searchParams.get('y'), m = +url.searchParams.get('m'), d = +url.searchParams.get('d');
  if (!(y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) throw httpError('Invalid date');
  return { y, m, d };
}

async function fetchRaw(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'OrthodoxCalendarApp/1.0 (personal use)' },
    cf: { cacheTtl: UPSTREAM_CACHE_SECONDS, cacheEverything: true },
  });
  if (!res.ok) throw httpError(`Upstream ${new URL(url).host} returned ${res.status}`, 502);
  return res;
}

async function fetchText(url) {
  const res = await fetchRaw(url);
  const type = res.headers.get('Content-Type') || '';
  const buf = new Uint8Array(await res.arrayBuffer());
  if (/1251/.test(type)) return decodeCp1251(buf);
  const text = new TextDecoder('utf-8').decode(buf);
  // Some older pages declare windows-1251 only in a <meta> tag.
  if (!/utf-8/i.test(type) && /charset=windows-1251/i.test(text.slice(0, 600))) return decodeCp1251(buf);
  return text;
}

async function fetchJson(url) {
  return (await fetchRaw(url)).json();
}

async function tryFetch(fn) {
  try { return await fn(); } catch { return null; }
}

// windows-1251 → string (Workers' TextDecoder only guarantees UTF-8).
const CP1251_HIGH = 'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏ' +
  'ђ‘’“”•–—�™љ›њќћџ' +
  ' ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї' +
  '°±Ііґµ¶·ё№є»јЅѕї';

function decodeCp1251(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    s += b < 0x80 ? String.fromCharCode(b) : b < 0xC0 ? CP1251_HIGH[b - 0x80] : String.fromCharCode(0x410 + b - 0xC0);
  }
  return s;
}

// ---------------------------------------------------------------- HTML helpers

const ENTITIES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–', hellip: '…', laquo: '«',
  raquo: '»', eacute: 'é', egrave: 'è', aelig: 'æ', oelig: 'œ', copy: '©',
  middot: '·', bull: '•', deg: '°', uuml: 'ü', ouml: 'ö', auml: 'ä',
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Tags → text, entities decoded, whitespace collapsed.
function clean(html) {
  return decodeEntities(String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ').trim();
}

// Like clean() but keeps paragraph/line breaks as "\n".
function cleanMultiline(html) {
  const t = String(html).replace(/\s+/g, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '');
  return decodeEntities(t).split('\n').map(l => l.replace(/[ \t\r\f\v]+/g, ' ').trim()).filter(Boolean).join('\n');
}

function absolute(href, base) {
  try {
    const u = new URL(href, base);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.toString();
  } catch { return null; }
}

function links(html, base) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => ({ url: absolute(m[1], base), name: clean(m[2]) }))
    .filter(l => l.url && l.name);
}

// ---------------------------------------------------------------- Holy Trinity day

function htUrl({ y, m, d }, parts) {
  const p = { dt: 1, header: 1, lives: 1, trp: 2, scripture: 1, ...parts };
  return `${HT_CAL}?month=${m}&today=${d}&year=${y}&dt=${p.dt}&header=${p.header}&lives=${p.lives}&trp=${p.trp}&scripture=${p.scripture}`;
}

const TONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

function parseHT(html) {
  const out = { oldStyle: null, title: '', tone: null, fastText: '', fastFree: false, commemorations: [], readings: [], hymns: [] };

  const dh = /class="dataheader">([^<]*)</.exec(html);
  if (dh && dh[1].includes('/')) out.oldStyle = dh[1].split('/')[1].trim();

  const hh = /class="headerheader">([\s\S]*?)(?:<br|<span class="header)/i.exec(html);
  if (hh) out.title = clean(hh[1]);
  const tone = /Tone (\w+)/i.exec(out.title);
  if (tone) out.tone = TONES[tone[1].toLowerCase()] || null;

  const f = /<span class="header(no)?fast">([\s\S]*?)<\/span>/i.exec(html);
  if (f) { out.fastText = clean(f[2]).replace(/\.$/, ''); out.fastFree = !!f[1]; }

  // Index of the <p> tag that carries a given section class (or end of document).
  const idx = s => { const i = html.indexOf(s); return i < 0 ? html.length : html.lastIndexOf('<p', i); };
  const headerEnd = html.indexOf('pheaderheader');
  const scripIdx = idx('pscriptureheader'), tropIdx = idx('ptroparionheader');

  // Commemorations: one per <br>-separated line.
  const commStart = html.indexOf('<span class="normaltext">', headerEnd < 0 ? 0 : headerEnd);
  if (commStart >= 0 && commStart < Math.min(scripIdx, tropIdx)) {
    const block = html.slice(commStart, Math.min(scripIdx, tropIdx));
    for (const raw of block.split(/<br\s*\/?>/i)) {
      const rank = /typicon-(\w)/.exec(raw);
      const body = raw.replace(/<span class="typicon-\w">[^<]*<\/span>/g, '').replace(/<img[^>]*jcal_img\/(\w)\.gif[^>]*>/i, '');
      const imgRank = /jcal_img\/(\w)\.gif/.exec(raw);
      const text = clean(body);
      if (!text) continue;
      const r = (rank || imgRank || [])[1];
      out.commemorations.push({
        rank: r && /\d/.test(r) ? +r : 0,
        minor: /minortext/.test(raw) || r === 'o',
        major: /<b>/i.test(body),
        note: /^\s*<i>[\s\S]*<\/i>\s*$/i.test(body.replace(/<\/?span[^>]*>/g, '')),
        text,
        links: dedupeBy(links(body, HT_CAL), l => l.url),
      });
    }
  }

  // Scripture references.
  if (scripIdx < html.length) {
    const block = html.slice(scripIdx, tropIdx > scripIdx ? tropIdx : html.length);
    const inner = block.slice(block.indexOf('<span class="normaltext">') + 1 || 0);
    for (const raw of inner.split(/<br\s*\/?>/i)) {
      const m = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*)/i.exec(raw);
      if (m) out.readings.push({ ref: clean(m[2]), service: clean(m[3]) });
      else if (clean(raw) && !/The Scripture Readings/.test(clean(raw))) out.readings.push({ ref: clean(raw), service: '' });
    }
  }

  // Troparia & kontakia.
  if (tropIdx < html.length) {
    const block = html.slice(tropIdx);
    for (const m of block.matchAll(/<p>\s*<b>([\s\S]*?)<\/b>\s*(?:<br\s*\/?>)?([\s\S]*?)<\/p>/gi)) {
      const title = clean(m[1]).replace(/\s*[—\-]+\s*$/, '');
      const text = clean(m[2]);
      if (title && text) out.hymns.push({ title, text });
    }
  }
  return out;
}

function dedupeBy(arr, key) {
  const seen = new Set();
  return arr.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

// Fasting category from Holy Trinity's wording.
function classifyFast(text, free) {
  const t = (text || '').toLowerCase();
  if (/meat is excluded|excluding meat/.test(t)) return 'dairy';
  if (free || /fast-free|fast free|end of the great lent/.test(t)) return 'free';
  if (/^eve of/.test(t)) return 'none';
  if (/total abstinence|full abstention|abstinence from food/.test(t)) return 'total';
  if (/strict fast|bread, vegetables|xerophagy|dry eating|uncooked/.test(t)) return 'strict';
  if (/without oil/.test(t)) return 'nooil';
  if (/caviar/.test(t)) return 'caviar';
  if (/fish/.test(t)) return 'fish';
  if (/with oil|wine and oil/.test(t)) return 'oil';
  if (/meat is excluded|excluding meat|dairy|cheese/.test(t)) return 'dairy';
  if (/fast/.test(t)) return 'fast';
  return 'none';
}

function classifySeason(text, title) {
  const t = `${text} ${title}`.toLowerCase();
  if (/^eve of/.test((text || '').toLowerCase())) return null;
  if (/end of the great lent|sviatki|bright week|trinity week|fast-free week|maslenitsa|cheesefare/.test(t)) return 'freeweek';
  if (/great lent|holy week|passion week|great and holy/.test(t)) return 'lent';
  if (/nativity fast|nativity \(st\. philip|st\. philip/.test(t)) return 'nativity';
  if (/apostles|peter (and|&) paul|petrov/.test(t)) return 'apostles';
  if (/dormition/.test(t) && /fast/.test(t)) return 'dormition';
  return null;
}

// ---------------------------------------------------------------- scripture text

const BOOKS = {
  genesis: 'GEN', exodus: 'EXO', leviticus: 'LEV', numbers: 'NUM', deuteronomy: 'DEU', joshua: 'JOS', judges: 'JDG',
  ruth: 'RUT', '1 samuel': '1SA', '2 samuel': '2SA', '1 kings': '1KI', '2 kings': '2KI', '3 kings': '1KI', '4 kings': '2KI',
  '1 chronicles': '1CH', '2 chronicles': '2CH', ezra: 'EZR', nehemiah: 'NEH', esther: 'EST', job: 'JOB',
  psalm: 'PSA', psalms: 'PSA', proverbs: 'PRO', ecclesiastes: 'ECC', 'song of songs': 'SNG', 'song of solomon': 'SNG',
  isaiah: 'ISA', jeremiah: 'JER', lamentations: 'LAM', ezekiel: 'EZK', daniel: 'DAN', hosea: 'HOS', joel: 'JOL',
  amos: 'AMO', obadiah: 'OBA', jonah: 'JON', micah: 'MIC', nahum: 'NAM', habakkuk: 'HAB', zephaniah: 'ZEP',
  haggai: 'HAG', zechariah: 'ZEC', malachi: 'MAL', wisdom: 'WIS', 'wisdom of solomon': 'WIS', sirach: 'SIR',
  baruch: 'BAR', matthew: 'MAT', mark: 'MRK', luke: 'LUK', john: 'JHN', acts: 'ACT', romans: 'ROM',
  '1 corinthians': '1CO', '2 corinthians': '2CO', galatians: 'GAL', ephesians: 'EPH', philippians: 'PHP',
  colossians: 'COL', '1 thessalonians': '1TH', '2 thessalonians': '2TH', '1 timothy': '1TI', '2 timothy': '2TI',
  titus: 'TIT', philemon: 'PHM', hebrews: 'HEB', james: 'JAS', '1 peter': '1PE', '2 peter': '2PE', '1 john': '1JN',
  '2 john': '2JN', '3 john': '3JN', jude: 'JUD', revelation: 'REV',
};

function parseRef(ref) {
  const m = /^(.*?)\s*(\d+):(\d+)/.exec(ref);
  if (!m) return null;
  const name = m[1].toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').replace(/^st /, '').trim();
  return { book: BOOKS[name] || null, chapter: +m[2], verse: +m[3] };
}

async function readingText(ref, orthocalReadings) {
  const p = parseRef(ref);
  if (p && p.book) {
    const hit = orthocalReadings.find(r => {
      const v = r.passage && r.passage[0];
      return v && v.book === p.book && v.chapter === p.chapter && v.verse === p.verse;
    });
    if (hit) return { source: 'orthocal.info (KJV)', verses: hit.passage.map(v => ({ c: v.chapter, v: v.verse, t: v.content, p: !!v.paragraph_start })) };
  }
  if (!p) return null;
  const query = ref.replace(/,\s+/g, ',');
  const data = await tryFetch(() => fetchJson(`${BIBLE_API}/${encodeURIComponent(query)}?translation=kjv`));
  if (data && Array.isArray(data.verses) && data.verses.length) {
    return { source: 'bible-api.com (KJV)', verses: data.verses.map(v => ({ c: v.chapter, v: v.verse, t: v.text.replace(/\s+/g, ' ').trim(), p: false })) };
  }
  return null;
}

// ---------------------------------------------------------------- OCA icons/lives

function julianOf({ y, m, d }) {
  // Julian date = civil date minus 13 days (valid 1900–2099).
  const dt = new Date(Date.UTC(y, m - 1, d) - 13 * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const pad = n => String(n).padStart(2, '0');

function parseOCAList(html) {
  const out = [];
  for (const m of html.matchAll(/<article class="saint[^"]*">([\s\S]*?)<\/article>/g)) {
    const a = m[1];
    const name = /<h2 class="name">([\s\S]*?)<\/h2>/.exec(a);
    const img = /<img[^>]*src="([^"]+)"/.exec(a);
    const life = /href="(\/saints\/lives\/[^"]+)"/.exec(a);
    const trop = /href="(\/saints\/troparia\/[^"]+)"/.exec(a);
    if (!name) continue;
    out.push({
      name: clean(name[1]),
      icon: img ? img[1].replace('/icons/xsm/', '/icons/sm/') : null,
      life: life ? OCA + life[1] : null,
      troparia: trop ? OCA + trop[1] : null,
    });
  }
  return out;
}

const TITLE_WORDS = new Set(('st sts saint saints martyr martyrs hieromartyr hieromartyrs venerable venerables holy new great ' +
  'righteous blessed apostle apostles prophet prophetess virgin virgin-martyr child-martyr child-martyrs priest deacon ' +
  'bishop archbishop metropolitan patriarch hierarch sainted repose commemoration icon most theotokos of the and ' +
  'with in at from our father fathers mother monk nun abbot abbess hegumen confessor passion-bearer wonderworker ' +
  'fool-for-christ uncovering transfer relics council ecumenical synaxis king queen prince princess empress emperor').split(' '));

// Names and places too common to identify a saint on their own.
const COMMON_WORDS = new Set(('john nicholas george alexander peter paul michael basil gregory theodore sergius seraphim ' +
  'andrew james stephen mary maria anna elizabeth sophia helen demetrius constantine vladimir anthony athanasius ' +
  'constantinople jerusalem alexandria antioch rome egypt palestine syria mount athos kiev kyiv moscow russia ' +
  'greek greece serbia georgia celtic british christ lord god jesus church').split(' '));

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9À-ɏ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function properWords(text) {
  const words = text.replace(/\([^)]*\)/g, ' ').split(/[^A-Za-zÀ-ɏ-]+/).filter(Boolean);
  return [...new Set(words.filter(w => /^[A-Z]/.test(w) && w.length >= 4 && !TITLE_WORDS.has(w.toLowerCase())).map(norm))];
}

// Score of how well a Holy Trinity line and an OCA entry share proper names (0 = no match).
function matchScore(words, ocaName) {
  const name = ` ${norm(ocaName)} `;
  const hits = words.filter(w => name.includes(` ${w} `));
  const uncommon = hits.some(w => !COMMON_WORDS.has(w));
  const score = hits.length + (uncommon ? 0.5 : 0);
  return score >= 2 || uncommon ? score : 0;
}

// Each OCA entry goes to the Holy Trinity line it matches best; each line keeps its best entry.
function assignOCA(items, ocaList) {
  const words = items.map(it => (it.note ? [] : properWords(it.text)));
  const result = items.map(() => ({ oca: null, score: 0 }));
  for (const o of ocaList) {
    let bestI = -1, best = 0;
    words.forEach((w, i) => { const s = w.length ? matchScore(w, o.name) : 0; if (s > best) { best = s; bestI = i; } });
    if (bestI >= 0 && best > result[bestI].score) result[bestI] = { oca: o, score: best };
  }
  return result.map(r => r.oca);
}

// ---------------------------------------------------------------- endpoints

async function getDay(date) {
  const j = julianOf(date);
  const [htHtml, orthocal, ocaHtml] = await Promise.all([
    fetchText(htUrl(date)),
    tryFetch(() => fetchJson(`${ORTHOCAL}/${date.y}/${date.m}/${date.d}/`)),
    tryFetch(() => fetchText(`${OCA}/saints/lives/${j.y}/${pad(j.m)}/${pad(j.d)}`)),
  ]);
  const ht = parseHT(htHtml);
  const ocaList = ocaHtml ? parseOCAList(ocaHtml) : [];
  const orthocalReadings = (orthocal && orthocal.readings) || [];

  const readings = await Promise.all(ht.readings.map(async r => ({ ...r, text: await readingText(r.ref, orthocalReadings) })));
  const top = ht.commemorations.reduce((a, c) => Math.max(a, c.rank), 0);

  return {
    date: `${date.y}-${pad(date.m)}-${pad(date.d)}`,
    julian: `${j.y}-${pad(j.m)}-${pad(j.d)}`,
    oldStyle: ht.oldStyle,
    title: ht.title,
    tone: ht.tone || (orthocal && orthocal.tone) || null,
    fast: { level: classifyFast(ht.fastText, ht.fastFree), text: ht.fastText, season: classifySeason(ht.fastText, ht.title) },
    greatFeast: top >= 6,
    rank: top,
    orthocal: orthocal ? {
      titles: orthocal.titles || [], feasts: orthocal.feasts || [], feastLevel: orthocal.feast_level,
      feastLevelDesc: orthocal.feast_level_description, fastDesc: orthocal.fast_level_desc,
      fastException: orthocal.fast_exception_desc, serviceNotes: orthocal.service_notes, paschaDistance: orthocal.pascha_distance,
    } : null,
    commemorations: (() => { const oca = assignOCA(ht.commemorations, ocaList); return ht.commemorations.map((c, i) => ({ ...c, oca: oca[i] })); })(),
    readings,
    hymns: ht.hymns,
    sources: {
      holyTrinity: 'https://www.holytrinityorthodox.com/htc/orthodox-calendar/',
      oca: `${OCA}/saints/lives/${j.y}/${pad(j.m)}/${pad(j.d)}`,
      orthocal: `https://orthocal.info/calendar/julian/${date.y}/${date.m}/${date.d}/`,
    },
  };
}

async function getMonth(y, m) {
  if (!(y > 1900 && y < 2200 && m >= 1 && m <= 12)) throw httpError('Invalid month');
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let retries = 12; // stay well inside the Workers limit of 50 subrequests per call
  const list = await Promise.all(Array.from({ length: days }, async (_, i) => {
    const date = { y, m, d: i + 1 };
    const url = htUrl(date, { dt: 1, header: 1, lives: 1, trp: 0, scripture: 0 });
    let html = await tryFetch(() => fetchText(url));
    if (!html && retries-- > 0) {
      await new Promise(r => setTimeout(r, 400));
      html = await tryFetch(() => fetchText(url));
    }
    if (!html) return { d: i + 1, error: true };
    const ht = parseHT(html);
    const top = ht.commemorations.reduce((a, c) => Math.max(a, c.rank), 0);
    const feast = ht.commemorations.find(c => c.rank === top && !c.note) || ht.commemorations[0];
    return {
      d: i + 1,
      oldStyle: ht.oldStyle,
      title: ht.title,
      fast: { level: classifyFast(ht.fastText, ht.fastFree), text: ht.fastText, season: classifySeason(ht.fastText, ht.title) },
      rank: top,
      greatFeast: top >= 6,
      pascha: /Pascha of the Lord|Bright Resurrection/i.test(ht.title),
      feast: feast ? feast.text : '',
    };
  }));
  return { y, m, days: list, partial: list.some(x => x.error) };
}

function checkSourceUrl(u) {
  let url;
  try { url = new URL(u); } catch { throw httpError('Bad url'); }
  if (!SOURCE_HOSTS.includes(url.hostname)) throw httpError('Host not allowed');
  url.protocol = 'https:';
  return url.toString();
}

function parseHTLife(html, url) {
  const title = /class="(?:ofd_los_header|header12)"[^>]*>([\s\S]*?)<\/p>/i.exec(html) || /<title>([\s\S]*?)<\/title>/i.exec(html);
  const paras = [...html.matchAll(/<p class="(?:ofd_los_body|body10)"[^>]*>([\s\S]*?)<\/p>/gi)].map(m => m[1]);
  const images = [...html.matchAll(/<img[^>]*src="([^"]+\.(?:jpe?g|png|gif))"/gi)].map(m => absolute(m[1], url)).filter(Boolean);
  let copyright = null;
  const body = [];
  for (const p of paras) {
    const t = cleanMultiline(p);
    if (!t) continue;
    if (/^©|^©|copyright/i.test(t)) copyright = t;
    else if (/^commemorated on/i.test(t)) continue;
    else body.push(...t.split('\n'));
  }
  return { source: 'Holy Trinity Russian Orthodox Church', url, title: title ? clean(title[1]).replace(/:\s*$/, '') : '', paragraphs: body, images, copyright };
}

function parseOCALife(html, url) {
  const art = /<article>([\s\S]*?)<\/article>/i.exec(html);
  const a = art ? art[1] : html;
  const title = /<h1>([\s\S]*?)<\/h1>/i.exec(a);
  const big = /rel="featured-saint" href="([^"]+)"/.exec(a);
  const content = a.replace(/<header[\s\S]*?<\/header>/i, '').replace(/<figure[\s\S]*?<\/figure>/gi, '');
  const paragraphs = content.split(/<p[^>]*>/i).map(p => clean(p)).filter(t => t && t.length > 1);
  return { source: 'Orthodox Church in America', url, title: title ? clean(title[1]) : '', paragraphs, images: big ? [big[1]] : [], copyright: null };
}

function parseOCATroparia(html) {
  const out = [];
  for (const m of html.matchAll(/<article>\s*<h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/article>/gi)) {
    const text = cleanMultiline(m[2]);
    if (text) out.push({ title: clean(m[1]), text });
  }
  return out;
}

async function getSaint(params) {
  const htUrls = (params.get('ht') || '').split('|').filter(Boolean).slice(0, 6).map(checkSourceUrl);
  const ocaLife = params.get('oca') ? checkSourceUrl(params.get('oca')) : null;
  const ocaTrop = params.get('trop') ? checkSourceUrl(params.get('trop')) : null;

  const [htLives, oca, trop] = await Promise.all([
    Promise.all(htUrls.map(u => tryFetch(async () => parseHTLife(await fetchText(u), u)))),
    ocaLife ? tryFetch(async () => parseOCALife(await fetchText(ocaLife), ocaLife)) : null,
    ocaTrop ? tryFetch(async () => parseOCATroparia(await fetchText(ocaTrop))) : null,
  ]);

  const lives = htLives.filter(l => l && l.paragraphs.length);
  // Use the OCA life when Holy Trinity has none (or only a short cross-reference).
  const htWords = lives.reduce((n, l) => n + l.paragraphs.join(' ').split(' ').length, 0);
  if (oca && oca.paragraphs.length && htWords < 120) lives.push(oca);

  const images = [...lives.flatMap(l => l.images), ...(oca ? oca.images : [])];
  return { lives, icon: images[0] || null, images: [...new Set(images)], hymns: trop || [] };
}
