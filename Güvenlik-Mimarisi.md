---
date: 2026-05-12
tags: [güvenlik, supabase, edge-function, mimari, stok]
type: concept
---

# Güvenlik Mimarisi — Sonçağ Stok Dashboard

[[stok/özet|Sonçağ Stok]] projesinin admin işlemleri için güvenli katmanlı mimari.

---

## Sorun: Neden Service Key Frontend'de Olamaz?

Tarayıcıya gönderilen her JavaScript kodu kullanıcı tarafından okunabilir. Supabase `service_role` JWT'si tüm Row Level Security (RLS) politikalarını bypass eder. Bu key'in ele geçirilmesi:

- Tüm kullanıcı hesaplarının silinmesine
- Keyfi kullanıcı oluşturulmasına  
- Tüm veritabanı verilerinin okunup değiştirilmesine

olanak tanır.

> [!warning] Güvenlik Kuralı
> `SUPABASE_SERVICE_ROLE_KEY` asla istemci tarafında barındırılamaz. Bu kural [[stok/CLAUDE.md]]'de de kayıtlıdır.

---

## Çözüm: Edge Function Mimarisi

```
┌─────────────────────────────────────────────────────┐
│  TARAYICI (Güvenilmez Zone)                         │
│                                                     │
│  sb (anon key)  ──►  Supabase DB (RLS korumalı)    │
│                                                     │
│  sb.functions.invoke('admin-operations', payload)   │
│         │                                           │
└─────────┼───────────────────────────────────────────┘
          │ HTTPS + JWT (kullanıcının access token'ı)
          ▼
┌─────────────────────────────────────────────────────┐
│  EDGE FUNCTION: admin-operations  (Güvenilir Zone)  │
│                                                     │
│  1. Authorization header'dan JWT al                 │
│  2. sbCaller.auth.getUser() → kimlik doğrula        │
│  3. user_permissions tablosundan admin yetkisi kontrol│
│  4. sbAdmin (service role) ile işlemi gerçekleştir  │
│                                                     │
│  ENV: SUPABASE_SERVICE_ROLE_KEY (Supabase secret)   │
└─────────────────────────────────────────────────────┘
```

---

## Desteklenen İşlemler

| `action` | Açıklama | Auth.Admin Metodu |
|----------|----------|-------------------|
| `create_user` | Yeni kullanıcı oluştur | `auth.admin.createUser()` |
| `update_user` | Email / şifre güncelle | `auth.admin.updateUserById()` |
| `delete_user` | Kullanıcıyı Auth'tan sil | `auth.admin.deleteUser()` |

---

## Yetki Kontrolü

Edge Function içindeki güvenlik katmanı (JWT'den sonra ikinci kontrol):

```typescript
// Super admin her şeyi yapabilir
if (user.email !== SUPER_ADMIN_EMAIL) {
  const { data: perm } = await sbAdmin
    .from("user_permissions")
    .select("permissions")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!perm?.permissions?.admin) {
    return 403 Forbidden  // "Admin yetkisi gerekli"
  }
}
```

---

## Frontend Çağrı Kalıbı

```javascript
// admin.js içindeki yardımcı fonksiyon
async function adminInvoke(action, payload = {}) {
  const { data, error } = await sb.functions.invoke('admin-operations', {
    body: { action, ...payload }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// Kullanım örnekleri
await adminInvoke('create_user', { email, password, fullName });
await adminInvoke('update_user', { userId, email, password });
await adminInvoke('delete_user', { userId });
```

---

## Dosya Haritası

| Dosya | Rol |
|-------|-----|
| `assets/js/supabase.js` | Yalnızca `sb` (anon key) — service key yok |
| `assets/js/admin.js` | `adminInvoke()` helper, UI mantığı |
| `assets/js/auth.js` | `sb` ile auth işlemleri |
| `supabase/functions/admin-operations/index.ts` | Edge Function — service key burada |

---

## Deploy Notu

Edge Function'ı Supabase'e deploy etmek için:

```bash
supabase functions deploy admin-operations
```

`SUPABASE_SERVICE_ROLE_KEY` Supabase Dashboard → Settings → Secrets → Edge Functions kısmına eklenmeli (zaten Supabase runtime'da `SUPABASE_SERVICE_ROLE_KEY` env var olarak mevcut).

---

*Bkz. [[stok/özet]] · [[index]]*
