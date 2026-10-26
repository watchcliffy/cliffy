'use strict';

const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTL = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);
const fmtNum = (n) => new Intl.NumberFormat('tr-TR').format(n || 0);
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '–');

let key = (() => { try { return localStorage.getItem('adminKey') || ''; } catch { return ''; } })();
let data = null;
let selectedId = null; // bölümleri açık olan dizi
let editingId = null; // düzenlenen dizi (null = yeni)

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'x-admin-key': key };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(d.error || 'Hata');
    e.status = res.status;
    throw e;
  }
  return d;
}

function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/admin/upload?filename=' + encodeURIComponent(file.name));
    x.setRequestHeader('x-admin-key', key);
    x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch { /* boş */ }
      if (x.status < 300) resolve(d.url); else reject(new Error(d.error || 'Yükleme hatası'));
    };
    x.onerror = () => reject(new Error('Ağ hatası'));
    x.send(file);
  });
}

function videoDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { resolve(Math.round(v.duration) || 0); URL.revokeObjectURL(url); };
    v.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
    v.src = url;
  });
}

// ---------- Giriş ----------
function showLogin(msg) {
  $('#panel').hidden = true;
  $('#login').hidden = false;
  if (msg) $('#login-msg').textContent = msg;
}

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  key = e.target.key.value;
  try { localStorage.setItem('adminKey', key); } catch { /* yok say */ }
  load();
});

$('#logout').onclick = () => {
  key = '';
  try { localStorage.removeItem('adminKey'); } catch { /* yok say */ }
  showLogin('Çıkış yapıldı.');
};

// ---------- Veri ----------
async function load() {
  try {
    data = await api('/api/admin/overview');
  } catch (e) {
    if (e.status === 403) return showLogin('Anahtar hatalı.');
    alert(e.message);
    return;
  }
  $('#login').hidden = true;
  $('#panel').hidden = false;
  renderStats();
  renderSeries();
  if (selectedId && !data.series.some((s) => s.id === selectedId)) selectedId = null;
  renderEpisodes();
}

function renderStats() {
  const st = data.stats;
  const items = [
    [fmtNum(st.users), 'Kullanıcı'],
    [fmtNum(st.vip), 'Aktif VIP'],
    [fmtTL(st.revenue), 'Gelir (demo)'],
    [fmtNum(st.unlocks), 'Açılan bölüm'],
    [fmtNum(st.views), 'Toplam izlenme'],
    [fmtNum(data.series.length), 'Dizi'],
  ];
  $('#stats').innerHTML = items.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#categories').innerHTML = [...new Set(data.series.map((s) => s.category))].map((c) => `<option value="${esc(c)}">`).join('');
}

function renderSeries() {
  $('#series-table').innerHTML = `
    <tr><th></th><th>Dizi</th><th>Kategori</th><th>Bölüm</th><th>Ücretsiz</th><th>Fiyat</th><th>İzlenme</th><th></th></tr>
    ${data.series.map((s) => `
      <tr class="${s.id === selectedId ? 'selected' : ''}">
        <td><div class="thumb" style="${s.cover ? `background-image:url(&quot;${esc(s.cover)}&quot;)` : `background:linear-gradient(160deg,${esc(s.colors[0])},${esc(s.colors[1])})`}"></div></td>
        <td><b>${esc(s.title)}</b></td>
        <td>${esc(s.category)}</td>
        <td>${s.episodes.length}</td>
        <td>${s.free_episodes}</td>
        <td>${s.price} jeton</td>
        <td>${fmtNum(s.views)}</td>
        <td class="actions">
          <button data-act="eps" data-id="${s.id}">Bölümler</button>
          <button data-act="edit" data-id="${s.id}">Düzenle</button>
          <button data-act="del" data-id="${s.id}" class="danger">Sil</button>
        </td>
      </tr>`).join('')}`;
}

$('#series-table').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const s = data.series.find((x) => x.id === b.dataset.id);
  if (b.dataset.act === 'eps') {
    selectedId = s.id;
    renderSeries();
    renderEpisodes();
    $('#episodes-card').scrollIntoView({ behavior: 'smooth' });
  } else if (b.dataset.act === 'edit') {
    openSeriesForm(s);
  } else if (b.dataset.act === 'del') {
    if (!confirm(`"${s.title}" dizisi ve tüm bölümleri silinsin mi?`)) return;
    try { await api('/api/admin/series/' + s.id, { method: 'DELETE' }); await load(); } catch (err) { alert(err.message); }
  }
});

