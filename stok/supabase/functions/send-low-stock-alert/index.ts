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

    const cell = "padding:16px 8px;text-align:center;border:1px solid #e5e7eb;";
    const lbl = "font-size:11px;color:#6b7280;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:6px;";
    const htmlBody = `<!DOCTYPE html>
<html lang="tr">
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;color:#111827;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="padding:28px 28px 8px;">
      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:12px;font-weight:600;">Kritik stok uyarısı</span>
      <div style="margin-top:14px;font-size:21px;font-weight:700;line-height:1.35;color:#111827;">${escapeHtml(productName)}</div>
      ${productBarcode ? `<div style="margin-top:6px;font-size:13px;color:#6b7280;font-family:Consolas,monospace;">${escapeHtml(productBarcode)}</div>` : ""}
    </div>
    <div style="padding:16px 28px 8px;">
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="${cell}border-radius:10px 0 0 10px;width:34%;">
            <div style="${lbl}">Mevcut stok</div>
            <div style="font-size:26px;font-weight:700;color:#dc2626;">${escapeHtml(stock)}</div>
          </td>
          <td style="${cell}width:33%;">
            <div style="${lbl}">Min. eşik</div>
            <div style="font-size:26px;font-weight:700;color:#374151;">${escapeHtml(minStock)}</div>
          </td>
          <td style="${cell}border-radius:0 10px 10px 0;width:33%;">
            <div style="${lbl}">Doluluk</div>
            <div style="font-size:26px;font-weight:700;color:#d97706;">%${escapeHtml(stockRatio)}</div>
          </td>
        </tr>
      </table>
      ${depo ? `<div style="margin-top:14px;font-size:13px;color:#4b5563;"><span style="color:#6b7280;">Depo:</span> <strong style="color:#111827;">${escapeHtml(depo)}</strong></div>` : ""}
      <p style="margin:18px 0 12px;font-size:14px;line-height:1.6;color:#374151;">
        Stok seviyesi kritik eşiğe düştü. Lütfen sistemi kontrol ederek gerekli sipariş işlemini başlatın.
      </p>
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
