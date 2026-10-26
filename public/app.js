'use strict';

// ================= Temel yardımcılar =================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = $('#view');
const tabbar = $('#tabbar');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* yok say */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* yok say */ } },
};

const state = {
  token: store.get('token'),
  me: null,
  config: null,
  muted: false,
  returnTo: null, // cüzdandan sonra dönülecek oynatıcı adresi
  cleanup: null,
};
let renderSeq = 0;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTL = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);
const fmtNum = (n) => new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
const fmtDate = (t) => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

function svg(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
const ICON = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  heart: svg('<path d="M12 20.5s-7.5-4.6-9.6-9.3A5.3 5.3 0 0 1 12 6.1a5.3 5.3 0 0 1 9.6 5.1c-2.1 4.7-9.6 9.3-9.6 9.3z"/>'),
  grid: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  share: svg('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
};

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Bir hata oluştu');
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function openSheet(html) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet"><div class="sheet-handle"></div>${html}</div>`;
  root.classList.add('open');
  $('.sheet-backdrop', root).onclick = closeSheet;
  return $('.sheet', root);
}
function closeSheet() {
  const root = $('#sheet-root');
  root.classList.remove('open');
  root.innerHTML = '';
}

function updateCoins() {
  $$('[data-coins]').forEach((el) => { el.textContent = state.me.coins; });
}

// ================= Oturum =================
async function ensureSession() {
  if (state.token) {
    try { state.me = await api('/api/me'); return; } catch (e) { if (e.status !== 401) throw e; }
  }
  const r = await api('/api/auth/guest', { method: 'POST' });
  state.token = r.token;
  store.set('token', r.token);
  state.me = await api('/api/me');
  toast(`Hoş geldin! ${state.config.signupBonus} jeton hediye 🎁`);
}

async function refreshMe() {
  state.me = await api('/api/me');
  updateCoins();
}

// ================= Ortak parçalar =================
function coverHtml(s, extra = '') {
  const style = s.cover
    ? `background-image:url(&quot;${esc(s.cover)}&quot;)`
    : `background:linear-gradient(160deg,${esc(s.colors[0])},${esc(s.colors[1])})`;
  return `<div class="cover" style="${style}">${s.cover ? '' : `<span class="cover-title">${esc(s.title)}</span>`}${extra}</div>`;
}

function topbar(title) {
  return `<header class="topbar">
    ${title ? `<h1 class="title">${esc(title)}</h1>` : '<div class="logo">Kısa<span>Dizi</span></div>'}
    <a class="coin-chip" href="#/wallet"><span class="coin"></span><b data-coins>${state.me.coins}</b></a>
  </header>`;
}

