-- Konsinye deposu: Mikro SCT irsaliyesiyle ana stoktan çıkmış konsinye ürünlerini
-- ayrı bir sayaçla (consignment_stock) takip etmek için.
--
-- Model: Overlay. Mikro, SCT irsaliyesinde ana `stock`'u zaten TAM BİR KEZ düşürüyor
-- (workflow stokv2, bkz. mikro-otomasyon.md L125-126). Bu yüzden:
--   GÖNDER  (İnceleme panelinden "Konsinye Deposuna Aktar"): consignment_stock += q, stock DOKUNULMAZ
--   İADE    (mal fiziksel geri geldi):                        consignment_stock -= q, stock += q
--            (Mikro konsinye iadesini alış irsaliyesi olarak GİRMİYOR — mikro-otomasyon.md L151,221 —
--             bu yüzden ana stoğu geri artırmak SADECE bu RPC üzerinden, elle yapılır)
--   FATURALANDI (konsinye kesin satışa döndü):                 consignment_stock -= q, stock/sales7d DOKUNULMAZ
--            (irsaliye zaten stok hareketini yaptı, fatura yeni bir STOK_HAREKETLERI satırı üretmez)

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS consignment_stock INTEGER NOT NULL DEFAULT 0
    CHECK (consignment_stock >= 0);

-- ── GÖNDER: İnceleme panelindeki bir SCT kaydını konsinye deposuna aktar ──
-- manual_reverse_review'in kopyası ama handle_invoice_stock ÇAĞIRMAZ (stok zaten Mikro'da düştü).
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

-- ── İADE: konsinyeden ana stoğa geri al ──
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

-- ── FATURALANDI: konsinye kesin satışa döndü, sadece konsinye bakiyesi düşer ──
CREATE OR REPLACE FUNCTION public.konsinye_invoice(p_product_id bigint, p_qty integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v RECORD;
BEGIN
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

-- ── Grants: 20260819_fix_rpc_public_grant_leak.sql dersi — FROM PUBLIC şart, sadece FROM anon yetmez ──
REVOKE EXECUTE ON FUNCTION public.konsinye_from_review(text)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.konsinye_return(bigint, integer)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.konsinye_invoice(bigint, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.konsinye_from_review(text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.konsinye_return(bigint, integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.konsinye_invoice(bigint, integer) TO authenticated;

-- ── get_dashboard_summary: total_consignment eklendi (additive, belowMin invariantını bozmaz) ──
CREATE OR REPLACE FUNCTION public.get_dashboard_summary()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
