const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const PROMPT = `Sen Sonçağ Mühendislik'in fatura okuma asistanısın. Bu faturadaki tüm ürün kalemlerini ayıkla.
SADECE aşağıdaki JSON array formatında yanıt ver — başka hiçbir metin, açıklama veya markdown ekleme:
[{"barcode":"BARKOD","name":"ÜRÜN ADI","qty":ADET}]

Kurallar:
- barcode: Faturadaki "Kod", "Ürün Kodu", "Stok Kodu", "Barkod" veya "Mal Kodu" başlıklı sütundaki değeri yaz. Genellikle 7-13 haneli sayısal bir koddur. Bu sütun yoksa boş string "" bırak.
- name: "Mal Hizmet Adı", "Ürün Adı" veya "Açıklama" sütunundaki tam ürün adını yaz.
- qty: "Miktar" veya "Adet" sütunundaki tam sayı değeri.
- ÇOK ÖNEMLİ: Eğer faturada aynı ürün koduna (barcode) veya ismine (name) sahip birden fazla satır varsa, bu satırların miktarlarını (qty) matematiksel olarak TOPLA ve JSON listesine tek bir obje olarak ekle. Aynı ürünü JSON içinde kesinlikle iki kere tekrarlama.
- Fiyat, KDV, iskonto, ara toplam, genel toplam satırlarını dahil etme.
- Yalnızca gerçek mal/hizmet kalemlerini listele.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!req.headers.get("Authorization")) {
    return new Response(JSON.stringify({ error: "Yetkisiz" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { pdf_base64, invoice_type = "alis" } = body;

    if (!pdf_base64) {
      return new Response(JSON.stringify({ error: "pdf_base64 eksik" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY ayarlanmamış — supabase secrets set GEMINI_API_KEY=..." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gemini 1.5 Flash — PDF inline data olarak gönder
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: "application/pdf", data: pdf_base64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini ${geminiRes.status}: ${errText.slice(0, 400)}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Markdown code block'u temizle, JSON'u parse et
    const jsonStr = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    let items: Array<{ barcode: string; name: string; qty: number }>;
    try {
      items = JSON.parse(jsonStr);
      if (!Array.isArray(items)) throw new Error("Yanıt JSON array değil");
    } catch {
      throw new Error(`JSON parse hatası — Gemini yanıtı: ${rawText.slice(0, 300)}`);
    }

    if (items.length === 0) {
      return new Response(JSON.stringify({ processed: 0, total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // JS zırhı: Gemini halüsinasyonuna karşı deterministic tekilleştirme
    const mergeMap = new Map<string, { barcode: string; name: string; qty: number }>();
    for (const item of items) {
      const barcode = String(item.barcode ?? "").trim();
      const name    = String(item.name    ?? "").trim();
      const qty     = Math.max(1, Math.round(Number(item.qty) || 1));
      const key     = barcode || name;
      if (!key) continue;
      const existing = mergeMap.get(key);
      if (existing) {
        existing.qty += qty;
      } else {
        mergeMap.set(key, { barcode, name, qty });
      }
    }
    const mergedItems = Array.from(mergeMap.values());

    const pType = invoice_type === "satis" ? 1 : 0;
    let processed = 0;
    const processedItems: Array<{ id: number; name: string; qty: number; old_stock: number; new_stock: number }> = [];

    // Her tekilleştirilmiş kalem için handle_invoice_stock RPC çağır (service role)
    for (const item of mergedItems) {
      const { barcode, name, qty } = item;
      if (!barcode && !name) continue;

      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/handle_invoice_stock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SERVICE_ROLE,
          "Authorization": `Bearer ${SERVICE_ROLE}`,
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

    return new Response(
      JSON.stringify({ processed, total: mergedItems.length, items: processedItems }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[parse-invoice-pdf]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
