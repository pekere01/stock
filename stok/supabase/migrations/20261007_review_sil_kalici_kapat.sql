-- 2026-10-07: "Ilceleme Bekleyenler" panelindeki "Sil" butonu dismiss_review'i
-- cagiriyordu -- o RPC sadece reviewed_at = NOW() yazip 7 gunluk erteleme
-- yapiyor, needs_review'a dokunmuyor. Sonuc: "Sil"e basilsa bile kayit 7 gun
-- sonra tekrar review listesine dusuyordu ("Bekletmeye Devam Et" ile ayni
-- davranis, iki farkli buton ayni islevi goruyordu).
--
-- Cozum: "Sil" icin ayri, kalici kapatan bir RPC. "Bekletmeye Devam Et"
-- hala dismiss_review (erteleme) kullanmaya devam ediyor, degismedi.

CREATE OR REPLACE FUNCTION public.permanently_dismiss_review(p_guid text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'authenticated'
     AND NOT (public.current_user_can('add_products') OR public.current_user_can('make_sales')) THEN
    RETURN json_build_object('error', 'yetkiniz_yok');
  END IF;

  UPDATE mikro_processed_ids
  SET needs_review = FALSE, reviewed_at = NOW()
  WHERE mikro_sth_guid = p_guid::uuid;

  RETURN json_build_object('dismissed', true, 'permanent', true);
END;
$function$;
