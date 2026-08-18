import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Frontend bu fonksiyonu girişli kullanıcının kendi session token'ıyla çağırıyor
  // (bkz. app.js triggerLowStockAlert) — service_role key ile değil. Token'ı Supabase
  // Auth üzerinden doğrula (parse-invoice.js'deki kalıpla aynı).
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: "Geçersiz veya süresi dolmuş token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { productName, productBarcode, newStock, minStock, depo } =
      await req.json();

    // Service role client — reads user_permissions without RLS restriction
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch recipients
    const { data: users, error: dbErr } = await supabase
      .from("user_permissions")
      .select("email")
      .eq("receives_email_alerts", true);

    if (dbErr) throw dbErr;
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const subject = `[Sonçağ Stok Uyarı] ${String(productName ?? "").replace(/[\r\n]/g, " ")} Stok Seviyesi Kritik!`;
    const stockRatio =
      minStock > 0 ? Math.round((newStock / minStock) * 100) : 0;

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
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;font-size:18px;color:#ef4444;">${newStock} adet</td>
        </tr>
        <tr>
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:13px;">Min. Stok Eşiği</td>
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;font-size:14px;color:#374151;">${minStock} adet</td>
        </tr>
        ${depo ? `<tr>
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:13px;">Depo</td>
          <td style="padding:11px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:500;font-size:13px;color:#374151;">${escapeHtml(depo)}</td>
        </tr>` : ""}
        <tr>
          <td style="padding:11px 0;color:#6b7280;font-size:13px;">Doluluk Oranı</td>
          <td style="padding:11px 0;text-align:right;font-weight:700;font-size:14px;color:#f59e0b;">${stockRatio}%</td>
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
      await transporter.sendMail({
        from: `"Sonçağ Stok" <${Deno.env.get("SMTP_USER")}>`,
        to: user.email,
        subject,
        html: htmlBody,
      });
      sentCount++;
    }

    return new Response(JSON.stringify({ sent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-low-stock-alert error:", err);
    return new Response(
      JSON.stringify({ error: String((err as Error).message ?? err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
