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

    const htmlBody = `<!DOCTYPE html>
<html lang="tr">
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f4f4;padding:24px;margin:0;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="background:#ef4444;padding:24px 28px;">
      <div style="color:rgba(255,255,255,0.8);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">&#9888; Kritik Stok Uyarısı</div>
      <div style="color:white;font-size:22px;font-weight:700;line-height:1.3;">${escapeHtml(productName)}</div>
      ${productBarcode ? `<div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:5px;font-family:monospace;">${escapeHtml(productBarcode)}</div>` : ""}
    </div>
    <div style="padding:28px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:13px;">Mevcut Stok</td>
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;font-size:18px;color:#ef4444;">${escapeHtml(stock)} adet</td>
        </tr>
        <tr>
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:13px;">Min. Stok Eşiği</td>
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;font-size:14px;color:#374151;">${escapeHtml(minStock)} adet</td>
        </tr>
        ${depo ? `<tr>
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:13px;">Depo</td>
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:500;font-size:13px;color:#374151;">${escapeHtml(depo)}</td>
        </tr>` : ""}
        <tr>
          <td style="padding:11px 0;color:#6b7280;font-size:13px;">Doluluk Oranı</td>
          <td style="padding:11px 0;text-align:right;font-weight:700;font-size:14px;color:#f59e0b;">${escapeHtml(stockRatio)}%</td>
        </tr>
      </table>
      <div style="margin-top:20px;padding:14px 16px;background:#fef2f2;border-radius:8px;border-left:3px solid #ef4444;">
        <div style="font-size:13px;color:#7f1d1d;line-height:1.6;">
          Stok seviyesi kritik eşiğe düştü. Lütfen sistemi kontrol ederek gerekli sipariş işlemini başlatın.
        </div>
      </div>
    </div>
    <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
      Sonçağ Stok Yönetim Sistemi &middot; Bu mesaj otomatik olarak gönderilmiştir.
    </div>
  </div>
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
