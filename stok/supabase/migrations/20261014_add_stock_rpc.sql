-- 2026-10-14: Stok ekleme (CSV içe aktarma + "aynı ürünü ekle") artık eski ekran değerinden hesaplanmıyor.
-- Önceden arayüz `dup.stock + stock` yazıyordu; arada olan satış/Mikro hareketi ezilirdi. Bu RPC satırı
-- kilitleyip `stock = stock + miktar` yapar, fiyat/depo güncellemesini ve stock_movements kaydını tek işlemde yazar.
-- Durum (status) products tetikleyicisiyle güncellenir. Yetki: add_products (products_update ile aynı).
CREATE OR REPLACE FUNCTION public.add_stock(
  p_product_id bigint,
  p_qty integer,
  p_cost numeric DEFAULT NULL,
  p_price numeric DEFAULT NULL,
  p_depo text DEFAULT NULL,
  p_purchase_rate numeric DEFAULT NULL,
  p_type text DEFAULT 'in',
  p_notes text DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p         RECORD;
  v_new_stock INTEGER;
  v_parts     TEXT[];
  v_incoming  TEXT;
  v_depo      TEXT;
  v_after     RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_can('add_products') THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  IF p_product_id IS NULL OR p_qty IS NULL OR p_qty < 0 OR p_qty > 1000000
     OR p_type NOT IN ('in', 'import') THEN
    RETURN json_build_object('error', 'gecersiz_parametre');
  END IF;

  SELECT * INTO v_p FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'urun_bulunamadi');
  END IF;

  v_new_stock := COALESCE(v_p.stock, 0) + p_qty;

  -- Depo birleştirme: arayüzdeki mergeDepo() ile aynı (virgülle ayrılmış, büyük/küçük harf duyarsız tekil).
  v_incoming := btrim(COALESCE(p_depo, ''));
  v_depo := v_p.warehouse_info;
  IF v_incoming <> '' THEN
    SELECT COALESCE(array_agg(x), ARRAY[]::TEXT[]) INTO v_parts
      FROM (SELECT btrim(t) AS x FROM unnest(string_to_array(COALESCE(v_p.warehouse_info, ''), ',')) AS t) s
     WHERE x <> '';
    IF EXISTS (SELECT 1 FROM unnest(v_parts) AS e WHERE lower(e) = lower(v_incoming)) THEN
      v_depo := array_to_string(v_parts, ', ');
    ELSE
      v_depo := array_to_string(v_parts || v_incoming, ', ');
    END IF;
  END IF;

  UPDATE products
     SET stock          = v_new_stock,
         cost_price     = CASE WHEN p_cost  IS NOT NULL AND p_cost  > 0 THEN p_cost  ELSE cost_price END,
         sale_price     = CASE WHEN p_price IS NOT NULL AND p_price > 0 THEN p_price ELSE sale_price END,
         purchase_rate  = COALESCE(p_purchase_rate, purchase_rate),
         warehouse_info = v_depo
   WHERE id = v_p.id;

  INSERT INTO stock_movements (product_id, product_name, user_id, user_email, type, quantity, old_stock, new_stock, notes)
  VALUES (v_p.id, v_p.name, auth.uid(), auth.email(), p_type, p_qty, COALESCE(v_p.stock, 0), v_new_stock, p_notes);

  SELECT stock, status, warehouse_info, cost_price, sale_price INTO v_after FROM products WHERE id = v_p.id;

  RETURN json_build_object(
    'id', v_p.id, 'name', v_p.name,
    'old_stock', COALESCE(v_p.stock, 0), 'new_stock', v_after.stock, 'status', v_after.status,
    'warehouse_info', v_after.warehouse_info, 'cost_price', v_after.cost_price, 'sale_price', v_after.sale_price
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.add_stock(bigint, integer, numeric, numeric, text, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_stock(bigint, integer, numeric, numeric, text, numeric, text, text) TO authenticated;
