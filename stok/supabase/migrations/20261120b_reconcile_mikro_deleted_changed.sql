-- Mikro'da sonradan silinen / miktarı veya ürünü değişen irsaliye satırlarını siteye yansıtır.
-- Sebep: stokv2 her STOK_HAREKETLERI satırını GUID'e göre bir kez işliyor; irsaliye hazırlanıp
-- sonra düzenlenince (19.11.2026: mal gelmedi, 12 satır silindi) satış sitede kalıyordu.
-- Akış (n8n "mikro silinen/değişen kontrolü", saatlik):
--   get_mikro_recheck_guids()  → son 14 günde işlenen GUID'ler
--   MSSQL: bu GUID'lerin Mikro'daki güncel miktar / iptal / stok kodu
--   reconcile_mikro_changes()  → farkı stoğa uygular (otomatik, pekere kararı 2026-11-20)
-- Kurallar:
--   * Sadece eksi stok canlıya alındıktan sonra (2026-11-20 10:06 UTC) işlenen satırlar:
--     öncesindeki satışlar 0'a kırpılmış olabilir, tam miktarı geri eklemek stoğu şişirir.
--   * Satırdan sonra üründe elle düzenleme / sayım düzeltmesi / import varsa stoğa dokunulmaz
--     (sayım zaten gerçeği yansıtıyor), sadece kayıt kapatılır.
--   * Mikro boş dönerse veya tek seferde 40'tan fazla silme çıkarsa hiçbir şey yapılmaz.
--   * Belge tarihi değişikliği yok sayılır.

