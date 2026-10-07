-- 2026-10-07: "Ilceleme Bekleyenler" panelinde urun adi sadece yerel
-- products.barcode eslesmesinden geliyordu. Mikro'nun kendi STOKLAR adi
-- (___, BILEME, ya da site'ye hic eklenmemis gercek urunler icin) hic
-- saklanmiyordu -- n8n sorgusu zaten `s.sto_isim AS urun_adi` ile cekiyor
-- ama HTTP Request body'sine hic eklenmemisti.
--
-- Bu migration sadece kolonu ve get_review_items'in donusunu ekliyor. n8n
-- tarafinda "stok" workflow'unun HTTP Request (dedup insert) dugumune
-- bir satir eklenmesi ayrica gerekiyor (bkz. sohbetteki talimat) -- bu
-- oturumda n8n MCP baglantisi yok, o yuzden elle yapilmasi lazim.

ALTER TABLE mikro_processed_ids
ADD COLUMN IF NOT EXISTS mikro_urun_adi TEXT;

DROP FUNCTION IF EXISTS public.get_review_items(text);

CREATE FUNCTION public.get_review_items(p_kategori text)
RETURNS TABLE(mikro_sth_guid uuid, stok_kod text, miktar numeric, irsaliye_no text, processed_at timestamptz, mikro_urun_adi text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT mikro_sth_guid, stok_kod, miktar, irsaliye_no, processed_at, mikro_urun_adi
  FROM mikro_processed_ids
  WHERE needs_review = TRUE
    AND review_kategori = p_kategori
    AND (reviewed_at IS NULL OR reviewed_at < NOW() - INTERVAL '7 days')
  ORDER BY processed_at ASC;
$function$;
