---
date: 2026-05-12
tags: [supabase, pagination, performans, mimari, stok]
type: concept
---

# Server-Side Pagination Mimarisi

[[stok/özet|Sonçağ Stok]] projesinde 127.780 ürünlük veri seti için sunucu taraflı sayfalama.

---

## Sorun: 127.780 Ürün → Client-Side Filtreleme İmkânsız

Önceki mimari tüm ürünleri tek seferde çekip tarayıcıda filtreliyordu.
`.range(0, 4999)` ile 5000 ürün sınırına takılıyorduk; gerçek veri seti bunun 25 katı.

> [!warning] Client-Side Filtreleme Yasaktır
> `app.js` içinde `products.filter(...)` ile arama/filtreleme yapılamaz.
> Tüm filtreleme `.ilike()`, `.eq()` ile Supabase'e devredilmelidir.
> Bkz. [[stok/CLAUDE.md]] — Sayfalama Kuralı.

---

## Çözüm: `loadData(page)` + Server-Side Query

### Temel Parametreler

```js
const PAGE_SIZE = 50;          // sayfa başı kayıt
let currentPage = 0;           // aktif sayfa (0-indeksli)
let totalCount  = 0;           // Supabase'den gelen tam kayıt sayısı
let pageSearch       = '';     // ilike filtresi
let pageCatFilter    = '';     // .eq('category', ...)
let pageStatusFilter = '';     // .eq('status', ...)
```

### Query Yapısı

```js
export async function loadData(page = 0) {
  const from = page * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let q = sb.from('products')
    .select('*', { count: 'exact' })   // totalCount için
    .order('created_at', { ascending: true });

  if (pageSearch)        q = q.or(`name.ilike.%${safe}%,barcode.ilike.%${safe}%`);
  if (pageCatFilter)     q = q.eq('category', pageCatFilter);
  if (pageStatusFilter)  q = q.eq('status', pageStatusFilter);
  q = q.range(from, to);               // tek sayfa verisi

  const { data, count } = await q;
  products   = data.map(dbToProduct);
  totalCount = count;                  // gerçek toplam
}
```

### `.select('*', { count: 'exact' })` Neden Gerekli?

PostgREST, `Prefer: count=exact` header'ı gönderir.
Yanıtta `Content-Range: 0-49/127780` döner.
Supabase JS client bunu `prodsRes.count` olarak expose eder.
`.range()` olmadan bu sayı döner ama tüm data çekilir — ikisi birlikte kullanılmalı.

---

## Arama Güvenliği

```js
const safe = (pageSearch || '').replace(/[*%,()]/g, '');
```

`.ilike()` içindeki `%` ve `*` karakterleri PostgREST wildcard'larıdır.
Kullanıcı girişinden temizlenmezse injection vektörü oluşur.

---

## Pagination UI

### HTML

```html
<div id="pagination-controls" class="pagination-controls"></div>
```

### Render

```js
function renderPaginationControls() {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  // "127.780 üründen 1–50 gösteriliyor" + Önceki / Sonraki
}
```

### Sayfa Geçişi

```js
window.goPage = async function(page) {
  await loadData(page);
  renderAll();
};
```

`goPage` global olarak tanımlanır çünkü inline `onclick="window.goPage(N)"` HTML'den çağrılır.

---

## Debounced Arama

```js
document.getElementById('search-input').addEventListener('input', e => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    pageSearch = e.target.value.trim();
    await loadData(0);
    renderAll();
  }, 400);
});
```

Her tuş vuruşunda sunucuya istek gitmez — 400ms sessizlik sonrası tetiklenir.

---

## Etkilenen Fonksiyonlar

| Fonksiyon | Değişiklik |
|-----------|-----------|
| `loadData(page)` | Sayfalı sorgu, `totalCount` set eder |
| `getFiltered()` | Sadece `return products` — server filtreler |
| `renderStats()` | `totalCount \|\| products.length` kullanır |
| `filterByStatus()` | `pageStatusFilter` set eder, `loadData(0)` çağırır |
| `submitProductForm()` | Dup check sunucu taraflı `.ilike()` ile |
| `doDelete()` | `totalCount--` |
| `exportCSV()` | `totalCount > PAGE_SIZE` ise uyarı toast |
| `commitCategoryRename()` | Rename sonrası `loadData(currentPage)` |
| `init()` | Event listener'lar async + debounced |

---

## Kapasite

| Senaryo | Davranış |
|---------|---------|
| < 50 ürün | Tek sayfa, pagination gizli kalır |
| 50–127k ürün | Önceki/Sonraki navigasyon |
| 127k+ ürün | Aynı mimari, limit yok |

---

*Bkz. [[stok/Supabase-Limitleri]] · [[stok/Güvenlik-Mimarisi]] · [[stok/özet]] · [[index]]*
