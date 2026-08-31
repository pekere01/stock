-- 20260831_products_select_requires_view.sql'i geri almak için.
DROP POLICY IF EXISTS products_select ON products;

CREATE POLICY products_select ON products
  FOR SELECT TO authenticated
  USING (true);
