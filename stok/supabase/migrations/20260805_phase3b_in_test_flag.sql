-- Phase 3B: test/konsinye takibi için ürün kartına manuel toggle
-- bkz. 01_Projects/stok/mikro-otomasyon.md "Phase 3 — B) Sitede Test/Konsinye Takibi"

ALTER TABLE products
ADD COLUMN IF NOT EXISTS in_test BOOLEAN DEFAULT FALSE;