function card(s, { rank, badge, href } = {}) {
  return `<a class="card" href="${href || `#/series/${s.id}`}">
    ${rank ? `<span class="rank">${rank}</span>` : ''}
    ${coverHtml(s, badge ? `<span class="ep-badge">${esc(badge)}</span>` : '')}
    <div class="card-title">${esc(s.title)}</div>
    <div class="card-sub">${s.episode_count} bölüm · ${esc(s.category)}</div>
  </a>`;
}

function goBack(fallback) {
  if (history.length > 1) history.back(); else location.hash = fallback;
}

// ================= Yönlendirme =================
async function render() {
  const seq = ++renderSeq;
  if (state.cleanup) { state.cleanup(); state.cleanup = null; }
  closeSheet();
  const [page, a, b] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (page !== 'wallet') state.returnTo = null;
  tabbar.hidden = page === 'watch' || page === 'series';
  $$('#tabbar a').forEach((el) => el.classList.toggle('active', el.dataset.tab === (page || 'home')));
  window.scrollTo(0, 0);
  try {
    if (!page) await viewHome(seq);
    else if (page === 'series') await viewSeries(seq, a);
    else if (page === 'watch') await viewWatch(seq, a, Number(b) || 1);
    else if (page === 'list') await viewList(seq, a || 'fav');
    else if (page === 'wallet') await viewWallet(seq);
    else if (page === 'profile') await viewProfile(seq);
    else location.hash = '#/';
  } catch (e) {
    if (seq !== renderSeq) return;
    view.innerHTML = `<div class="empty">😕 ${esc(e.message)}<br><br><a class="btn primary" href="#/">Ana sayfaya dön</a></div>`;
  }
}

// ================= Ana sayfa =================
async function viewHome(seq) {
  const [{ series }] = await Promise.all([api('/api/series'), refreshMe()]);
  if (seq !== renderSeq) return;
  const trending = [...series].sort((a, b) => b.views - a.views);
  const newest = [...series].sort((a, b) => b.created_at - a.created_at);
  const categories = [...new Set(series.map((s) => s.category))];
  const cont = state.me.history.slice(0, 10);

  view.innerHTML = `
    ${topbar()}
    <div class="banner-row">
      ${trending.slice(0, 4).map((s) => `
        <a class="banner" href="#/series/${s.id}">
          ${coverHtml(s)}
          <div class="banner-info"><b>${esc(s.title)}</b><span>${esc(s.description)}</span></div>
        </a>`).join('')}
    </div>
    ${cont.length ? `
      <div class="section"><h2>İzlemeye devam et</h2>
        <div class="row">${cont.map((h) => card(h.series, { badge: `Bölüm ${h.episode_no}`, href: `#/watch/${h.series.id}/${h.episode_no}` })).join('')}</div>
      </div>` : ''}
    <div class="section"><h2>🔥 Trend</h2>
      <div class="row">${trending.slice(0, 10).map((s, i) => card(s, { rank: i + 1 })).join('')}</div>
    </div>
    <div class="section"><h2>Yeni Çıkanlar</h2>
      <div class="row">${newest.slice(0, 10).map((s) => card(s)).join('')}</div>
    </div>
    <div class="section"><h2>Tüm Diziler</h2>
      <div class="chips">
        <button class="chip active" data-cat="">Tümü</button>
        ${categories.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
      <div class="grid" id="grid"></div>
    </div>`;

  const grid = $('#grid', view);
  const paintGrid = (cat) => {
    grid.innerHTML = series.filter((s) => !cat || s.category === cat).map((s) => card(s)).join('');
  };
  $('.chips', view).addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $$('.chip', view).forEach((c) => c.classList.toggle('active', c === chip));
    paintGrid(chip.dataset.cat);
  });
  paintGrid('');
}

// ================= Dizi detay =================
async function viewSeries(seq, id) {
  const d = await api('/api/series/' + encodeURIComponent(id));
  if (seq !== renderSeq) return;
  const s = d.series;
  const resumeNo = d.resume ? d.resume.episode_no : 1;
  const lockedCount = d.episodes.filter((e) => e.locked).length;

  view.innerHTML = `
    <div class="detail-hero">
      ${coverHtml(s)}
      <button class="back-btn" id="back">${ICON.back}</button>
    </div>
    <div class="detail-body">
      <h1>${esc(s.title)}</h1>
      <div class="meta">${esc(s.category)} · ${s.episode_count} bölüm · ${fmtNum(s.views)} izlenme</div>
      <p class="desc">${esc(s.description)}</p>
      <div class="detail-actions">
        <a class="btn primary" href="#/watch/${s.id}/${resumeNo}">▶ ${d.resume ? `Devam et · Bölüm ${resumeNo}` : 'İzlemeye başla'}</a>
        <button class="icon-btn ${d.favorite ? 'on' : ''}" id="fav" aria-label="Favori">${ICON.heart}</button>
      </div>
      <h3>Bölümler</h3>
      <div class="legend"><span>İlk ${s.free_episodes} bölüm ücretsiz</span>${lockedCount ? `<span>🔒 ${lockedCount} kilitli</span>` : ''}</div>
      <div class="ep-grid">
        ${d.episodes.map((e) => `
          <a class="ep ${e.locked ? 'locked' : ''} ${d.resume && resumeNo === e.episode_no ? 'current' : ''}" href="#/watch/${s.id}/${e.episode_no}">
            ${e.episode_no}${e.locked ? '<i>🔒</i>' : ''}
          </a>`).join('')}
      </div>
    </div>`;

  $('#back', view).onclick = () => goBack('#/');
  $('#fav', view).onclick = async (ev) => {
    const btn = ev.currentTarget;
    try {
      const r = await api(`/api/favorites/${s.id}`, { method: 'POST' });
      btn.classList.toggle('on', r.favorite);
      toast(r.favorite ? 'Listene eklendi' : 'Listenden çıkarıldı');
    } catch (e) { toast(e.message); }
  };
}

