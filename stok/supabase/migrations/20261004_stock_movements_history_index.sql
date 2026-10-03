-- Stok Hareket Geçmişi modalındaki tip/arama filtreleri artık sorguya (.eq('type', ...),
-- imatch) taşındı (bkz. app.js loadHistory, 2026-10-04 fix). stock_movements üzerinde
-- hiç index yoktu (sadece RLS policy'leri vardı) — ORDER BY created_at DESC LIMIT 200
-- artan veri hacmiyle giderek pahalılaşmasın diye destekleyici index ekleniyor.

CREATE INDEX IF NOT EXISTS idx_stock_movements_type_created_at
  ON stock_movements (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created_at
  ON stock_movements (product_id, created_at DESC);
