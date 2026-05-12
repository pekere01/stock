---
date: 2026-05-12
tags: [log, aktivite, sistem]
type: log
---

# 📋 Vault Aktivite Logu

Append-only kayıt. Her oturum sonunda burayı güncelle.
Format: `## [YYYY-MM-DD] eylem | Özet`

---

## [2026-05-12] edge-function-deploy | admin-operations Edge Function production'a deploy edildi

**Güvenlik & Altyapı tamamlandı:**
- `admin-operations` Supabase Edge Function buluta (production) başarıyla deploy edildi
- `SUPABASE_SERVICE_ROLE_KEY` frontend'den tamamen temizlendi — hiçbir istemci dosyasında kalmadı
- Tüm `auth.admin.*` çağrıları (createUser / deleteUser / updateUserById) artık yalnızca Edge Function üzerinden yürütülüyor
- JWT doğrulama + `user_permissions` tablosu üzerinden admin yetki kontrolü production'da aktif

**Mimari akış (production):**
```
Frontend (anon key) → sb.functions.invoke('admin-operations') → Edge Function (JWT) → service_role → Supabase Auth Admin API
```

Referans: [[stok/Güvenlik-Mimarisi]]

---

## [2026-05-12] github-temizligi | GitHub repo temizliği yapıldı

