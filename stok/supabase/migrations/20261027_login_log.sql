-- 2026-10-27: Giriş kaydı (login_log) — kim, ne zaman, nereden girdi.
--  * Yazma YALNIZCA sunucudan: log-login edge fonksiyonu (secret key). IP ve konum istemciden alınmaz.
--  * Okuma şimdilik YALNIZCA süper admin (pekere). İleride yöneticilere açmak için politikayı
--    (SELECT public.current_user_can('admin')) ile değiştirmek yeterli.
--  * event: 'giris' = e-posta+şifre ile giriş, 'oturum' = kayıtlı oturumla siteyi açma
--    (fonksiyon aynı kişi için 30 dakikada bir 'oturum' yazar).

CREATE TABLE IF NOT EXISTS public.login_log (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid,
  email       text,
  event       text NOT NULL CHECK (event IN ('giris', 'oturum')),
  ip          text,
  city        text,
  region      text,
  country     text,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS idx_login_log_created ON public.login_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_log_user_created ON public.login_log (user_id, created_at DESC);
ALTER TABLE public.login_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.login_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.login_log_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.login_log TO authenticated;
DROP POLICY IF EXISTS login_log_select ON public.login_log;
CREATE POLICY login_log_select ON public.login_log
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = 'ab0b3832-a82a-47a0-aa2f-a73dfb7c01dd'::uuid);
