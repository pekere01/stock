-- 2026-11-24: Silinen/değişen satır kontrolü penceresi 14 → 45 gün (pekere onayı).
-- 20.11 10:06 UTC sınırı korunuyor: sayımla düzeltilen dönemin satırlarına dokunulmaz.
-- Pencere 2027-01-04'te 45 günü tam kapsar. reconcile_mikro_changes değişmedi.
CREATE OR REPLACE FUNCTION public.get_mikro_recheck_guids()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object('guids', COALESCE(json_agg(mikro_sth_guid::text), '[]'::json))
  FROM mikro_processed_ids
  WHERE reversed = FALSE
    AND reversal_reason IS NULL
    AND p_type IN (0, 1)
    AND processed_at > GREATEST(now() - interval '45 days', '2026-11-20 10:06:00+00'::timestamptz);
$function$;