CREATE OR REPLACE FUNCTION public.get_mikro_recheck_guids()
 RETURNS json
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object('guids', COALESCE(json_agg(mikro_sth_guid::text), '[]'::json))
  FROM mikro_processed_ids
  WHERE reversed = FALSE
    AND reversal_reason IS NULL
    AND p_type IN (0, 1)
    AND processed_at > GREATEST(now() - interval '14 days', '2026-11-20 10:06:00+00'::timestamptz);
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_mikro_changes(p_checked text[], p_found jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_checked   uuid[] := COALESCE(p_checked, '{}')::uuid[];
  v_cutoff    CONSTANT timestamptz := '2026-11-20 10:06:00+00';
  rec         RECORD;
  v_prod      RECORD;
  v_action    text;
  v_delta     integer;   -- stoğa eklenecek miktar (+/-)
  v_belge     text;
  v_note      text;
  v_skip      boolean;
  v_del_count integer;
  n_deleted   integer := 0;
  n_changed   integer := 0;
  n_moved     integer := 0;
  n_skipped   integer := 0;
  v_details   jsonb := '[]'::jsonb;
BEGIN
  IF auth.role() = 'authenticated' THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  IF array_length(v_checked, 1) IS NULL THEN
    RETURN json_build_object('checked', 0);
  END IF;

  -- Mikro bağlantısı boş döndüyse her şeyi "silinmiş" sanma.
  IF COALESCE(jsonb_array_length(p_found), 0) = 0 THEN
    RETURN json_build_object('error', 'mikro_bos_dondu', 'checked', array_length(v_checked, 1));
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _mikro_found (guid uuid PRIMARY KEY, miktar numeric, iptal int, stok_kod text) ON COMMIT DROP;
  TRUNCATE _mikro_found;
  INSERT INTO _mikro_found
  SELECT DISTINCT ON ((x->>'guid')::uuid)
         (x->>'guid')::uuid,
         (x->>'miktar')::numeric,
         COALESCE((x->>'iptal')::int, 0),
         NULLIF(TRIM(x->>'stok_kod'), '')
  FROM jsonb_array_elements(p_found) x
  WHERE NULLIF(x->>'guid', '') IS NOT NULL;

  SELECT COUNT(*) INTO v_del_count
  FROM mikro_processed_ids mp
  LEFT JOIN _mikro_found f ON f.guid = mp.mikro_sth_guid
  WHERE mp.mikro_sth_guid = ANY(v_checked)
    AND mp.reversed = FALSE AND mp.reversal_reason IS NULL
    AND mp.processed_at > v_cutoff
    AND (f.guid IS NULL OR f.iptal = 1);

  IF v_del_count > 40 THEN
    RETURN json_build_object('error', 'cok_fazla_silme', 'silinecek', v_del_count);
  END IF;

  FOR rec IN
    SELECT mp.*, f.guid AS f_guid, f.miktar AS f_miktar, f.iptal AS f_iptal, f.stok_kod AS f_kod
    FROM mikro_processed_ids mp
    LEFT JOIN _mikro_found f ON f.guid = mp.mikro_sth_guid
    WHERE mp.mikro_sth_guid = ANY(v_checked)
      AND mp.reversed = FALSE AND mp.reversal_reason IS NULL
      AND mp.processed_at > v_cutoff
      AND (f.guid IS NULL OR f.iptal = 1
           OR f.miktar IS DISTINCT FROM mp.miktar
           OR (f.stok_kod IS NOT NULL AND f.stok_kod IS DISTINCT FROM mp.stok_kod))
    ORDER BY mp.processed_at
  LOOP
    v_belge := COALESCE(NULLIF(rec.irsaliye_no, ''), 'GUID ' || left(rec.mikro_sth_guid::text, 8));

    IF rec.f_guid IS NULL OR rec.f_iptal = 1 THEN
      v_action := 'silindi';
    ELSIF rec.f_kod IS NOT NULL AND rec.f_kod IS DISTINCT FROM rec.stok_kod THEN
      v_action := 'urun_degisti';
    ELSE
      v_action := 'miktar_degisti';
    END IF;

    -- Eski ürün (satırın işlendiği ürün)
    v_prod := NULL;
    SELECT * INTO v_prod FROM products WHERE barcode = rec.stok_kod LIMIT 1 FOR UPDATE;
    IF NOT FOUND AND NULLIF(TRIM(rec.mikro_urun_adi), '') IS NOT NULL THEN
      SELECT * INTO v_prod FROM products WHERE LOWER(name) = LOWER(TRIM(rec.mikro_urun_adi)) LIMIT 1 FOR UPDATE;
    END IF;

    -- Satırdan sonra elle düzenleme / sayım / import varsa stok zaten elle oturtulmuş.
    v_skip := v_prod.id IS NULL OR EXISTS (
      SELECT 1 FROM stock_movements sm
      WHERE sm.product_id = v_prod.id
        AND sm.created_at > rec.processed_at
        AND (sm.type IN ('import', 'correction') OR (sm.type = 'edit' AND sm.new_stock IS DISTINCT FROM sm.old_stock))
        AND COALESCE(sm.notes, '') NOT LIKE 'Mikro''da %'
    );

    -- Eski üründen geri alınacak miktar
    IF v_action IN ('silindi', 'urun_degisti') THEN
      v_delta := CASE WHEN rec.p_type = 1 THEN rec.miktar::integer ELSE -rec.miktar::integer END;
    ELSE
      v_delta := CASE WHEN rec.p_type = 1 THEN (rec.miktar - rec.f_miktar)::integer
                      ELSE (rec.f_miktar - rec.miktar)::integer END;
    END IF;

    IF NOT v_skip AND v_delta <> 0 THEN
      v_note := CASE v_action
        WHEN 'silindi'      THEN 'Mikro''da silindi — ' || v_belge || ' ' || CASE WHEN rec.p_type = 1 THEN 'satışı' ELSE 'girişi' END || ' geri alındı'
        WHEN 'urun_degisti' THEN 'Mikro''da ürün değişti — ' || v_belge || ' bu üründen geri alındı (yeni kod: ' || rec.f_kod || ')'
        ELSE 'Mikro''da miktar değişti — ' || v_belge || ': ' || rec.miktar::integer || ' → ' || rec.f_miktar::integer
      END;

      UPDATE products SET stock = stock + v_delta WHERE id = v_prod.id;
      INSERT INTO stock_movements (product_id, product_name, user_id, user_email, type, quantity, old_stock, new_stock, notes)
      VALUES (v_prod.id, v_prod.name, NULL, NULL, 'correction', abs(v_delta), v_prod.stock, v_prod.stock + v_delta, v_note);
    ELSIF v_skip THEN
      n_skipped := n_skipped + 1;
    END IF;

    -- Ürün değiştiyse yeni ürüne normal yoldan işle (yeni ürün yoksa handle_invoice_stock açar).
    IF v_action = 'urun_degisti' THEN
      PERFORM handle_invoice_stock(rec.f_kod, '', rec.f_miktar::integer, rec.p_type, NULL,
                                   'Mikro''da ürün değişti — ' || v_belge || ' (eski kod: ' || rec.stok_kod || ')');
    END IF;

    IF v_action = 'silindi' THEN
      UPDATE mikro_processed_ids
      SET reversed = TRUE,
          reversal_reason = CASE WHEN v_skip THEN 'mikro_silindi_sayim_sonrasi' ELSE 'mikro_silindi' END,
          reviewed_at = NOW(), needs_review = FALSE
      WHERE id = rec.id;
      n_deleted := n_deleted + 1;
    ELSIF v_action = 'urun_degisti' THEN
      UPDATE mikro_processed_ids SET stok_kod = rec.f_kod, miktar = rec.f_miktar WHERE id = rec.id;
      n_moved := n_moved + 1;
    ELSE
      UPDATE mikro_processed_ids SET miktar = rec.f_miktar WHERE id = rec.id;
      n_changed := n_changed + 1;
    END IF;

    v_details := v_details || jsonb_build_object(
      'kod', rec.stok_kod, 'islem', v_action, 'belge', v_belge,
      'eski_miktar', rec.miktar, 'yeni_miktar', rec.f_miktar, 'yeni_kod', rec.f_kod,
      'stok_degisimi', CASE WHEN v_skip THEN 0 ELSE v_delta END, 'atlandi', v_skip);
  END LOOP;

  RETURN json_build_object(
    'checked', array_length(v_checked, 1),
    'silinen', n_deleted, 'miktar_degisen', n_changed, 'urun_degisen', n_moved,
    'sayim_sonrasi_atlanan', n_skipped, 'detay', v_details);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_mikro_recheck_guids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mikro_recheck_guids() FROM anon;
REVOKE ALL ON FUNCTION public.get_mikro_recheck_guids() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_mikro_recheck_guids() TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_mikro_changes(text[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_mikro_changes(text[], jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_mikro_changes(text[], jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_mikro_changes(text[], jsonb) TO service_role;

-- 19.11 silinen irsaliye satırları (+ 5506640'ın 16.11 8'lik satırı): pekere stoğu elle düzeltti,
-- sadece kaydı kapat, stoğa dokunma.
UPDATE mikro_processed_ids
SET reversed = TRUE, reversal_reason = 'mikro_silindi_elle', reviewed_at = NOW(), needs_review = FALSE
WHERE reversed = FALSE
  AND mikro_sth_guid IN (
    '046b951b-0c2c-48b5-ab61-16454ed96261','f96a951b-0c2c-48b5-ab61-16454ed96261','fa6a951b-0c2c-48b5-ab61-16454ed96261',
    'fc6a951b-0c2c-48b5-ab61-16454ed96261','066b951b-0c2c-48b5-ab61-16454ed96261','006b951b-0c2c-48b5-ab61-16454ed96261',
    'f76a951b-0c2c-48b5-ab61-16454ed96261','f36a951b-0c2c-48b5-ab61-16454ed96261','fe6a951b-0c2c-48b5-ab61-16454ed96261',
    '536c951b-0c2c-48b5-ab61-16454ed96261','026b951b-0c2c-48b5-ab61-16454ed96261','f56a951b-0c2c-48b5-ab61-16454ed96261',
    '29136378-c59e-4381-930e-b92328413528');
