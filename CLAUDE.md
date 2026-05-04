# Stok Yonetim Dashboard — Blueprint

## Amac
E-ticaret isletmeleri icin gorsel acidan etkileyici, tam islevli envanter yonetim paneli. Urunleri listeleme, ekleme, duzenleme, silme, arama/filtreleme, SVG grafikler ve CSV export. Tamamiyla localStorage tabanli, API yok.

## Teknik Gereksinimler
- Tek dosya: `index.html` (inline CSS + JS)
- Tema: Koyu (#0a0a0a arka plan), aksent renk #3b82f6 (mavi)
- Font: DM Sans (Google Fonts)
- Dil: Turkce
- Framework yok, sadece vanilla HTML/CSS/JS
- localStorage ile tum veri persistance
- SVG tabanli grafikler (kutuphanesiz, saf SVG)

## API Anahtari
Bu projede API kullanilmiyor. Harici bagimliligi yok.

### .env.example
```
# Bu proje API anahtari gerektirmez
```




## Veri Yapisi

### Urun Objesi
```js
{
  id: number,
  name: string,
  sku: string,           // Stok Kodu
  category: string,
  price: number,         // Satis fiyati (TL)
  cost: number,          // Maliyet (TL)
  stock: number,         // Mevcut stok
  minStock: number,      // Minimum stok esigi
  sales7d: number,       // Son 7 gun satis
  status: "active" | "low_stock" | "out_of_stock",
  createdAt: timestamp
}
```

### Hesaplanan Alanlar
```js
profit = price - cost                    // Birim kar
margin = ((price - cost) / price) * 100  // Kar marji %
stockValue = stock * cost                // Stok degeri (maliyet bazli)
stockRevenue = stock * price             // Stok degeri (satis bazli)
daysUntilOut = stock / (sales7d / 7)     // Tahmini tukeniş suresi (gun)
```

## UI Spesifikasyonu

### Genel Layout
```
+--------------------------------------------------+
|  HEADER: "Stok Yonetim" + Arama + [Urun Ekle]   |
+--------------------------------------------------+
|  ISTATISTIK KARTLARI (4 adet, yatay)             |
|  [Toplam Urun] [Stok Degeri] [Dusuk Stok] [Kar] |
+--------------------------------------------------+
|  GRAFIKLER (2 adet, yan yana)                     |
|  [Kategori Dagilimi - Pie] [Haftalik Satis - Bar]|
+--------------------------------------------------+
|  FILTRELER: Kategori | Durum | Siralama           |
+--------------------------------------------------+
|  URUN TABLOSU                                     |
|  Ad | SKU | Kategori | Fiyat | Stok | Satis | ...|
+--------------------------------------------------+
|  [CSV Indir] [Verileri Sifirla]                   |
+--------------------------------------------------+
```

### Istatistik Kartlari (4 adet)
Her kart icerigi:

1. **Toplam Urun**: Urun sayisi, ikon: kutular
2. **Toplam Stok Degeri**: Maliyet bazli toplam, ikon: TL simgesi, format: "₺125.430"
3. **Dusuk Stok Uyarisi**: stock <= minStock olan urun sayisi, ikon: uyari ucgeni, kirmizi ton
4. **Ortalama Kar Marji**: Tum urunlerin ortalama margin'i, ikon: yukari ok, yesil ton

Animasyon: Sayfa yuklendiginde sayilar 0'dan hedef degere sayar (1.5sn, easeOut). `requestAnimationFrame` kullan.

### SVG Grafikler

#### Kategori Dagilimi (Pie/Donut Chart)
- Her kategori icin dilim, renk kodlu
- Ortasinda toplam urun sayisi
- Hover'da dilim buyusun, tooltip gostersin (kategori adi + urun sayisi + yuzde)
- Renkler: her kategoriye sabit renk ata
- Donut seklinde (ic yaricap = dis yaricap * 0.6)

#### Haftalik Satis (Bar Chart)
- X ekseni: urun adlari (top 8 en cok satan)
- Y ekseni: satis adedi
- Bar rengi: aksent mavi, hover'da acik mavi
- Her barin ustunde deger etiketi
- Gridlines yatay

### Filtre Bari
- Kategori dropdown: "Tum Kategoriler" + CATEGORIES listesi
- Durum dropdown: "Tumu", "Aktif", "Dusuk Stok", "Tukendi"
- Siralama dropdown: "Ada Gore (A-Z)", "Fiyata Gore (Artan)", "Fiyata Gore (Azalan)", "Stoka Gore (Azalan)", "Satisa Gore (Azalan)"
- Arama: header'daki arama input'u ile canli filtreleme (ad ve SKU'da ara)

### Urun Tablosu
Sutunlar:
| Sutun | Genislik | Icerik |
|-------|----------|--------|
| Urun Adi | flex | Ad + SKU alt satir |
| Kategori | 140px | Badge seklinde |
| Fiyat | 100px | ₺249,90 formati |
| Maliyet | 100px | ₺85,00 formati |
| Kar Marji | 90px | %65.9 + renk (yesil >40, sari >20, kirmizi <20) |
| Stok | 80px | Sayi + progress bar (stock/minStock*100 bazli) |
| 7g Satis | 80px | Sayi |
| Durum | 100px | Renkli badge: Aktif/Dusuk/Tukendi |
| Islemler | 80px | Duzenle + Sil ikonlari |

Tablo satirlari hover efekti. Tukenmis urunler hafif kirmizi arka plan.

### Urun Ekle/Duzenle Modal
- Karanlik overlay
- Bos form (ekle) veya dolu form (duzenle)
- Alanlar: name, sku, category (select), stock, minStock
- Kaydet + Iptal butonlari
- Form validasyonu: tum alanlar zorunlu, fiyat > maliyet kontrolu

### CSV Export
Buton tiklandiginda tum urun verisini CSV olarak indir. Dosya adi: `stok-raporu-YYYY-MM-DD.csv`. Turkce basliklar. UTF-8 BOM ile (Excel uyumlu).

### Verileri Sifirla
Onay modal'i gosterip localStorage'i temizle ve varsayilan veriyle yeniden yukle.

### Responsive
- 1024px alti: grafikler alt alta
- 768px alti: istatistik kartlari 2x2 grid, tablo yatay scroll
- 480px alti: kartlar tek kolon

### Animasyonlar
- Sayfa yuklenme: kartlar staggered fade-in (100ms aralik)
- Sayi animasyonu: 0'dan hedefe 1.5sn (counter animation)
- Tablo satirlari: fade-in
- Modal: scale(0.95) -> scale(1) transition
- Silme: satir kayarak kuculsun ve kaybolsun
- Grafik: pie chart dilimleri saat yonunde animasyonla acilsin
- Bar chart: barlar asagidan yukari buyusun

### Renk Paleti
```css
--bg-primary: #0a0a0a;
--bg-secondary: #111111;
--bg-card: #1a1a1a;
--bg-table-row: #141414;
--bg-table-hover: #1e1e1e;
--border: #2a2a2a;
--text-primary: #f5f5f5;
--text-secondary: #a0a0a0;
--accent: #3b82f6;
--accent-hover: #2563eb;
--success: #22c55e;
--warning: #f59e0b;
--error: #ef4444;
```

## localStorage Yapisi

```js
// Key: 'stok-dashboard-products'
// Value: JSON array of product objects

// Key: 'stok-dashboard-initialized'
// Value: 'true' (ilk yukleme yapildi mi)
```

## Onemli Notlar
- Fiyat formatlama: Turkce locale, ₺ simgesi, 2 ondalik
- SKU otomatik onerisi: Kategori kisaltmasi + 3 haneli artan sayi
- Status otomatik guncelleme: stock === 0 -> out_of_stock, stock <= minStock -> low_stock, diger -> active
- Grafiklerin animasyonlu olmasina onem ver, dashboard hissi versin
- Silme isleminde onay iste
- Tablo bos ise "Urun bulunamadi" mesaji goster

---

## 🎯 3 GÖRÜNÜM ZORUNLULUĞU (ÖNEMLİ)

Bu uygulamayı kurarken **3 farklı view (görünüm)** zorunlu olarak içerecek. Sağ panelde tab'lar ile geçiş:

### View 1: 📱 Düzenleyici / Editör (varsayılan)
- Yukarıda anlatılan ana editör arayüzü
- Sol panel form/ayarlar, sağ panel mini önizleme

### View 2: 🌐 Web Sitesi / Landing Page
- Browser frame (mac-stili: 3 colored dots + URL bar)
- Tam müşteri-yüzlü landing page mockup:
  - **Hero** — büyük başlık, slogan, 2 CTA buton, gradient arka plan
  - **3 Feature** kartı (icon + başlık + açıklama)
  - **Popüler içerik grid** (varsa popular işaretli olanlar otomatik)
  - **İletişim Info** (adres, saat, telefon — 3 kolon)
  - **CTA section** — büyük çağrı + buton
  - **Footer** — copyright + brand

### View 3: 🍽️ Müşteri Görünümü / Tam UI
- Browser frame
- Müşterinin gerçekten kullanacağı tam ekran arayüz
- (Bu uygulamanın asıl ürünü — örn QR menü için tam menü sayfası, randevu için booking sayfası)

### Tab Sistemi (zorunlu)
```html
<div class="view-tabs">
  <button class="view-tab active" onclick="switchView('phone')">📱 Editör</button>
  <button class="view-tab" onclick="switchView('landing')">🌐 Web Sitesi</button>
  <button class="view-tab" onclick="switchView('app')">🎯 Tam UI</button>
</div>
```

### Browser Frame CSS (zorunlu)
```css
.browser-frame {
  background: white; border-radius: 12px; overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4); border: 1px solid #333;
}
.browser-bar {
  background: #2a2a2a; padding: 10px 16px;
  display: flex; align-items: center; gap: 16px;
}
.browser-dots span { width: 12px; height: 12px; border-radius: 50%; }
.browser-dots span:nth-child(1) { background: #ff5f57; }
.browser-dots span:nth-child(2) { background: #febc2e; }
.browser-dots span:nth-child(3) { background: #28c840; }
.browser-url {
  background: #1a1a1a; color: #999; padding: 6px 14px;
  border-radius: 6px; font-size: 12px; flex: 1; text-align: center;
}
```

### Reactive Updates
Her view aynı state'ten render edilmeli — editör'deki değişiklik anında 3 view'da yansımalı.

```js
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view-content').forEach(c => c.classList.add('hidden'));
  document.getElementById('view-' + view).classList.remove('hidden');
  if (view === 'landing') renderLanding();
  if (view === 'app') renderApp();
  if (view === 'phone') renderPreview();
}
```

///### Landing Page İçerik Üretimi
///Müşteri sektörüne göre AI ile üretilebilir ya da template'le:
///- Restoran → "Geleneksel Lezzet, Modern Sunuş" + 3 değer önermesi
///- Diş kliniği → "Profesyonel Diş Hizmeti" + uzmanlık alanları
///- Salon → "Modern Saç & Güzellik" + hizmetler
///- Otel → "Konfor + Lüks" + oda tipleri

///### Tab Arası Geçiş Animasyonu (opsiyonel)
///Smooth opacity transition (0.2s).

