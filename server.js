'use strict';
// Cliffy sunucusu: API + statik dosyalar + video yayını. Harici paket gerektirmez.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildSeed } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MEDIA_DIR = path.join(__dirname, 'media');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
// Video bağlantılarını imzalayan gizli anahtar. Ayarlanmazsa her açılışta yenisi üretilir (eski bağlantılar geçersizleşir).
const MEDIA_SECRET = process.env.MEDIA_SECRET || crypto.randomBytes(32).toString('hex');
// Demo ödeme/reklam: açıkken satın alma ücretsiz çalışır. Gerçek içerik gelince DEMO_PAYMENTS=false yapılmalı.
const DEMO_PAYMENTS = process.env.DEMO_PAYMENTS !== 'false';
const TRUST_PROXY = !!process.env.RENDER; // Render'da gerçek IP, X-Forwarded-For başlığında gelir

// İş kuralları: fiyatlar, bonuslar, limitler.
const CONFIG = {
  demoPayments: DEMO_PAYMENTS,
  // Android uygulamasındaki ödüllü reklam. ADMOB_REWARDED_ID verilmezse Google'ın test reklamı gösterilir.
  admob: {
    rewardedId: process.env.ADMOB_REWARDED_ID || 'ca-app-pub-3940256099942544/5224354917',
    testing: !process.env.ADMOB_REWARDED_ID,
  },
  signupBonus: 100,
  dailyBonus: 20,
  adUnlocksPerDay: 5,
  guestsPerHourPerIp: 20, // mobil operatörlerde çok kişi aynı IP'yi paylaşır, o yüzden çok düşük tutulmamalı
  adminFailsPerHour: 10,
  videoLinkHours: 6,
  coinPacks: [
    { id: 'c100', coins: 100, bonus: 0, price: 49.99 },
    { id: 'c300', coins: 300, bonus: 30, price: 129.99 },
    { id: 'c600', coins: 600, bonus: 100, price: 249.99, tag: 'Popüler' },
    { id: 'c1500', coins: 1500, bonus: 400, price: 549.99, tag: 'En avantajlı' },
  ],
  vipPlans: [
    { id: 'week', name: 'Haftalık VIP', days: 7, price: 149.99 },
    { id: 'month', name: 'Aylık VIP', days: 30, price: 399.99, tag: '%35 indirim' },
  ],
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.m4v': 'video/mp4',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t',
};
const UPLOAD_EXT = new Set(['.mp4', '.m4v', '.webm', '.mov', '.jpg', '.jpeg', '.png', '.webp']);
const PROTECTED_EXT = new Set(['.mp4', '.m4v', '.webm', '.mov']); // /media/ altında imzasız açılamaz
const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' };

// ---------- Veritabanı ----------
// DATABASE_URL varsa (Supabase/Postgres) tüm veri tek satırda JSON olarak orada tutulur; yoksa data/db.json kullanılır.
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const pool = process.env.DATABASE_URL
  ? new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 })
  : null;

let db;
async function loadDb() {
  if (pool) {
    await pool.query('CREATE TABLE IF NOT EXISTS app_state (id int PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
    const r = await pool.query('SELECT data FROM app_state WHERE id = 1');
    if (r.rows.length) { db = r.rows[0].data; return; }
  } else if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return;
  }
  db = buildSeed();
  await saveNow();
  console.log('İlk çalıştırma: demo veriler oluşturuldu.');
}

let saveTimer = null;
let saving = Promise.resolve(); // kayıtlar sırayla yapılır, biri bitmeden diğeri başlamaz
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 200);
}
function saveNow() {
  saving = saving.then(() => {
    if (pool) {
      return pool.query(
        'INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
        [JSON.stringify(db)],
      );
    }
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }).catch((e) => console.error('Veri kaydedilemedi:', e.message));
  return saving;
}

// ---------- Yardımcılar ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const newId = () => crypto.randomBytes(6).toString('hex');
const now = () => Date.now();
const today = () => new Date().toISOString().slice(0, 10);

function send(res, status, data) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJson(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'İstek çok büyük')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Geçersiz JSON')); }
    });
    req.on('error', reject);
  });
}

function getUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const user = token && db.users.find((u) => u.token === token);
  if (!user) throw new HttpError(401, 'Oturum bulunamadı');
  return user;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ---------- Hız sınırı (aynı IP'den çok fazla istek) ----------
const hits = new Map(); // "tür:ip" → { count, reset }
const clientIp = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
function tooMany(req, kind, max) {
  const h = hits.get(kind + ':' + clientIp(req));
  return !!h && h.reset > now() && h.count >= max;
}
function hit(req, kind, windowMs = 36e5) {
  const k = kind + ':' + clientIp(req);
  let h = hits.get(k);
  if (!h || h.reset <= now()) { h = { count: 0, reset: now() + windowMs }; hits.set(k, h); }
  h.count++;
}
setInterval(() => { for (const [k, h] of hits) if (h.reset <= now()) hits.delete(k); }, 6e5).unref();

function requireAdmin(req) {
  if (tooMany(req, 'admin', CONFIG.adminFailsPerHour)) throw new HttpError(429, 'Çok fazla hatalı deneme. Bir saat sonra tekrar dene.');
  if (!safeEqual(req.headers['x-admin-key'] || '', ADMIN_KEY)) { hit(req, 'admin'); throw new HttpError(403, 'Yetkisiz'); }
}

// ---------- Süreli video bağlantıları ----------
const mediaSig = (p, exp) => crypto.createHmac('sha256', MEDIA_SECRET).update(p + ':' + exp).digest('hex').slice(0, 32);
function signMedia(url) {
  if (!url || !url.startsWith('/media/')) return url; // dış servis (Bunny vb.) adresleri olduğu gibi kalır
  const exp = Math.floor(now() / 1000) + CONFIG.videoLinkHours * 3600;
  return `${url}?exp=${exp}&sig=${mediaSig(url, exp)}`;
}
function checkMediaSig(pathname, query) {
  if (!PROTECTED_EXT.has(path.extname(pathname).toLowerCase())) return; // kapak resimleri herkese açık
  const exp = Number(query.get('exp'));
  if (!(exp * 1000 > now()) || !safeEqual(query.get('sig') || '', mediaSig(pathname, exp))) {
    throw new HttpError(403, 'Video bağlantısının süresi dolmuş. Sayfayı yenile.');
  }
}

function requireDemoPayments() {
  if (!DEMO_PAYMENTS) throw new HttpError(503, 'Ödeme sistemi çok yakında açılacak');
}

const findSeries = (id) => db.series.find((s) => s.id === id) || (() => { throw new HttpError(404, 'Dizi bulunamadı'); })();
const findEpisode = (id) => db.episodes.find((e) => e.id === id) || (() => { throw new HttpError(404, 'Bölüm bulunamadı'); })();
const episodesOf = (seriesId) => db.episodes.filter((e) => e.series_id === seriesId).sort((a, b) => a.episode_no - b.episode_no);

const isVip = (u) => u.vip_until > now();
const priceOf = (ep, s) => (ep.price ?? s.price);
const isFree = (ep, s) => ep.episode_no <= s.free_episodes || priceOf(ep, s) === 0;
const canWatch = (u, ep, s) => isFree(ep, s) || isVip(u) || u.unlocked.includes(ep.id);

function adsLeft(u) {
  if (u.ad_log.date !== today()) u.ad_log = { date: today(), count: 0 };
  return Math.max(0, CONFIG.adUnlocksPerDay - u.ad_log.count);
}

function addTx(u, type, coins, note, amountTl = 0) {
  db.transactions.push({ id: newId(), user_id: u.id, type, coins, amount_tl: amountTl, note, created_at: now() });
}

// ---------- Görünümler (istemciye giden veri) ----------
function seriesCard(s) {
  return {
    id: s.id, title: s.title, description: s.description, category: s.category, cover: s.cover, colors: s.colors,
    free_episodes: s.free_episodes, price: s.price, views: s.views, created_at: s.created_at,
    episode_count: episodesOf(s.id).length,
  };
}

function episodeView(ep, s, u) {
  const open = canWatch(u, ep, s);
  return {
    id: ep.id, series_id: ep.series_id, episode_no: ep.episode_no, title: ep.title, duration: ep.duration,
    price: priceOf(ep, s), free: isFree(ep, s), locked: !open,
    video_url: open ? signMedia(ep.video_url) : null, // kilitli bölümün adresi asla gönderilmez
  };
}

function meView(u) {
  return {
    id: u.id, name: u.name, coins: u.coins, vip: isVip(u), vip_until: u.vip_until,
    ads_left: adsLeft(u), can_checkin: u.last_checkin !== today(),
  };
}

function profileView(u) {
  const history = Object.entries(u.history)
    .map(([sid, h]) => {
      const s = db.series.find((x) => x.id === sid);
      return s && { series: seriesCard(s), episode_no: h.episode_no, seconds: h.seconds, updated_at: h.updated_at };
    })
    .filter(Boolean)
    .sort((a, b) => b.updated_at - a.updated_at);
  const favorites = u.favorites.map((id) => db.series.find((s) => s.id === id)).filter(Boolean).map(seriesCard);
  const transactions = db.transactions.filter((t) => t.user_id === u.id).slice(-20).reverse();
  return { ...meView(u), history, favorites, transactions, unlocked_count: u.unlocked.length };
}

// ---------- Router ----------
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
}

