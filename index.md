---
date: 2026-05-12
tags: [index, vault, blueprints, master-map]
type: index
---

# 🗺️ Blueprints Vault — Ana Harita

Bu vault, Claude Code ile inşa edilen hazır uygulama şablonlarını (blueprint) ve aktif projeleri barındıran **ikinci beyin**dir. Her şey buraya bağlanır.

> [!info] Nasıl Kullanılır
> Her blueprint'in içinde `CLAUDE.md` (spec) + `kur.md` (build komutu) bulunur. [[KULLANIM-REHBERI]]'ne bak. Tüm aktivite [[log]]'da kayıt altında.

---

## ⚡ Aktif Projeler (Canlı / Deploy Edilmiş)

| Proje | Durum | Notlar |
|-------|-------|--------|
| [[stok/özet\|Sonçağ Stok Dashboard]] | 🟢 Canlı | Supabase auth + granüler yetki · [[stok/Güvenlik-Mimarisi\|Edge Function mimarisi]] · [[stok/Supabase-Limitleri\|Limit yönetimi]] · [[stok/Pagination-Mimarisi\|Server-Side Pagination]] |
| [[restoran]] | 🟡 Build Var | `index.html` mevcut, blueprint'ten türedi |

---

## 📦 Blueprint Kataloğu (15 Şablon)

Tüm blueprint'ler `/kur` komutuyla `index.html` üretir. API anahtarı gerekenler işaretlendi.

### 🛒 E-Ticaret (4)

| # | Blueprint | API | Açıklama |
|---|-----------|-----|----------|
| 1 | [[urun-aciklama-yazici]] | Fal AI | Ürün açıklama metni + AI ürün fotoğrafı |
| 2 | [[stok-dashboard]] | — | Envanter paneli, 20 ürün hazır, CSV export |
| 3 | [[fiyat-hesaplayici]] | Apify | Google Shopping'den rakip fiyat karşılaştırma |
| 4 | [[qr-menu]] | Fal AI | Restoran QR dijital menü + AI yemek görseli |

### 🎬 YouTube (3)

| # | Blueprint | API | Açıklama |
|---|-----------|-----|----------|
| 5 | [[video-icerik-uretici]] | Fal AI | Başlık/tag/script üretici + AI thumbnail |
| 6 | [[thumbnail-olusturucu]] | Fal AI | Canvas editör + AI arka plan oluşturucu |
| 7 | [[analytics-dashboard]] | Apify | Gerçek YouTube kanal verisi dashboard'u |

### ⚙️ Otomasyon (3)

| # | Blueprint | API | Açıklama |
|---|-----------|-----|----------|
| 8 | [[workflow-builder]] | — | n8n tarzı sürükle-bırak görsel akış |
| 9 | [[lead-scraper-panel]] | Apify | Google Maps'ten lead scraping paneli |
| 10 | [[email-kampanya-yoneticisi]] | — | Cold email funnel yöneticisi |

### 🧩 Uygulamalar (5)

| # | Blueprint | API | Açıklama |
|---|-----------|-----|----------|
| 11 | [[randevu-sistemi]] | — | Takvim + online booking sistemi |
| 12 | [[fatura-olusturucu]] | — | KDV hesaplamalı, canlı önizleme + PDF |
| 13 | [[restoran-siparis-sistemi]] | — | 3 ekran: müşteri / mutfak / yönetim |
| 14 | [[portfolio-site-builder]] | Fal AI | Görsel portfolio + AI profil fotoğrafı |
| 15 | [[ai-chatbot-widget]] | Fal AI | Chatbot widget builder + AI bot avatarı |

---

## 🔑 API Referansları

| Servis | Kullanıldığı Yerler | Dashboard |
|--------|---------------------|-----------|
| **Fal AI** | qr-menu, video-icerik-uretici, thumbnail-olusturucu, urun-aciklama-yazici, portfolio-site-builder, ai-chatbot-widget | https://fal.ai/dashboard/keys |
| **Apify** | fiyat-hesaplayici, analytics-dashboard, lead-scraper-panel | https://console.apify.com/account/integrations |
| **Supabase** | [[stok/özet\|Sonçağ Stok]] | Proje CLAUDE.md'de |

---

## 📝 Community Notları

Webinar/topluluk paylaşımlarından gelen snippet'ler ve uzantılar:

- [[_COMMUNITY_Auth Screen & Theme]] — Auth ekranı ve tema şablonu
- [[_COMMUNITY_Dark Theme Colors]] — Koyu tema renk paleti referansı
- [[_COMMUNITY_Pie Chart]] — SVG pie/donut chart snippet
- [[_COMMUNITY_Product CRUD & Supabase]] — Supabase ile ürün CRUD kalıbı
- [[_COMMUNITY_Product Data & CSV Export]] — Ürün verisi + CSV export kalıbı

> [!todo] Community notları henüz boş — webinar katılımcıları içerik ekledikçe güncellenecek.

---

## 🏗️ Vault Meta

- [[KULLANIM-REHBERI]] — Blueprint sistemi nasıl kullanılır, script ile kurulum
- [[CLAUDE.md]] — Master Architect protokolü (bu vault'un kuralları)
- [[log]] — Tüm aktivite logu (append-only)

---

## 🧱 Ortak Teknik Standartlar

Tüm blueprint'ler bu standartları paylaşır:

```
Tek dosya:  index.html (inline CSS + JS)
Font:       DM Sans (Google Fonts)
Tema:       Koyu arka plan #0a0a0a
Dil:        Türkçe
Framework:  Yok — vanilla HTML/CSS/JS
Persist:    localStorage (API'siz) veya Supabase (auth gerekenlerde)
```

> [!success] Güvenlik Mimarisi — Tamamlandı ✅
> [[stok/özet|Sonçağ Stok Dashboard]]'da service key frontend'den tamamen kaldırıldı. `admin-operations` Edge Function production'a deploy edildi (2026-05-12). Admin işlemleri artık JWT doğrulamalı [[stok/Güvenlik-Mimarisi|Edge Function]] üzerinden yürütülüyor — güvenlik açığı kapatıldı.
