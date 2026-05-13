-- Dashboard özet istatistikleri için Supabase RPC
-- Supabase SQL Editor'de bir kez çalıştır.
-- SECURITY DEFINER: tüm ürünleri sayar (RLS filtresi yok → doğru aggregate).

CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'total_products',
        COUNT(*),
      'total_stock',
        COALESCE(SUM(stock), 0),
      'low_stock_count',
        COUNT(*) FILTER (WHERE stock <= min_stock),
      'out_of_stock_count',
        COUNT(*) FILTER (WHERE stock = 0),
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
$$;
