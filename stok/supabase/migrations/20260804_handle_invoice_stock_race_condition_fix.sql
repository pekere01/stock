-- n8n'in gerçek çalıştırmasında bulunan race condition düzeltiliyor:
-- aynı barkod için "bulunamadı -> oluştur" yolu iki eşzamanlı çağrıda
-- unique constraint (products_barcode_unique) ihlaline yol açıp bir
-- stok hareketinin sessizce kaybolmasına neden oluyordu.
CREATE OR REPLACE FUNCTION public.handle_invoice_stock(
  p_barcode text,
  p_name text DEFAULT ''::text,
  p_qty integer DEFAULT 1,
  p_type integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_product     RECORD;
  v_old_stock   INTEGER;
  v_new_stock   INTEGER;
  v_eff_barcode TEXT;
  v_eff_name    TEXT;
BEGIN
  v_eff_barcode := NULLIF(TRIM(p_barcode), '');
  v_eff_name    := NULLIF(TRIM(p_name), '');

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
