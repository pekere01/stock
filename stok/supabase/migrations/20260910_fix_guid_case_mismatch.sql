-- Fix: MSSQL CAST(sth_Guid AS VARCHAR(36)) sends UPPERCASE hex, but Postgres
-- uuid::text always renders lowercase. Every guid-matching RPC that received
-- its guid list from n8n/MSSQL (Dal A/B/C of "mikro fatura kontrolü v2") was
-- comparing as TEXT and never matching real production rows since 2026-08-05.
-- Fix: compare as native uuid (case-insensitive by type) instead of text.
-- bkz. 01_Projects/stok/mikro-otomasyon.md Phase 4

CREATE OR REPLACE FUNCTION public.auto_reverse_unbilled_sci(unbilled_guids text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  reversed_count INTEGER := 0;
BEGIN
  IF array_length(unbilled_guids, 1) IS NULL THEN
    RETURN json_build_object('reversed_count', 0);
  END IF;

  FOR rec IN
    SELECT mp.id, mp.stok_kod, mp.miktar, mp.p_type
    FROM mikro_processed_ids mp
    WHERE mp.mikro_sth_guid = ANY(unbilled_guids::uuid[])
      AND mp.reconciled = FALSE
      AND mp.reversed = FALSE
  LOOP
    PERFORM handle_invoice_stock(
      rec.stok_kod, '', rec.miktar::INTEGER,
      CASE WHEN rec.p_type = 1 THEN 0 ELSE 1 END
    );
    UPDATE mikro_processed_ids
    SET reversed = TRUE, reversal_reason = 'faturasiz_sci'
    WHERE id = rec.id;
    reversed_count := reversed_count + 1;
  END LOOP;

  RETURN json_build_object('reversed_count', reversed_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reapply_late_invoiced_sci(late_guids text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  reapplied_count INTEGER := 0;
BEGIN
  IF array_length(late_guids, 1) IS NULL THEN
    RETURN json_build_object('reapplied_count', 0);
  END IF;

  FOR rec IN
    SELECT mp.id, mp.stok_kod, mp.miktar, mp.p_type
    FROM mikro_processed_ids mp
    WHERE mp.mikro_sth_guid = ANY(late_guids::uuid[])
      AND mp.reversed = TRUE
      AND mp.reversal_reason = 'faturasiz_sci'
  LOOP
    PERFORM handle_invoice_stock(
      rec.stok_kod, '', rec.miktar::INTEGER,
      rec.p_type
    );
    UPDATE mikro_processed_ids
    SET reversed = FALSE, reversal_reason = NULL
    WHERE id = rec.id;
    reapplied_count := reapplied_count + 1;
  END LOOP;

  RETURN json_build_object('reapplied_count', reapplied_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.flag_needs_review(review_guids text[], p_kategori text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE mikro_sth_guid = ANY(review_guids::uuid[])
    AND reconciled = FALSE
    AND reversed = FALSE
    AND needs_review = FALSE;

  GET DIAGNOSTICS flagged_count = ROW_COUNT;
  RETURN json_build_object('flagged_count', flagged_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.manual_reverse_review(p_guid text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
BEGIN
  IF auth.role() = 'authenticated'
     AND NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  SELECT mp.id, mp.stok_kod, mp.miktar, mp.p_type INTO rec
  FROM mikro_processed_ids mp
  WHERE mp.mikro_sth_guid = p_guid::uuid
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
$function$;

CREATE OR REPLACE FUNCTION public.dismiss_review(p_guid text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'authenticated'
     AND NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  UPDATE mikro_processed_ids
  SET reviewed_at = NOW()
  WHERE mikro_sth_guid = p_guid::uuid;

  RETURN json_build_object('dismissed', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.konsinye_from_review(p_guid text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  v_product RECORD;
BEGIN
  IF NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  SELECT mp.id, mp.stok_kod, mp.miktar INTO rec
  FROM mikro_processed_ids mp
  WHERE mp.mikro_sth_guid = p_guid::uuid
    AND mp.reconciled = FALSE
    AND mp.reversed = FALSE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'kayit_bulunamadi_veya_zaten_islenmis');
  END IF;

  SELECT * INTO v_product FROM products WHERE barcode = rec.stok_kod LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'urun_bulunamadi');
  END IF;

  UPDATE products
  SET consignment_stock = consignment_stock + rec.miktar::INTEGER
  WHERE id = v_product.id;

  INSERT INTO stock_movements (product_id, product_name, user_id, user_email, type, quantity, notes)
  VALUES (v_product.id, v_product.name, auth.uid(), auth.email(), 'konsinye_out', rec.miktar::INTEGER,
          'Konsinye deposuna aktarıldı (Mikro SCT)');

  UPDATE mikro_processed_ids
  SET needs_review = FALSE, reviewed_at = NOW(), reversal_reason = 'konsinye'
  WHERE id = rec.id;

  RETURN json_build_object('ok', true, 'product_id', v_product.id, 'qty', rec.miktar);
END;
$function$;