// ---------- Kullanıcı API'si ----------
route('GET', '/api/config', () => CONFIG);
route('GET', '/api/health', () => ({ ok: true, storage: pool ? 'postgres' : 'file' })); // gizli bilgi içermez

route('POST', '/api/auth/guest', ({ req }) => {
  if (tooMany(req, 'guest', CONFIG.guestsPerHourPerIp)) throw new HttpError(429, 'Çok fazla yeni hesap açıldı. Biraz sonra tekrar dene.');
  hit(req, 'guest');
  const u = {
    id: newId(),
    token: crypto.randomBytes(24).toString('hex'),
    name: 'Misafir' + Math.floor(1000 + Math.random() * 9000),
    coins: CONFIG.signupBonus,
    vip_until: 0,
    unlocked: [],
    favorites: [],
    history: {},
    ad_log: { date: today(), count: 0 },
    last_checkin: null,
    created_at: now(),
  };
  db.users.push(u);
  addTx(u, 'bonus', CONFIG.signupBonus, 'Hoş geldin hediyesi');
  save();
  return { token: u.token, me: meView(u) };
});

route('GET', '/api/me', ({ req }) => profileView(getUser(req)));

route('GET', '/api/series', () => ({ series: db.series.map(seriesCard) }));

route('GET', '/api/series/:id', ({ req, params }) => {
  const u = getUser(req);
  const s = findSeries(params.id);
  return {
    series: seriesCard(s),
    episodes: episodesOf(s.id).map((e) => episodeView(e, s, u)),
    favorite: u.favorites.includes(s.id),
    resume: u.history[s.id] || null,
  };
});

route('POST', '/api/episodes/:id/unlock', async ({ req, params }) => {
  const u = getUser(req);
  const body = await readJson(req);
  const ep = findEpisode(params.id);
  const s = findSeries(ep.series_id);
  if (!canWatch(u, ep, s)) {
    if (body.method === 'coins') {
      const price = priceOf(ep, s);
      if (u.coins < price) throw new HttpError(402, 'Yetersiz jeton');
      u.coins -= price;
      addTx(u, 'unlock', -price, `${s.title} · Bölüm ${ep.episode_no}`);
    } else if (body.method === 'ad') {
      // DEMO: Gerçekte reklam ağı (AdMob SSV) sunucuya doğrulama gönderir.
      requireDemoPayments();
      if (adsLeft(u) <= 0) throw new HttpError(429, 'Bugünkü reklam hakkın doldu');
      u.ad_log.count++;
    } else {
      throw new HttpError(400, 'Geçersiz yöntem');
    }
    u.unlocked.push(ep.id);
    save();
  }
  return { episode: episodeView(ep, s, u), me: meView(u) };
});

route('POST', '/api/progress', async ({ req }) => {
  const u = getUser(req);
  const body = await readJson(req);
  const ep = findEpisode(body.episode_id);
  const s = findSeries(ep.series_id);
  if (!canWatch(u, ep, s)) throw new HttpError(403, 'Bölüm kilitli');
  const prev = u.history[s.id];
  if (!prev || prev.episode_id !== ep.id) s.views = (s.views || 0) + 1;
  u.history[s.id] = {
    episode_id: ep.id, episode_no: ep.episode_no,
    seconds: Math.max(0, Math.floor(Number(body.seconds) || 0)), updated_at: now(),
  };
  save();
  return { ok: true };
});

route('POST', '/api/favorites/:id', ({ req, params }) => {
  const u = getUser(req);
  const s = findSeries(params.id);
  const i = u.favorites.indexOf(s.id);
  if (i >= 0) u.favorites.splice(i, 1); else u.favorites.unshift(s.id);
  save();
  return { favorite: i < 0 };
});

route('POST', '/api/checkin', ({ req }) => {
  const u = getUser(req);
  if (u.last_checkin === today()) throw new HttpError(409, 'Bugünkü ödülü zaten aldın');
  u.last_checkin = today();
  u.coins += CONFIG.dailyBonus;
  addTx(u, 'checkin', CONFIG.dailyBonus, 'Günlük giriş ödülü');
  save();
  return { bonus: CONFIG.dailyBonus, me: meView(u) };
});

