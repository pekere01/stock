-- Faz 2: 09-01 mutabakat script'inin bozdugu 69 negatif urunun geri kalan
-- 32'si (elle correction/edit kaydi tasidigi icin Faz 1 migration'ina
-- (20260902_fix_recon_negative_stock.sql) dahil edilmemisti). Bu grupta
-- audit-trail replay tek anlamli sonuc vermiyordu, o yuzden pekere Mikro'nun
-- kendi stok karti ekranindan her 32 urunun GUNCEL GERCEK bakiyesini elle
-- kontrol etti (2026-09-02).
--
-- Kural: Mikro'da negatif/sifir cikan -> site 0. Mikro'da pozitif cikan ->
-- site Mikro'daki sayiya esitlenir. Bu, siteki degerin Mikro'nun gercek
-- fiziksel sayimindan sapmis olabilecegini (bazi urunlerde bircok kutu
-- stok varken sitede -20 gibi imkansiz bir deger gorunuyordu) dogrudan
-- Mikro'ya gore duzeltiyor.
--
-- n8n / handle_invoice_stock RPC / app.js tarafinda hicbir degisiklik
-- gerekmiyor - bu saf bir veri duzeltmesidir.

BEGIN;

CREATE TEMP TABLE _fix2 (product_id bigint PRIMARY KEY, old_stock int, new_stock int, mikro_bakiye int) ON COMMIT DROP;

INSERT INTO _fix2 (product_id, old_stock, new_stock, mikro_bakiye) VALUES
  (33339,  -220,    0,   -36),
  (25048,  -110,   19,    19),
  (30483,   -95, 2051,  2051),
  (25077,   -75,  960,   960),
  (25080,   -50,  470,   470),
  (25228,   -40, 2450,  2450),
  (25075,   -30, 1970,  1970),
  (30405,   -20, 1026,  1026),
  (25852,   -20,    0,   -10),
  (27129,   -20,    0,   -64),
  (25049,   -20,  760,   760),
  (637,     -16,    0, -1110),
  (25883,    -6,    0,    -6),
  (9298,     -6,   24,    24),
  (9297,     -5,   42,    42),
  (2812,     -2,    0,     0),
  (15968,    -2,    0,     0),
  (6646,     -2,    0,    -1),
  (11120,    -2,    1,     1),
  (8961,     -2,   13,    13),
  (46283,    -2,    0,    -1),
  (8391,     -2,    6,     6),
  (11155,    -2,    0,    -2),
  (27026,    -2,    0,   -22),
  (46322,    -1,    0,     0),
  (25896,    -1,    0,   -35),
  (46710,    -1,    0,     0),
  (6280,     -1,    0,     0),
  (290,      -1,    0,     0),
  (29328,    -1,    0,   -34),
  (5947,     -1,   58,    58),
  (46711,    -1,    0,     0);

-- Guvenlik: beklenen satir sayisi tutmuyorsa dur
DO $$ BEGIN
  IF (SELECT count(*) FROM _fix2) <> 32 THEN
    RAISE EXCEPTION 'Beklenen 32 urun yerine % bulundu', (SELECT count(*) FROM _fix2);
  END IF;
END $$;

-- Guvenlik: audit sorgusundan bu yana stok degismis urun varsa dur
DO $$
DECLARE v_drift int;
BEGIN
  SELECT count(*) INTO v_drift
  FROM _fix2 f JOIN products p ON p.id = f.product_id
  WHERE p.stock <> f.old_stock;
  IF v_drift > 0 THEN
    RAISE EXCEPTION '% urunun stogu audit''tan bu yana degismis, migration durduruldu', v_drift;
  END IF;
END $$;

-- Her duzeltme icin audit-trail kaydi (Mikro bakiyesi de notta saklaniyor)
INSERT INTO stock_movements (product_id, product_name, user_id, user_email,
                              type, quantity, old_stock, new_stock, notes, created_at)
SELECT f.product_id, p.name, NULL, NULL, 'correction', (f.new_stock - f.old_stock),
       f.old_stock, f.new_stock,
       'Faz 2: 09-01 mutabakat hatasi, elle mudahaleli grup. Mikro stok karti bakiyesi (' ||
       f.mikro_bakiye || ' adet) pekere tarafindan elle dogrulandi (2026-09-02); negatif/sifir ise site 0, pozitif ise Mikro degeri yazildi.',
       now()
FROM _fix2 f JOIN products p ON p.id = f.product_id;

-- Duzeltmeyi uygula (trg_update_status tetiklenip status'u otomatik gunceller)
UPDATE products p SET stock = f.new_stock
FROM _fix2 f
WHERE p.id = f.product_id AND p.stock = f.old_stock;

COMMIT;
