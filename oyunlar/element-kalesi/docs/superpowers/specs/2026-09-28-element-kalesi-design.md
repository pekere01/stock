---
title: Element Kalesi — Tasarım (Spec)
tags: [proje/aktif, alan/oyun, tip/plan]
created: 2026-09-28
type: plan
---

# Element Kalesi — Tasarım

> [!info] Özet
> Android + iOS için 2D, dikey, tek elle oynanan **Merge + Tower Defense** hybrid-casual oyun.
> Fantastik tema; ayırt edici mekanik **element birleştirme** (farklı elementler → melez birim).
> Hedef: ~4–6 haftada küçük bir ilk sürüm (MVP) → Play Store → oyuncu verisine bakıp büyütmek.
> Geçici ad: "Element Kalesi".

## 1. Neden bu oyun (pazar gerekçesi)

- 2025–2026'da casual pazar düz; büyüyen tek segment **hybrid-casual** (basit oynanış + kalıcı
  ilerleme + reklam/IAP karma gelir).
- Tower Defense: uzun oturum, yüksek ARPDAU, düzenli içerik güncellemesiyle ayakta kalır.
- Survivor-like ve Match-3 doymuş; kopya oyunlar yerine **"kanıtlanmış tür + taze mekanik"**
  kazanıyor. Bizim tazeliğimiz: element melezleme + keşif/koleksiyon.
- Kaynak ilham: Nextbiggames "Most Promising Idle & Action Games August 2026" videosu
  (sadeleşen TD, düzenli güncelleme = büyüme sinyali).

## 2. Temel oyun döngüsü (tek maç)

**Ekran:** Dikey. Düşmanlar üstten girip kıvrılan yoldan alttaki kale kapısına yürür.
Yolun ortasında **3×5 = 15 yuvalık** tahta.

**Çağırma:** "Çağır" butonu mana harcar, boş rastgele bir yuvaya **1. seviye** rastgele temel
element birimi koyar. Her çağırma maliyeti artar (formül `data/`'da; başlangıç 10 mana, her
çağırmada +5). Tahta doluysa buton pasif.

**4 temel element:**

| Element | Rol |
|---|---|
| 🔥 Ateş | Alan hasarı |
| ❄️ Buz | Yavaşlatma |
| ⚡ Şimşek | Zincirleme vuruş |
| 🌿 Doğa | Zehir (zamanla hasar) |

**Birleştirme (sürükle-bırak):**
- **Aynı element + aynı seviye** → o element, seviye +1. Azami seviye **5**.
- **Farklı temel element + aynı seviye, seviye ≥ 2** → **melez birim**. Melezin gücü
  birleştirilen seviyeye göre ölçeklenir. Melezler **seviye atlayamaz ve birleştirilemez**.
- Diğer tüm kombinasyonlar (farklı seviye, seviye 1 farklı element, melez içeren) **geçersiz** →
  birim eski yerine döner.