// ---------- Dizi formu ----------
function openSeriesForm(s) {
  editingId = s ? s.id : null;
  const f = $('#series-form');
  f.reset();
  $('#series-form-title').textContent = s ? `Düzenle: ${s.title}` : 'Yeni dizi';
  if (s) {
    f.elements.title.value = s.title;
    f.category.value = s.category;
    f.description.value = s.description;
    f.free_episodes.value = s.free_episodes;
    f.price.value = s.price;
    f.color1.value = s.colors[0];
    f.color2.value = s.colors[1];
    f.cover.value = s.cover || '';
  }
  $('#series-status').textContent = '';
  $('#series-form-card').hidden = false;
  $('#series-form-card').scrollIntoView({ behavior: 'smooth' });
}

$('#new-series').onclick = () => openSeriesForm(null);
$('#series-form-close').onclick = () => { $('#series-form-card').hidden = true; };

$('#series-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = $('#series-save');
  const status = $('#series-status');
  btn.disabled = true;
  try {
    let cover = f.cover.value.trim();
    const file = f.cover_file.files[0];
    if (file) {
      status.textContent = 'Kapak yükleniyor…';
      cover = await uploadFile(file);
    }
    const body = {
      title: f.elements.title.value,
      category: f.category.value,
      description: f.description.value,
      free_episodes: f.free_episodes.value,
      price: f.price.value,
      colors: [f.color1.value, f.color2.value],
      cover,
    };
    if (editingId) await api('/api/admin/series/' + editingId, { method: 'PUT', body });
    else {
      const created = await api('/api/admin/series', { method: 'POST', body });
      selectedId = created.id; // yeni dizinin bölüm ekleme ekranını aç
    }
    $('#series-form-card').hidden = true;
    await load();
    if (!editingId) $('#episodes-card').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    status.textContent = '❌ ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- Bölümler ----------
function renderEpisodes() {
  const card = $('#episodes-card');
  const s = data && data.series.find((x) => x.id === selectedId);
  if (!s) { card.hidden = true; return; }
  card.hidden = false;
  $('#episodes-title').textContent = `Bölümler: ${s.title}`;
  $('#episodes-table').innerHTML = s.episodes.length ? `
    <tr><th>No</th><th>Başlık</th><th>Süre</th><th>Fiyat</th><th>Video</th><th></th></tr>
    ${s.episodes.map((ep) => `
      <tr>
        <td>${ep.episode_no}</td>
        <td>${esc(ep.title)}</td>
        <td>${fmtDur(ep.duration)}</td>
        <td>${ep.episode_no <= s.free_episodes ? 'Ücretsiz' : `${ep.price ?? s.price} jeton`}</td>
        <td class="url"><a href="${esc(ep.video_url)}" target="_blank" rel="noopener">${esc(ep.video_url)}</a></td>
        <td class="actions"><button class="danger" data-del="${ep.id}">Sil</button></td>
      </tr>`).join('')}` : '<tr><td class="status">Henüz bölüm yok. Yukarıdan video yükleyin.</td></tr>';
}

$('#episodes-close').onclick = () => { selectedId = null; renderSeries(); renderEpisodes(); };

$('#episodes-table').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-del]');
  if (!b || !confirm('Bu bölüm silinsin mi? Sonraki bölümlerin numaraları kayar.')) return;
  try { await api('/api/admin/episodes/' + b.dataset.del, { method: 'DELETE' }); await load(); } catch (err) { alert(err.message); }
});

$('#episode-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = $('#episode-save');
  const status = $('#episode-status');
  const files = [...f.files.files].sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
  const url = f.video_url.value.trim();
  if (!files.length && !url) { status.textContent = 'Video dosyası seçin veya adres girin.'; return; }
  const base = { title: files.length > 1 ? '' : f.elements.title.value, price: f.price.value };
  btn.disabled = true;
  try {
    if (files.length) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const label = `${i + 1}/${files.length} · ${file.name}`;
        const duration = await videoDuration(file);
        const videoUrl = await uploadFile(file, (p) => { status.textContent = `Yükleniyor ${label} · %${Math.round(p * 100)}`; });
        await api(`/api/admin/series/${selectedId}/episodes`, { method: 'POST', body: { ...base, video_url: videoUrl, duration } });
      }
    } else {
      await api(`/api/admin/series/${selectedId}/episodes`, { method: 'POST', body: { ...base, video_url: url } });
    }
    status.textContent = '✅ Eklendi';
    f.reset();
    await load();
  } catch (err) {
    status.textContent = '❌ ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- Başlat ----------
if (key) load(); else showLogin();
