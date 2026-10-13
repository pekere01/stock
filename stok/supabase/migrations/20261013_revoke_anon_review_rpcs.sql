-- 2026-10-13: 20261007 migration'ları (DROP+CREATE get_review_items, yeni permanently_dismiss_review)
-- REVOKE yazmadığı için anon bu iki SECURITY DEFINER RPC'yi çağırabiliyordu (çoklu-model taraması bulgusu #1, #2).
-- Canlıya apply_migration ile uygulandı; anon artık 42501 alıyor. Frontend (review.js) authenticated çağırır.
REVOKE EXECUTE ON FUNCTION public.get_review_items(text)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.permanently_dismiss_review(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_review_items(text)           TO authenticated;
GRANT  EXECUTE ON FUNCTION public.permanently_dismiss_review(text) TO authenticated;
