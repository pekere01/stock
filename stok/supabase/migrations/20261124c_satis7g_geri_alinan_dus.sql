-- 2026-11-24: "7G Satış" ve dashboard "Haftalık Satış" Mikro'da silinen/azalan satışları düşsün
-- (pekere: 5508576 ICP 175 satışı Mikro'da silindi, düzeltme stoğu geri ekledi ama 7G Satış 10 gösteriyordu).
-- Net satış = 'sale' hareketleri − reconcile_mikro_changes'in satışı geri alan düzeltmeleri
-- (notu "Mikro'da … satışı …" olan 'correction'; işaretli: old_stock − new_stock).

-- 1) reconcile_mikro_changes: miktar/ürün değişti notlarına da "satışı/girişi" yaz (silindi'de zaten var).
--    Gövde canlıdan okunup yalnız iki not ifadesi değiştiriliyor (repo dosyası canlıyla birebir değil).
DO $do$
DECLARE
  src  text;
  src2 text;
BEGIN
  SELECT p.prosrc INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reconcile_mikro_changes';

  src2 := replace(src,
    $a$|| v_belge || ' bu üründen geri alındı (yeni kod: '$a$,
    $a$|| v_belge || ' ' || CASE WHEN rec.p_type = 1 THEN 'satışı' ELSE 'girişi' END || ' bu üründen geri alındı (yeni kod: '$a$);
  src2 := replace(src2,
    $a$ELSE 'Mikro''da miktar değişti — ' || v_belge || ': '$a$,
    $a$ELSE 'Mikro''da miktar değişti — ' || v_belge || ' ' || CASE WHEN rec.p_type = 1 THEN 'satışı' ELSE 'girişi' END || ': '$a$);

  IF src2 = src OR (length(src2) - length(src)) < 100 THEN
    RAISE EXCEPTION 'reconcile_mikro_changes not ifadeleri bulunamadi, degisiklik yapilmadi';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.reconcile_mikro_changes(p_checked text[], p_found jsonb) '
    'RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO %L AS %L',
    'public', src2);
END
$do$;

-- 2) Tablo "7G Satış"
CREATE OR REPLACE FUNCTION public.get_sales_7d(p_ids bigint[])
 RETURNS TABLE(product_id bigint, qty integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.current_user_can('view') OR public.current_user_can('add_products')
          OR public.current_user_can('make_sales')) THEN
    RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.product_id,
           SUM(CASE WHEN m.type = 'sale' THEN m.quantity ELSE m.old_stock - m.new_stock END)::int
    FROM stock_movements m
    WHERE (m.type = 'sale'
           OR (m.type = 'correction' AND m.notes LIKE 'Mikro''da % satışı%'))
      AND m.product_id = ANY (p_ids)
      AND m.created_at > now() - interval '7 days'
    GROUP BY m.product_id
    HAVING SUM(CASE WHEN m.type = 'sale' THEN m.quantity ELSE m.old_stock - m.new_stock END) > 0;
END;
$function$;

-- 3) Dashboard "Haftalık Satış Performansı" (top_sales) aynı net hesap
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
        COALESCE(SUM(GREATEST(stock, 0)), 0),
      'total_consignment',
        COALESCE(SUM(consignment_stock), 0),
      'low_stock_count',
        COUNT(*) FILTER (WHERE stock <= min_stock),
      'out_of_stock_count',
        COUNT(*) FILTER (WHERE stock <= 0),
      'negative_stock_count',
        COUNT(*) FILTER (WHERE stock < 0),
      'total_cost_value',
        COALESCE(SUM(GREATEST(stock, 0) * COALESCE(cost_price, 0)), 0),
      'total_sale_value',
        COALESCE(SUM(GREATEST(stock, 0) * COALESCE(sale_price, 0)), 0),
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
              ORDER BY sales7d DESC, name
            ),
            '[]'::json
          )
          FROM (
            SELECT p.name AS name,
                   SUM(CASE WHEN m.type = 'sale' THEN m.quantity ELSE m.old_stock - m.new_stock END)::int AS sales7d
            FROM stock_movements m
            JOIN products p ON p.id = m.product_id
            WHERE (m.type = 'sale'
                   OR (m.type = 'correction' AND m.notes LIKE 'Mikro''da % satışı%'))
              AND m.product_id IS NOT NULL
              AND m.created_at > now() - interval '7 days'
            GROUP BY p.id, p.name
            HAVING SUM(CASE WHEN m.type = 'sale' THEN m.quantity ELSE m.old_stock - m.new_stock END) > 0
            ORDER BY 2 DESC, p.name
            LIMIT 8
          ) top
        )
    )
    FROM products
  );
END;
$function$;
