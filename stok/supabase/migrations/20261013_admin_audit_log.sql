-- 2026-10-13: Yönetici işlemleri denetim kaydı (admin_audit_log).
--  * Yazma YALNIZCA sunucudan: edge fonksiyonu (service_role) ve SECURITY DEFINER tetikleyici/fonksiyonlar.
--  * Okuma YALNIZCA yönetici: RLS SELECT politikası current_user_can('admin').
--  * İstemci (authenticated/anon) için INSERT/UPDATE/DELETE izni ve politikası YOK: sahte/silinen kayıt olmaz.
-- Kayıt kaynakları: kullanıcı işlemleri → admin-operations edge fonksiyonu; yetki/e-posta bildirimi
-- değişiklikleri → user_permissions tetikleyicisi; ürün silme → products tetikleyicisi;
-- incelemeden kalıcı kapatma → permanently_dismiss_review.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           bigserial PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid,
  actor_email  text,
  action       text NOT NULL,
  target_type  text,
  target_id    text,
  target_label text,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           text
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log (created_at DESC);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.admin_audit_log_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_audit_log TO authenticated;
DROP POLICY IF EXISTS admin_audit_select ON public.admin_audit_log;
CREATE POLICY admin_audit_select ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING ((SELECT public.current_user_can('admin')));

-- user_permissions: yetki / e-posta bildirimi / rol değişiklikleri, kayıt ekleme ve silme.
-- Gürültüyü önlemek için last_seen ve görünen ad (_name) değişiklikleri kaydedilmez.
CREATE OR REPLACE FUNCTION public.log_user_permissions_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old  jsonb;
  v_new  jsonb;
  v_diff jsonb := '{}'::jsonb;
  k      text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO admin_audit_log (actor_id, actor_email, action, target_type, target_id, target_label, details)
    VALUES (auth.uid(), auth.email(), 'yetki_kaydi_silindi', 'kullanici', OLD.user_id::text, OLD.email,
            jsonb_build_object('permissions', COALESCE(OLD.permissions, '{}'::jsonb) - '_name',
                               'receives_email_alerts', OLD.receives_email_alerts));
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO admin_audit_log (actor_id, actor_email, action, target_type, target_id, target_label, details)
    VALUES (auth.uid(), auth.email(), 'yetki_kaydi_olusturuldu', 'kullanici', NEW.user_id::text, NEW.email,
            jsonb_build_object('permissions', COALESCE(NEW.permissions, '{}'::jsonb) - '_name',
                               'receives_email_alerts', NEW.receives_email_alerts));
    RETURN NEW;
  END IF;

  v_old := COALESCE(OLD.permissions, '{}'::jsonb) - '_name';
  v_new := COALESCE(NEW.permissions, '{}'::jsonb) - '_name';
  FOR k IN
    SELECT DISTINCT key FROM (
      SELECT jsonb_object_keys(v_old) AS key
      UNION ALL
      SELECT jsonb_object_keys(v_new)
    ) s
  LOOP
    IF (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('eski', v_old -> k, 'yeni', v_new -> k));
    END IF;
  END LOOP;
  IF NEW.receives_email_alerts IS DISTINCT FROM OLD.receives_email_alerts THEN
    v_diff := v_diff || jsonb_build_object('receives_email_alerts',
              jsonb_build_object('eski', to_jsonb(OLD.receives_email_alerts), 'yeni', to_jsonb(NEW.receives_email_alerts)));
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    v_diff := v_diff || jsonb_build_object('role',
              jsonb_build_object('eski', to_jsonb(OLD.role), 'yeni', to_jsonb(NEW.role)));
  END IF;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO admin_audit_log (actor_id, actor_email, action, target_type, target_id, target_label, details)
    VALUES (auth.uid(), auth.email(), 'yetki_degisti', 'kullanici', OLD.user_id::text, OLD.email,
            jsonb_build_object('degisiklikler', v_diff));
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.log_user_permissions_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_user_permissions ON public.user_permissions;
CREATE TRIGGER trg_log_user_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.log_user_permissions_change();

-- products: ürün silme (yalnızca admin silebilir, products_delete politikası).
CREATE OR REPLACE FUNCTION public.log_product_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO admin_audit_log (actor_id, actor_email, action, target_type, target_id, target_label, details)
  VALUES (auth.uid(), auth.email(), 'urun_silindi', 'urun', OLD.id::text, OLD.name,
          jsonb_build_object('barkod', OLD.barcode, 'stok', OLD.stock, 'kategori', OLD.category));
  RETURN OLD;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.log_product_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_product_delete ON public.products;
CREATE TRIGGER trg_log_product_delete
  AFTER DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_product_delete();

-- permanently_dismiss_review: incelemeden kalıcı kapatma admin işlemidir (arayüzde zaten yalnızca admin
-- görüyordu; sunucu add_products/make_sales'e de izin veriyordu). Artık yalnızca admin + kayda geçer.
CREATE OR REPLACE FUNCTION public.permanently_dismiss_review(p_guid text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.current_user_can('admin') THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  SELECT stok_kod, miktar, irsaliye_no, mikro_urun_adi INTO rec
  FROM mikro_processed_ids WHERE mikro_sth_guid = p_guid::uuid;

  UPDATE mikro_processed_ids
  SET needs_review = FALSE, reviewed_at = NOW()
  WHERE mikro_sth_guid = p_guid::uuid;

  IF FOUND THEN
    INSERT INTO admin_audit_log (actor_id, actor_email, action, target_type, target_id, target_label, details)
    VALUES (auth.uid(), auth.email(), 'inceleme_kalici_kapatildi', 'inceleme', p_guid, rec.stok_kod,
            jsonb_build_object('miktar', rec.miktar, 'irsaliye_no', rec.irsaliye_no, 'urun_adi', rec.mikro_urun_adi));
  END IF;

  RETURN json_build_object('dismissed', true, 'permanent', true);
END;
$function$;

-- Eski audit_logs: ölü tablo (son kayıt 2026-05-04) ve herkese açık ekleme politikaları vardı
-- (giriş yapmış herkes sahte satır yazabiliyordu). Ekleme politikaları kapatıldı, yazma izinleri alındı;
-- tablo ve okuma (yalnızca admin) olduğu gibi duruyor.
DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
DROP POLICY IF EXISTS log_insert_own ON public.audit_logs;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM anon, authenticated;
