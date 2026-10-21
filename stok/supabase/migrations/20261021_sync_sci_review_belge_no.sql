-- sync_sci_review'a irsaliye numarası doldurma: e-irsaliye numarası Mikro'da sonradan atanabildiği için
-- stokv2 bazı satırları boş sth_belge_no ile kaydediyor. Dal A artık guid ile birlikte belge no da gönderir.
-- Parametre eklemek eski overload'ı silmez (PGRST203) → önce eskisini düşür.
DROP FUNCTION IF EXISTS public.sync_sci_review(text[]);

CREATE OR REPLACE FUNCTION public.sync_sci_review(unbilled_guids text[], unbilled_belge text[] DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  guids uuid[] := COALESCE(unbilled_guids, '{}')::uuid[];
  flagged_count integer;
  cleared_count integer;
  belge_count integer := 0;
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

  -- e-irsaliye numarası Mikro'da sonradan atanabiliyor: boş kalan irsaliye_no'yu doldur
  IF unbilled_belge IS NOT NULL THEN
    UPDATE mikro_processed_ids mp
    SET irsaliye_no = b.belge, irsaliye_tipi = 'SCI'
    FROM unnest(guids, unbilled_belge) AS b(guid, belge)
    WHERE mp.mikro_sth_guid = b.guid
      AND COALESCE(mp.irsaliye_no, '') = ''
      AND COALESCE(b.belge, '') <> '';
    GET DIAGNOSTICS belge_count = ROW_COUNT;
  END IF;

  RETURN json_build_object('flagged_count', flagged_count, 'cleared_count', cleared_count, 'belge_filled', belge_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_sci_review(text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_sci_review(text[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.sync_sci_review(text[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_sci_review(text[], text[]) TO service_role;
