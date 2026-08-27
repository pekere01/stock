-- 20260827_konsinye_deposu.sql PUBLIC'ten revoke etmişti ama Supabase yeni fonksiyonlara
-- oluşturulduğunda otomatik olarak anon+authenticated+service_role'e de ayrıca EXECUTE
-- veriyor (ALTER DEFAULT PRIVILEGES) — bu PUBLIC revoke ile silinmiyor, açıkça revoke gerekiyor.
-- Canlı sorguyla yakalandı: anon konsinye_from_review/return/invoice'ı çağırabiliyordu.
-- Bkz. 20260819_fix_rpc_public_grant_leak.sql — aynı ders, bu sefer yeni fonksiyonlarda tekrarlandı.

REVOKE EXECUTE ON FUNCTION public.konsinye_from_review(text)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.konsinye_return(bigint, integer)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.konsinye_invoice(bigint, integer) FROM anon;

-- Doğrulama: aşağıdaki sorguda 'anon' hiç görünmemeli.
-- SELECT r.routine_name, g.grantee, g.privilege_type
-- FROM information_schema.routine_privileges g
-- JOIN information_schema.routines r ON r.specific_name = g.specific_name
-- WHERE r.routine_schema='public'
--   AND r.routine_name IN ('konsinye_from_review','konsinye_return','konsinye_invoice')
-- ORDER BY r.routine_name, g.grantee;
