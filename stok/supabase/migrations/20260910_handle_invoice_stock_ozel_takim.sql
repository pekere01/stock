-- "___" stok kodu Mikro'da özel/bespoke takım siparişlerine verilen placeholder
-- kod (BİLEME gibi tek bir fiziksel stok kalemini temsil etmiyor). Bu yüzden
-- BİLEME ile aynı desende: ürün eşleştirme/stok güncellemesi atlanır, bunun
-- yerine bilgilendirme amaçlı bir stock_movements kaydı düşülür.
-- bkz. 01_Projects/stok/mikro-otomasyon.md §İrsaliye Türleri (BİLEME düzeltmesi, 2026-08-18)

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
    -- Fallback: satırı yeniden çek, normal güncelleme yoluna düş.
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
$function$;
