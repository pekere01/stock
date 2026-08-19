const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const SUPABASE_URL   = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SERVICE_ROLE   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// PDF için 5MB üst sınır. base64 kodlaması ham veriden ~%33 büyük olduğu için
// sınır, base64 karakter sayısına göre hesaplanıyor.
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_PDF_BYTES * 4 / 3);

const PROMPT = `Sen bir fatura ayrıştırma motorusun. Aşağıdaki KATALAN kurallara göre çalış.

ÇIKTI: Yalnızca şu JSON array (başka hiçbir metin, markdown veya açıklama olmadan):
[{"barcode":"...","name":"...","qty":sayı}]

━━━ GEÇERLİ BİR ÜRÜN SATIRI İÇİN 3 KOŞUL (hepsi sağlanmalı) ━━━
1. "Miktar" veya "Adet" sütununda SIFIRDAN BÜYÜK bir sayı VAR
2. "Mal Hizmet Adı", "Mal Hizmet" veya "Ürün Adı" sütununda gerçek bir ürün/hizmet ismi VAR
3. Satır bir KDV/iskonto/toplam/ara toplam/genel toplam satırı DEĞİL

Bu 3 koşuldan biri eksikse → satırı ATLA.

━━━ ALAN EŞLEMESİ ━━━
• barcode → SADECE "Kod", "Stok Kodu", "Ürün Kodu", "Mal Kodu", "Barkod" sütunu. Yoksa: ""
• name    → SADECE "Mal Hizmet Adı", "Mal Hizmet" veya "Ürün Adı" sütunu
• qty     → SADECE "Miktar" veya "Adet" sütunu (tam sayı)

━━━ KESİNLİKLE YASAK ━━━
✗ "Açıklama" sütunundaki HİÇBİR VERİ — ne barcode ne name olarak kullan
✗ Sipariş no, irsaliye no, parti no, lot no ("P 148581", "IRŞ-001" gibi kodlar) → ATLA
✗ Miktar/Adet sütunu BOŞ olan satırlar → ATLA
✗ Ürün tablosunun altındaki not/açıklama alt satırları → ATLA

━━━ TEKİLLEŞTİRME ━━━
Aynı barcode VEYA name birden fazla satırda varsa → qty topla, JSON'a TEK kayıt yaz.`;

// Prod domain sabit; yerelde geliştirirken localhost otomatik izinli.
// Custom domain bağlandığında ALLOWED_ORIGINS'e ekleyin.
const ALLOWED_ORIGINS = new Set(['https://soncagstock.vercel.app']);
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin(origin) ? origin : 'https://soncagstock.vercel.app');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Yetkisiz' });
  
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Yetkisiz' });

  const { pdf_base64, invoice_type = 'alis' } = req.body;

  // Token'ı Supabase Auth üzerinden doğrula
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!userRes.ok) {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
  }

  if (!pdf_base64) return res.status(400).json({ error: 'pdf_base64 eksik' });
  if (pdf_base64.length > MAX_BASE64_CHARS) return res.status(413).json({ error: 'PDF çok büyük (maks. 5MB)' });
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY Vercel env vars\'a eklenmemiş' });

  try {
    const geminiBody = JSON.stringify({
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: 'application/pdf', data: pdf_base64 } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    });

    let geminiRes;
    for (let attempt = 1; attempt <= 4; attempt++) {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiBody }
      );
      if (geminiRes.status !== 503 && geminiRes.status !== 429) break;
      if (attempt < 4) await new Promise(r => setTimeout(r, attempt * 3000));
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini ${geminiRes.status}: ${errText.slice(0, 400)}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    const jsonStr = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let items;
    try {
      items = JSON.parse(jsonStr);
      if (!Array.isArray(items)) throw new Error('Yanıt JSON array değil');
    } catch {
      throw new Error(`JSON parse hatası — Gemini yanıtı: ${rawText.slice(0, 300)}`);
    }

    if (items.length === 0) {
      return res.status(200).json({ processed: 0, total: 0, items: [] });
    }

    // Deterministic dedup (Gemini halüsinasyonuna karşı JS zırhı)
    const mergeMap = new Map();
    for (const item of items) {
      const barcode = String(item.barcode ?? '').trim();
      const name    = String(item.name    ?? '').trim();
      const qty     = Math.max(1, Math.round(Number(item.qty) || 1));
      const key     = barcode || name;
      if (!key) continue;
      const existing = mergeMap.get(key);
      if (existing) existing.qty += qty;
      else mergeMap.set(key, { barcode, name, qty });
    }
    const mergedItems = Array.from(mergeMap.values());

    const pType = invoice_type === 'satis' ? 1 : 0;
    let processed = 0;
    const processedItems = [];

    for (const { barcode, name, qty } of mergedItems) {
      if (!barcode && !name) continue;

      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/handle_invoice_stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE,
          'Authorization': `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          p_barcode: barcode || name,
          p_name:    name || barcode,
          p_qty:     qty,
          p_type:    pType,
        }),
      });

      if (rpcRes.ok) {
        processed++;
        try {
          const rpcData = await rpcRes.json();
          if (rpcData && !rpcData.error) {
            processedItems.push({
              id:        rpcData.id,
              name:      rpcData.name,
              qty,
              old_stock: rpcData.old_stock,
              new_stock: rpcData.new_stock,
            });
          }
        } catch (_) {}
      }
    }

    return res.status(200).json({ processed, total: mergedItems.length, items: processedItems });

  } catch (err) {
    console.error('[parse-invoice]', err);
    return res.status(500).json({ error: String(err) });
  }
}
