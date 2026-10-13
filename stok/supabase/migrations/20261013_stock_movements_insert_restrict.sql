-- 2026-10-13: stock_movements INSERT politikası daraltıldı (sahte hareket kaydı riski).
-- Önceden: giriş yapmış herkes, kendi user_id'siyle istediği tip/miktarda kayıt ekleyebiliyordu
-- (sahte 'sale' haftalık grafiği çarpıtır). Şimdi: yalnızca add_products/admin yetkisi olanlar ve
-- yalnızca arayüzün yazdığı tipler. 'sale', 'konsinye_out', 'bileme_kaplama', 'ozel_takim',
-- 'correction' gibi sistem tiplerini yalnızca SECURITY DEFINER sunucu fonksiyonları yazar
-- (sell_stock, handle_invoice_stock, konsinye_from_review ...), RLS'e takılmazlar.
DROP POLICY IF EXISTS auth_insert_movements ON public.stock_movements;
CREATE POLICY auth_insert_movements ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND type IN ('edit', 'create', 'delete', 'import', 'in')
    AND (SELECT public.current_user_can('add_products'))
  );
