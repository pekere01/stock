-- Güvenlik denetimi (2026-08-05): SECURITY DEFINER RPC'ler anon rolüne açıktı —
-- publishable key herkese açık olduğu için, giriş yapmadan herkes bu RPC'leri
-- doğrudan REST API üzerinden çağırıp stok manipüle edebiliyordu. search_path da
-- pin'lenmemişti (search_path hijacking riski).

-- 1) search_path sabitle
ALTER FUNCTION public.handle_invoice_stock(text, text, integer, integer) SET search_path = public;
ALTER FUNCTION public.reconcile_mikro_records(text[]) SET search_path = public;
ALTER FUNCTION public.auto_reverse_unbilled_sci(text[]) SET search_path = public;
ALTER FUNCTION public.reapply_late_invoiced_sci(text[]) SET search_path = public;
ALTER FUNCTION public.flag_needs_review(text[], text) SET search_path = public;
ALTER FUNCTION public.manual_reverse_review(text) SET search_path = public;
ALTER FUNCTION public.dismiss_review(text) SET search_path = public;
ALTER FUNCTION public.get_review_items(text) SET search_path = public;
ALTER FUNCTION public.get_dashboard_summary() SET search_path = public;
ALTER FUNCTION public.update_product_status() SET search_path = public;

-- 2) anon rolünden TÜM RPC yetkisini kaldır (hiçbiri girişsiz çağrılamamalı)
REVOKE EXECUTE ON FUNCTION public.handle_invoice_stock(text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_mikro_records(text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_reverse_unbilled_sci(text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reapply_late_invoiced_sci(text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.flag_needs_review(text[], text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.manual_reverse_review(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dismiss_review(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_review_items(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary() FROM anon;

-- 3) n8n/backend-only (service_role) fonksiyonlardan authenticated yetkisini de kaldır —
-- dashboard hiçbirini doğrudan çağırmıyor (grep ile doğrulandı), sadece n8n workflow'ları
-- ve service_role kullanan Vercel/Edge Function'lar çağırıyor; service_role RLS/grant
-- sistemini zaten bypass eder, bu grant'lara ihtiyacı yok.
REVOKE EXECUTE ON FUNCTION public.reconcile_mikro_records(text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_reverse_unbilled_sci(text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reapply_late_invoiced_sci(text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_needs_review(text[], text) FROM authenticated;

-- handle_invoice_stock, get_dashboard_summary, get_review_items, manual_reverse_review,
-- dismiss_review: authenticated için EXECUTE kalır (dashboard'da girişli kullanıcı bunları
-- gerçekten çağırıyor: app.js applyInvoiceStock/loadData, review.js panel).

-- 4) update_product_status bir trigger fonksiyonu (SECURITY INVOKER), doğrudan RPC olarak
-- çağrılmasına gerek yok — trigger mekanizması ayrı EXECUTE izni gerektirmeden çalışır.
REVOKE EXECUTE ON FUNCTION public.update_product_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_product_status() FROM authenticated;
