# Sonçağ Stok Dashboard — Proje Özeti

> Tarih: 2026-05-11  
> Branch: main · 15 commit

---

## Proje Nedir

Sonçağ firması için geliştirilmiş çok kullanıcılı, Supabase tabanlı stok yönetim panelidir. E-ticaret/perakende işletmesinin ürün envanterini, stok hareketlerini ve satış performansını takip eder.

> **Not:** CLAUDE.md'de başlangıçta localStorage tabanlı tek dosya olarak planlanmıştı. Proje zamanla Supabase auth + veritabanı, modüler JS mimarisi ve çok kullanıcılı yetki sistemine evrildi.

---

## Dosya Yapısı

```
stok/
├── index.html              — Ana uygulama (HTML + inline CSS referansları)
├── assets/
│   ├── style.css           — Tüm stiller (koyu tema, CSS değişkenleri)
│   └── js/
│       ├── app.js          — Ana mantık: CRUD, grafikler, istatistikler, import/export
│       ├── auth.js         — Kimlik doğrulama, yetki sistemi, oturum yönetimi
│       ├── admin.js        — Admin paneli: kullanıcı yönetimi, audit log
│       ├── ui.js           — Yardımcı fonksiyonlar: toast, modal, format, animasyon
│       └── supabase.js     — Supabase client (normal + service role)
└── logo.jfif               — Marka logosu (favicon + header)
```

---

## Teknik Stack

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Vanilla HTML/CSS/JS (framework yok) |
| Auth & DB | Supabase (PostgreSQL + Auth) |
| Font | DM Sans (Google Fonts) |
| Excel Import | XLSX.js (cdn) |
| Grafikler | Saf SVG (kütüphane yok) |
| Para birimi | EUR bazlı fiyatlandırma, canlı EUR/TRY kuru API |

---

## Veri Modeli

### Ürün (`products` tablosu)
```
id, name, barcode (SKU), category, cost_price (EUR), sale_price (EUR),
stock, min_stock, sales7d, status, warehouse_info,
purchase_rate (alış kuru), sale_rate (satış kuru), created_at
```

### Hesaplanan Alanlar (istemci tarafı)
```js
margin        = ((price - cost) / price) * 100        // Kar marjı %
stockValueEUR = stock * cost                           // Stok değeri (EUR)
stockValueTL  = stockValueEUR * eurRate                // TL karşılığı
daysUntilOut  = stock / (sales7d / 7)                  // Tahmini tükenme (gün)
```

---

## Özellikler

### Kimlik Doğrulama
- Supabase email/password login
- Oturum localStorage'da kalıcı (`persistSession: true`)
- Super admin: `teknik@soncag.com` (tüm izinler statik)

### Yetki Sistemi (Granüler)
| İzin | Açıklama |
|------|----------|
| `view` | Ürün listesi ve istatistikleri görüntüleme |
| `add_products` | Ürün ekleme ve düzenleme |
| `make_sales` | Stoktan satış/çıkış yapma |
| `manage_categories` | Kategori CRUD |
| `view_history` | Stok hareket geçmişini görme |
| `admin` | Kullanıcı yönetimi, tüm erişim |

View-only kullanıcılar fiyat/maliyet bilgilerini göremez.

