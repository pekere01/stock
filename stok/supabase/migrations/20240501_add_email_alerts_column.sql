-- E-posta bildirim yetkisi için kolon ekle
-- Supabase SQL Editor'da çalıştır: Dashboard → SQL Editor → New Query → Paste → Run
ALTER TABLE user_permissions
  ADD COLUMN IF NOT EXISTS receives_email_alerts boolean DEFAULT false;
