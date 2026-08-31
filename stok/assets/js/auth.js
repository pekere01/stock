import { sb } from './supabase.js';

export const SUPER_ADMIN_EMAIL = 'teknik@soncag.com';

export const STATIC_NAMES = {
  'teknik@soncag.com': 'admin'
};

export const PERM_DEFS = [
  { key: 'view',              label: 'Görüntüleme',        desc: 'Ürün listesini ve istatistikleri görebilir' },
  { key: 'add_products',      label: 'Ürün Ekle/Düzenle',  desc: 'Yeni ürün ekleyebilir, mevcut ürünleri düzenleyebilir' },
  { key: 'make_sales',        label: 'Satış / Stok Çıkar', desc: 'Stoktan ürün düşebilir (satış yapabilir)' },
  { key: 'manage_categories', label: 'Kategori Yönetimi',  desc: 'Kategori ekleyebilir, silebilir, düzenleyebilir' },
  { key: 'view_history',      label: 'Hareket Geçmişi',    desc: 'Stok hareket geçmişini görebilir' },
  { key: 'admin',             label: 'Yönetici',           desc: 'Kullanıcıları ve yetkileri yönetebilir, tüm işlemlere erişebilir' },
];

export const DEFAULT_PERMISSIONS = { view: true, add_products: false, make_sales: false, manage_categories: false, view_history: false, admin: false };

export let currentUser = null;
export let currentDisplayName = '';
export let currentPermissions = null;

export function isAdmin() {
  return currentUser?.email === SUPER_ADMIN_EMAIL;
}

export function canDo(action) {
  if (!currentUser) return false;
  if (currentUser.email === SUPER_ADMIN_EMAIL) return true;
  if (currentPermissions?.admin) return true;
  return currentPermissions?.[action] === true;
}

export function isViewOnly() {
  if (!currentUser) return true;
  if (currentUser.email === SUPER_ADMIN_EMAIL) return false;
  if (!currentPermissions) return true;
  const p = currentPermissions;
  return !p.add_products && !p.make_sales && !p.manage_categories && !p.admin;
}

export async function loadUserPermissions() {
  if (!currentUser) { currentPermissions = null; currentDisplayName = ''; return; }
  if (currentUser.email === SUPER_ADMIN_EMAIL) {
    currentPermissions = { view: true, add_products: true, make_sales: true, manage_categories: true, admin: true };
    currentDisplayName = STATIC_NAMES[currentUser.email] || currentUser.email;
    return;
  }
  try {
    const metaName = currentUser.user_metadata?.full_name || '';
    const { data } = await sb.from('user_permissions')
      .select('permissions').eq('user_id', currentUser.id).maybeSingle();
    if (data) {
      currentPermissions = { ...DEFAULT_PERMISSIONS, ...data.permissions };
      if (!currentPermissions._name && metaName) {
        currentPermissions._name = metaName;
        await sb.from('user_permissions').update({
          permissions: currentPermissions,
          last_seen: new Date().toISOString()
        }).eq('user_id', currentUser.id);
      } else {
        await sb.from('user_permissions').update({ last_seen: new Date().toISOString() }).eq('user_id', currentUser.id);
      }
    } else {
      currentPermissions = { ...DEFAULT_PERMISSIONS };
      if (metaName) currentPermissions._name = metaName;
      await sb.from('user_permissions').upsert({
        user_id: currentUser.id,
        email: currentUser.email,
        role: 'user',
        permissions: currentPermissions,
        last_seen: new Date().toISOString()
      }, { onConflict: 'user_id' });
    }
    currentDisplayName = STATIC_NAMES[currentUser.email] || currentPermissions._name || metaName || currentUser.email;
  } catch (err) {
    console.warn('Yetki yükleme hatası:', err);
    currentPermissions = { ...DEFAULT_PERMISSIONS };
    currentDisplayName = STATIC_NAMES[currentUser.email] || currentUser.email;
  }
}

function applyPermissions() {
  const adminBtn = document.getElementById('admin-panel-btn');
  const addBtn   = document.getElementById('add-product-btn');
  if (adminBtn) adminBtn.style.display = (isAdmin() || currentPermissions?.admin) ? '' : 'none';
  if (addBtn)   addBtn.style.display   = canDo('add_products') ? '' : 'none';
}

export async function logAction(action, productName, productBarcode, quantity, notes) {
  if (!currentUser) return;
  try {
    await sb.from('audit_logs').insert({
      user_id:         currentUser.id,
      user_email:      currentDisplayName || currentUser.email,
      action,
      product_name:    productName  || '',
      product_barcode: productBarcode || '',
      quantity:        quantity || 0,
      notes:           notes    || ''
    });
  } catch (err) {
    console.warn('Audit log hatası:', err);
  }
}

function translateAuthError(msg) {
  if (!msg) return 'Bir hata oluştu.';
  if (/Invalid login credentials/i.test(msg)) return 'E-posta veya şifre hatalı.';
  if (/User already registered/i.test(msg))   return 'Bu e-posta zaten kayıtlı.';
  if (/Email not confirmed/i.test(msg))        return 'E-postanı doğrulaman gerekiyor. Gelen kutuna bak.';
  if (/Password should be at least/i.test(msg)) return 'Şifre en az 6 karakter olmalı.';
  if (/rate limit/i.test(msg))                 return 'Çok fazla deneme. Lütfen biraz bekle.';
  if (/network|fetch/i.test(msg))              return 'Bağlantı hatası. İnternetini kontrol et.';
  console.error('auth error:', msg);
  return 'Giriş başarısız. Lütfen tekrar deneyin.';
}

export async function handleAuthSubmit(e) {
  e.preventDefault();
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit-btn');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Lütfen bekle...';
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    enterApp();
    toast('Hoş geldin!');
  } catch (err) {
    errEl.textContent = translateAuthError(err.message || String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Giriş Yap';
  }
}

export async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null;
  exitApp();
  document.getElementById('auth-form').reset();
  toast('Çıkış yapıldı');
}

async function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-root').classList.remove('hidden');
  document.getElementById('main-dashboard').classList.remove('hidden');
  document.getElementById('admin-panel').classList.add('hidden');
  const widget = document.getElementById('user-widget');
  widget.style.display = '';
  await loadUserPermissions();
  document.getElementById('user-email').textContent  = currentDisplayName;
  document.getElementById('user-avatar').textContent = (currentDisplayName[0] || '?').toUpperCase();
  await window.loadData?.();
  applyPermissions();
  window.populateFilters?.();
  window.renderAll?.();
  window.fetchAndUpdateEurRate?.();
}

function exitApp() {
  document.getElementById('app-root').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('user-widget').style.display = 'none';
  currentPermissions = null;
  currentDisplayName = '';
}

function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.className = 'toast ' + type;
  t.textContent = '';
  const icon = document.createElement('span');
  icon.textContent = type === 'success' ? '✓' : '✕';
  const text = document.createElement('span');
  text.textContent = msg;
  t.append(icon, ' ', text);
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 2400);
}

export async function bootstrapAuth() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      enterApp();
    } else {
      exitApp();
    }
  } catch (err) {
    console.error('Auth bootstrap error', err);
    exitApp();
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      currentUser = null;
      exitApp();
    } else if (event === 'TOKEN_REFRESHED') {
      currentUser = session.user;
    } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      const appVisible = !document.getElementById('app-root')?.classList.contains('hidden');
      currentUser = session.user;
      if (!appVisible) enterApp();
    }
  });
}

window.handleAuthSubmit = handleAuthSubmit;
window.handleLogout     = handleLogout;
