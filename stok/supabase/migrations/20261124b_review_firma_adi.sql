-- 2026-11-24: İnceleme Bekleyenler'de firma adı (pekere onayı).
-- Mikro: STOK_HAREKETLERI.sth_cari_kodu → CARI_HESAPLAR.cari_unvan1.
-- Yeni kayıtlarda n8n stokv2 cari_kodu/cari_unvan gönderene kadar alanlar boş kalır.
ALTER TABLE public.mikro_processed_ids
  ADD COLUMN IF NOT EXISTS cari_kodu text,
  ADD COLUMN IF NOT EXISTS cari_unvan text;

-- Dönüş tipi değiştiği için DROP + CREATE.
DROP FUNCTION IF EXISTS public.get_review_items(text);
CREATE FUNCTION public.get_review_items(p_kategori text)
 RETURNS TABLE(mikro_sth_guid uuid, stok_kod text, miktar numeric, irsaliye_no text, processed_at timestamp with time zone, mikro_urun_adi text, cari_unvan text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT mikro_sth_guid, stok_kod, miktar, irsaliye_no, processed_at, mikro_urun_adi, cari_unvan
  FROM mikro_processed_ids
  WHERE needs_review = TRUE
    AND review_kategori = p_kategori
    AND (reviewed_at IS NULL OR reviewed_at < NOW() - INTERVAL '7 days')
  ORDER BY processed_at ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_review_items(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_review_items(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_review_items(text) TO authenticated, service_role;

-- İncelemedeki mevcut kayıtlar (pekere Mikro'dan sorguladı, 24.11).
UPDATE public.mikro_processed_ids m
SET cari_kodu = v.kod, cari_unvan = v.unvan
FROM (VALUES
  ('SCI2026000000744', '1069', 'ÇUKUROVA İNŞAAT MAKİNALARI SAN. VE TİC. A.Ş'),
  ('SCT2026000000035', '1002', 'ISCAR KESİCİ TAKIM TİCARETİ VE İMALATI LTD ŞTİ'),
  ('SCT2026000000037', '1245', 'ONER SEPERATOR SAN. TİC. LTD.ŞTİ.'),
  ('SCT2026000000041', '1069', 'ÇUKUROVA İNŞAAT MAKİNALARI SAN. VE TİC. A.Ş'),
  ('SCT2026000000043', '1069', 'ÇUKUROVA İNŞAAT MAKİNALARI SAN. VE TİC. A.Ş')
) AS v(irs, kod, unvan)
WHERE m.irsaliye_no = v.irs AND m.cari_unvan IS NULL;
