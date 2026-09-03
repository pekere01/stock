/**
 * Deterministik UI dogrulama — TestSprite ajaninin guvenilir kosamadigi
 * kontroller icin. LLM yok: gercek tarayicida computed gorunurluk okunur.
 *
 * Neden: TestSprite ajani plani yeniden derliyor, adim eliyor ve DOM'da var
 * olan ama display:none olan elementi "gorunur" sayiyor. 2026-09-03'te 4 test
 * bu yuzden yanlislikla "failed" verdi. Bu script ayni sorulari kesin cevaplar.
 *
 * GUVENLIK: canli PRODUCTION verisine bakar. Sadece OKUR — hicbir aksiyon
 * butonuna tiklamaz. Panelleri acar, okur, kendi close fonksiyonuyla kapatir.
 *
 * Kullanim:
 *   node verify-ui.mjs --email <adres> --password-file <yol>
 *        [--profile noaccess|viewer|editor] veya [--perms view,make_sales,...]
 *   node verify-ui.mjs ... --json      # ham gozlemi JSON bas
 *   node verify-ui.mjs ... --headed    # tarayiciyi gorunur ac
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? def : (argv[i + 1] ?? def);
};
const has = (name) => argv.includes(`--${name}`);

const URL           = arg('url', 'https://soncagstock.vercel.app/');
const EMAIL         = arg('email');
const PASSWORD_FILE = arg('password-file');
const PROFILE       = arg('profile', 'editor');
const AS_JSON       = has('json');

if (!EMAIL || !PASSWORD_FILE) {
  console.error('HATA: --email ve --password-file zorunlu (sifre komut satirina yazilmaz).');
  process.exit(2);
}
const PASSWORD = readFileSync(PASSWORD_FILE, 'utf8').trim();

/**
 * Beklentiler sabit profil degil, yetki listesinden HESAPLANIR — auth.js ve
 * app.js'teki kurallarin birebir aynasi. Boylece yetki kombinasyonu degisince
 * script'i elle guncellemek gerekmez.
 *
 *   isViewOnly()   = add_products/make_sales/manage_categories/admin hepsi false
 *   canMoveStock() = add_products veya make_sales
 */
const PRESETS = {
  noaccess: [],
  viewer:   ['view'],
  editor:   ['view', 'add_products', 'make_sales', 'manage_categories', 'view_history'],
};

const permsArg = arg('perms');
const permList = permsArg
  ? permsArg.split(',').map((x) => x.trim()).filter(Boolean)
  : PRESETS[PROFILE];

if (!permList) {
  console.error(`HATA: bilinmeyen profil '${PROFILE}'. Secenekler: ${Object.keys(PRESETS).join(', ')}`);
  console.error("Ya da yetkileri dogrudan ver: --perms view,make_sales,add_products");
  process.exit(2);
}

const permSet = new Set(permList);
const can = (p) => permSet.has(p) || permSet.has('admin');
const isViewOnly   = !(can('add_products') || can('make_sales') || can('manage_categories') || can('admin'));
const canMoveStock = can('add_products') || can('make_sales');

const expected = {
  addProductBtn:   can('add_products'),
  invoiceDropdown: can('make_sales'),
  categoryItem:    can('manage_categories'),
  importItem:      can('add_products'),
  adminBtn:        can('admin'),
  konsinyeBtn:     canMoveStock,
  reviewBtn:       canMoveStock,
  pricesMasked:    isViewOnly,
  rowButtons: {
    sale:    can('make_sales'),
    edit:    can('add_products'),
    delete:  can('admin'),
    history: can('view_history'),
  },
};

const results = [];
const check = (name, actual, want) => {
  results.push({ name, ok: JSON.stringify(actual) === JSON.stringify(want), actual, want });
};

const browser = await chromium.launch({ headless: !has('headed') });
const page = await browser.newPage();
// Guvenlik agi: bu script hicbir dialog tetiklemez, ama prompt/confirm cikarsa reddet.
page.on('dialog', (d) => d.dismiss().catch(() => {}));

