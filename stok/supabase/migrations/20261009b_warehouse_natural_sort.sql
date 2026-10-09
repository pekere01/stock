-- Depo filtresi seçiliyken ürünler warehouse_info'ya göre sıralanıyordu, ama
-- düz string sıralaması "B10/05" < "B5/10" gibi yanlış sonuç veriyordu (rakam
-- değil karakter karşılaştırması: '1' < '5'). pekere B01,B02...B10,B11 şeklinde
-- gerçek sayısal sıra istedi.
--
-- natural_sort_key(): string'i rakam/rakam-olmayan parçalara böler, rakam
-- parçalarını 6 haneye sıfırla doldurur, birleştirir. "B10/05" -> "B000010/000005",
-- "B5/10" -> "B000005/000010" — string karşılaştırması artık sayısal sırayla eşleşir.
-- Doğrudan client erişimi gerekmiyor (sadece generated column hesaplamasında
-- kullanılıyor), bu yüzden hiçbir role EXECUTE verilmiyor.

CREATE OR REPLACE FUNCTION public.natural_sort_key(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(string_agg(
    CASE WHEN chunk ~ '^[0-9]+$' THEN lpad(chunk, 6, '0') ELSE chunk END,
    '' ORDER BY ord
  ), '')
  FROM unnest(regexp_split_to_array(COALESCE(s, ''), '(?<=[0-9])(?=\D)|(?<=\D)(?=[0-9])')) WITH ORDINALITY AS t(chunk, ord);
$$;

REVOKE EXECUTE ON FUNCTION public.natural_sort_key(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.natural_sort_key(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.natural_sort_key(text) FROM authenticated;

ALTER TABLE products ADD COLUMN warehouse_sort_key text
  GENERATED ALWAYS AS (public.natural_sort_key(warehouse_info)) STORED;

CREATE INDEX IF NOT EXISTS idx_products_warehouse_sort_key ON products (warehouse_sort_key);
