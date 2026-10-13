-- 2026-10-13: Süper admin kontrolü e-postadan değişmez hesap kimliğine (UUID) taşındı.
-- Önceden: (auth.jwt() ->> 'email') = 'teknik@soncag.com' -> e-posta değişirse yetki gider, adres başkasına
-- geçerse süper yetki geçerdi. Şimdi: auth.uid() sabit kimlikle eşleşir. Yedek olarak hem süper admin
-- hem admin2 user_permissions'ta admin=true (güvenlik ağı: kimlik yanlış olsa bile tablo üzerinden admin).
CREATE OR REPLACE FUNCTION public.current_user_can(perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    auth.uid() = 'ab0b3832-a82a-47a0-aa2f-a73dfb7c01dd'::uuid
    OR EXISTS (
      SELECT 1 FROM user_permissions
      WHERE user_id = auth.uid()
        AND (permissions ->> 'admin' = 'true' OR permissions ->> perm = 'true')
    ),
    false
  );
$function$;
