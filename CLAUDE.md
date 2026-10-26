# Cliffy (eski adı KısaDizi)

ReelShort / DramaBox benzeri kısa dikey dizi izleme uygulaması (MVP). Kullanıcı Türkçe konuşur ve programlamaya yeni; yanıtlar Türkçe, sade ve adım adım olmalı.

## Çalıştırma
- `npm start` (veya masaüstündeki "KısaDizi Başlat" kısayolu / `Baslat.bat`) → http://localhost:3000
- Yönetim paneli: `/admin.html`, anahtar `ADMIN_KEY` (varsayılan `admin123`)
- Telefondan erişim: aynı Wi-Fi'de `http://192.168.1.5:3000` (sunucu açılışta güncel adresi yazdırır; `10.86.*` Ethernet adresi telefondan çalışmaz)
- `npm run reset` demo verileri sıfırlar (sunucu kapalıyken). `npm run demo-videos` demo videoları `media/demo/` içine indirir.

## Yapı
- `server.js`: Harici paketsiz Node HTTP sunucusu. API, statik dosyalar, Range destekli video, yükleme. İş kuralları en üstteki `CONFIG` içinde.
- `data/db.json`: JSON veritabanı (series, episodes, users, transactions). Sunucu belleğinde tutulur; sunucu çalışırken dosyayı elle düzenleme.
- `seed.js`: 8 demo dizi. `public/app.js`: hash router'lı tek sayfa uygulama (ana sayfa, dizi, dikey oynatıcı, listem, cüzdan, profil). `public/admin.*`: yönetim paneli.
- Kilitli bölümün `video_url`'i istemciye gönderilmez (`episodeView`). Ödeme ve reklam şu an demo.
- `/media/` altındaki videolar yalnızca imzalı, süreli adresle açılır (`signMedia`, `MEDIA_SECRET`); kapak resimleri açık. Misafir hesap açma ve hatalı admin şifresi IP başına sınırlı.
- `DEMO_PAYMENTS=false` demo satın alma ve reklamla açmayı kapatır (gerçek lisanslı içerik gelmeden önce yapılmalı).

## Notlar
- Platform Windows + PowerShell; Node ve Git kurulu (`C:\Program Files\Git\cmd\git.exe`), Flutter yok. Yerel git deposu var, GitHub'a henüz gönderilmedi.
- `render.yaml`: Render yayın ayarı (build'de demo videoları indirir, ADMIN_KEY'i Render üretir). Render'da `data/db.json` her yeniden yüklemede sıfırlanır; kalıcı veritabanı gerekecek.
- `sirketler/`: içerik lisansı için şirketlere gidecek e-posta taslakları (git dışı).
- Harici demo video adresleri (Google gtv bucket) 403 verdiği için videolar yerelde tutuluyor.
- Yol haritası: GitHub → Render'da yayın → PWABuilder/Capacitor ile APK → RevenueCat, AdMob, kalıcı veritabanı.
