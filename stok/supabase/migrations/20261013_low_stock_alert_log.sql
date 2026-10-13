-- 2026-10-13: send-low-stock-alert için bekleme süresi (aynı ürün için saatte en fazla 1 e-posta) kaydı.
-- Yalnızca edge fonksiyonu (service_role) okur/yazar; RLS açık, politika yok, anon/authenticated erişimi kapalı.
CREATE TABLE IF NOT EXISTS public.low_stock_alert_log (
  id         bigserial PRIMARY KEY,
  product_id bigint NOT NULL,
  sent_by    uuid,
  sent_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_low_stock_alert_log_product_sent ON public.low_stock_alert_log (product_id, sent_at DESC);
ALTER TABLE public.low_stock_alert_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.low_stock_alert_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.low_stock_alert_log_id_seq FROM PUBLIC, anon, authenticated;
