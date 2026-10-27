import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Giriş kaydı: kim, ne zaman, hangi IP/şehirden. IP ve konum sunucuda belirlenir (istemciye güvenilmez).
// İstemci bu çağrıyı beklemez; burada ne olursa olsun giriş akışı etkilenmez.
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

const PUBLISHABLE_KEY = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}")["default"] ?? "";
const SECRET_KEY = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"] ?? "";

// Kayıtlı oturumla her sayfa açılışını yazmamak için aynı kişiye 30 dakikada bir 'oturum' kaydı.
const SESSION_THROTTLE_MS = 30 * 60_000;

async function lookupGeo(ip: string | null) {
  const empty = { city: null, region: null, country: null };
  if (!ip || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i.test(ip)) return empty;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country`, {
      signal: AbortSignal.timeout(2500),
    });
    const g = await res.json();
    if (!g?.success) return empty;
    return { city: g.city ?? null, region: g.region ?? null, country: g.country ?? null };
  } catch {
    return empty;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Yetkisiz" }, 401);

  try {
    const sbCaller = createClient(Deno.env.get("SUPABASE_URL")!, PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await sbCaller.auth.getUser();
    if (userErr || !user) return json({ error: "Kimlik doğrulanamadı" }, 401);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const event = body?.event === "giris" ? "giris" : "oturum";

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (event === "oturum") {
      const since = new Date(Date.now() - SESSION_THROTTLE_MS).toISOString();
      const { count } = await sbAdmin
        .from("login_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since);
      if (count) return json({ ok: true, skipped: true });
    }

    const ip = req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const geo = await lookupGeo(ip);

    const { error } = await sbAdmin.from("login_log").insert({
      user_id: user.id,
      email: user.email,
      event,
      ip,
      ...geo,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400) || null,
    });
    if (error) throw error;
    return json({ ok: true });
  } catch (err) {
    console.error("log-login error:", err);
    return json({ error: "Kayıt yazılamadı" }, 500);
  }
});
