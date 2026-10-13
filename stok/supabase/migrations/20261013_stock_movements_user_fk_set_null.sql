-- 2026-10-13: Hareket kaydı olan kullanıcı silinemiyordu ("Database error deleting user"):
-- stock_movements.user_id kullanıcıya bağlıydı ve silmeyi engelliyordu. Artık kullanıcı silinince
-- hareketin user_id'si boşalır; user_email sütunu hareketin kimin yaptığını göstermeye devam eder.
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_user_id_fkey;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
