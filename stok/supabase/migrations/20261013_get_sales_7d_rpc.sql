-- 2026-10-13: Ürün tablosundaki "7G Satış" sütunu eski products.sales7d sayacından değil,
-- gerçek son 7 günün stock_movements 'sale' hareketlerinden (Mikro dahil) gelir.
-- İstemci sayfadaki ürün kimliklerini verir, ürün başına toplam satış adedini alır.
CREATE OR REPLACE FUNCTION public.get_sales_7d(p_ids bigint[])
RETURNS TABLE (product_id bigint, qty integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.current_user_can('view') OR public.current_user_can('add_products')
          OR public.current_user_can('make_sales')) THEN
    RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.product_id, SUM(m.quantity)::int
    FROM stock_movements m
    WHERE m.type = 'sale'
      AND m.product_id = ANY (p_ids)
      AND m.created_at > now() - interval '7 days'
    GROUP BY m.product_id
    HAVING SUM(m.quantity) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_7d(bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sales_7d(bigint[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sales_7d(bigint[]) TO authenticated;
