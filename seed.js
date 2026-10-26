'use strict';
// Demo verileri üretir. Doğrudan çalıştırılırsa (npm run reset) data/db.json dosyasını sıfırlar.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const newId = () => crypto.randomBytes(6).toString('hex');

// Demo videoları yerelde durur (media/demo/). İndirmek için: npm run demo-videos
const BASE = '/media/demo/';
const CLIPS = [
  ['clip1.mp4', 5],
  ['clip2.mp4', 5],
  ['clip3.mp4', 10],
  ['clip4.mp4', 10],
  ['clip5.mp4', 10],
  ['clip6.mp4', 10],
];

const SERIES = [
  {
    title: 'Milyarderin Gizli Eşi', category: 'Romantik', colors: ['#ff3d6e', '#3a1c71'], episodes: 24, views: 1840000,
    description: 'Borç yüzünden sözleşmeli bir evliliğe zorlanan Zeynep, kocasının aslında şehrin en güçlü milyarderi olduğunu düğünden sonra öğrenir.',
  },
  {
    title: 'İntikam Yemini', category: 'İntikam', colors: ['#f12711', '#1a1a2e'], episodes: 20, views: 1320000,
    description: 'Düğün gecesi ihanete uğrayıp her şeyini kaybeden Elif, beş yıl sonra yeni bir kimlikle geri döner. Hedefinde tek bir aile var.',
  },
  {
    title: 'Kayıp Varis', category: 'Aile', colors: ['#f7971e', '#2c3e50'], episodes: 18, views: 760000,
    description: 'Kurye olarak çalışan Kerem, bir kazanın ardından köklü bir ailenin yıllardır aradığı varis olduğunu öğrenir.',
  },
  {
    title: 'Ay Işığında Kurt', category: 'Fantastik', colors: ['#4facfe', '#1b1b3a'], episodes: 22, views: 980000,
    description: 'Dolunay gecesi ormanda kaybolan Deniz, kaderinin sürünün lideriyle bağlandığı gizli bir dünyaya adım atar.',
  },
  {
    title: 'Patronumla Sahte Evlilik', category: 'Romantik', colors: ['#ee9ca7', '#42275a'], episodes: 16, views: 1510000,
    description: 'Soğuk ve mesafeli CEO, mirasını kaybetmemek için asistanına bir teklif yapar: bir yıllık sahte evlilik.',
  },
  {
    title: 'Geri Dönen Kraliçe', category: 'İntikam', colors: ['#c471f5', '#12002b'], episodes: 20, views: 640000,
    description: 'Ailesinin şirketinden kovulan Selin, rakip holdingin başında geri dönüp herkesten tek tek hesap sorar.',
  },
  {
    title: 'Saray Sırları', category: 'Tarihi', colors: ['#d4af37', '#3d0c02'], episodes: 14, views: 420000,
    description: 'Saraya cariye olarak getirilen Gülbahar, entrikaların ortasında hem hayatta kalmak hem de kalbini korumak zorundadır.',
  },
  {
    title: 'Gece Nöbeti', category: 'Gerilim', colors: ['#00c9a7', '#0b1d26'], episodes: 15, views: 530000,
    description: 'Hastanede gece nöbetine kalan genç doktor, her gece aynı saatte gelen gizemli bir hastanın peşine düşer.',
  },
];

function buildSeed() {
  const db = { series: [], episodes: [], users: [], transactions: [] };
  const DAY = 864e5;
  const t0 = Date.now();
  SERIES.forEach((d, i) => {
    const s = {
      id: newId(),
      title: d.title,
      description: d.description,
      category: d.category,
      cover: null,
      colors: d.colors,
      free_episodes: 5,
      price: 30,
      views: d.views,
      created_at: t0 - (SERIES.length - i) * 3 * DAY,
    };
    db.series.push(s);
    for (let n = 1; n <= d.episodes; n++) {
      const [file, duration] = CLIPS[(i + n) % CLIPS.length];
      db.episodes.push({
        id: newId(),
        series_id: s.id,
        episode_no: n,
        title: n === d.episodes ? 'Final' : `Bölüm ${n}`,
        video_url: BASE + file,
        duration,
        price: null, // null = dizinin varsayılan fiyatı
        created_at: s.created_at,
      });
    }
  });
  return db;
}

module.exports = { buildSeed };

if (require.main === module) {
  const file = path.join(__dirname, 'data', 'db.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(buildSeed(), null, 2));
  console.log('Demo veriler oluşturuldu:', file);
}