GitHub'da sadece çalışan kod: `index.html`, `assets/`, `supabase/`
Takibinden çıkarılanlar (lokalde sağlam, sadece GitHub'dan gitti):
- `CLAUDE.md`, `özet.md`, `Güvenlik-Mimarisi.md`, `Pagination-Mimarisi.md`, `Supabase-Limitleri.md`
- `.claudeignore`, `.vscode/`

`.gitignore` kuralları eklendi:
- `*.md` → tüm Obsidian notları otomatik dışarıda
- `.claude/`, `graphify-out/`, `*.rar` → analiz/beyin araçları dışarıda

Commit: `930ef79` — push: `github.com/pekere01/stock`

---

## [2026-05-12] server-side-pagination | Server-Side Pagination mimarisine geçildi

- `stok/assets/js/app.js` — Tüm değişiklikler:
  - `loadData(page)` → `.select('*', { count: 'exact' })` + `.range(from, to)` + `.ilike()` / `.eq()` filtreleri
  - `getFiltered()` → `return products` (client-side filtreleme kaldırıldı)
  - `renderStats()` → `totalCount` değişkeni toplam ürün sayısı için kullanılıyor
  - `filterByStatus()` → async, `pageStatusFilter` set eder, `loadData(0)` çağırır
  - `submitProductForm()` → dup check sunucu taraflı `.ilike()` ile
  - `doDelete()` → `totalCount--` eklendi
  - `exportCSV()` → `totalCount > PAGE_SIZE` ise uyarı toast
  - `commitCategoryRename()` → rename sonrası `loadData(currentPage)` çağrısı
  - `init()` → search 400ms debounced async, kategori/durum filtreleri async
  - `renderPaginationControls()` + `window.goPage()` eklendi
- `stok/index.html` → `#pagination-controls` div eklendi
- `stok/assets/style.css` → `.pagination-controls`, `.pag-btn`, `.pag-page` CSS eklendi
- `stok/Pagination-Mimarisi.md` oluşturuldu — mimari açıklama, güvenlik notları, etkilenen fonksiyonlar
- `stok/CLAUDE.md` — "Sayfalama Kuralı" bölümü eklendi (client-side filtreleme yasaktır)
- `index.md` — Pagination-Mimarisi bağlantısı eklendi

---

## [2026-05-12] performans-limit | Veri çekme limiti 1000'den 5000'e çıkarıldı

- `stok/assets/js/app.js` → `loadData()` içindeki iki sorguya `.range()` eklendi
  - `products`: `.range(0, 4999)` (5000 ürün)
  - `categories`: `.range(0, 1999)` (2000 kategori)
- `stok/CLAUDE.md` — Veritabanı & Sorgu Standartları bölümü eklendi
- `stok/Supabase-Limitleri.md` oluşturuldu — PostgREST limit mekanizması, .range() vs .limit() farkı, sayfalama şablonu

---

## [2026-05-12] anayasa-güncellendi | blueprints/CLAUDE.md — Bölüm 5 "Güvenlik Standartları" eklendi

- Vault geneli bağlayıcı güvenlik kuralları eklendi (5.1 Secret Key, 5.2 Supabase Mimarisi, 5.3 Admin İşlem Kuralı, 5.4 Kontrol Listesi)
- Referans: [[stok/Güvenlik-Mimarisi]]

---

## [2026-05-12] kritik-güvenlik-ve-mimari-dönüşüm | Stok Dashboard — Service Key Temizlendi, Edge Function Mimarisine Geçildi

**Değişen dosyalar:**
- `stok/assets/js/supabase.js` — `SUPABASE_SERVICE_KEY` sabiti ve `sbAdmin` export'u tamamen silindi
- `stok/assets/js/auth.js` — kullanılmayan `sbAdmin` import'u temizlendi
- `stok/assets/js/admin.js` — `sbAdmin` importu kaldırıldı; `adminInvoke()` helper eklendi; 3 auth.admin çağrısı `sb.functions.invoke('admin-operations')` ile değiştirildi
- `stok/index.html` — eski "Service Role Key Eksik" uyarı bloğu kaldırıldı
- `stok/supabase/functions/admin-operations/index.ts` — **YENİ** Edge Function: JWT ile kimlik doğrulama, `user_permissions` üzerinden admin yetkisi kontrolü, service role ile işlem

**Dokümantasyon:**
- `stok/Güvenlik-Mimarisi.md` oluşturuldu — Edge Function akışı, yetki katmanları, dosya haritası
- `stok/CLAUDE.md` — 3 maddelik güvenlik kuralı bölümü eklendi
- `stok/özet.md` — bilinen kısıtlama satırı "giderildi" olarak güncellendi
- `index.md` — güvenlik notu güncel mimariyi yansıtacak şekilde revize edildi

---

## [2026-05-12] rpc-dashboard | Dashboard istatistikleri için Supabase RPC'ye geçildi

**Sorun:** 127k ürün → client-side pagination (50 satır) tüm istatistikleri yanlış hesaplıyordu.

**Çözüm:** `get_dashboard_summary()` PostgreSQL fonksiyonu → tek sorguda tüm tabloyu aggregate eder.

- `stok/supabase/get_dashboard_summary.sql` — SQL Editor'de çalıştırılacak RPC tanımı
- `stok/assets/js/app.js`:
  - `dashboardSummary` state değişkeni eklendi
  - `loadData()` → `Promise.all([cats, products, rpc])` ile paralel çağrı
  - `renderStats()` → `total_count`, `total_stock`, `total_cost_value`, `total_sale_value`, `low_stock_count`, `avg_margin` artık RPC'den geliyor
  - `renderAlertBanner()` → `out_of_stock_count` + `low_stock_count` artık RPC'den geliyor
  - `renderPieFromSummary()` eklendi (pasif) — tüm kategori dağılımını RPC'den çizer; kullanıcı onayı bekleniyor

**RPC dönüş alanları:** `total_count`, `total_stock`, `low_stock_count`, `out_of_stock_count`, `total_cost_value`, `total_sale_value`, `avg_margin`, `category_distribution[]`

---

## [2026-05-12] pagination-count-cache-ve-state-reset | Pagination exact count cache'lendi ve state reset bug'ı çözüldü

**Yavaşlık düzeltmesi:**
- `loadData(page, recount=true)` — yeni `recount` parametresi eklendi
- Filtre yokken `count: 'exact'` kaldırıldı; `dashboardSummary.total_count` (RPC) kullanılıyor
- Filtre varsa sadece filtre değişiminde `count: 'exact'` çalışıyor (sayfa geçişinde değil)
- `window.goPage()` → `loadData(page, false)` ile recount atlanıyor
- `hasFilter` flag'i: `safe || pageCatFilter || pageStatusFilter`

**State reset bug'ı:**
- `auth.js` — `onAuthStateChange` içinde `TOKEN_REFRESHED` artık `enterApp()` çağırmıyor
- `SIGNED_IN` / `INITIAL_SESSION` → `app-root.hidden` kontrolüyle sadece auth ekranındayken `enterApp()` tetikleniyor
- Sekme focus'unda token yenilenince `currentPage` artık sıfırlanmıyor

**Değişen dosyalar:** `stok/assets/js/app.js`, `stok/assets/js/auth.js`

---

## [2026-05-12] sistem-başlatıldı | Vault indexlendi ve LLM Wiki protokolü aktive edildi

- Tüm loose `.md` dosyaları tarandı: `KULLANIM-REHBERI.md`, `2026-05-04.md`, 5× `_COMMUNITY_*` notu
- 15 blueprint kataloğu çıkarıldı, kategorilere ayrıldı (E-Ticaret / YouTube / Otomasyon / Uygulamalar)
- 2 aktif proje tespit edildi: [[stok/özet|Sonçağ Stok Dashboard]] (Supabase, production) + [[restoran]] (index.html mevcut)
- [[index]] oluşturuldu — tüm projeleri, API referanslarını ve community notlarını haritalar
- [[log]] oluşturuldu — bu dosya
- Vault artık [[CLAUDE.md]] Master Architect protokolü altında yönetiliyor
