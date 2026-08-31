-- Bug: bir kullanıcının TÜM yetkileri (view dahil) kaldırıldığında dashboard
-- client-side artık "Yetkiniz Yok" gösterip loadData()'yı hiç çağırmıyor
-- (bkz. auth.js enterApp). Ama products_select RLS'i hâlâ `USING (true)` —
-- yani DevTools/REST'ten doğrudan `products` tablosu sorgulanırsa
-- (supabase.from('products').select(...)) böyle bir kullanıcı yine tüm
-- veriyi (fiyat dahil) çekebilir. Bu migration o boşluğu kapatıyor.
--
-- 'view' izni listeye dahil edildiği için gerçek etkilenen tek grup
-- Serap'ın senaryosu (view=false + hiç elevated izin yok) — dashboard'a
-- zaten giremeyen bu kullanıcılar için realtime kaybı da anlamsız (asla
-- setupRealtime()'a ulaşmıyorlar). view=true olan herkes (review/konsinye
-- panelleri dahil) etkilenmez, current_user_can('view') zaten true dönüyor.

DROP POLICY IF EXISTS products_select ON products;

CREATE POLICY products_select ON products
  FOR SELECT TO authenticated
  USING (
    public.current_user_can('view')
    OR public.current_user_can('add_products')
    OR public.current_user_can('make_sales')
    OR public.current_user_can('manage_categories')
  );
