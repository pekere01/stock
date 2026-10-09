-- Depo filtresi (admin-only UI, index.html #filter-depo) için distinct depo
-- adlarını alfabetik döner. warehouse_info virgülle ayrılmış çoklu depo
-- içerebilir (bkz. mergeDepo, app.js) — bu fonksiyon listeyi açıp (unnest)
-- trim'leyip distinct + sıralı döner.
--
-- SECURITY INVOKER (varsayılan, DEFINER değil): get_dashboard_summary'nin
-- aksine burada RLS bypass'ına gerek yok — bu liste zaten kullanıcının
-- görebildiği ürünlerin depo adlarını yansıtmalı, hepsinin değil.

CREATE OR REPLACE FUNCTION public.get_depo_list()
RETURNS TABLE(depo text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT trim(d) AS depo
  FROM products, unnest(string_to_array(warehouse_info, ',')) AS d
  WHERE warehouse_info IS NOT NULL AND trim(d) <> ''
  ORDER BY depo;
$$;

REVOKE EXECUTE ON FUNCTION public.get_depo_list() FROM PUBLIC;
-- REVOKE ... FROM PUBLIC yetmez — Supabase fonksiyon oluşturulduğunda anon'a
-- default privileges ile doğrudan EXECUTE veriyor (bu projede 3. kez yaşanan
-- ders, bkz. 20260819_fix_rpc_public_grant_leak.sql). anon'u ayrıca kapat.
REVOKE EXECUTE ON FUNCTION public.get_depo_list() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_depo_list() TO authenticated;
