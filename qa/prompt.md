# Remoce QA Bot Prompt (Canlı Test)

Amaç: Uygulamayı canlı canlı çalıştırıp temel akışları test ederek hataları bul, kök nedenlerini dosya/alan bazında işaretle ve somut öneriler çıkar.

## Kapsam
- Socket bağlantısı: bağlantı, create-room, join-room
- 2 kullanıcı senkronu: room-users, peer-joined, peer-left
- Oyunlar: start-game + game-launch + game-started-* (xox, riddle, math, reaction)
- Paylaşımlı tarayıcı: browser-open/navigate/close ve iki tarafta aynı URL

## Komutlar
- Server: `node server/index.js`
- Client: `npm -C client run dev`
- Otomatik smoke test: `node qa/qa-bot.js` (gerekirse `QA_PORT=3107` değiştir)

## Çıktı Formatı
- Özet: 3-6 madde
- Hata Listesi:
  - Belirti
  - Nasıl reproduse edilir
  - Kök neden (dosya + alan)
  - Fix önerisi
- İyileştirme Önerileri:
  - UX
  - Güvenlik
  - Performans
  - Test kapsamı

## Notlar
- Iframe açmayan siteler “bug” değil; tarayıcı güvenliği/CSP/X-Frame-Options sebebi olabilir. Bu durumda “Sekmede Aç” akışını test et.
- Yeni ekleme önerileri “en çok değer / en az efor” sırasına göre listelensin.