let observation = {};
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  await page.fill('#auth-email', EMAIL);
  await page.fill('#auth-password', PASSWORD);
  await page.click('button:has-text("Giriş Yap")');

  await page.waitForSelector('#table-body tr', { timeout: 30000 });
  await page.waitForTimeout(2500);

  observation = await page.evaluate(() => {
    // Gercek gorunurluk: DOM'da olmak yetmez, render edilmis olmali.
    const shown = (el) =>
      !!el && el.isConnected && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const byId = (id) => shown(document.getElementById(id));
    const firstRow = document.querySelector('#table-body tr');
    const cellText = (i) => firstRow?.children?.[i]?.textContent?.trim() ?? null;

    return {
      addProductBtn:   byId('add-product-btn'),
      invoiceDropdown: byId('dropdown-invoice'),
      categoryItem:    byId('category-btn'),
      importItem:      byId('import-btn'),
      exportItem:      byId('export-btn'),
      exportItemExists: !!document.getElementById('export-btn'),
      exportVisibleByText: (() => {
        const items = Array.from(document.querySelectorAll('.dropdown-item'));
        const el = items.find((b) => b.textContent.trim().startsWith("Excel'e Aktar"));
        return el ? shown(el) : false;
      })(),
      historyItem:     byId('history-btn'),
      adminBtn:        byId('admin-panel-btn'),
      konsinyeBtn:     byId('konsinye-panel-btn'),
      reviewBtn:       byId('review-panel-btn'),
      statValue:  document.getElementById('stat-value')?.textContent?.trim() ?? null,
      statMargin: document.getElementById('stat-margin')?.textContent?.trim() ?? null,
      priceCell: cellText(3),
      costCell:  cellText(4),
      marginCell: cellText(5),
      rowButtonTitles: firstRow
        ? Array.from(firstRow.querySelectorAll('.row-actions button')).map((b) => b.title)
        : [],
      productRowCount: document.querySelectorAll('#table-body tr').length,
    };
  });

  check('Ürün Ekle butonu',            observation.addProductBtn,   expected.addProductBtn);
  check('Fatura Yükle menüsü',         observation.invoiceDropdown, expected.invoiceDropdown);
  check('Kategorileri Yönet öğesi',    observation.categoryItem,    expected.categoryItem);
  check('CSV İçe Aktar öğesi',         observation.importItem,      expected.importItem);
  check('Yönetim Paneli butonu',       observation.adminBtn,        expected.adminBtn);
  check('Konsinye Deposu butonu',      observation.konsinyeBtn,     expected.konsinyeBtn);
  check('İnceleme Bekleyenler butonu', observation.reviewBtn,       expected.reviewBtn);

  const masked = observation.priceCell === '—' && observation.costCell === '—';
  check('Fiyat/Maliyet maskeli mi', masked,                        expected.pricesMasked);
  check('Stat kartı maskeli mi',    observation.statValue === '—', expected.pricesMasked);

  const titles = observation.rowButtonTitles;
  check('Satır: Stok Çıkar (Satış)', titles.includes('Stok Çıkar (Satış)'), expected.rowButtons.sale);
  check('Satır: Düzenle',            titles.includes('Düzenle'),            expected.rowButtons.edit);
  check('Satır: Sil (admin-only)',   titles.includes('Sil'),                expected.rowButtons.delete);
  check('Satır: Hareket Geçmişi',    titles.includes('Hareket Geçmişi'),    expected.rowButtons.history);

  // Export, tabloda maskelenen kolonlari CSV'ye yaziyor — maskelemeyle ayni
  // kosula bagli olmali, yoksa tek tikla bypass edilir.
  // Metinle bakiyoruz: id="export-btn" gate duzeltmesiyle geldi, deploy edilmeden
  // once id yok ama oge sayfada duruyor. "gizli" ile "id yok"u karistirma.
  check('Export öğesi görünürlüğü maskelemeyle tutarlı',
        observation.exportVisibleByText, !expected.pricesMasked);
  if (!observation.exportItemExists) {
    results.push({
      name: 'NOT: export gate henüz deploy edilmemiş (id="export-btn" canlıda yok)',
      ok: true, actual: 'gate yok', want: 'bilgi',
    });
  }

  if (expected.konsinyeBtn) {
    await page.click('#konsinye-panel-btn');
    await page.waitForTimeout(2500);
    const k = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#konsinye-table-body tr'));
      return {
        open: !!document.getElementById('konsinye-panel')?.classList.contains('visible'),
        rowCount: rows.length,
        firstRow: rows[0] ? Array.from(rows[0].children).map((td) => td.textContent.trim()) : null,
        buttons: rows[0] ? Array.from(rows[0].querySelectorAll('button')).map((b) => b.textContent.trim()) : [],
      };
    });
    observation.konsinye = k;
    check('Konsinye paneli açıldı',            k.open, true);
    check('Konsinye tablosu satır içeriyor',   k.rowCount > 0, true);
    check('Konsinye satırında iade/fatura butonları',
          k.buttons.includes('Ana Stoğa İade') && k.buttons.includes('Faturalandı'), true);

    await page.evaluate(() => window.closeKonsinyePanel?.());
    await page.waitForTimeout(800);
    check('Konsinye paneli kapandı',
          await page.evaluate(() => !document.getElementById('konsinye-panel')?.classList.contains('visible')),
          true);
  }

  if (expected.reviewBtn) {
    await page.click('#review-panel-btn');
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const body = (id) => document.getElementById(id)?.textContent?.trim() ?? null;
      return {
        open: !!document.getElementById('review-panel')?.classList.contains('visible'),
        intest: body('review-table-intest-body'),
        sct:    body('review-table-sct-body'),
        diger:  body('review-table-diger-body'),
      };
    });
    observation.review = r;
    check('İnceleme paneli açıldı', r.open, true);
    check('İnceleme paneli üç bölümü render etti',
          r.intest !== null && r.sct !== null && r.diger !== null, true);

    await page.evaluate(() => window.closeReviewPanel?.());
    await page.waitForTimeout(800);
    check('İnceleme paneli kapandı',
          await page.evaluate(() => !document.getElementById('review-panel')?.classList.contains('visible')),
          true);
  }
} catch (err) {
  results.push({ name: 'script hatası', ok: false, actual: String(err?.message ?? err), want: 'hatasız çalışma' });
} finally {
  await browser.close();
}

if (AS_JSON) {
  console.log(JSON.stringify({ perms: permList, observation, results }, null, 2));
} else {
  console.log(`\nYetkiler: ${permList.join(', ') || '(hicbiri)'}  ·  Hedef: ${URL}  ·  Hesap: ${EMAIL}\n`);
  for (const r of results) {
    const detail = r.ok ? '' : `  (gözlenen: ${JSON.stringify(r.actual)}, beklenen: ${JSON.stringify(r.want)})`;
    console.log(`  ${r.ok ? 'GEÇTİ' : 'KALDI'}  ${r.name}${detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} geçti\n`);
}

process.exit(results.some((r) => !r.ok) ? 1 : 0);
