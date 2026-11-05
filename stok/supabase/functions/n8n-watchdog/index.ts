import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

// n8n nabız bekçisi: pg_cron (hafta içi 08:00–18:30 TR, 30 dakikada bir) çağırır.
// n8n her çalışmada n8n_heartbeat(workflow) RPC'sine "ben buradayım" yazar; nabız STALE_MINUTES'tan
// eskiyse tek bir uyarı, geri gelince tek bir "düzeldi" e-postası gider (alert_sent_at durumu).
// Kimlik doğrulaması yok, ama karar tamamen veritabanındaki duruma dayandığı için dışarıdan
// tetiklenmesi en fazla bir kesinti başına bir e-posta üretir.
const ALERT_TO = "01aeker01@gmail.com";
const STALE_MINUTES = 150;
// Sabah ilk kontrollerde gece/hafta sonu boşluğunu kesinti saymamak için 10:30'dan önce uyarmaz.
const EARLIEST_ALERT_MINUTE_TR = 10 * 60 + 30;

const SECRET_KEY = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"] ?? "";

function trNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function fmtTr(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
}

async function sendMail(subject: string, text: string) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_APP_PASSWORD") },
  });
  await transporter.sendMail({
    from: `"Sonçağ Stok" <${Deno.env.get("SMTP_USER")}>`,
    to: ALERT_TO,
    subject,
    text,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });

  const { weekday, minutes } = trNow();
  if (weekday === "Sat" || weekday === "Sun") return Response.json({ skipped: "hafta_sonu" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await sb.from("n8n_heartbeat").select("workflow, last_seen, alert_sent_at");
  if (error) {
    console.error("n8n-watchdog read error:", error);
    return Response.json({ error: "okunamadi" }, { status: 500 });
  }

  const results: Record<string, string> = {};
  for (const row of rows ?? []) {
    const ageMin = (Date.now() - new Date(row.last_seen).getTime()) / 60_000;
    const stale = ageMin > STALE_MINUTES;

    try {
      if (stale && !row.alert_sent_at && minutes >= EARLIEST_ALERT_MINUTE_TR) {
        await sendMail(
          `[Sonçağ Stok] n8n çalışmıyor: ${row.workflow}`,
          `n8n "${row.workflow}" iş akışı ${Math.round(ageMin / 60 * 10) / 10} saattir çalışmadı.\n` +
            `Son çalışma: ${fmtTr(row.last_seen)}\n\n` +
            `Mikro'daki irsaliyeler stok sitesine işlenmiyor. Sunucuda (TeamViewer) Docker Desktop ve ` +
            `"docker ps --filter name=n8n" ile n8n'in açık olduğunu kontrol edin.\n` +
            `Bekçi görevi: C:\\n8n-bekci\\bekci.log`,
        );
        await sb.from("n8n_heartbeat").update({ alert_sent_at: new Date().toISOString() }).eq("workflow", row.workflow);
        results[row.workflow] = "uyari_gonderildi";
      } else if (!stale && row.alert_sent_at) {
        await sendMail(
          `[Sonçağ Stok] n8n tekrar çalışıyor: ${row.workflow}`,
          `n8n "${row.workflow}" iş akışı yeniden çalışıyor.\n` +
            `Uyarı zamanı: ${fmtTr(row.alert_sent_at)}\nSon çalışma: ${fmtTr(row.last_seen)}`,
        );
        await sb.from("n8n_heartbeat").update({ alert_sent_at: null }).eq("workflow", row.workflow);
        results[row.workflow] = "duzeldi_gonderildi";
      } else {
        results[row.workflow] = stale ? "bayat_bekleniyor" : "saglikli";
      }
    } catch (err) {
      console.error("n8n-watchdog mail error:", err);
      results[row.workflow] = "mail_hatasi";
    }
  }
  return Response.json(results);
});
