-- strix pentest bulgusu (2026-08-16): handle_invoice_stock imzası 2026-08-06 ve 2026-08-18'de
-- parametre eklenerek değişti (CREATE OR REPLACE farklı imzayla yeni overload yaratır, eskisini
-- REPLACE etmez — bkz. 20260818_handle_invoice_stock_bileme_kaplama.sql üstündeki not). 2026-08-05
-- sertleştirmesindeki REVOKE sadece eski 4 parametreli imzayı hedefliyordu; yeni 6 parametreli
-- overload hiç REVOKE edilmedi ve varsayılan olarak PUBLIC'e (anon dahil) açık kaldı — giriş
-- yapmadan, sitenin public anon key'iyle herkes doğrudan stok manipüle edebiliyordu.
--
-- Dashboard (app.js applyInvoiceStock) girişli kullanıcı olarak çağırıyor → authenticated yetkisi
-- kalmalı. n8n/service_role zaten grant sistemini bypass eder.
-- NOT: REVOKE ... FROM PUBLIC yetmiyor — bu imzaya anon'a doğrudan (PUBLIC üzerinden değil,
-- ayrı) EXECUTE verilmiş, bu yüzden anon'dan da açıkça revoke etmek gerekti (canlıda doğrulandı).
REVOKE EXECUTE ON FUNCTION public.handle_invoice_stock(text, text, integer, integer, timestamp with time zone, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_invoice_stock(text, text, integer, integer, timestamp with time zone, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.handle_invoice_stock(text, text, integer, integer, timestamp with time zone, text) TO authenticated;
