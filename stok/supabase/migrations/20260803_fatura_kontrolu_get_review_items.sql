-- Dashboard "İnceleme Bekleyenler" paneli için okuma RPC'si.
-- mikro_processed_ids'e anon/authenticated icin SELECT policy acilmiyor (bilinçli kilitli iç tablo,
-- RLS acik ama policy yok - test sirasinda dogrulandi), bunun yerine sadece gereken kolonlari
-- donen SECURITY DEFINER fonksiyon kullaniliyor.
CREATE OR REPLACE FUNCTION get_review_items(p_kategori TEXT)
RETURNS TABLE (
  mikro_sth_guid UUID,
  stok_kod TEXT,
  miktar NUMERIC,
  irsaliye_no TEXT,
  processed_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT mikro_sth_guid, stok_kod, miktar, irsaliye_no, processed_at
  FROM mikro_processed_ids
  WHERE needs_review = TRUE
    AND review_kategori = p_kategori
    AND (reviewed_at IS NULL OR reviewed_at < NOW() - INTERVAL '7 days')
  ORDER BY processed_at ASC;
$$;
