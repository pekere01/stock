-- handle_invoice_stock v2: p_name parametresi + otomatik ürün oluşturma
CREATE OR REPLACE FUNCTION handle_invoice_stock(
  p_barcode TEXT,
  p_name    TEXT    DEFAULT '',
  p_qty     INTEGER DEFAULT 1,
  p_type    INTEGER DEFAULT 0   -- 0 = alış (stok ekle), 1 = satış (stok çıkar)
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product       RECORD;
  v_old_stock     INTEGER;
  v_new_stock     INTEGER;
  v_eff_barcode   TEXT;
BEGIN
  v_eff_barcode := NULLIF(TRIM(p_barcode), '');

  -- 1) Barkod ile ara
  IF v_eff_barcode IS NOT NULL THEN
    SELECT * INTO v_product FROM products WHERE barcode = v_eff_barcode LIMIT 1;
  END IF;

  -- 2) Barkod bulunamadıysa ürün adı ile ara
  IF NOT FOUND AND TRIM(COALESCE(p_name, '')) != '' THEN
    SELECT * INTO v_product
      FROM products
     WHERE LOWER(name) = LOWER(TRIM(p_name))
     LIMIT 1;
  END IF;

  -- 3) Hiçbiri yoksa sıfır stokla yeni ürün oluştur
  IF NOT FOUND THEN
    INSERT INTO products (name, barcode, stock, min_stock, category, status)
    VALUES (
      COALESCE(NULLIF(TRIM(p_name), ''), v_eff_barcode, p_barcode),
      v_eff_barcode,
      0,
      0,
      'Genel',
      'out_of_stock'
    )
    RETURNING * INTO v_product;
  END IF;

  v_old_stock := COALESCE(v_product.stock, 0);

  -- Stok güncelle
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
$$;