// DEMO ödeme: Gerçekte Google Play / App Store satın alması RevenueCat webhook'u ile doğrulanır.
route('POST', '/api/purchase/coins', async ({ req }) => {
  requireDemoPayments();
  const u = getUser(req);
  const body = await readJson(req);
  const pack = CONFIG.coinPacks.find((p) => p.id === body.pack_id);
  if (!pack) throw new HttpError(400, 'Paket bulunamadı');
  const total = pack.coins + pack.bonus;
  u.coins += total;
  addTx(u, 'purchase', total, `${total} jeton satın alındı`, pack.price);
  save();
  return { me: meView(u) };
});

route('POST', '/api/purchase/vip', async ({ req }) => {
  requireDemoPayments();
  const u = getUser(req);
  const body = await readJson(req);
  const plan = CONFIG.vipPlans.find((p) => p.id === body.plan_id);
  if (!plan) throw new HttpError(400, 'Plan bulunamadı');
  u.vip_until = Math.max(now(), u.vip_until) + plan.days * 864e5;
  addTx(u, 'vip', 0, `${plan.name} satın alındı`, plan.price);
  save();
  return { me: meView(u) };
});

// ---------- Yönetim API'si ----------
const toInt = (v, def) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? def : Math.max(0, Math.round(Number(v))));
const validColors = (c) => (Array.isArray(c) && c.length === 2 && c.every((x) => /^#[0-9a-f]{6}$/i.test(x)) ? c : null);

function seriesInput(b, base = {}) {
  const title = String(b.title ?? base.title ?? '').trim();
  if (!title) throw new HttpError(400, 'Dizi adı zorunlu');
  return {
    title,
    description: String(b.description ?? base.description ?? '').trim(),
    category: String(b.category ?? base.category ?? '').trim() || 'Genel',
    cover: b.cover !== undefined ? (String(b.cover || '').trim() || null) : (base.cover ?? null),
    colors: validColors(b.colors) || base.colors || ['#ff3d6e', '#3a1c71'],
    free_episodes: toInt(b.free_episodes, base.free_episodes ?? 5),
    price: toInt(b.price, base.price ?? 30),
  };
}

route('GET', '/api/admin/overview', ({ req }) => {
  requireAdmin(req);
  const revenue = db.transactions.reduce((a, t) => a + (t.amount_tl || 0), 0);
  return {
    stats: {
      users: db.users.length,
      vip: db.users.filter(isVip).length,
      revenue: Math.round(revenue * 100) / 100,
      unlocks: db.users.reduce((a, u) => a + u.unlocked.length, 0),
      views: db.series.reduce((a, s) => a + (s.views || 0), 0),
    },
    series: db.series.map((s) => ({ ...s, episodes: episodesOf(s.id).map((e) => ({ ...e, video_url: signMedia(e.video_url) })) })),
  };
});

route('POST', '/api/admin/series', async ({ req }) => {
  requireAdmin(req);
  const s = { id: newId(), ...seriesInput(await readJson(req)), views: 0, created_at: now() };
  db.series.push(s);
  save();
  return s;
});

route('PUT', '/api/admin/series/:id', async ({ req, params }) => {
  requireAdmin(req);
  const s = findSeries(params.id);
  Object.assign(s, seriesInput(await readJson(req), s));
  save();
  return s;
});

route('DELETE', '/api/admin/series/:id', ({ req, params }) => {
  requireAdmin(req);
  const s = findSeries(params.id);
  db.series = db.series.filter((x) => x !== s);
  db.episodes = db.episodes.filter((e) => e.series_id !== s.id);
  save();
  return { ok: true };
});

route('POST', '/api/admin/series/:id/episodes', async ({ req, params }) => {
  requireAdmin(req);
  const s = findSeries(params.id);
  const b = await readJson(req);
  const videoUrl = String(b.video_url || '').trim();
  if (!videoUrl) throw new HttpError(400, 'Video adresi zorunlu');
  const eps = episodesOf(s.id);
  const no = eps.length ? eps[eps.length - 1].episode_no + 1 : 1;
  const ep = {
    id: newId(), series_id: s.id, episode_no: no,
    title: String(b.title || '').trim() || `Bölüm ${no}`,
    video_url: videoUrl,
    duration: toInt(b.duration, 0),
    price: b.price === '' || b.price === null || b.price === undefined ? null : toInt(b.price, null),
    created_at: now(),
  };
  db.episodes.push(ep);
  save();
  return ep;
});

route('DELETE', '/api/admin/episodes/:id', ({ req, params }) => {
  requireAdmin(req);
  const ep = findEpisode(params.id);
  db.episodes = db.episodes.filter((e) => e !== ep);
  episodesOf(ep.series_id).forEach((e, i) => { e.episode_no = i + 1; }); // numaraları yeniden sırala
  save();
  return { ok: true };
});

route('POST', '/api/admin/upload', async ({ req, query }) => {
  requireAdmin(req);
  const ext = path.extname(query.get('filename') || '').toLowerCase();
  if (!UPLOAD_EXT.has(ext)) throw new HttpError(400, 'Desteklenmeyen dosya türü');
  const name = newId() + ext;
  const target = path.join(MEDIA_DIR, name);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(target);
    req.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    req.on('error', reject);
  });
  return { url: '/media/' + name };
});

