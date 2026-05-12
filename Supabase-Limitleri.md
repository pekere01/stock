---
date: 2026-05-12
tags: [supabase, postgrest, limit, performans, stok]
type: concept
---

# Supabase Sorgu Limitleri & .range() Kullanımı

[[stok/özet|Sonçağ Stok]] projesinde veri çekme limitlerinin yönetimi.

---

## Sorun: Varsayılan 1000 Satır Limiti

Supabase, arka planda **PostgREST** kullanır. PostgREST'in `max-rows` ayarı varsayılan olarak **1000**'dir. Bu şu anlama gelir:

- `.select('*')` yalnız kullanılırsa en fazla 1000 satır döner
- **Hata vermez** — 1001. satır ve sonrası sessizce kırpılır
- Stok > 1000 ürüne ulaştığında dashboard eksik veri gösterir

> [!warning] Sessiz Veri Kaybı
> Bu limit aşıldığında ne bir hata mesajı ne de uyarı gelir. Dashboard çalışıyormuş gibi görünür ama ürünlerin bir kısmı görünmez. İstatistikler, grafikler ve filtreler yanlış hesaplar.

---

## Çözüm: `.range()` ile Limit Aşma

PostgREST'te `.range(from, to)` metodu HTTP `Range` header'ı gönderir:

```
Range: 0-4999
```

Bu, sunucu tarafındaki `max-rows` kısıtlamasını **override eder** ve istenen aralığı döndürür.

### Mevcut Kullanım (`app.js`)

```javascript
// loadData() içinde
const [prodsRes, catsRes] = await Promise.all([
  sb.from('products')
    .select('*')
    .order('created_at', { ascending: true })
    .range(0, 4999),    // 5000 ürüne kadar

  sb.from('categories')
    .select('*')
    .order('name', { ascending: true })
    .range(0, 1999)     // 2000 kategoriye kadar
]);
```

---

## .range() vs .limit() Farkı

| Yöntem | Ne Yapar | Sunucu max-rows'u bypass eder mi? |
|--------|----------|-----------------------------------|
| `.select('*')` (hiçbir şey yok) | PostgREST default (1000) | Hayır |
| `.limit(5000)` | İstek başlığı: `limit=5000` | **Hayır** — max-rows kısıtı geçerli kalır |
| `.range(0, 4999)` | HTTP `Range: 0-4999` header | **Evet** — override eder |

> [!info] Tercih
> Büyük veri setleri için her zaman `.range()` kullan. `.limit()` yeterli değil.

---

## Kapasite Sınırları

| Tablo | Mevcut `.range()` | Güvenli üst sınır notu |
|-------|-------------------|------------------------|
| `products` | `0-4999` (5000) | Stok bu sayıya ulaşırsa sayfalama gerekir |
| `categories` | `0-1999` (2000) | Pratikte onlarca kategori olur, sorunsuz |

---

## İleride: Sayfalama (Pagination)

5000 ürün sınırına ulaşıldığında çözüm:

```javascript
async function loadAllProducts() {
  const PAGE = 1000;
  let all = [], from = 0;
  while (true) {
    const { data } = await sb.from('products')
      .select('*').order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
```

---

*Bkz. [[stok/özet]] · [[stok/Güvenlik-Mimarisi]] · [[index]]*
