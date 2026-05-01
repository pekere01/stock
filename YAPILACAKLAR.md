# Stok Yönetim — Yapılacaklar

---

## Supabase — Tablo Kurulumu (ZORUNLU)

### Adım 1: Temel Tablolar

Supabase Dashboard → **SQL Editor** → **New query** → yapıştır → **Run**:

```sql
-- Kullanıcı yetkileri (zaten varsa bu adımı atla)
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT,
  role        TEXT DEFAULT 'user',
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_seen   TIMESTAMPTZ
);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS own_permissions ON user_permissions
  FOR ALL USING (auth.uid() = user_id);
```

---

### Adım 2: Products Tablosu (YENİ)

```sql
CREATE TABLE products (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  barcode        TEXT,
  category       TEXT NOT NULL DEFAULT '',
  cost_price     NUMERIC(10,2) DEFAULT 0,
  sale_price     NUMERIC(10,2) DEFAULT 0,
  stock          INT DEFAULT 0,
  min_stock      INT DEFAULT 0,
  sales7d        INT DEFAULT 0,
  status         TEXT DEFAULT 'active',
  warehouse_info TEXT,
  purchase_rate  NUMERIC(10,4),
  sale_rate      NUMERIC(10,4),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_authenticated ON products
  FOR ALL USING (auth.role() = 'authenticated');
```

---

### Adım 3: Categories Tablosu (YENİ)

```sql
CREATE TABLE categories (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_authenticated ON categories
  FOR ALL USING (auth.role() = 'authenticated');
```

---

### Adım 4: Audit Logs Tablosu (zaten varsa atla)

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email      TEXT,
  action          TEXT,
  product_name    TEXT,
  product_barcode TEXT,
  quantity        INT DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_read ON audit_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY audit_insert ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
```

---

### Adım 5: Kontrol

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Çıktıda `audit_logs`, `categories`, `products`, `user_permissions` görünmeli.

---

### Adım 6: Supabase URL Ayarı (Yayın Sonrası)

Supabase Dashboard → **Authentication → URL Configuration**:
- **Site URL** → `https://soncag-stok.vercel.app`
- **Redirect URLs** → aynı adresi ekle

---

## Mevcut Durum

| Özellik | Durum |
|---|---|
| Giriş / Auth | ✅ Supabase Auth |
| Ürün CRUD | ✅ Supabase `products` tablosu |
| Kategoriler | ✅ Supabase `categories` tablosu |
| İşlem Geçmişi | ✅ Supabase `audit_logs` tablosu |
| Kullanıcı Yetkileri | ✅ Supabase `user_permissions` tablosu |
| localStorage | ❌ Kaldırıldı (sadece EUR kuru önbelleği kalır) |
| EUR/TRY kuru | ✅ frankfurter.app |
