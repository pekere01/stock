-- 2026-10-13: Satış (stok çıkar) artık yalnızca make_sales yetkisi olanların çağırabildiği bir RPC.
-- Önceden arayüz products tablosunu doğrudan güncelliyordu; bu yüzden add_products olan biri de
-- (API üzerinden) satış yapabiliyordu. RPC stok + sales7d + fiyat güncellemesini ve stock_movements
-- kaydını tek işlemde (satır kilitli) yazar. Durum (status) products tetikleyicisiyle güncellenir.
CREATE OR REPLACE FUNCTION public.sell_stock(
  p_product_id bigint,
  p_qty integer,
  p_sale_price numeric DEFAULT NULL,
  p_sale_rate numeric DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p           RECORD;
  v_new_stock   INTEGER;
  v_new_sales7d INTEGER;
  v_has_price   BOOLEAN;
  v_notes       TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_can('make_sales') THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  IF p_product_id IS NULL OR p_qty IS NULL OR p_qty < 1 OR p_qty > 100000 THEN
    RETURN json_build_object('error', 'gecersiz_parametre');
  END IF;

  SELECT * INTO v_p FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'urun_bulunamadi');
  END IF;

  IF p_qty > COALESCE(v_p.stock, 0) THEN
    RETURN json_build_object('error', 'yetersiz_stok', 'stock', COALESCE(v_p.stock, 0));
  END IF;

  v_new_stock   := COALESCE(v_p.stock, 0) - p_qty;
  v_new_sales7d := COALESCE(v_p.sales7d, 0) + p_qty;
  v_has_price   := p_sale_price IS NOT NULL AND p_sale_price > 0;

  IF v_has_price THEN
    UPDATE products
       SET stock = v_new_stock, sales7d = v_new_sales7d,
           sale_price = p_sale_price, sale_rate = COALESCE(p_sale_rate, sale_rate)
     WHERE id = v_p.id;
    v_notes := 'Satış fiyatı: ' || trim(to_char(p_sale_price, 'FM999999990.00')) || ' €';
  ELSE
    UPDATE products SET stock = v_new_stock, sales7d = v_new_sales7d WHERE id = v_p.id;
    v_notes := '';
  END IF;

  INSERT INTO stock_movements (product_id, product_name, user_id, user_email, type, quantity, old_stock, new_stock, new_price, notes)
  VALUES (v_p.id, v_p.name, auth.uid(), auth.email(), 'sale', p_qty, COALESCE(v_p.stock, 0), v_new_stock,
          CASE WHEN v_has_price THEN p_sale_price ELSE 0 END, v_notes);

  RETURN json_build_object(
    'id', v_p.id, 'old_stock', COALESCE(v_p.stock, 0), 'new_stock', v_new_stock,
    'sales7d', v_new_sales7d, 'min_stock', v_p.min_stock
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sell_stock(bigint, integer, numeric, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sell_stock(bigint, integer, numeric, numeric) TO authenticated;
