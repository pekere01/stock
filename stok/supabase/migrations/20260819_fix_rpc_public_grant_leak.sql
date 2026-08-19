-- 20260819_full_security_hardening.sql sadece "FROM anon" revoke etmişti; bu
-- fonksiyonlar PUBLIC seviyesinde de EXECUTE'a sahipti (varsayılan oluşturma
-- davranışı) ve PUBLIC grant'ı her role otomatik uygulanır — yani anon hâlâ
-- fiilen çağırabiliyordu. Canlı testle yakalandı: rls_verify.mjs script'i
-- anon (girişsiz) olarak dismiss_review'i çağırdı ve 200 {"dismissed":true}
-- döndü. handle_invoice_stock'ta bu ders zaten öğrenilmişti (bkz.
-- 20260818_handle_invoice_stock_revoke_anon.sql yorumu), burada tekrar
-- unutulmuş — REVOKE ... FROM anon YETMEZ, REVOKE ... FROM PUBLIC de gerekir.

REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary()         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_review_items(text)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manual_reverse_review(text)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dismiss_review(text)            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.flag_needs_review(text[], text) FROM PUBLIC;

-- PUBLIC'ten revoke etmek authenticated'in de dolaylı erişimini kaldırır —
-- dashboard'un gerçekten çağırdığı bu 5 fonksiyona authenticated'i açıkça
-- geri veriyoruz.
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_review_items(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_reverse_review(text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_review(text)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_needs_review(text[], text) TO authenticated;

-- Backend-only RPC'ler — kimseye (authenticated dahil) grant gerekmiyor.
REVOKE EXECUTE ON FUNCTION public.auto_reverse_unbilled_sci(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reapply_late_invoiced_sci(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reconcile_mikro_records(text[])   FROM PUBLIC;

-- Doğrulama: aşağıdaki sorguda 'anon' veya 'PUBLIC' hiç görünmemeli.
-- SELECT r.routine_name, g.grantee, g.privilege_type
-- FROM information_schema.routine_privileges g
-- JOIN information_schema.routines r ON r.specific_name = g.specific_name
-- WHERE r.routine_schema='public'
--   AND r.routine_name IN ('get_dashboard_summary','get_review_items','manual_reverse_review',
--                           'dismiss_review','flag_needs_review','auto_reverse_unbilled_sci',
--                           'reapply_late_invoiced_sci','reconcile_mikro_records')
-- ORDER BY r.routine_name, g.grantee;