// ================= Dikey oynatıcı =================
async function viewWatch(seq, seriesId, startNo) {
  const d = await api('/api/series/' + encodeURIComponent(seriesId));
  if (seq !== renderSeq) return;
  const s = d.series;
  const eps = d.episodes;
  if (!eps.length) {
    view.innerHTML = '<div class="empty">Bu dizide henüz bölüm yok.<br><br><a class="btn primary" href="#/">Ana sayfa</a></div>';
    return;
  }
  const startIdx = Math.min(Math.max(startNo, 1), eps.length) - 1;
  let resumeAt = d.resume && d.resume.episode_no === eps[startIdx].episode_no ? d.resume.seconds : 0;
  let current = -1;
  let lastSaved = 0;

  view.innerHTML = `
    <div class="player">
      <div class="player-top">
        <button class="back-btn" id="back">${ICON.back}</button>
        <div class="player-title"><b>${esc(s.title)}</b><span id="ep-label"></span></div>
      </div>
      <div class="feed">
        ${eps.map((e, i) => `
          <section class="slide ${e.locked ? 'locked' : ''}" data-i="${i}">
            <div class="slide-bg">${coverHtml(s)}</div>
            <video playsinline webkit-playsinline preload="none"></video>
            <div class="spin"></div>
            <div class="paused-icon">${ICON.play}</div>
            <div class="video-error">
              <b>Video yüklenemedi</b>
              <p>Bağlantını kontrol edip tekrar dene.</p>
              <button class="btn" data-retry>Tekrar dene</button>
            </div>
            <div class="slide-info"><b>${esc(e.title)}</b><span>Bölüm ${e.episode_no} / ${eps.length}</span></div>
            <div class="bar"><div class="bar-fill"></div></div>
            <div class="lock">
              <div class="lock-icon">🔒</div>
              <b>Bölüm ${e.episode_no} kilitli</b>
              <p>Hikâyenin devamını izlemek için bölümü aç.</p>
              <button class="btn primary" data-unlock>Bölümü aç</button>
            </div>
          </section>`).join('')}
      </div>
      <div class="side-actions">
        <button data-act="fav" class="${d.favorite ? 'on' : ''}">${ICON.heart}<span>Listem</span></button>
        <button data-act="eps">${ICON.grid}<span>Bölümler</span></button>
        <button data-act="share">${ICON.share}<span>Paylaş</span></button>
      </div>
      <button class="unmute" hidden>🔇 Sesi açmak için dokun</button>
    </div>`;

  const player = $('.player', view);
  const feed = $('.feed', player);
  const slides = $$('.slide', feed);
  const unmuteBtn = $('.unmute', player);
  const videoAt = (i) => slides[i].querySelector('video');

  function load(i, preload) {
    const e = eps[i];
    if (!e || e.locked) return;
    const v = videoAt(i);
    v.preload = preload;
    if (!v.getAttribute('src')) v.src = e.video_url;
  }
  function unload(i) {
    const v = videoAt(i);
    if (!v.getAttribute('src')) return;
    v.pause();
    v.removeAttribute('src');
    v.load();
    slides[i].classList.remove('loading', 'paused', 'failed');
  }
  function play(i) {
    const v = videoAt(i);
    v.muted = state.muted;
    const p = v.play();
    if (p) p.catch((err) => {
      // Tarayıcı sesli otomatik oynatmayı engellerse sessiz başlat.
      if (err.name === 'NotAllowedError' && !v.muted) {
        state.muted = true;
        v.muted = true;
        unmuteBtn.hidden = false;
        v.play().catch(() => {});
      }
    });
  }
  function togglePlay(i) {
    if (eps[i].locked) return;
    const v = videoAt(i);
    if (v.paused) play(i); else v.pause();
  }
  function saveProgress(i) {
    const e = eps[i];
    if (!e || e.locked) return;
    lastSaved = Date.now();
    api('/api/progress', { method: 'POST', body: { episode_id: e.id, seconds: videoAt(i).currentTime || 0 } }).catch(() => {});
  }
  function goTo(i) {
    if (i >= 0 && i < eps.length) slides[i].scrollIntoView({ behavior: 'smooth' });
  }

  function activate(i) {
    if (i === current) return;
    if (current >= 0 && !eps[current].locked) {
      saveProgress(current);
      videoAt(current).pause();
    }
    current = i;
    closeSheet();
    history.replaceState(null, '', `#/watch/${s.id}/${eps[i].episode_no}`);
    $('#ep-label', player).textContent = `Bölüm ${eps[i].episode_no} / ${eps.length}`;
    slides.forEach((_, j) => { if (Math.abs(j - i) > 1) unload(j); });
    if (eps[i].locked) { openUnlock(i); return; }
    load(i, 'auto');
    load(i + 1, 'metadata'); // bir sonraki bölümü önceden hazırla
    play(i);
    saveProgress(i);
  }

  function onUnlocked(i, r) {
    eps[i] = r.episode;
    Object.assign(state.me, r.me);
    slides[i].classList.remove('locked');
    if (i === current) {
      load(i, 'auto');
      play(i);
      saveProgress(i);
    }
  }

  function openUnlock(i) {
    const e = eps[i];
    const me = state.me;
    const enough = me.coins >= e.price;
    const sheet = openSheet(`
      <h3>Bölüm ${e.episode_no}'i aç</h3>
      <div class="unlock-price"><span class="coin"></span>${e.price} jeton<small>Bakiyen: ${me.coins}</small></div>
      <button class="btn primary block" data-m="coins">${enough ? `${e.price} jeton ile aç` : 'Jeton yetersiz · Jeton al'}</button>
      <button class="btn block" data-m="ad" ${me.ads_left <= 0 ? 'disabled' : ''}>📺 Reklam izle, ücretsiz aç <small>(bugün ${me.ads_left} hak)</small></button>
      <button class="btn vip block" data-m="vip">👑 VIP ol, tüm bölümleri sınırsız izle</button>`);
    sheet.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-m]');
      if (!b || b.disabled) return;
      const m = b.dataset.m;
      if (m === 'vip' || (m === 'coins' && !enough)) {
        state.returnTo = location.hash;
        location.hash = '#/wallet';
        return;
      }
      b.disabled = true;
      try {
        if (m === 'ad') { closeSheet(); await showFakeAd(); }
        const r = await api(`/api/episodes/${e.id}/unlock`, { method: 'POST', body: { method: m } });
        closeSheet();
        onUnlocked(i, r);
        toast('Bölüm açıldı 🎉');
      } catch (err) {
        toast(err.message);
        b.disabled = false;
      }
    });
  }

  // Video olayları
  slides.forEach((sl, i) => {
    const v = videoAt(i);
    const fill = $('.bar-fill', sl);
    v.addEventListener('timeupdate', () => {
      if (v.duration) fill.style.width = (v.currentTime / v.duration) * 100 + '%';
      if (i === current && Date.now() - lastSaved > 5000) saveProgress(i);
    });
    v.addEventListener('loadedmetadata', () => {
      if (i === current && resumeAt > 3 && resumeAt < v.duration - 3) v.currentTime = resumeAt;
      resumeAt = 0;
    });
    v.addEventListener('error', () => {
      if (!v.getAttribute('src')) return; // unload() sırasında oluşan hatayı yok say
      sl.classList.remove('loading', 'paused');
      sl.classList.add('failed');
    });
    v.addEventListener('waiting', () => sl.classList.add('loading'));
    v.addEventListener('playing', () => sl.classList.remove('loading', 'paused'));
    v.addEventListener('pause', () => { if (v.getAttribute('src') && !v.ended) sl.classList.add('paused'); });
    v.addEventListener('ended', () => {
      saveProgress(i);
      if (i === current) {
        if (i + 1 < eps.length) goTo(i + 1);
        else toast('Diziyi bitirdin! 🎬');
      }
    });
    sl.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-unlock]')) return openUnlock(i);
      if (ev.target.closest('[data-retry]')) {
        sl.classList.remove('failed');
        unload(i);
        load(i, 'auto');
        return play(i);
      }
      const bar = ev.target.closest('.bar');
      if (bar) {
        if (v.duration) v.currentTime = ((ev.clientX - bar.getBoundingClientRect().left) / bar.clientWidth) * v.duration;
        return;
      }
      togglePlay(i);
    });
  });

  // Üst ve yan butonlar
  $('#back', player).onclick = () => { location.hash = `#/series/${s.id}`; };
  unmuteBtn.onclick = () => {
    state.muted = false;
    unmuteBtn.hidden = true;
    if (current >= 0) videoAt(current).muted = false;
  };
  $('.side-actions', player).addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'fav') {
      try {
        const r = await api(`/api/favorites/${s.id}`, { method: 'POST' });
        b.classList.toggle('on', r.favorite);
        toast(r.favorite ? 'Listene eklendi' : 'Listenden çıkarıldı');
      } catch (e) { toast(e.message); }
    } else if (act === 'eps') {
      const sheet = openSheet(`
        <h3>${esc(s.title)}</h3>
        <div class="muted">${eps.length} bölüm · İlk ${s.free_episodes} bölüm ücretsiz</div>
        <div class="ep-grid">
          ${eps.map((e, i) => `<button class="ep ${e.locked ? 'locked' : ''} ${i === current ? 'current' : ''}" data-go="${i}">${e.episode_no}${e.locked ? '<i>🔒</i>' : ''}</button>`).join('')}
        </div>`);
      sheet.addEventListener('click', (e2) => {
        const g = e2.target.closest('[data-go]');
        if (!g) return;
        closeSheet();
        goTo(Number(g.dataset.go));
      });
    } else if (act === 'share') {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: s.title, url });
        else { await navigator.clipboard.writeText(url); toast('Bağlantı kopyalandı'); }
      } catch { /* kullanıcı vazgeçti */ }
    }
  });

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); goTo(current + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); goTo(current - 1); }
    else if (e.key === ' ') { e.preventDefault(); togglePlay(current); }
  };
  document.addEventListener('keydown', onKey);

  // Ekranda %60'tan fazla görünen bölüm aktif olur.
  feed.scrollTop = startIdx * feed.clientHeight;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting && en.intersectionRatio >= 0.6) activate(Number(en.target.dataset.i));
    }
  }, { root: feed, threshold: [0.6] });
  slides.forEach((sl) => io.observe(sl));

  state.cleanup = () => {
    io.disconnect();
    document.removeEventListener('keydown', onKey);
    if (current >= 0 && !eps[current].locked) saveProgress(current);
    slides.forEach((_, j) => unload(j));
  };
}

