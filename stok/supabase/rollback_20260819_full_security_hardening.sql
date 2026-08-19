-- ============================================================================
-- ACİL DURUM ROLLBACK — 20260819_full_security_hardening.sql'i geri alır
-- ============================================================================
-- Bu dosya normal migration akışının DIŞINDA tutuluyor (supabase/migrations/
-- klasöründe DEĞİL) — otomatik uygulanmaz, sadece bir şeyler bozulursa elle
-- (apply_migration veya SQL Editor ile) çalıştırılır.
--
-- ÖNEMLİ: RPC grant'larını (bölüm 4) geri almak, anon'un handle_invoice_stock
-- dışındaki fatura/dashboard RPC'lerini tekrar girişsiz çağırabilmesini
-- sağlar — yani BİLEREK güvenlik açığını yeniden açar. Bu SADECE "uygulama
-- tamamen çalışmıyor, acil restore lazım" senaryosunda, geçici olarak
-- kullanılmalı; işlevsellik başka bir yolla düzeltilir düzeltilmez RPC'ler
-- tekrar kapatılmalı.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Hesap silme cascade — FK'yi kaldır (kolonu TEXT'e geri çevir)
-- ----------------------------------------------------------------------------
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS fk_user_permissions_user_id;
ALTER TABLE user_permissions ALTER COLUMN user_id TYPE text USING user_id::text;


-- ----------------------------------------------------------------------------
-- 2) RLS politikaları — yeni politikaları DROP edip eskilerini geri kur
-- ----------------------------------------------------------------------------

-- user_permissions
DROP POLICY IF EXISTS perm_select              ON user_permissions;
DROP POLICY IF EXISTS perm_insert_admin_only   ON user_permissions;
DROP POLICY IF EXISTS perm_update_admin_only   ON user_permissions;
DROP POLICY IF EXISTS perm_delete_admin_only   ON user_permissions;

CREATE POLICY perm_read_all   ON user_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY perm_insert_own ON user_permissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY perm_update_all ON user_permissions FOR UPDATE TO authenticated USING (true);
CREATE POLICY perm_delete_all ON user_permissions FOR DELETE TO authenticated USING (true);

-- products
DROP POLICY IF EXISTS products_select ON products;
DROP POLICY IF EXISTS products_insert ON products;
DROP POLICY IF EXISTS products_update ON products;
DROP POLICY IF EXISTS products_delete ON products;

CREATE POLICY products_auth ON products FOR ALL TO public USING (auth.role() = 'authenticated'::text);
CREATE POLICY policy_delete_products_admin_and_manager ON products FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_permissions
                 WHERE user_permissions.user_id = (auth.uid())::text
                   AND user_permissions.role = ANY (ARRAY['admin'::text, 'manager'::text])));

-- categories
DROP POLICY IF EXISTS categories_select ON categories;
DROP POLICY IF EXISTS categories_insert ON categories;
DROP POLICY IF EXISTS categories_update ON categories;
DROP POLICY IF EXISTS categories_delete ON categories;

CREATE POLICY categories_auth ON categories FOR ALL TO public USING (auth.role() = 'authenticated'::text);

-- audit_logs (INSERT politikalarına dokunulmamıştı, sadece SELECT geri alınıyor)
DROP POLICY IF EXISTS audit_select_admin_only ON audit_logs;

CREATE POLICY log_read_all ON audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY audit_read   ON audit_logs FOR SELECT TO public USING (auth.role() = 'authenticated'::text);

-- stock_movements (INSERT politikasına dokunulmamıştı, sadece SELECT geri alınıyor)
DROP POLICY IF EXISTS movements_select_with_permission ON stock_movements;

CREATE POLICY auth_read_movements ON stock_movements FOR SELECT TO public USING (auth.uid() IS NOT NULL);


-- ----------------------------------------------------------------------------
-- 3) CHECK constraint'leri kaldır
-- ----------------------------------------------------------------------------
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_stock_non_negative;
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_price_ge_cost;


-- ----------------------------------------------------------------------------
-- 4) RPC yetkilerini eski (açık) haline döndür — YUKARIDAKİ UYARIYI OKUYUN
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary()         TO anon;
GRANT EXECUTE ON FUNCTION public.get_review_items(text)          TO anon;
GRANT EXECUTE ON FUNCTION public.manual_reverse_review(text)     TO anon;
GRANT EXECUTE ON FUNCTION public.dismiss_review(text)            TO anon;
GRANT EXECUTE ON FUNCTION public.flag_needs_review(text[], text) TO anon;

GRANT EXECUTE ON FUNCTION public.auto_reverse_unbilled_sci(text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.auto_reverse_unbilled_sci(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reapply_late_invoiced_sci(text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.reapply_late_invoiced_sci(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_mikro_records(text[])   TO anon;
GRANT EXECUTE ON FUNCTION public.reconcile_mikro_records(text[])   TO authenticated;


-- ----------------------------------------------------------------------------
-- 5) Helper fonksiyonu kaldır (hiçbir policy artık kullanmıyor olacak)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.current_user_can(text);
