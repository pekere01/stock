import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Süper admin kimliğe (UUID) bağlıdır: e-posta değişse de aynı hesap kalır.
// (Veritabanındaki current_user_can() hâlâ e-posta kontrolü yapıyor; bkz. güvenlik notu.)
const SUPER_ADMIN_ID = "ab0b3832-a82a-47a0-aa2f-a73dfb7c01dd";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Legacy anon/service_role JWT yerine yeni sb_publishable_/sb_secret_ key sistemi
const PUBLISHABLE_KEY = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}")["default"] ?? "";
const SECRET_KEY = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"] ?? "";

type Target = { type: string; id?: string | null; label?: string | null };
type AuditFn = (action: string, target?: Target | null, details?: Record<string, unknown>) => Promise<void>;

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Yetkisiz" }, 401);

  const ip = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // İşlem bağlamı (hata kaydı için)
  let currentAction = "bilinmiyor";
  let currentTargetId: string | null = null;
  let audit: AuditFn | null = null;

  try {
    // Caller kimliğini JWT ile doğrula (anon key + caller token)
    const sbCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      PUBLISHABLE_KEY,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await sbCaller.auth.getUser();
    if (userErr || !user) return json({ error: "Kimlik doğrulanamadı" }, 401);

    // Service role client — yalnızca bu fonksiyon içinde, secret olarak tutulur
    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      SECRET_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Denetim kaydı: yazılamasa bile asıl işlemi bozmaz ama sunucu loguna düşer.
    audit = async (action, target = null, details = {}) => {
      const { error } = await sbAdmin.from("admin_audit_log").insert({
        actor_id: user.id,
        actor_email: user.email,
        action,
        target_type: target?.type ?? null,
        target_id: target?.id ?? null,
        target_label: target?.label ?? null,
        details,
        ip,
      });
      if (error) console.error("admin_audit_log yazılamadı:", error.message);
    };

    const isSuper = user.id === SUPER_ADMIN_ID;

    // Admin yetkisi kontrolü (süper admin veya permissions.admin === true)
    if (!isSuper) {
      const { data: perm, error: permErr } = await sbAdmin
        .from("user_permissions")
        .select("permissions")
        .eq("user_id", user.id)
        .maybeSingle();
      if (permErr || !perm?.permissions?.admin) {
        // Yetkisiz denemeyi kaydet; log şişmesin diye aynı kişi için 10 dakikada bir.
        const since = new Date(Date.now() - 10 * 60_000).toISOString();
        const { count } = await sbAdmin
          .from("admin_audit_log")
          .select("id", { count: "exact", head: true })
          .eq("actor_id", user.id)
          .eq("action", "yetkisiz_deneme")
          .gte("created_at", since);
        if (!count) await audit("yetkisiz_deneme", { type: "islem" }, { not: "Admin olmayan kullanıcı yönetici işlemi denedi" });
        return json({ error: "Admin yetkisi gerekli" }, 403);
      }
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json({ error: "Geçersiz istek" }, 400);
    const action = String(body.action ?? "");
    const userId = body.userId === undefined ? undefined : String(body.userId);
    const email = body.email === undefined ? undefined : String(body.email);
    const password = body.password === undefined ? undefined : String(body.password);
    const fullName = body.fullName === undefined ? undefined : String(body.fullName);
    currentAction = action || "bilinmiyor";
    currentTargetId = userId ?? null;

    // Süper admin hesabına yalnızca süper admin dokunabilir.
    const touchesSuper = userId === SUPER_ADMIN_ID;

    if (action === "update_user" || action === "delete_user") {
      if (!userId || !UUID_RE.test(userId)) return json({ error: "Geçersiz kullanıcı" }, 400);
      if (touchesSuper && !isSuper) {
        await audit("super_admin_koruma_engeli", { type: "kullanici", id: userId }, { islem: action });
        return json({ error: "Bu hesaba yalnızca süper admin dokunabilir" }, 403);
      }
    }

    if (action === "update_user") {
      const { data: before } = await sbAdmin.auth.admin.getUserById(userId!);
      const oldEmail = before?.user?.email ?? null;
      const payload: { email?: string; password?: string } = {};
      if (email) payload.email = email;
      if (password) payload.password = password;
      const { error } = await sbAdmin.auth.admin.updateUserById(userId!, payload);
      if (error) throw error;
      await audit("kullanici_guncellendi", { type: "kullanici", id: userId, label: email || oldEmail }, {
        email_degisti: email && email !== oldEmail ? { eski: oldEmail, yeni: email } : false,
        sifre_degisti: !!password,
      });
      return json({ ok: true });
    }

    if (action === "delete_user") {
      const { data: before } = await sbAdmin.auth.admin.getUserById(userId!);
      const oldEmail = before?.user?.email ?? null;
      const { error } = await sbAdmin.auth.admin.deleteUser(userId!);
      if (error) throw error;
      await audit("kullanici_silindi", { type: "kullanici", id: userId, label: oldEmail }, { email: oldEmail });
      return json({ ok: true });
    }

    if (action === "create_user") {
      if (!email) return json({ error: "Geçersiz istek" }, 400);
      const { data, error } = await sbAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) throw error;
      await audit("kullanici_olusturuldu", { type: "kullanici", id: data.user.id, label: email }, { ad: fullName ?? null });
      return json({ ok: true, userId: data.user.id });
    }

    return json({ error: "Geçersiz işlem" }, 400);
  } catch (err) {
    console.error("admin-operations error:", err);
    // İç ayrıntı istemciye gitmez; yalnızca Supabase Auth'un kullanıcıya yönelik mesajları geçer
    // (örn. "e-posta zaten kayıtlı", "şifre çok zayıf").
    const name = (err as { name?: string })?.name ?? "";
    const safe = name.startsWith("Auth") ? String((err as Error).message) : "İşlem başarısız";
    if (audit) {
      await audit(`${currentAction}_basarisiz`, { type: "kullanici", id: currentTargetId }, { hata: safe });
    }
    return json({ error: safe }, 500);
  }
});
