-- Faz 3: n8n/Mikro entegrasyonu 2026-06-11'den itibaren guvenilir calisiyor
-- (bkz. mikro-otomasyon.md). Bu tarihten once hic gercek stok hareketi
-- gormemis (ya da tek hareketi 2026-05-14 ilk toplu import'un kendisi olan)
-- urunlerin tasidigi miktar dogrulanamaz - siteye ilk yuklendikleri gunden
-- beri hic n8n tarafindan teyit edilmemis. pekere karar verdi: bu urunler
-- 0'a cekilsin, cunku depoda fiziksel sayim yapilacak ve o zaman gercek
-- deger girilecek; belirsiz eski bir sayiyi tutmak sayimdan daha yanlis.
--
-- Kapsam: son GERCEK hareketi (new_stock dolu olan en son stock_movements
-- satiri) 2026-06-11'den once olan VEYA hic hareketi olmayan, ve su anki
-- stogu 0'dan farkli olan urunler. Bu kriter dinamik hesaplanir (liste
-- hardcode edilmedi) - 2026-09-02 itibariyla 159 urun.
--
-- n8n / handle_invoice_stock RPC / app.js tarafinda hicbir degisiklik
-- gerekmiyor - bu saf bir veri temizligidir.

BEGIN;

CREATE TEMP TABLE _fix (product_id bigint PRIMARY KEY, old_stock int) ON COMMIT DROP;

INSERT INTO _fix (product_id, old_stock)
SELECT p.id, p.stock
FROM products p
LEFT JOIN LATERAL (
  SELECT sm.created_at
  FROM stock_movements sm
  WHERE sm.product_id = p.id AND sm.new_stock IS NOT NULL
  ORDER BY sm.created_at DESC
  LIMIT 1
) lr ON true
WHERE (lr.created_at IS NULL OR lr.created_at < '2026-06-11')
  AND p.stock <> 0;

-- Guvenlik: beklenen satir sayisi civarinda degilse dur (asiri sapma varsa
-- kriter yanlis hesaplanmis olabilir)
DO $$ BEGIN
  IF (SELECT count(*) FROM _fix) NOT BETWEEN 100 AND 300 THEN
    RAISE EXCEPTION 'Beklenmedik satir sayisi: % (159 civari bekleniyor)', (SELECT count(*) FROM _fix);
  END IF;
END $$;

-- Guvenlik: audit sorgusundan bu yana stok degismis urun varsa dur
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

-- Her sifirlama icin audit-trail kaydi
INSERT INTO stock_movements (product_id, product_name, user_id, user_email,
                              type, quantity, old_stock, new_stock, notes, created_at)
SELECT f.product_id, p.name, NULL, NULL, 'correction', -f.old_stock,
       f.old_stock, 0,
       '2026-06-11 (n8n guvenilirlik tarihi) oncesinde dogrulanmamis stok 0''a cekildi; depoda fiziksel sayim yapilacak (2026-09-02)',
       now()
FROM _fix f JOIN products p ON p.id = f.product_id;

-- Duzeltmeyi uygula (trg_update_status tetiklenip status'u otomatik gunceller)
UPDATE products p SET stock = 0
FROM _fix f
WHERE p.id = f.product_id AND p.stock = f.old_stock;

COMMIT;
