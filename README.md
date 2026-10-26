# KısaDizi: Kısa dizi izleme uygulaması (MVP)

ReelShort, DramaBox ve NetShort benzeri, dikey ve kısa bölümlerden oluşan dizi izleme uygulaması.
Telefonda da çalışan bir web uygulaması (PWA) ve Node.js sunucusundan oluşur. **Hiçbir paket kurmanız gerekmez.**

## Çalıştırma

Gereken tek şey [Node.js](https://nodejs.org) (18 veya üstü).

```powershell
cd "C:\Users\ilhan turan\Desktop\video"
npm start
```

- Uygulama: http://localhost:3000
- Yönetim paneli: http://localhost:3000/admin.html (varsayılan anahtar: `admin123`)

**Telefonda denemek için:** Telefon ve bilgisayar aynı Wi-Fi ağında olmalı.
1. Bilgisayarın IP adresini öğrenin (`ipconfig` komutunda "IPv4 Address" satırı, örneğin 192.168.1.20).
2. Telefonda `http://192.168.1.20:3000` adresini açın.
3. Tarayıcı menüsünden "Ana ekrana ekle" seçeneğiyle uygulama gibi kullanabilirsiniz.

Windows güvenlik duvarı izin isterse "Özel ağlar" için izin verin.

**Verileri sıfırlamak için:** Sunucuyu durdurun (Ctrl+C), sonra `npm run reset` komutunu çalıştırın.

## Özellikler

| Kullanıcı tarafı | Yönetim paneli |
|---|---|
| TikTok tarzı dikey, kaydırmalı oynatıcı | Dizi ekleme, düzenleme, silme |
| Ana sayfa: banner, trend, yeni çıkanlar, kategoriler | Kapak görseli yükleme veya renkli otomatik kapak |
| İzlemeye devam et (kaldığı saniyeden) | Toplu video yükleme (dosya adına göre sıralı bölüm) |
| İlk N bölüm ücretsiz, sonrası kilitli | Bölüm başına özel fiyat |
| Jetonla, reklam izleyerek veya VIP ile bölüm açma | İstatistikler: kullanıcı, VIP, gelir, izlenme |
| Jeton paketleri ve VIP abonelik (demo ödeme) | |
| Günlük giriş ödülü, hoş geldin bonusu | |
| Favoriler, izleme geçmişi, işlem geçmişi | |
| Misafir hesabı (kayıt gerektirmez) | |

Sunucu, kilitli bölümün video adresini istemciye hiç göndermez. Bölüm açılmadan videoya ulaşılamaz.

## Dosya yapısı

```
server.js          API, video yayını (Range desteği), dosya yükleme
seed.js            Demo diziler (npm run reset)
data/db.json       Veritabanı (otomatik oluşur)
media/             Yönetim panelinden yüklenen videolar ve kapaklar
public/
  index.html       Uygulama kabuğu
  app.js           Tüm ekranlar: ana sayfa, dizi, oynatıcı, cüzdan, profil
  app.css          Tasarım
  admin.html/js/css  Yönetim paneli
```

İş kuralları (jeton paketleri, VIP fiyatları, bonuslar, günlük reklam hakkı) `server.js` dosyasının başındaki `CONFIG` bölümündedir.

## Demo olan kısımlar ve yayına almadan önce yapılacaklar

Bu sürüm fikri test etmek için hazırlanmış çalışan bir prototiptir. Gerçek yayına almak için aşağıdaki adımlar gerekir.

1. **Gerçek içerik:** Demo videolar `media/demo/` klasöründeki kısa, yatay, açık lisanslı kliplerdir. Klasör silinirse `npm run demo-videos` komutuyla yeniden indirilir. Kendi dikey (9:16) dizilerinizi yönetim panelinden yükleyin. İzinsiz içerik kullanmayın.
2. **Video altyapısı:** Videoları kendi sunucunuz yerine **Cloudflare Stream**, **Bunny Stream** veya **Mux** gibi bir servise taşıyın. Bu servisler HLS formatı, otomatik kalite ve CDN sağlar. Yönetim panelinde bölüm eklerken `.m3u8` adresi girmeniz yeterlidir; iOS Safari HLS'i doğrudan oynatır, Android/Chrome için `hls.js` eklenmelidir.
3. **Gerçek ödeme:** `/api/purchase/*` uçları şu an demo. Mobil uygulamada Google Play ve App Store satın alması zorunludur. **RevenueCat** kullanın ve satın almayı onun webhook'u ile sunucuda doğrulayın.
4. **Gerçek reklam:** "Reklam izle" şu an 5 saniyelik sahte bir ekran. **AdMob ödüllü reklam** ve sunucu tarafı doğrulama (SSV) kullanın.
5. **Mobil uygulama:** Bu web uygulaması **Capacitor** ile hiç baştan yazılmadan Android/iOS uygulamasına çevrilebilir (`npx cap add android`).
6. **Veritabanı ve hesaplar:** JSON dosyası yerine PostgreSQL (veya Supabase) kullanın. Google/Apple ile giriş ekleyin.
7. **Güvenlik:** `ADMIN_KEY` ortam değişkenini güçlü bir değerle ayarlayın (`$env:ADMIN_KEY="..."; npm start`). HTTPS kullanın.
8. **Yasal:** KVKK aydınlatma metni, gizlilik politikası, kullanım şartları ve iade koşulları.

## API özeti

| Yöntem | Adres | Açıklama |
|---|---|---|
| POST | `/api/auth/guest` | Misafir hesabı oluşturur, token döner |
| GET | `/api/me` | Profil, bakiye, geçmiş, favoriler, işlemler |
| GET | `/api/series` | Tüm diziler |
| GET | `/api/series/:id` | Dizi ve bölümler (kilit durumu dahil) |
| POST | `/api/episodes/:id/unlock` | `{method: "coins" \| "ad"}` |
| POST | `/api/progress` | `{episode_id, seconds}`, izleme ilerlemesini kaydeder |
| POST | `/api/favorites/:id` | Favori ekler veya çıkarır |
| POST | `/api/checkin` | Günlük ödül |
| POST | `/api/purchase/coins` · `/api/purchase/vip` | Demo satın alma |
| * | `/api/admin/*` | Yönetim (başlık: `x-admin-key`) |
