-- 2026-09-03: 20260831_konsinye_review_permission_check.sql'in kapsamadığı
-- SECURITY DEFINER RPC'lere yetki kontrolü. Bunlar RLS'i bypass ediyor ve
-- authenticated'e EXECUTE verilmiş durumda; gövdelerinde hiç kontrol yoktu,
-- yani sadece 'view' izni olan bir kullanıcı konsoldan doğrudan çağırıp
-- stok değiştirebiliyordu.
--
-- Guard `auth.role() = 'authenticated'` koşuluna bağlı: service_role ile
-- gelen çağrılar (n8n, parse-invoice-pdf Edge Function, api/parse-invoice.js)
-- hiçbir şekilde etkilenmez. Bkz. 20260818_handle_invoice_stock_revoke_anon.sql
-- notu: "n8n/service_role zaten grant sistemini bypass eder."
--
-- handle_invoice_stock imzası DEFAULT'larıyla birebir korunmalı — manual_reverse_review
-- onu 4 argümanla çağırıyor ve bu çağrı default'lar üzerinden çözülüyor.

CREATE OR REPLACE FUNCTION public.handle_invoice_stock(
  p_barcode text,
  p_name text DEFAULT ''::text,
  p_qty integer DEFAULT 1,
  p_type integer DEFAULT 0,
  p_movement_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_detail text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_product     RECORD;
  v_old_stock   INTEGER;
  v_new_stock   INTEGER;
  v_eff_barcode TEXT;
  v_eff_name    TEXT;
  v_type        TEXT;
  v_notes       TEXT;
  v_created_at  TIMESTAMPTZ;
BEGIN
  IF auth.role() = 'authenticated'
     AND NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  v_eff_barcode := NULLIF(TRIM(p_barcode), '');
  v_eff_name    := NULLIF(TRIM(p_name), '');
  v_type        := CASE WHEN p_type = 0 THEN 'in' ELSE 'sale' END;
  v_notes       := CASE WHEN auth.uid() IS NULL
                     THEN 'Mikro'
                     ELSE 'E-Fatura ile otomatik stok güncellemesi (RPC)'
                   END;
  v_created_at  := COALESCE(p_movement_date, now());

  -- Bileme/kaplama irsaliyesi: gerçek ürün eşleştirme yapma, satış sayma.
  IF v_eff_barcode = 'BİLEME' THEN
    INSERT INTO stock_movements (product_id, product_name, user_id, user_email, type, quantity, old_stock, new_stock, notes, created_at)
    VALUES (
      NULL,
      COALESCE(NULLIF(TRIM(p_detail), ''), v_eff_name, 'Bileme/Kaplama'),
      auth.uid(), auth.email(), 'bileme_kaplama', p_qty, NULL, NULL,
      v_notes || ' — bileme/kaplamaya gönderildi',
      v_created_at
    );

    RETURN json_build_object('skipped', true, 'reason', 'bileme_kaplama', 'detail', p_detail);
  END IF;

  IF v_eff_barcode IS NOT NULL THEN
    SELECT * INTO v_product FROM products WHERE barcode = v_eff_barcode LIMIT 1;
  END IF;

  IF NOT FOUND AND v_eff_name IS NOT NULL THEN
    SELECT * INTO v_product FROM products WHERE LOWER(name) = LOWER(v_eff_name) LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO products (barcode, name, stock, min_stock)
    VALUES (
      v_eff_barcode,
      COALESCE(v_eff_name, v_eff_barcode, 'Bilinmeyen Ürün'),
      CASE WHEN p_type = 0 THEN GREATEST(p_qty, 0) ELSE 0 END,
      0
    )
    ON CONFLICT (barcode) DO NOTHING
    RETURNING * INTO v_product;

    IF FOUND THEN
      INSERT INTO stock_movements (product_id, product_name, user_id, user_email, type, quantity, old_stock, new_stock, notes, created_at)
      VALUES (v_product.id, v_product.name, auth.uid(), auth.email(), v_type, p_qty, 0, v_product.stock,
              v_notes || ' (yeni ürün oluşturuldu)', v_created_at);

      RETURN json_build_object(
        'id', v_product.id, 'name', v_product.name,
        'created', true,
        'old_stock', 0, 'new_stock', v_product.stock
      );
    END IF;

    -- Çakışma oldu: başka bir çağrı bu barkodu zaten oluşturdu.
    SELECT * INTO v_product FROM products WHERE barcode = v_eff_barcode LIMIT 1;
  END IF;

  v_old_stock := COALESCE(v_product.stock, 0);

  IF p_type = 0 THEN
    v_new_stock := v_old_stock + p_qty;
  ELSE
    v_new_stock := GREATEST(0, v_old_stock - p_qty);
  END IF;

  UPDATE products SET stock = v_new_stock WHERE id = v_product.id;

  INSERT INTO stock_movements (product_id, product_name, user_id, user_email, type, quantity, old_stock, new_stock, notes, created_at)
  VALUES (v_product.id, v_product.name, auth.uid(), auth.email(), v_type, p_qty, v_old_stock, v_new_stock, v_notes, v_created_at);

  RETURN json_build_object(
    'id',        v_product.id,
    'name',      v_product.name,
    'old_stock', v_old_stock,
    'new_stock', v_new_stock
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM, 'detail', SQLSTATE);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.manual_reverse_review(p_guid text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  rec RECORD;
BEGIN
  IF auth.role() = 'authenticated'
     AND NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  SELECT mp.id, mp.stok_kod, mp.miktar, mp.p_type INTO rec
  FROM mikro_processed_ids mp
  WHERE mp.mikro_sth_guid::TEXT = p_guid
    AND mp.reconciled = FALSE
    AND mp.reversed = FALSE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'kayit_bulunamadi_veya_zaten_islenmis');
  END IF;

  PERFORM handle_invoice_stock(
    rec.stok_kod, '', rec.miktar::INTEGER,
    CASE WHEN rec.p_type = 1 THEN 0 ELSE 1 END
  );

  UPDATE mikro_processed_ids
  SET reversed = TRUE, reversal_reason = 'manuel_sct', reviewed_at = NOW(), needs_review = FALSE
  WHERE id = rec.id;

  RETURN json_build_object('reversed', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dismiss_review(p_guid text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF auth.role() = 'authenticated'
     AND NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  UPDATE mikro_processed_ids
  SET reviewed_at = NOW()
  WHERE mikro_sth_guid::TEXT = p_guid;

  RETURN json_build_object('dismissed', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.flag_needs_review(review_guids text[], p_kategori text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  flagged_count INTEGER;
BEGIN
  IF auth.role() = 'authenticated'
     AND NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  IF array_length(review_guids, 1) IS NULL THEN
    RETURN json_build_object('flagged_count', 0);
  END IF;

  UPDATE mikro_processed_ids
  SET needs_review = TRUE, review_kategori = p_kategori
  WHERE mikro_sth_guid::TEXT = ANY(review_guids)
    AND reconciled = FALSE
    AND reversed = FALSE
    AND needs_review = FALSE;

  GET DIAGNOSTICS flagged_count = ROW_COUNT;
  RETURN json_build_object('flagged_count', flagged_count);
END;
$fn$;
