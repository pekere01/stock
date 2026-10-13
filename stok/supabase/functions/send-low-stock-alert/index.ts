import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

// Prod domain sabit. localhost yalnızca ALLOW_LOCALHOST_CORS=true gizli ayarı açıkken izinlidir
// (yerelde canlı Supabase'e karşı geliştirirken: supabase secrets set ALLOW_LOCALHOST_CORS=true;
// işin bitince: supabase secrets unset ALLOW_LOCALHOST_CORS).
// Custom domain bağlandığında ALLOWED_ORIGINS'e ekleyin.
const ALLOWED_ORIGINS = new Set(["https://soncagstock.vercel.app"]);
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (Deno.env.get("ALLOW_LOCALHOST_CORS") !== "true") return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "https://soncagstock.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

// Süper admin kimliğe (UUID) bağlıdır; e-posta değişse de aynı hesap kalır.
const SUPER_ADMIN_ID = "ab0b3832-a82a-47a0-aa2f-a73dfb7c01dd";
// Aynı ürün için en fazla bu kadar sıklıkta e-posta gider.
const COOLDOWN_MINUTES = 60;
// Uyarı, çağıranın bu ürüne yaptığı gerçek bir satışa bağlı olmalı.
const RECENT_SALE_MINUTES = 15;

// Legacy anon/service_role JWT yerine yeni sb_publishable_/sb_secret_ key sistemi
const PUBLISHABLE_KEY = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}")["default"] ?? "";
const SECRET_KEY = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"] ?? "";

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Frontend bu fonksiyonu girişli kullanıcının kendi session token'ıyla çağırıyor
  // (bkz. app.js triggerLowStockAlert) — service_role key ile değil.
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Yetkisiz erişim" }, 401);

  const userRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: PUBLISHABLE_KEY },
  });
  if (!userRes.ok) return json({ error: "Geçersiz veya süresi dolmuş token" }, 401);
  const caller = await userRes.json() as { id?: string; email?: string };
  if (!caller?.id) return json({ error: "Geçersiz veya süresi dolmuş token" }, 401);

  try {
    // Service role client — user_permissions / products / stock_movements RLS'siz okunur
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Yetki: yalnızca satış yetkisi olan (veya yönetici) bu uyarıyı tetikleyebilir.
    let allowed = caller.id === SUPER_ADMIN_ID;
    if (!allowed) {
      const { data: perm } = await supabase
        .from("user_permissions")
        .select("permissions")
        .eq("user_id", caller.id)
        .maybeSingle();
      allowed = !!(perm?.permissions?.admin || perm?.permissions?.make_sales);
    }
    if (!allowed) return json({ error: "Bu işlem için yetkiniz yok" }, 403);

    // 2) Ürünü istemciden değil veritabanından oku. İstemciden yalnızca ürün kimliği (veya
    //    eski önbellekli arayüzler için barkod) alınır; ad/stok/eşik/depo istemciye güvenilmez.
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    let query = supabase
      .from("products")
      .select("id, name, barcode, stock, min_stock, warehouse_info");
    if (body.productId !== undefined && Number.isFinite(Number(body.productId))) {
      query = query.eq("id", Number(body.productId));
    } else if (typeof body.productBarcode === "string" && body.productBarcode.trim() !== "") {
      query = query.eq("barcode", body.productBarcode.trim());
    } else {
      return json({ error: "Geçersiz istek" }, 400);
    }
    const { data: product, error: prodErr } = await query.maybeSingle();
    if (prodErr) throw prodErr;
    if (!product) return json({ error: "Ürün bulunamadı" }, 404);

    const stock = Number(product.stock ?? 0);
    const minStock = Number(product.min_stock ?? 0);

    // 3) Gerçekten eşiğe düşmüş mü?
    if (!(stock <= minStock)) return json({ sent: 0, reason: "esik_ustunde" });

    // 4) Çağıranın bu ürüne yakın zamanda yaptığı gerçek bir satış var mı?
    const saleSince = new Date(Date.now() - RECENT_SALE_MINUTES * 60_000).toISOString();
    const { count: saleCount, error: saleErr } = await supabase
      .from("stock_movements")
      .select("id", { count: "exact", head: true })
      .eq("product_id", product.id)
      .eq("user_id", caller.id)
      .eq("type", "sale")
      .gte("created_at", saleSince);
    if (saleErr) throw saleErr;
    if (!saleCount) return json({ sent: 0, reason: "son_satis_yok" });

    // 5) Bekleme süresi: aynı ürün için kısa süre içinde ikinci e-posta gitmez.
    const coolSince = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
    const { count: recentCount, error: coolErr } = await supabase
      .from("low_stock_alert_log")
      .select("id", { count: "exact", head: true })
      .eq("product_id", product.id)
      .gte("sent_at", coolSince);
    if (coolErr) throw coolErr;
    if (recentCount) return json({ sent: 0, reason: "bekleme_suresi" });

    // Alıcılar
    const { data: users, error: dbErr } = await supabase
      .from("user_permissions")
      .select("email")
      .eq("receives_email_alerts", true);
    if (dbErr) throw dbErr;
    if (!users || users.length === 0) return json({ sent: 0, message: "No recipients" });

    // Çift gönderimi daraltmak için önce kaydı rezerve et; hiç gitmezse geri al.
    const { data: logRow, error: logErr } = await supabase
      .from("low_stock_alert_log")
      .insert({ product_id: product.id, sent_by: caller.id })
      .select("id")
      .single();
    if (logErr) throw logErr;

    const productName = String(product.name ?? "");
    const productBarcode = String(product.barcode ?? "");
    const depo = String(product.warehouse_info ?? "");

    // Gmail SMTP transporter (port 587 STARTTLS)
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: Deno.env.get("SMTP_USER"),
        pass: Deno.env.get("SMTP_APP_PASSWORD"),
      },
    });

    const subject = `[Sonçağ Stok Uyarı] ${productName.replace(/[\r\n]/g, " ")} Stok Seviyesi Kritik!`;
    const stockRatio = minStock > 0 ? Math.round((stock / minStock) * 100) : 0;

    const barPct = Math.min(100, Math.max(4, stockRatio));
    const font = "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";
    const htmlBody = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
