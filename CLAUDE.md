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
- Platform Windows + PowerShell; Node ve Git kurulu (`C:\Program Files\Git\cmd\git.exe`), Flutter yok.
- Yayında: https://cliffy-yhfq.onrender.com (Render ücretsiz plan, Blueprint). Kod: github.com/watchcliffy/cliffy (gizli). `git push` buradan çalışır; Render her push'ta otomatik yeniden yayınlar. Giriş gerekirse kullanıcı `GitHuba-Yukle.bat`'ı çalıştırır (cihaz koduyla giriş).
- `render.yaml`: Render yayın ayarı (build'de demo videoları indirir, ADMIN_KEY'i Render üretir).
- Veritabanı: `DATABASE_URL` tanımlıysa tüm `db` nesnesi Postgres'te `app_state` tablosunda tek satır (jsonb) olarak tutulur (`pg` paketi, Supabase için). Tanımlı değilse `data/db.json`. Render'da DATABASE_URL girildi (Supabase, session pooler); `/api/health` → `storage: postgres` ile doğrulanabilir. Yüklenen videolar (`media/`) Render'da hâlâ kalıcı değil → Bunny Stream.
- `sirketler/`: içerik lisansı için şirketlere gidecek e-posta taslakları (git dışı).
- `mobile/`: Capacitor 8 Android uygulaması (appId `com.watchcliffy.app`). WebView `server.url` ile yayındaki siteyi açar, yani web değişiklikleri APK yeniden derlenmeden gelir. AdMob: `@capacitor-community/admob`; `app.js` içindeki `showRewardedAd` Capacitor varsa gerçek reklam, yoksa demo reklam gösterir. Reklam kimliği sunucudan gelir (`ADMOB_REWARDED_ID`, yoksa Google test kimliği); AndroidManifest'teki APPLICATION_ID şu an test kimliği. Derleme: JDK 21 (`C:\Program Files\Microsoft\jdk-21*`, JAVA_HOME elle ayarlanmalı; sistemde Java 8 de var) + Android SDK (`%LOCALAPPDATA%\Android\Sdk`), `& mobile\android\gradlew.bat assembleDebug` (cmd /c ile değil, yol boşluk içeriyor). Gradle 8.14.3'e sabitlendi (9.6+ AGP 8.13 ile çalışmaz). Çıkan APK `public/cliffy.apk` olarak sitede indirilebilir.
- Geri butonu `navStack` ile çalışır (uygulama içi geçmiş); döngüye girmemesi için fallback `location.replace` kullanır.
- İş e-postası: herzamanonline2222@gmail.com (git kayıtları ve şirket yazışmaları bununla). Kişisel Gmail hiçbir yerde kullanılmamalı.
- Alan adı planı: watchcliffy.com (boştu, henüz alınmadı). Sıra: alan adı → şirketlere e-posta → Bunny Stream (video) → APK + RevenueCat/AdMob.
- Harici demo video adresleri (Google gtv bucket) 403 verdiği için videolar yerelde tutuluyor.
- Yol haritası: GitHub → Render'da yayın → PWABuilder/Capacitor ile APK → RevenueCat, AdMob, kalıcı veritabanı.
