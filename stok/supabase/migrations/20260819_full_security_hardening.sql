-- ============================================================================
-- 2026-08-19 — Kapsamlı güvenlik sertleştirmesi (security-review sonrası)
-- ============================================================================
-- Kapsam:
--   1) user_permissions.user_id kolonu TEXT'ten UUID'ye çevrilip auth.users(id)
--      FOREIGN KEY + ON DELETE CASCADE ile bağlanıyor (hesap silme cascade).
--   2) current_user_can() helper — RLS policy'lerinde tekrar eden yetki
--      kontrolünü tek yerde topluyor, super-admin e-posta bypass'ı içeriyor
--      (teknik@soncag.com şu an DB'de permissions.admin=false, ama app.js'de
--      SUPER_ADMIN_EMAIL olarak hardcoded — bu satır olmadan kendini kilitler).
--   3) user_permissions / products / categories / audit_logs / stock_movements
--      RLS politikaları — "her authenticated her şeyi yapabilir" açığını kapatır.
--   4) products üzerinde CHECK constraint (sale_price >= cost_price, stock >= 0).
--   5) Fatura/dashboard RPC'lerinden anon (ve backend-only olanlardan
--      authenticated) yetkisi kaldırılıyor.
--
-- NOT: eski policy'ler (products_auth vb.) user_permissions.user_id kolonuna
-- referans veriyor — kolonu UUID'ye çevirmeden ÖNCE hepsi DROP edilmeli
-- (Postgres "cannot alter type of a column used in a policy definition" hatası
-- verir). Bu yüzden DROP POLICY adımları en başa alındı.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) Eski politikaları kaldır (kolon tipi değişiminden önce olmalı)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS perm_read_all   ON user_permissions;
DROP POLICY IF EXISTS perm_insert_own ON user_permissions;
DROP POLICY IF EXISTS perm_update_all ON user_permissions;
DROP POLICY IF EXISTS perm_delete_all ON user_permissions;

DROP POLICY IF EXISTS products_auth                            ON products;
DROP POLICY IF EXISTS policy_delete_products_admin_and_manager  ON products;

DROP POLICY IF EXISTS categories_auth ON categories;

DROP POLICY IF EXISTS log_read_all ON audit_logs;
DROP POLICY IF EXISTS audit_read   ON audit_logs;

DROP POLICY IF EXISTS auth_read_movements ON stock_movements;


-- ----------------------------------------------------------------------------
-- 1) Hesap silme cascade — user_permissions.user_id → auth.users(id)
-- ----------------------------------------------------------------------------
ALTER TABLE user_permissions
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

ALTER TABLE user_permissions
  ADD CONSTRAINT fk_user_permissions_user_id
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Not: audit_logs.user_id (TEXT) ve stock_movements.user_id (UUID) kolonlarına
-- KASITLI olarak FK/cascade eklenmedi — denetim kaydı, kullanıcı silinse bile
-- korunmalı (kim ne yaptı bilgisi kaybolmamalı).


-- ----------------------------------------------------------------------------
-- 2) Yetki kontrolü helper'ı
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_can(perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT coalesce(
    (auth.jwt() ->> 'email') = 'teknik@soncag.com'
    OR EXISTS (
      SELECT 1 FROM user_permissions
      WHERE user_id = auth.uid()
        AND (permissions ->> 'admin' = 'true' OR permissions ->> perm = 'true')
    ),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_can(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_can(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_can(text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3) user_permissions — herkes kendini admin yapabiliyordu
-- ----------------------------------------------------------------------------
CREATE POLICY perm_select ON user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_can('admin'));

CREATE POLICY perm_insert_admin_only ON user_permissions
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can('admin'));

CREATE POLICY perm_update_admin_only ON user_permissions
  FOR UPDATE TO authenticated
  USING (public.current_user_can('admin'))
  WITH CHECK (public.current_user_can('admin'));

CREATE POLICY perm_delete_admin_only ON user_permissions
  FOR DELETE TO authenticated
  USING (public.current_user_can('admin'));


-- ----------------------------------------------------------------------------
-- 4) products — sadece SELECT herkese (authenticated) açık, CRUD yetkiye bağlı
-- ----------------------------------------------------------------------------
CREATE POLICY products_select ON products
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY products_insert ON products
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can('add_products'));

CREATE POLICY products_update ON products
  FOR UPDATE TO authenticated
  USING (public.current_user_can('add_products') OR public.current_user_can('make_sales'))
  WITH CHECK (public.current_user_can('add_products') OR public.current_user_can('make_sales'));

CREATE POLICY products_delete ON products
  FOR DELETE TO authenticated
  USING (public.current_user_can('admin'));


-- ----------------------------------------------------------------------------
-- 5) categories — sadece SELECT herkese açık, CRUD manage_categories'e bağlı
-- ----------------------------------------------------------------------------
CREATE POLICY categories_select ON categories
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY categories_insert ON categories
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can('manage_categories'));

CREATE POLICY categories_update ON categories
  FOR UPDATE TO authenticated
  USING (public.current_user_can('manage_categories'))
  WITH CHECK (public.current_user_can('manage_categories'));

CREATE POLICY categories_delete ON categories
  FOR DELETE TO authenticated
  USING (public.current_user_can('manage_categories'));


-- ----------------------------------------------------------------------------
-- 6) audit_logs — SELECT sadece admin; INSERT dokunulmuyor
-- ----------------------------------------------------------------------------
CREATE POLICY audit_select_admin_only ON audit_logs
  FOR SELECT TO authenticated
  USING (public.current_user_can('admin'));


-- ----------------------------------------------------------------------------
-- 7) stock_movements — SELECT view_history/admin izniyle sınırlı
-- ----------------------------------------------------------------------------
CREATE POLICY movements_select_with_permission ON stock_movements
  FOR SELECT TO authenticated
  USING (public.current_user_can('view_history'));


-- ----------------------------------------------------------------------------
-- 8) Eksik DB kısıtlamaları
-- ----------------------------------------------------------------------------
-- stock her satırda geçerli, doğrudan enforce edilir. price>=cost'u "test3"
-- (id 46521, dummy veri, sale_price=0 cost_price=1) ihlal ediyor — NOT VALID
-- ile eklendi: yeni/güncellenen satırlar için hemen zorunlu, bu tek satırı
-- geriye dönük bloklamıyor. "test3" temizlenince VALIDATE CONSTRAINT ile tam
-- zorunlu hale getirilebilir: ALTER TABLE products VALIDATE CONSTRAINT chk_products_price_ge_cost;
ALTER TABLE products
  ADD CONSTRAINT chk_products_stock_non_negative CHECK (stock >= 0);

ALTER TABLE products
  ADD CONSTRAINT chk_products_price_ge_cost CHECK (
    sale_price IS NULL OR cost_price IS NULL OR sale_price >= cost_price
  ) NOT VALID;


-- ----------------------------------------------------------------------------
-- 9) Fatura/dashboard RPC'lerinin anon'a (ve backend-only olanların
--    authenticated'e) açık kalan yetkisi
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary()         FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_review_items(text)          FROM anon;
REVOKE EXECUTE ON FUNCTION public.manual_reverse_review(text)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.dismiss_review(text)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.flag_needs_review(text[], text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.auto_reverse_unbilled_sci(text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_reverse_unbilled_sci(text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reapply_late_invoiced_sci(text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reapply_late_invoiced_sci(text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_mikro_records(text[])   FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_mikro_records(text[])   FROM authenticated;