// Demo reklam: gerçek uygulamada AdMob "ödüllü reklam" gösterilir.
function showFakeAd() {
  return new Promise((resolve) => {
    let left = 5;
    const el = document.createElement('div');
    el.className = 'ad';
    el.innerHTML = `
      <div class="ad-tag">Reklam · <span>${left}</span></div>
      <div class="ad-box">📱 Reklam alanı<small>Gerçek uygulamada burada AdMob ödüllü reklamı oynar.</small></div>
      <div class="muted">Ödülünü almak için reklamın bitmesini bekle</div>`;
    document.body.appendChild(el);
    const timer = setInterval(() => {
      left--;
      $('.ad-tag span', el).textContent = left;
      if (left <= 0) {
        clearInterval(timer);
        el.remove();
        resolve();
      }
    }, 1000);
  });
}

// ================= Listem =================
async function viewList(seq, tab) {
  await refreshMe();
  if (seq !== renderSeq) return;
  const isHistory = tab === 'history';
  const items = isHistory ? state.me.history : state.me.favorites.map((s) => ({ series: s }));
  view.innerHTML = `
    ${topbar('Listem')}
    <nav class="tabs">
      <a href="#/list/fav" class="${isHistory ? '' : 'active'}">Favoriler</a>
      <a href="#/list/history" class="${isHistory ? 'active' : ''}">İzleme geçmişi</a>
    </nav>
    ${items.length ? items.map((it) => `
      <a class="list-item" href="${isHistory ? `#/watch/${it.series.id}/${it.episode_no}` : `#/series/${it.series.id}`}">
        ${coverHtml(it.series)}
        <div>
          <b>${esc(it.series.title)}</b>
          <div class="muted">${isHistory
            ? `Bölüm ${it.episode_no} / ${it.series.episode_count} · ${fmtDate(it.updated_at)}`
            : esc(it.series.description)}</div>
        </div>
      </a>`).join('') : `
      <div class="empty">
        ${isHistory ? 'Henüz bir şey izlemedin.' : 'Favorilerin boş.<br>Dizilerdeki ♥ ile ekleyebilirsin.'}
        <br><br><a class="btn primary" href="#/">Dizileri keşfet</a>
      </div>`}`;
}