// ---------- Statik dosyalar ve video (Range destekli) ----------
function serveFile(req, res, baseDir, rel) {
  const file = path.normalize(path.join(baseDir, decodeURIComponent(rel)));
  if (!file.startsWith(baseDir + path.sep)) throw new HttpError(403, 'Yasak');
  let stat = null;
  try { stat = fs.statSync(file); } catch { /* yok */ }
  if (!stat || !stat.isFile()) throw new HttpError(404, 'Dosya bulunamadı');

  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start, end;
    if (range[1]) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1; }
    else { start = Math.max(0, stat.size - Number(range[2])); end = stat.size - 1; }
    if (start >= stat.size || start > end) {
      res.writeHead(416, { ...SECURITY_HEADERS, 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, {
      ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes',
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes',
    'Cache-Control': baseDir !== MEDIA_DIR ? 'no-cache' : PROTECTED_EXT.has(path.extname(file).toLowerCase()) ? 'private, max-age=3600' : 'public, max-age=86400',
  });
  fs.createReadStream(file).pipe(res);
}

// ---------- Sunucu ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        const result = await r.handler({ req, res, params, query: url.searchParams });
        if (!res.headersSent) send(res, 200, result ?? { ok: true });
        return;
      }
      throw new HttpError(404, 'Bulunamadı');
    }
    if (url.pathname.startsWith('/media/')) {
      checkMediaSig(url.pathname, url.searchParams);
      return serveFile(req, res, MEDIA_DIR, url.pathname.slice(7));
    }
    return serveFile(req, res, PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  } catch (e) {
    const status = e instanceof URIError ? 400 : e.status || 500; // bozuk adres (%zz gibi) sunucu hatası sayılmaz
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Sunucu hatası' : e.message });
    else res.end();
  }
});

loadDb().then(() => server.listen(PORT, () => {
  console.log(`\n  Cliffy çalışıyor:   http://localhost:${PORT}`);
  console.log(`  Veritabanı:           ${pool ? 'Postgres (DATABASE_URL)' : DB_FILE}`);
  console.log(`  Yönetim paneli:       http://localhost:${PORT}/admin.html`);
  // Telefondan erişim adresleri (aynı ağda olmalı). 169.254.* adresleri kullanılamaz, atlanır.
  for (const [name, addrs] of Object.entries(require('os').networkInterfaces())) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) {
        console.log(`  Telefondan (${name}):`.padEnd(23) + `http://${a.address}:${PORT}`);
      }
    }
  }
  if (!fs.existsSync(path.join(MEDIA_DIR, 'demo', 'clip1.mp4'))) console.log('  UYARI: Demo videolar eksik. İndirmek için: npm run demo-videos');
  if (ADMIN_KEY === 'admin123') console.log('  UYARI: Varsayılan yönetici anahtarı kullanılıyor (admin123). Yayına almadan önce ADMIN_KEY ayarlayın.');
  if (DEMO_PAYMENTS) console.log('  UYARI: Demo ödeme açık (jeton/VIP ücretsiz). Gerçek içerikte DEMO_PAYMENTS=false yapın.');
  console.log('');
  // Baslat.bat ile açıldığında tarayıcıyı otomatik aç (Windows).
  if (process.env.OPEN_BROWSER) require('child_process').exec(`start "" http://localhost:${PORT}`);
})).catch((e) => {
  console.error('Veritabanı açılamadı:', e.message);
  process.exit(1);
});

async function shutdown() {
  clearTimeout(saveTimer);
  if (db) await saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown); // Render sunucuyu kapatırken
