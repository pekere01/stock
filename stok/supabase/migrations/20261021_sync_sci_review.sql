-- SCI 7+ gün faturasız: stoğu otomatik geri alma yerine İnceleme Bekleyenler'e al (kategori 'sci').
-- n8n "mikro fatura kontrolü v2" Dal A artık auto_reverse_unbilled_sci yerine bunu çağırır.
-- Listede olmayan (faturalanmış/iptal edilmiş) sci işaretleri kalkar; 90 günlük Mikro penceresinden
-- düşen eski kayıtlar yanlışlıkla temizlenmesin diye yalnız son 85 günde işlenenler temizlenir.
CREATE OR REPLACE FUNCTION public.sync_sci_review(unbilled_guids text[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  guids uuid[] := COALESCE(unbilled_guids, '{}')::uuid[];
  flagged_count integer;
  cleared_count integer;
BEGIN
  UPDATE mikro_processed_ids
  SET needs_review = TRUE, review_kategori = 'sci'
  WHERE mikro_sth_guid = ANY(guids)
    AND reversed = FALSE
    AND needs_review = FALSE;
  GET DIAGNOSTICS flagged_count = ROW_COUNT;

  UPDATE mikro_processed_ids
  SET needs_review = FALSE, review_kategori = NULL
  WHERE review_kategori = 'sci'
    AND needs_review = TRUE
    AND reversed = FALSE
    AND processed_at > NOW() - INTERVAL '85 days'
    AND NOT (mikro_sth_guid = ANY(guids));
  GET DIAGNOSTICS cleared_count = ROW_COUNT;

  RETURN json_build_object('flagged_count', flagged_count, 'cleared_count', cleared_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_sci_review(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_sci_review(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.sync_sci_review(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_sci_review(text[]) TO service_role;