// ================= Cüzdan =================
async function viewWallet(seq) {
  await refreshMe();
  if (seq !== renderSeq) return;
  const me = state.me;
  const cfg = state.config;
  const txAmount = (t) => (t.coins ? `${t.coins > 0 ? '+' : ''}${t.coins}` : fmtTL(t.amount_tl));

  view.innerHTML = `
    ${topbar('Cüzdan')}
    ${state.returnTo ? `<button class="btn ghost" id="return">‹ İzlemeye geri dön</button>` : ''}
    <div class="box balance">
      <div><div class="muted">Jeton bakiyen</div><b><span class="coin"></span><span data-coins>${me.coins}</span></b></div>
      ${me.vip ? '<span class="vip-badge">👑 VIP</span>' : ''}
    </div>
    <div class="box checkin">
      <div>
        <b>Günlük ödül</b>
        <div class="muted">${me.can_checkin ? `Her gün uğra, ${cfg.dailyBonus} jeton kazan` : 'Bugünkü ödülünü aldın. Yarın yine gel!'}</div>
      </div>
      <button class="btn primary" id="checkin" ${me.can_checkin ? '' : 'disabled'}>+${cfg.dailyBonus}</button>
    </div>

    <h2 class="h2">👑 VIP Üyelik</h2>
    <div class="vip-plans">
      ${cfg.vipPlans.map((p) => `
        <button class="vip-plan" data-vip="${p.id}">
          ${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}
          <div><b>${esc(p.name)}</b><div class="muted">Tüm bölümler kilitsiz · ${p.days} gün</div></div>
          <span class="price">${fmtTL(p.price)}</span>
        </button>`).join('')}
    </div>
    ${me.vip ? `<p class="note">VIP üyeliğin ${fmtDate(me.vip_until)} tarihine kadar geçerli.</p>` : ''}

    <h2 class="h2">Jeton Paketleri</h2>
    <div class="packs">
      ${cfg.coinPacks.map((p) => `
        <button class="pack" data-pack="${p.id}">
          ${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}
          <b><span class="coin"></span>${p.coins}</b>
          <div class="bonus">${p.bonus ? `+${p.bonus} bonus` : ''}</div>
          <div class="price">${fmtTL(p.price)}</div>
        </button>`).join('')}
    </div>

    <h2 class="h2">Son işlemler</h2>
    ${me.transactions.length ? `<ul class="tx">${me.transactions.map((t) => `
      <li>
        <div>${esc(t.note)}<div class="muted">${new Date(t.created_at).toLocaleString('tr-TR')}</div></div>
        <b class="${t.coins > 0 ? 'plus' : 'minus'}">${txAmount(t)}</b>
      </li>`).join('')}</ul>` : '<p class="note">Henüz işlem yok.</p>'}
    <p class="note">⚠️ Demo modu: gerçek ödeme alınmaz.</p>`;

  const ret = $('#return', view);
  if (ret) ret.onclick = () => { location.hash = state.returnTo; };
  $('#checkin', view).onclick = async () => {
    try {
      const r = await api('/api/checkin', { method: 'POST' });
      toast(`+${r.bonus} jeton eklendi 🎉`);
      render();
    } catch (e) { toast(e.message); }
  };
  $('.vip-plans', view).addEventListener('click', (e) => {
    const b = e.target.closest('[data-vip]');
    if (b) confirmBuy('vip', cfg.vipPlans.find((p) => p.id === b.dataset.vip));
  });
  $('.packs', view).addEventListener('click', (e) => {
    const b = e.target.closest('[data-pack]');
    if (b) confirmBuy('coins', cfg.coinPacks.find((p) => p.id === b.dataset.pack));
  });
}

