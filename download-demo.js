'use strict';
// Demo videolarını media/demo/ klasörüne bir kez indirir (npm run demo-videos).
// Videolar yerelde durduğu için dış sitelerin kapanmasından etkilenmez.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'media', 'demo');

// Ücretsiz / açık lisanslı örnek klipler (Blender Foundation CC-BY, MDN CC0).
const VIDEOS = {
  'clip1.mp4': 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'clip2.mp4': 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
  'clip3.mp4': 'https://www.w3schools.com/html/mov_bbb.mp4',
  'clip4.mp4': 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
  'clip5.mp4': 'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
  'clip6.mp4': 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
};

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  for (const [name, url] of Object.entries(VIDEOS)) {
    const file = path.join(DIR, name);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) { console.log('Var:', name); continue; }
    const res = await fetch(url);
    if (!res.ok) { console.error(`İndirilemedi (${res.status}): ${url}`); process.exitCode = 1; continue; }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log('İndirildi:', name);
  }
}

main();