### Dashboard İstatistikleri (4 kart)
1. **Toplam Ürün** — çeşit sayısı + toplam adet
2. **Toplam Stok Değeri** — EUR ve TL karşılığı (view-only'e gizli)
3. **Düşük Stok** — `stock <= minStock` olan ürün sayısı
4. **Ortalama Kar Marjı** — tüm ürünlerin ortalaması

Sayılar `requestAnimationFrame` ile 0'dan hedefe animasyonlu sayar.

### SVG Grafikler
- **Donut Chart** — Kategorilere göre ürün dağılımı, hover tooltip, animasyonlu dilimler
- **Bar Chart** — Haftalık satışta ilk 8 ürün, gridlines, bar üstü değer etiketi

### Ürün Tablosu
Sütunlar: Ad/Barkod · Kategori · Depo · Alış/Satış (EUR) · TL Karşılığı · Kar Marjı (renk kodlu) · Stok + progress bar · 7g Satış · Durum badge · İşlemler

Durum renkleri: Aktif (yeşil) · Düşük Stok (sarı) · Tükendi (kırmızı, satır arka planı kırmızımsı)

### Filtreleme & Arama
- Canlı arama (ad + barkod)
- Kategori filtresi
- Durum filtresi
- Sıralama: Ada gore, fiyata göre, stoka göre, satışa göre

### EUR/TRY Kuru
- Açılışta canlı API'den otomatik çekilir
- `localStorage`'da önbellek
- Header'da widget: `€1 = ₺XX.XX` + yenile butonu
- Alış kuru ve satış kuru ürün bazlı kayıt edilebilir

### CSV Import
- Excel/CSV dosyası sürükle-bırak veya seç
- Sütun başlıkları otomatik eşleştirilir (Türkçe/İngilizce çok varyant)
- Önizleme tablosu, seçici onay akışı

### CSV Export
- Tüm ürünleri `stok-raporu-YYYY-MM-DD.csv` olarak indirir
- UTF-8 BOM (Excel uyumlu)
- Türkçe sütun başlıkları

### Stok Hareket Geçmişi
- Her CRUD işlemi `logMovement` ile kayıt altına alınır
- Ürün bazlı geçmiş modalı

### Admin Paneli
- Sekme: **Kullanıcılar** — yetki düzenleme, uyarı alımı toggle
- Sekme: **Kullanıcı Oluştur** — yeni hesap oluşturma (service role ile)
- Sekme: **Audit Log** — tüm işlem kaydı

### Alert Banner
Düşük stoklu ürünler varsa header altında otomatik uyarı şeridi.

---

## Tema & Tasarım

```css
--bg-primary:  #0a0a0a   /* Sayfa arka planı */
--bg-card:     #1a1a1a   /* Kartlar */
--accent:      #3b82f6   /* Ana mavi */
--success:     #22c55e
--warning:     #f59e0b
--error:       #ef4444
--text-primary: #f5f5f5
```

Font: DM Sans · Dil: Türkçe · Responsive (768px / 480px kırılım noktaları)

---

## Git Geçmişi (özet)

| Commit | Açıklama |
|--------|----------|
| `4aa891a` | Supabase edge function ve migration geri eklendi |
| `a42a7fc` | UI polish — premium koyu dashboard |
| `7246d47` | `logAction` → `logMovement` tüm CRUD'da |
| `6b5200d` | Tüm CRUD işlemlerine audit log eklendi |
| `f7092a9` | Inline stok ±buton kaldırıldı, uyarı banner eklendi |
| `a87843a` | Logo favicon ve brand icon olarak eklendi |
| `299003f` | Modüler JS mimarisi, UI düzeltmeleri |
| `3ad5550` | CSV import, stok geçmişi, hızlı tarama, dashboard iyileştirme |
| `510875f` | Mobil uyumluluk — responsive header, filter bar, tablo scroll |

---

## Bilinen Kısıtlamalar / Dikkat Noktaları

- ~~`supabase.js` içinde `SUPABASE_SERVICE_KEY` düz metin olarak istemci kodunda~~ → **2026-05-12'de giderildi.** Service key frontend'den tamamen silindi; auth admin işlemleri `admin-operations` Edge Function'a taşındı. Bkz. [[Güvenlik-Mimarisi]]
- CLAUDE.md'deki 3-view (Editör/Landing/Tam UI) tab sistemi henüz uygulanmamış
- `assets/js/app.js` büyüdükçe tek dosya karmaşıklaşabilir; ilerde feature modüllerine bölünebilir
- EUR kuru API başarısız olursa fallback `34.00` sabit değeri kullanılır