function confirmBuy(kind, item) {
  const title = kind === 'vip' ? item.name : `${item.coins + item.bonus} jeton`;
  const sheet = openSheet(`
    <h3>${esc(title)}</h3>
    <p class="muted">Tutar: <b>${fmtTL(item.price)}</b></p>
    <p class="muted">Bu bir demodur. Gerçek uygulamada burada Google Play veya App Store ödeme ekranı açılır.</p>
    <button class="btn primary block" id="buy">Satın al (demo)</button>
    <button class="btn block" id="cancel">Vazgeç</button>`);
  $('#cancel', sheet).onclick = closeSheet;
  $('#buy', sheet).onclick = async (ev) => {
    ev.currentTarget.disabled = true;
    try {
      if (kind === 'vip') await api('/api/purchase/vip', { method: 'POST', body: { plan_id: item.id } });
      else await api('/api/purchase/coins', { method: 'POST', body: { pack_id: item.id } });
      closeSheet();
      toast(kind === 'vip' ? 'VIP üyeliğin aktif 👑' : 'Jetonlar hesabına eklendi 🎉');
      if (state.returnTo) location.hash = state.returnTo; // izlediği bölüme geri dön
      else render();
    } catch (e) {
      toast(e.message);
      $('#buy', sheet).disabled = false;
    }
  };
}

