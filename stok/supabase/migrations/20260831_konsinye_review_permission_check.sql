-- konsinye_from_review / konsinye_return / konsinye_invoice sadece anon'dan
-- REVOKE edilmişti (20260827_konsinye_deposu.sql) ama authenticated içinde
-- hiçbir yetki kontrolü yoktu — sadece 'Görüntüleme' izni olan biri bile
-- bu RPC'leri DevTools/console'dan doğrudan çağırıp stok hareketi
-- yaratabilirdi. UI tarafında buton/panel zaten add_products veya
-- make_sales'e bağlandı (review.js), bu migration aynı kuralı sunucu
-- tarafında da zorunlu kılıyor.

CREATE OR REPLACE FUNCTION public.konsinye_from_review(p_guid text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
  v_product RECORD;
BEGIN
  IF NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  SELECT mp.id, mp.stok_kod, mp.miktar INTO rec
  FROM mikro_processed_ids mp
  WHERE mp.mikro_sth_guid::TEXT = p_guid
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
$$;

CREATE OR REPLACE FUNCTION public.konsinye_return(p_product_id bigint, p_qty integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v RECORD;
  v_new_stock INTEGER;
  v_status TEXT;
BEGIN
  IF NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  SELECT * INTO v FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'urun_bulunamadi');
  END IF;
  IF p_qty IS NULL OR p_qty < 1 OR p_qty > v.consignment_stock THEN
    RETURN json_build_object('error', 'gecersiz_miktar');
  END IF;

  v_new_stock := v.stock + p_qty;
  v_status := CASE
    WHEN v_new_stock <= 0 THEN 'out_of_stock'
    WHEN v_new_stock <= v.min_stock THEN 'low_stock'
    ELSE 'active'
  END;

  UPDATE products
  SET consignment_stock = consignment_stock - p_qty,
      stock = v_new_stock,
      status = v_status
  WHERE id = p_product_id;

  INSERT INTO stock_movements (product_id, product_name, user_id, user_email, type, quantity, old_stock, new_stock, notes)
  VALUES (p_product_id, v.name, auth.uid(), auth.email(), 'konsinye_return', p_qty, v.stock, v_new_stock,
          'Konsinyeden ana stoğa iade');

  RETURN json_build_object('ok', true, 'new_stock', v_new_stock, 'consignment_stock', v.consignment_stock - p_qty);
END;
$$;

CREATE OR REPLACE FUNCTION public.konsinye_invoice(p_product_id bigint, p_qty integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v RECORD;
BEGIN
  IF NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  SELECT * INTO v FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'urun_bulunamadi');
  END IF;
  IF p_qty IS NULL OR p_qty < 1 OR p_qty > v.consignment_stock THEN
    RETURN json_build_object('error', 'gecersiz_miktar');
  END IF;

  UPDATE products
  SET consignment_stock = consignment_stock - p_qty
  WHERE id = p_product_id;

  INSERT INTO stock_movements (product_id, product_name, user_id, user_email, type, quantity, notes)
  VALUES (p_product_id, v.name, auth.uid(), auth.email(), 'konsinye_sale', p_qty,
          'Konsinye ürün faturalandı (kesin satış)');

  RETURN json_build_object('ok', true, 'consignment_stock', v.consignment_stock - p_qty);
END;
$$;
