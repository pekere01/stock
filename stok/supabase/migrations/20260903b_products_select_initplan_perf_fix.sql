-- 2026-09-03: 20260831_products_select_requires_view.sql'in getirdigi performans
-- regresyonunun duzeltmesi.
--
-- Sorun: politika current_user_can(...) cagrilarini dogrudan USING icinde
-- kullaniyordu. Postgres bunu satir basina filtre olarak degerlendirdi —
-- 46.551 urunluk tabloda her sayfa sorgusu Seq Scan + satir basina 4 SECURITY
-- DEFINER fonksiyon cagrisi demekti. Olculen: 1282 ms (shared hit=48201).
-- Yetkisiz kullanicida sorgu tamamen statement timeout'a (57014) dusuyordu.
--
-- Cozum: her cagriyi (select ...) ile sarmalamak. Postgres bunu InitPlan'a
-- cevirir; fonksiyon sorgu basina BIR kez calisir. Olculen: 23.8 ms
-- (shared hit=1628), ~54x hizlanma. Yetki mantigi aynen korunuyor.
--
-- Bu, Supabase'in RLS performansi icin onerdigi standart kalip. Ayni kalip
-- ileride current_user_can kullanan baska politikalara da uygulanmali.

DROP POLICY IF EXISTS products_select ON products;

CREATE POLICY products_select ON products
  FOR SELECT TO authenticated
  USING (
    (select public.current_user_can('view'))
    OR (select public.current_user_can('add_products'))
    OR (select public.current_user_can('make_sales'))
    OR (select public.current_user_can('manage_categories'))
  );
