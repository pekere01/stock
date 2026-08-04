-- Phase 4: Fatura bazlı stok doğrulama
-- bkz. 01_Projects/stok/mikro-otomasyon.md Phase 4

ALTER TABLE mikro_processed_ids
ADD COLUMN IF NOT EXISTS irsaliye_no TEXT,
ADD COLUMN IF NOT EXISTS irsaliye_tipi TEXT,
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS review_kategori TEXT,
ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- SCI, 7+ gün faturasız → otomatik geri al
CREATE OR REPLACE FUNCTION auto_reverse_unbilled_sci(unbilled_guids TEXT[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    WHERE mp.mikro_sth_guid::TEXT = ANY(unbilled_guids)
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
$$;

-- Daha önce faturasızlıktan geri alınmış SCI'ye geç fatura geldiyse → tekrar düş
CREATE OR REPLACE FUNCTION reapply_late_invoiced_sci(late_guids TEXT[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    WHERE mp.mikro_sth_guid::TEXT = ANY(late_guids)
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
$$;

-- SCT / diğer → sadece işaretle, stok dokunulmaz
CREATE OR REPLACE FUNCTION flag_needs_review(review_guids TEXT[], p_kategori TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  flagged_count INTEGER;
BEGIN
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
$$;

-- Dashboard "Stoktan Düş"
CREATE OR REPLACE FUNCTION manual_reverse_review(p_guid TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
BEGIN
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
$$;

-- Dashboard "Bekletmeye Devam Et" (7 gün snooze)
CREATE OR REPLACE FUNCTION dismiss_review(p_guid TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE mikro_processed_ids
  SET reviewed_at = NOW()
  WHERE mikro_sth_guid::TEXT = p_guid;

  RETURN json_build_object('dismissed', true);
END;
$$;

-- reconcile_mikro_records: reversal_reason='iptal' eklendi (tek satır fark, mantık aynı, orijinal kod korunuyor)
CREATE OR REPLACE FUNCTION public.reconcile_mikro_records(cancelled_guids text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  rec RECORD;
  reversed_count INTEGER := 0;
BEGIN
  IF array_length(cancelled_guids, 1) IS NULL THEN
    RETURN json_build_object('reversed_count', 0);
  END IF;

  FOR rec IN
    SELECT mp.id, mp.stok_kod, mp.miktar, mp.p_type
    FROM mikro_processed_ids mp
    WHERE mp.mikro_sth_guid::TEXT = ANY(cancelled_guids)
    AND mp.reconciled = FALSE
    AND mp.reversed = FALSE
  LOOP
    PERFORM handle_invoice_stock(
      rec.stok_kod, '', rec.miktar::INTEGER,
      CASE WHEN rec.p_type = 1 THEN 0 ELSE 1 END
    );
    UPDATE mikro_processed_ids
    SET reconciled = TRUE, reconciled_at = NOW(), reversed = TRUE, reversal_reason = 'iptal'
    WHERE id = rec.id;
    reversed_count := reversed_count + 1;
  END LOOP;

  RETURN json_build_object('reversed_count', reversed_count);
END;
$function$;
