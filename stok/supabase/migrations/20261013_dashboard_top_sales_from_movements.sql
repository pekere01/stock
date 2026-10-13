-- 2026-10-13: Dashboard "Haftalık Satış Performansı" artık products.sales7d sayacından değil,
-- gerçek son 7 günün stock_movements 'sale' hareketlerinden hesaplanır. Böylece Mikro/n8n
-- (handle_invoice_stock) satışları da sayılır ve 7 günden eski satışlar kendiliğinden düşer.
-- Çıktı biçimi aynı: top_sales = [{name, sales7d}]. Tablodaki "7G Satış" sütunu (products.sales7d) bu
-- değişiklikte DEĞİŞMEDİ.
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
              ORDER BY sales7d DESC, name
            ),
            '[]'::json
          )
          FROM (
            SELECT p.name AS name, SUM(m.quantity)::int AS sales7d
            FROM stock_movements m
            JOIN products p ON p.id = m.product_id
            WHERE m.type = 'sale'
              AND m.product_id IS NOT NULL
              AND m.created_at > now() - interval '7 days'
            GROUP BY p.id, p.name
            HAVING SUM(m.quantity) > 0
            ORDER BY SUM(m.quantity) DESC, p.name
            LIMIT 8
          ) top
        )
    )
    FROM products
  );
END;
$function$;