// ================= Profil =================
async function viewProfile(seq) {
  await refreshMe();
  if (seq !== renderSeq) return;
  const me = state.me;
  view.innerHTML = `
    ${topbar('Profil')}
    <div class="profile-head">
      <div class="avatar">${esc(me.name.slice(0, 1))}</div>
      <div>
        <b>${esc(me.name)}</b>
        <div class="muted">ID: ${esc(me.id)}</div>
        ${me.vip ? `<span class="vip-badge">👑 VIP · ${fmtDate(me.vip_until)} tarihine kadar</span>` : ''}
      </div>
    </div>
    <div class="stats">
      <div class="stat"><b data-coins>${me.coins}</b><span>Jeton</span></div>
      <div class="stat"><b>${me.history.length}</b><span>İzlenen dizi</span></div>
      <div class="stat"><b>${me.unlocked_count}</b><span>Açılan bölüm</span></div>
    </div>
    <div class="menu">
      <a href="#/wallet">💰 Cüzdan ve VIP <span>›</span></a>
      <a href="#/list/fav">♥ Favorilerim <span>›</span></a>
      <a href="#/list/history">🕘 İzleme geçmişi <span>›</span></a>
      <a href="/admin.html" target="_blank" rel="noopener">🛠 Yönetim paneli <span>›</span></a>
      <button id="reset">↺ Yeni misafir hesabı aç <span>›</span></button>
    </div>
    <p class="note">Misafir hesabın bu cihazda saklanır. Cliffy demo sürümü.</p>`;

  $('#reset', view).onclick = async () => {
    if (!confirm('Mevcut misafir hesabından çıkılacak ve yeni hesap açılacak. Emin misin?')) return;
    store.del('token');
    state.token = null;
    await ensureSession();
    render();
  };
}

// ================= Başlat =================
async function boot() {
  try {
    state.config = await api('/api/config');
    await ensureSession();
  } catch (e) {
    view.innerHTML = `<div class="empty">Sunucuya bağlanılamadı.<br>${esc(e.message)}<br><br><button class="btn primary" onclick="location.reload()">Tekrar dene</button></div>`;
    return;
  }
  window.addEventListener('hashchange', render);
  render();
}

boot();
