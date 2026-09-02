-- 2026-09-01 tarihli ad-hoc "toplu duzeltme" mutabakat scripti (git'e hic
-- girmedi, dogrudan DB'ye yazildi) urunun stogunu, 11.06.2026 sonrasi
-- pencerede SADECE satis/cikis hareketlerini toplayip eksisini yazarak
-- hesaplamis - ayni penceredeki giris/fatura hareketlerini tamamen es
-- gecmis. Sonuc: 69 urun imkansiz negatif stoga dustu (handle_invoice_stock
-- RPC'si GREATEST(0,...) ile asla negatif yazmaz, o yuzden bu deger RPC
-- disinda, dogrudan bir UPDATE ile yazilmis olmali).
--
-- Bu migration sadece "temiz" 37 urunu duzeltir: import/in/sale disinda
-- hicbir elle-mudahale (correction/edit/create/delete) kaydi olmayan,
-- yani stock_movements gecmisinden tek anlamli replay edilebilen urunler.
-- Deger, handle_invoice_stock ile ayni semantikle (baseline 0, giris:+qty,
-- satis:GREATEST(0, running-qty)) urunun TUM stock_movements'i sirayla
-- replay edilerek elde edildi ve elle dogrulandi (2026-09-02).
--
-- Elle mudahaleli 32 urun ve negatif-olmayan ~310 uyusmazlik BU
-- migration'a DAHIL DEGIL - ayri incelenip ayri ele alinacak.
--
-- n8n / handle_invoice_stock RPC / app.js tarafinda hicbir degisiklik
-- gerekmiyor - bu saf bir veri duzeltmesidir.

BEGIN;

CREATE TEMP TABLE _fix (product_id bigint PRIMARY KEY, old_stock int, new_stock int) ON COMMIT DROP;

INSERT INTO _fix (product_id, old_stock, new_stock) VALUES
  (31068, -500, 0),
  (27086, -370, 0),
  (32663, -300, 0),
  (33438, -200, 0),
  (25072, -150, 0),
  (25071, -100, 0),
  (28693, -100, 0),
  (15947,  -80, 0),
  (41563,  -50, 0),
  (33197,  -40, 0),
  (42544,  -40, 0),
  (40242,  -40, 10),
  (44172,  -30, 0),
  (32691,  -20, 0),
  (25374,  -20, 10),
  (32776,  -20, 0),
  (37600,  -20, 0),
  (46259,  -10, 0),
  (27954,   -8, 0),
  (15945,   -6, 0),
  (11113,   -4, 0),
  (11149,   -4, 0),
  (9107,    -3, 0),
  (8438,    -3, 2),
  (8468,    -3, 6),
  (2598,    -2, 0),
  (25910,   -2, 0),
  (27365,   -2, 56),
  (29506,   -2, 2),
  (11123,   -2, 0),
  (9296,    -2, 3),
  (8108,    -2, 0),
  (8764,    -1, 0),
  (8435,    -1, 1),
  (15891,   -1, 0),
  (2705,    -1, 0),
  (8467,    -1, 5);

-- Guvenlik: beklenen satir sayisi tutmuyorsa dur
DO $$ BEGIN
  IF (SELECT count(*) FROM _fix) <> 37 THEN
    RAISE EXCEPTION 'Beklenen 37 urun yerine % bulundu', (SELECT count(*) FROM _fix);
  END IF;
END $$;

-- Guvenlik: audit sorgusundan bu yana stok degismis urun varsa dur
-- (canli n8n pipeline'i araya bir hareket yazmis olabilir)
DO $$
DECLARE v_drift int;
BEGIN
  SELECT count(*) INTO v_drift
  FROM _fix f JOIN products p ON p.id = f.product_id
  WHERE p.stock <> f.old_stock;
  IF v_drift > 0 THEN
    RAISE EXCEPTION '% urunun stogu audit''tan bu yana degismis, migration durduruldu', v_drift;
  END IF;
END $$;

-- Her duzeltme icin audit-trail kaydi
INSERT INTO stock_movements (product_id, product_name, user_id, user_email,
                              type, quantity, old_stock, new_stock, notes, created_at)
SELECT f.product_id, p.name, NULL, NULL, 'correction', (f.new_stock - f.old_stock),
       f.old_stock, f.new_stock,
       'toplu duzeltme 2026-09-01 giris hareketini atlamisti; RPC-semantikli replay ile duzeltildi (2026-09-02)',
       now()
FROM _fix f JOIN products p ON p.id = f.product_id;

-- Duzeltmeyi uygula (trg_update_status tetiklenip status'u otomatik gunceller)
UPDATE products p SET stock = f.new_stock
FROM _fix f
WHERE p.id = f.product_id AND p.stock = f.old_stock;

COMMIT;