</head>
<body style="margin:0;padding:0;background-color:#0b0b12;" bgcolor="#0b0b12">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0b12" style="background-color:#0b0b12;">
 <tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#151521" style="width:100%;max-width:560px;background-color:#151521;border:1px solid #2a2a3d;">
   <tr><td height="5" bgcolor="#ef4444" style="height:5px;line-height:5px;font-size:0;background-color:#ef4444;">&nbsp;</td></tr>
   <tr><td style="padding:26px 30px 0;${font}">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
       <td style="${font}font-size:12px;letter-spacing:2px;color:#8b8ba3;font-weight:600;">SONÇAĞ STOK</td>
       <td align="right" style="${font}font-size:12px;font-weight:700;color:#fca5a5;">&#9888; KRİTİK STOK</td>
     </tr></table>
   </td></tr>
   <tr><td style="padding:22px 30px 0;${font}">
     <div style="font-size:24px;line-height:1.3;font-weight:700;color:#ffffff;">${escapeHtml(productName)}</div>
     ${productBarcode ? `<div style="margin-top:6px;font-size:13px;color:#8b8ba3;font-family:Consolas,'Courier New',monospace;">${escapeHtml(productBarcode)}</div>` : ""}
   </td></tr>
   <tr><td style="padding:26px 30px 0;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1d1d2e" style="background-color:#1d1d2e;"><tr>
       <td width="50%" style="padding:20px 22px;${font}">
         <div style="font-size:11px;letter-spacing:1.5px;color:#8b8ba3;font-weight:600;">MEVCUT STOK</div>
         <div style="margin-top:4px;font-size:54px;line-height:1.1;font-weight:700;color:#f87171;">${escapeHtml(stock)}</div>
         <div style="font-size:13px;color:#8b8ba3;">adet</div>
       </td>
       <td width="50%" valign="middle" style="padding:20px 22px;${font}border-left:1px solid #2a2a3d;">
         <div style="font-size:11px;letter-spacing:1.5px;color:#8b8ba3;font-weight:600;">MİN. STOK EŞİĞİ</div>
         <div style="margin-top:2px;font-size:24px;font-weight:700;color:#e5e5f0;">${escapeHtml(minStock)} <span style="font-size:13px;font-weight:400;color:#8b8ba3;">adet</span></div>
         ${depo ? `<div style="margin-top:14px;font-size:11px;letter-spacing:1.5px;color:#8b8ba3;font-weight:600;">DEPO</div>
         <div style="margin-top:2px;font-size:15px;font-weight:600;color:#e5e5f0;">${escapeHtml(depo)}</div>` : ""}
       </td>
     </tr></table>
   </td></tr>
   <tr><td style="padding:18px 30px 0;${font}">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
       <td style="${font}font-size:12px;color:#8b8ba3;">Eşiğin doluluk oranı</td>
       <td align="right" style="${font}font-size:13px;font-weight:700;color:#fbbf24;">%${escapeHtml(stockRatio)}</td>
     </tr></table>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#2a2a3d" style="margin-top:8px;background-color:#2a2a3d;"><tr>
       <td width="${barPct}%" height="8" bgcolor="#f59e0b" style="width:${barPct}%;height:8px;line-height:8px;font-size:0;background-color:#f59e0b;">&nbsp;</td>
       <td height="8" style="height:8px;line-height:8px;font-size:0;">&nbsp;</td>
     </tr></table>
   </td></tr>
   <tr><td style="padding:24px 30px 28px;${font}font-size:14px;line-height:1.65;color:#c9c9dc;">
     Stok seviyesi kritik eşiğe düştü. Lütfen sistemi kontrol ederek gerekli sipariş işlemini başlatın.
   </td></tr>
   <tr><td bgcolor="#0f0f18" align="center" style="padding:16px 30px;background-color:#0f0f18;border-top:1px solid #2a2a3d;${font}font-size:11px;color:#6b6b82;">
     Sonçağ Stok Yönetim Sistemi &middot; Bu mesaj otomatik olarak gönderilmiştir.
   </td></tr>
  </table>
 </td></tr>
</table>
</body>
</html>`;

    let sentCount = 0;
    for (const user of users) {
      try {
        await transporter.sendMail({
          from: `"Sonçağ Stok" <${Deno.env.get("SMTP_USER")}>`,
          to: user.email,
          subject,
          html: htmlBody,
        });
        sentCount++;
      } catch (mailErr) {
        console.error("send-low-stock-alert mail error:", mailErr);
      }
    }

    // Hiç e-posta gitmediyse bekleme süresini başlatma.
    if (sentCount === 0) {
      await supabase.from("low_stock_alert_log").delete().eq("id", logRow.id);
      return json({ error: "Gönderim başarısız" }, 502);
    }

    return json({ sent: sentCount });
  } catch (err) {
    console.error("send-low-stock-alert error:", err);
    return json({ error: "Gönderim başarısız" }, 500);
  }
});