- 4 temel elementten 6 melez (isimler ve yetenekler `data/`'da denge sırasında netleşir):

| Tarif | Melez (çalışma adı) |
|---|---|
| Ateş + Buz | Buhar Büyücüsü |
| Ateş + Şimşek | Plazma Topçusu |
| Ateş + Doğa | Kül Druidi |
| Buz + Şimşek | Kristal Okçu |
| Buz + Doğa | Don Sarmaşığı |
| Şimşek + Doğa | Fırtına Druidi |

**Keşif:** Bir melez ilk kez oluşturulunca **Büyü Kitabı**na kaydedilir (kalıcı koleksiyon;
keşfedilmemiş tarifler "?" gösterilir).

**Dalgalar:** Maç başına **15 dalga**. Düşmanlar ölünce mana düşürür. Kale **20 can**; kapıya
ulaşan düşman can düşürür (boss daha fazla). **5. ve 10. dalga ara boss, 15. dalga final boss
Ejderha.** Can 0 → maç kaybedilir; 15. dalga temizlenince kazanılır.

**Dalga arası:** 5 saniyelik mola (birleştirme ve planlama için).

**Hedef süre:** Maç başına ~6–8 dakika.

## 3. Maçlar arası ilerleme (meta)

**Ödüller:** Maç sonunda **altın** (hayatta kalınan dalga sayısına göre; kaybetmek de kazandırır).
Boss yenilince ilgili **element kristali**.

**Kalıcı yükseltmeler (MVP):**
- **Element ağacı:** Her element için 5 kademe (+hasar, +menzil, özel etki). Bedel: altın +
  o elementin kristali.
- **Kale:** Başlangıç canı, başlangıç manası.

**Dünya/bölümler:** 1 dünya, **10 bölüm**. Her bölüm farklı yol şekli ve düşman karışımı.
1–3 yıldız (bitişteki kale canına göre: tam can 3★, ≥%50 2★, kazanıldı 1★).
Bölüm N+1, N kazanılınca açılır.

**Kayıt:** Yalnız cihazda yerel kayıt (hesap/sunucu yok). Kayıt verisi **sürüm numaralı**.

**Gelir (MVP, hafif):**
- **İsteğe bağlı ödüllü reklam:** "Ödülü 2 katına çıkar" ve "kaybettin, 1 kez devam et".
  Zorunlu/geçiş reklamı yok.
- IAP yok (sonraki sürüm: "Reklamları kaldır", kristal paketleri).

**Bilinçli olarak kapsam dışı (MVP):** Çok oyunculu mod, günlük görevler, gacha/sandık, hesap
girişi, bulut kayıt, liderlik tablosu, 5. element. İlk güncelleme adayı: 🌑 **Gölge** elementi
(+4 yeni melez).

## 4. Teknik mimari

**Yığın:** Phaser 3 + TypeScript + Vite (yerel ağda telefondan test). Paketleme: **Capacitor**
(Android + iOS). Reklam: Capacitor AdMob eklentisi (MVP sonunda eklenir).

> [!warning] iOS
> iOS derlemesi ve App Store yüklemesi **Mac gerektirir** (ya da Codemagic gibi bulut derleme).
> Hesaplar: Google Play 25$ (tek sefer), Apple Developer 99$/yıl. MVP önce Android'e çıkar.

**Klasör:** `01_Projects/oyunlar/element-kalesi/`

**Birimler:** `logic/` hiçbir Phaser import'u içermez; `scenes/` iş kuralı içermez.

| Birim | Sorumluluk | Phaser'a bağımlı |
|---|---|---|
| `data/` | Element, birim, melez tarifleri, düşman, dalga, bölüm, ekonomi sabitleri — tüm denge değerleri tek yerde | Hayır |
| `logic/merge` | `merge(a, b) → sonuç \| geçersiz` kuralları | Hayır |
| `logic/economy` | Mana, çağırma maliyeti, altın ödülü, yükseltme fiyatı | Hayır |
| `logic/waves` | Dalga sırası ve düşman çıkış zamanlaması | Hayır |
| `logic/save` | İlerleme okuma/yazma, sürüm taşıma, yedek | Hayır |
| `scenes/` | Menü, bölüm seçimi, maç, maç sonu, yükseltme, Büyü Kitabı — çizim + dokunma | Evet |

**Hata durumları:**
- Kayıt bozuk → yedek kayıttan yükle; o da yoksa temiz kayıt. Asla çökme.
- Reklam yüklenemedi → reklam butonu gizlenir, oyun normal akar.
- Uygulama arka plana alındı → maç otomatik duraklar.

## 5. Test

- `logic/` için **Vitest** birim testleri: birleştirme kuralları (geçerli/geçersiz tüm dallar),
  ekonomi formülleri, dalga zamanlaması, kayıt sürüm taşıma ve bozuk kayıt kurtarma.
- Tarayıcıda otomatik oynatma + ekran görüntüsüyle sahne doğrulama.
- Her kilometre taşından sonra gerçek telefonda deneme.

## 6. Grafik ve lisans

Kenney.nl / itch.io **CC0** fantastik paketler. Her paketin kaynağı ve lisansı
`assets/CREDITS.md`'de kayıtlı. Özel çizimle değiştirme sonraki sürümlere.

## 7. MVP bitti sayılır, eğer

- 10 bölüm baştan sona oynanabilir, 6 melezin hepsi keşfedilebilir.
- Element ağacı ve kale yükseltmeleri çalışır; ilerleme uygulama kapanıp açılınca korunur.
- Ödüllü reklam (test reklam kimlikleriyle) çalışır, başarısızlıkta oyun bozulmaz.
- `logic/` testleri geçer; Android APK/AAB gerçek cihazda sorunsuz açılır.
