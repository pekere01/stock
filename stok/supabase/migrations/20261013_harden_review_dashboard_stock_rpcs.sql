-- 2026-10-13: çoklu-model taraması bulgularından #4, #5, #6 (canlı doğrulanmış).
-- Davranışı koruyan sertleştirme; imzalar ve grant'ler aynı (CREATE OR REPLACE).

-- #4: konsinye_from_review aynı kaydı tekrar uygulayabiliyordu (needs_review kontrol edilmiyor,
-- satır kilitlenmiyordu). Artık yalnızca needs_review = TRUE kayıt işlenir ve satır kilitlenir;
-- ilk çağrı needs_review'i FALSE yaptığı için ikinci/eşzamanlı çağrı "zaten islenmis" döner.
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
    AND mp.reversed = FALSE
    AND mp.needs_review = TRUE
  FOR UPDATE OF mp;

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

-- #5: handle_invoice_stock parametre doğrulaması + satır kilidi.
-- Gerçek veride p_type yalnızca 0/1, miktar 1..2000 pozitif tamsayı; bu yüzden
-- p_type IN (0,1) ve 1 <= p_qty <= 100000 meşru akışları etkilemez.
-- Ürün satırı FOR UPDATE ile kilitlenir (eşzamanlı çağrıda hareket kaybı olmaz).
CREATE OR REPLACE FUNCTION public.handle_invoice_stock(p_barcode text, p_name text DEFAULT ''::text, p_qty integer DEFAULT 1, p_type integer DEFAULT 0, p_movement_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_detail text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF p_qty IS NULL OR p_qty < 1 OR p_qty > 100000 OR p_type IS NULL OR p_type NOT IN (0, 1) THEN
    RETURN json_build_object('error', 'gecersiz_parametre');
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

  -- Özel/bespoke takım siparişi: "___" Mikro'nun tek bir SKU'su olmayan
  -- özel takım kalemlerine verdiği placeholder kod, gerçek ürün değil.
  IF v_eff_barcode = '___' THEN
    INSERT INTO stock_movements (product_id, product_name, user_id, user_email, type, quantity, old_stock, new_stock, notes, created_at)
    VALUES (
      NULL,
      COALESCE(NULLIF(TRIM(p_detail), ''), v_eff_name, 'Özel Takım'),
      auth.uid(), auth.email(), 'ozel_takim', p_qty, NULL, NULL,
      v_notes || ' — özel takım siparişi (stok takibi dışı)',
      v_created_at
    );

    RETURN json_build_object('skipped', true, 'reason', 'ozel_takim', 'detail', p_detail);
  END IF;

  IF v_eff_barcode IS NOT NULL THEN
    SELECT * INTO v_product FROM products WHERE barcode = v_eff_barcode LIMIT 1 FOR UPDATE;
  END IF;

  IF NOT FOUND AND v_eff_name IS NOT NULL THEN
    SELECT * INTO v_product FROM products WHERE LOWER(name) = LOWER(v_eff_name) LIMIT 1 FOR UPDATE;
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
    -- Fallback: satırı yeniden çek (kilitleyerek), normal güncelleme yoluna düş.
    SELECT * INTO v_product FROM products WHERE barcode = v_eff_barcode LIMIT 1 FOR UPDATE;
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
$function$;

-- #6: get_dashboard_summary SECURITY DEFINER'dı ve izin kontrolü yoktu; products_select ile aynı
-- koşul (view | add_products | make_sales | manage_categories) eklendi. Yetkisiz kullanıcı için
-- RPC hatası (42501) döner; arayüz zaten rpcRes.error'u yok sayar. service_role/n8n etkilenmez.
CREATE OR REPLACE FUNCTION public.get_dashboard_summary()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'authenticated'
     AND NOT (public.current_user_can('view') OR public.current_user_can('add_products')
              OR public.current_user_can('make_sales') OR public.current_user_can('manage_categories')) THEN
    RAISE EXCEPTION 'yetkiniz_yok' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT json_build_object(
      'total_products',
        COUNT(*),
      'total_stock',
        COALESCE(SUM(stock), 0),
      'total_consignment',
        COALESCE(SUM(consignment_stock), 0),
      'low_stock_count',
        COUNT(*) FILTER (WHERE stock <= min_stock),
      'out_of_stock_count',
        COUNT(*) FILTER (WHERE stock <= 0),
      'total_cost_value',
        COALESCE(SUM(stock * COALESCE(cost_price, 0)), 0),
      'total_sale_value',
        COALESCE(SUM(stock * COALESCE(sale_price, 0)), 0),
      'avg_margin',
        COALESCE(
          AVG((sale_price - cost_price) / NULLIF(sale_price, 0) * 100)
          FILTER (WHERE sale_price > 0),
          0
        ),
      'category_distribution',
        (
          SELECT COALESCE(
            json_agg(
              json_build_object('category', category, 'count', cnt)
              ORDER BY cnt DESC
            ),
            '[]'::json
          )
          FROM (
            SELECT category, COUNT(*) AS cnt
            FROM products
            GROUP BY category
          ) sub
        ),
      'top_sales',
        (
          SELECT COALESCE(
            json_agg(
              json_build_object('name', name, 'sales7d', sales7d)
              ORDER BY sales7d DESC
            ),
            '[]'::json
          )
          FROM (
            SELECT name, sales7d
            FROM products
            WHERE sales7d > 0
            ORDER BY sales7d DESC
            LIMIT 8
          ) top
        )
    )
    FROM products
  );
END;
$function$;
