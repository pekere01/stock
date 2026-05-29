const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Yetkisiz" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { pdf_base64 } = await req.json();
    if (!pdf_base64) {
      return new Response(JSON.stringify({ error: "pdf_base64 alanı eksik" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // base64 → Uint8Array
    const binaryStr = atob(pdf_base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const xmlText = await findXmlInPdf(bytes);
    if (!xmlText) {
      return new Response(JSON.stringify({ items: [], debug: "XML bulunamadı" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = extractItemsFromXml(xmlText);
    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── XML arama: önce sıkıştırılmamış, sonra deflate stream ──────────────────

async function findXmlInPdf(bytes: Uint8Array): Promise<string | null> {
  const raw = new TextDecoder("latin1").decode(bytes);

  // 1. Sıkıştırılmamış XML: <?xml veya <ubl:Invoice direkt binary içinde
  const starts = ["<?xml", "<ubl:Invoice", "<ns2:Invoice", "<Invoice "];
  for (const marker of starts) {
    const idx = raw.indexOf(marker);
    if (idx !== -1 && raw.includes("InvoiceLine", idx)) {
      // XML bitiş etiketi bul
      const endings = ["</ubl:Invoice>", "</ns2:Invoice>", "</Invoice>"];
      for (const end of endings) {
        const endIdx = raw.indexOf(end, idx);
        if (endIdx !== -1) {
          const candidate = raw.slice(idx, endIdx + end.length);
          if (candidate.includes("InvoiceLine") || candidate.includes("InvoicedQuantity")) {
            console.log("[EF-XML] Sıkıştırılmamış XML bulundu, uzunluk:", candidate.length);
            return candidate;
          }
        }
      }
    }
  }

  // 2. Deflate sıkıştırılmış stream'lerde ara
  let pos = 0;
  while (pos < raw.length) {
    const si = raw.indexOf("stream", pos);
    if (si === -1) break;
    let cs = si + 6;
    if (raw[cs] === "\r") cs++;
    if (raw[cs] === "\n") cs++;
    const ei = raw.indexOf("endstream", cs);
    if (ei === -1) break;

    const streamBytes = bytes.slice(cs, ei);
    if (streamBytes.length > 200) {
      for (const fmt of ["deflate", "deflate-raw"] as const) {
        try {
          const ds = new DecompressionStream(fmt);
          const writer = ds.writable.getWriter();
          writer.write(streamBytes);
          writer.close();
          const reader = ds.readable.getReader();
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const total = chunks.reduce((s, c) => s + c.length, 0);
          const merged = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { merged.set(c, off); off += c.length; }

          let decoded: string;
          try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(merged); }
          catch { decoded = new TextDecoder("latin1").decode(merged); }

          if (decoded.includes("InvoiceLine") || decoded.includes("InvoicedQuantity")) {
            console.log("[EF-XML] Deflate stream'de XML bulundu, uzunluk:", decoded.length);
            return decoded;
          }
          break;
        } catch { /* sonraki format */ }
      }
    }
    pos = ei + 9;
  }

  return null;
}

// ── UBL-TR 1.2 XML → ürün listesi ──────────────────────────────────────────

function extractItemsFromXml(xmlText: string): Array<{ barcode: string; qty: number }> {
  const itemMap = new Map<string, number>();
  const lineBlocks = xmlText.match(/<cac:InvoiceLine[\s\S]*?<\/cac:InvoiceLine>/g) ?? [];
  console.log("[EF-XML] InvoiceLine sayısı:", lineBlocks.length);

  for (const block of lineBlocks) {
    // Alış faturası: 7 haneli barkod (Kod sütunu)
    const idMatch = block.match(
      /<cac:SellersItemIdentification>[\s\S]*?<cbc:ID>(\d{7})<\/cbc:ID>/
    );
    // Satış faturası: ürün adı
    const nameMatch = block.match(/<cbc:Name>([^<]+)<\/cbc:Name>/);
    const identifier = idMatch?.[1] ?? nameMatch?.[1]?.trim() ?? null;
    if (!identifier) continue;

    const qtyMatch = block.match(
      /<cbc:InvoicedQuantity[^>]*>([\d.,]+)<\/cbc:InvoicedQuantity>/
    );
    if (!qtyMatch) continue;
    const qty = Math.round(parseFloat(qtyMatch[1].replace(",", ".")));
    if (qty <= 0 || qty > 99999) continue;

    itemMap.set(identifier, (itemMap.get(identifier) ?? 0) + qty);
  }

  console.log("[EF-XML] Bulunan kalemler:", [...itemMap.entries()]);
  return Array.from(itemMap.entries()).map(([barcode, qty]) => ({ barcode, qty }));
}
