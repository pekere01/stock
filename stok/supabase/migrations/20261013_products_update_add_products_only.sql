-- 2026-10-13: Yetkiler ayrıştırıldı.
--   add_products : ürün ekleme (products_insert, zaten) + ürün düzenleme (products_update)
--   make_sales   : satış / stok çıkar → yalnızca sell_stock RPC (20261013_sell_stock_rpc.sql)
-- products_update artık make_sales'e açık değil; satış doğrudan tablo güncellemesiyle yapılamaz.
ALTER POLICY products_update ON public.products
  USING      ((SELECT public.current_user_can('add_products')))
  WITH CHECK ((SELECT public.current_user_can('add_products')));

-- handle_invoice_stock yalnızca n8n/service_role ve SECURITY DEFINER iç fonksiyonlar (review akışı)
-- tarafından çağrılır; arayüz artık doğrudan çağırmıyor (Fatura Yükle kaldırıldı). Giriş yapmış
-- kullanıcıların bu RPC ile "satış" tipi stok düşürmesi (make_sales'i atlayarak) kapatıldı.
REVOKE EXECUTE ON FUNCTION public.handle_invoice_stock(text, text, integer, integer, timestamp with time zone, text) FROM authenticated;
