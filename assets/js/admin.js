import { sb } from './supabase.js';
import { currentUser, SUPER_ADMIN_EMAIL, PERM_DEFS, DEFAULT_PERMISSIONS, STATIC_NAMES } from './auth.js';
import { toast, showConfirm, escapeHtml } from './ui.js';

async function adminInvoke(action, payload = {}) {
  const { data, error } = await sb.functions.invoke('admin-operations', {
    body: { action, ...payload }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

let adminCurrentTab = 'users';
let editingPermUserId = null;
let editingPermData = {};
let editingReceivesAlerts = false;
let editingUserDetail = null;

export function openAdminPanel() {
  document.getElementById('main-dashboard').classList.add('hidden');
  document.getElementById('admin-panel').classList.remove('hidden');
  switchAdminTab('users');
  loadAdminUsers();
}
export function closeAdminPanel() {
  document.getElementById('admin-panel').classList.add('hidden');
  document.getElementById('main-dashboard').classList.remove('hidden');
}

export function switchAdminTab(tab) {
  adminCurrentTab = tab;
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById('admin-section-' + tab);
  if (sec) sec.classList.add('active');
  if (tab === 'logs') loadAuditLogs();
  if (tab === 'create-user') onCreateUserTabOpen();
}

export async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-body');
  tbody.innerHTML = '<tr><td colspan="5"><div class="admin-empty">Yükleniyor…</div></td></tr>';
  try {
    const { data, error, status } = await sb.from('user_permissions').select('*').order('created_at', { ascending: true });
    if (error) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty" style="color:var(--error);">
        Supabase hatası (${status}): ${escapeHtml(error.message)}<br>
        <small style="opacity:.7">${escapeHtml(error.hint || error.details || '')}</small>
      </div></td></tr>`;
      return;
    }
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty">
        Tabloda kayıt bulunamadı.<br>
        <small style="opacity:.7;display:block;margin-top:6px;">Mevcut kullanıcıları eklemek için Supabase SQL Editor'da seed scriptini çalıştır,<br>ardından kullanıcıların bir kez çıkış yapıp tekrar giriş yapması yeterli.</small>
      </div></td></tr>`;
      return;
    }
    const isSuperAdminSession = currentUser?.email === SUPER_ADMIN_EMAIL;
    const visibleData = isSuperAdminSession ? data : data.filter(u => u.role !== 'admin');
    tbody.innerHTML = visibleData.map(u => {
      const isSuperAdmin = u.email === SUPER_ADMIN_EMAIL;
      const perms = { ...DEFAULT_PERMISSIONS, ...(u.permissions || {}) };
      const displayName = STATIC_NAMES[u.email] || perms._name || u.email;
      const permTags = PERM_DEFS.map(d => {
        const on = isSuperAdmin || perms[d.key];
        const isAdminPerm = d.key === 'admin' && on;
        const label = isAdminPerm && isSuperAdmin ? 'Admin' : d.label;
        const tagClass = isAdminPerm ? (isSuperAdmin ? 'admin-tag' : 'manager-tag') : (on ? 'on' : 'off');
        return `<span class="perm-tag ${tagClass}">${label}</span>`;
      }).join('');
      const roleLabel = u.role === 'admin'   ? '<span class="role-badge admin">Admin</span>'
                      : u.role === 'manager' ? '<span class="role-badge manager">Yönetici</span>'
                      : '<span class="role-badge user">Kullanıcı</span>';
      const createdAt = u.created_at ? new Date(u.created_at).toLocaleDateString('tr-TR') : '—';
      const isSelf = u.user_id === currentUser?.id;
      const detailBtn = `<button class="btn btn-secondary" style="font-size:11px;padding:5px 10px;" onclick="openUserDetail('${u.user_id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>Detay
      </button>`;
      const actions = isSuperAdmin
        ? detailBtn
        : `${detailBtn}
        <button class="btn btn-secondary" style="font-size:11px;padding:5px 10px;margin-left:4px;" onclick="openPermEditor('${u.user_id}','${escapeHtml(u.email)}')">Yetki Düzenle</button>
        ${!isSelf ? `<button class="icon-btn danger" style="margin-left:4px;" title="Kullanıcıyı Sil" onclick="askDeleteUser('${u.user_id}','${escapeHtml(u.email)}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
        </button>` : ''}
      `;
      return `<tr>
        <td>
          <div style="font-weight:500;font-size:13px;">${escapeHtml(displayName)}</div>
          <div class="log-sub">${escapeHtml(u.email)}</div>
          ${u.last_seen ? `<div class="log-sub">Son görülme: ${new Date(u.last_seen).toLocaleDateString('tr-TR')}</div>` : ''}
        </td>
        <td>${roleLabel}</td>
        <td><div class="perm-tags">${permTags}</div></td>
        <td><span class="log-date">${createdAt}</span></td>
        <td style="text-align:center"><div style="display:flex;align-items:center;justify-content:center;gap:4px;">${actions}</div></td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty" style="color:var(--error);">Beklenmedik hata: ${escapeHtml(String(err.message || err))}</div></td></tr>`;
  }
}

export function openUserDetail(userId) {
  editingUserDetail = { userId, email: '', permData: {} };
  document.getElementById('admin-users-list').style.display = 'none';
  document.getElementById('user-detail-view').style.display = '';
  document.getElementById('ud-name').value = '';
  document.getElementById('ud-email').value = '';
  document.getElementById('ud-password').value = '';
  document.getElementById('ud-error').textContent = '';
  document.getElementById('ud-success').style.display = 'none';
  document.getElementById('ud-submit-btn').disabled = false;
  document.getElementById('user-detail-title').textContent = 'Yükleniyor…';
  const alertToggle = document.getElementById('ud-email-alerts-toggle');
  if (alertToggle) alertToggle.classList.remove('on');

  sb.from('user_permissions').select('*').eq('user_id', userId).maybeSingle().then(({ data, error }) => {
    if (error || !data) {
      document.getElementById('ud-error').textContent = 'Kullanıcı verisi yüklenemedi.';
      return;
    }
    const perms = { ...DEFAULT_PERMISSIONS, ...(data.permissions || {}) };
    const displayName = STATIC_NAMES[data.email] || perms._name || '';
    const alertsOn = !!(data.receives_email_alerts);
    editingUserDetail = { userId, email: data.email, permData: data.permissions || {}, receivesAlerts: alertsOn };
    document.getElementById('ud-name').value = displayName;
    document.getElementById('ud-email').value = data.email || '';
    document.getElementById('user-detail-title').textContent = displayName || data.email;
    const t = document.getElementById('ud-email-alerts-toggle');
    if (t) t.classList.toggle('on', alertsOn);
  });
}

export function closeUserDetail() {
  document.getElementById('user-detail-view').style.display = 'none';
  document.getElementById('admin-users-list').style.display = '';
  editingUserDetail = null;
}

export function toggleUdEmailAlerts() {
  if (!editingUserDetail) return;
  editingUserDetail.receivesAlerts = !editingUserDetail.receivesAlerts;
  const btn = document.getElementById('ud-email-alerts-toggle');
  if (btn) btn.classList.toggle('on', editingUserDetail.receivesAlerts);
}

export async function saveUserDetail(e) {
  e.preventDefault();
  if (!editingUserDetail) return;
  const errEl     = document.getElementById('ud-error');
  const succEl    = document.getElementById('ud-success');
  const submitBtn = document.getElementById('ud-submit-btn');
  const newName     = document.getElementById('ud-name').value.trim();
  const newEmail    = document.getElementById('ud-email').value.trim();
  const newPassword = document.getElementById('ud-password').value;
  errEl.textContent = '';
  succEl.style.display = 'none';
  if (!newEmail) { errEl.textContent = 'E-posta zorunludur.'; return; }
  if (newPassword && newPassword.length < 6) { errEl.textContent = 'Şifre en az 6 karakter olmalı.'; return; }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Kaydediliyor...';
  try {
    const updatedPerms = { ...(editingUserDetail.permData || {}), _name: newName };
    const { error: permErr } = await sb.from('user_permissions')
      .update({ email: newEmail, permissions: updatedPerms, receives_email_alerts: !!editingUserDetail.receivesAlerts })
      .eq('user_id', editingUserDetail.userId);
    if (permErr) throw permErr;
    const authPayload = { email: newEmail };
    if (newPassword) authPayload.password = newPassword;
    await adminInvoke('update_user', { userId: editingUserDetail.userId, ...authPayload });
    editingUserDetail.email = newEmail;
    editingUserDetail.permData = updatedPerms;
    document.getElementById('user-detail-title').textContent = newName || newEmail;
    document.getElementById('ud-password').value = '';
    const msg = 'Kullanıcı bilgileri başarıyla güncellendi.';
    succEl.textContent = msg;
    succEl.style.display = '';
    toast('Kullanıcı güncellendi');
    loadAdminUsers();
  } catch (err) {
    errEl.textContent = 'Hata: ' + (err.message || String(err));
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Kaydet`;
  }
}

export async function loadAuditLogs() {
  const tbody = document.getElementById('admin-logs-body');
  const countEl = document.getElementById('log-count-label');
  tbody.innerHTML = '<tr><td colspan="6"><div class="admin-empty">Yükleniyor…</div></td></tr>';
  try {
    const { data, error } = await sb.from('audit_logs')
      .select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    if (!data || data.length === 0) {
      if (countEl) countEl.textContent = '';
      tbody.innerHTML = '<tr><td colspan="6"><div class="admin-empty">Henüz işlem kaydı yok.</div></td></tr>';
      return;
    }
    if (countEl) countEl.textContent = `Son ${data.length} kayıt gösteriliyor`;
    tbody.innerHTML = data.map(log => {
      const dt = new Date(log.created_at);
      const dateStr = dt.toLocaleDateString('tr-TR');
      const timeStr = dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `<tr>
        <td>
          <div class="log-date" style="font-size:12px;color:var(--text-primary);">${dateStr}</div>
          <div class="log-sub">${timeStr}</div>
        </td>
        <td><div class="log-user">${escapeHtml(STATIC_NAMES[log.user_email] || log.user_email || '—')}</div></td>
        <td><span class="log-action-badge">${escapeHtml(log.action || '—')}</span></td>
        <td>
          <div class="log-product">${escapeHtml(log.product_name || '—')}</div>
          ${log.product_barcode ? `<div class="log-sub">${escapeHtml(log.product_barcode)}</div>` : ''}
        </td>
        <td style="text-align:center;font-weight:700;">${log.quantity || '—'}</td>
        <td class="log-sub">${escapeHtml(log.notes || '—')}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty">Hata: ${escapeHtml(err.message)}</div></td></tr>`;
  }
}

export function openPermEditor(userId, email) {
  editingPermUserId = userId;
  editingPermData = {};
  editingReceivesAlerts = false;
  document.getElementById('perm-modal-title').textContent = 'Yetki Düzenle';
  document.getElementById('perm-user-info').textContent = `Kullanıcı: ${email}`;
  sb.from('user_permissions').select('permissions, receives_email_alerts').eq('user_id', userId).maybeSingle().then(({ data }) => {
    const current = { ...DEFAULT_PERMISSIONS, ...((data && data.permissions) || {}) };
    editingPermData = { ...current };
    editingReceivesAlerts = !!(data && data.receives_email_alerts);
    const container = document.getElementById('perm-rows');
    const canGrantAdmin = currentUser?.email === SUPER_ADMIN_EMAIL;
    container.innerHTML = PERM_DEFS.filter(d => d.key !== 'admin' || canGrantAdmin).map(d => `
      <div class="perm-editor-row">
        <div>
          <div class="perm-editor-label">${d.label}</div>
          <div class="perm-editor-desc">${d.desc}</div>
        </div>
        <button type="button" class="toggle-switch ${current[d.key] ? 'on' : ''}" id="toggle-${d.key}"
          onclick="togglePerm('${d.key}')"></button>
      </div>`).join('') + `
      <div style="height:1px;background:var(--border);margin:10px 0 6px;"></div>
      <div class="perm-editor-row">
        <div>
          <div class="perm-editor-label">E-posta Bildirimleri</div>
          <div class="perm-editor-desc">Düşük stok uyarılarını e-posta ile alır</div>
        </div>
        <button type="button" class="toggle-switch ${editingReceivesAlerts ? 'on' : ''}" id="toggle-email-alerts"
          onclick="toggleEmailAlerts()"></button>
      </div>`;
    document.getElementById('perm-modal').classList.add('visible');
  });
}

export function togglePerm(key) {
  editingPermData[key] = !editingPermData[key];
  const btn = document.getElementById('toggle-' + key);
  if (btn) btn.classList.toggle('on', editingPermData[key]);
}

export function toggleEmailAlerts() {
  editingReceivesAlerts = !editingReceivesAlerts;
  const btn = document.getElementById('toggle-email-alerts');
  if (btn) btn.classList.toggle('on', editingReceivesAlerts);
}

export async function savePermissions() {
  if (!editingPermUserId) return;
  try {
    const { error } = await sb.from('user_permissions')
      .update({ permissions: editingPermData, role: editingPermData.admin ? 'manager' : 'user', receives_email_alerts: editingReceivesAlerts })
      .eq('user_id', editingPermUserId);
    if (error) throw error;
    closePermModal();
    loadAdminUsers();
    toast('Yetkiler güncellendi');
  } catch (err) {
    toast('Hata: ' + (err.message || err), 'error');
  }
}

export function closePermModal() {
  document.getElementById('perm-modal').classList.remove('visible');
  editingPermUserId = null;
}

export function askDeleteUser(userId, email) {
  showConfirm(
    `"${email}" kalıcı olarak silinecek`,
    "Kullanıcı hem veritabanından hem Supabase Auth'tan tamamen silinecek. Giriş yapamaz hale gelir. Bu işlem geri alınamaz.",
    async () => {
      let dbOk = false, authOk = false, dbErrMsg = '', authErrMsg = '';
      try {
        const { error } = await sb.from('user_permissions').delete().eq('user_id', userId);
        if (error) dbErrMsg = error.message; else dbOk = true;
      } catch (e) { dbErrMsg = e.message || String(e); }
      try {
        await adminInvoke('delete_user', { userId });
        authOk = true;
      } catch (e) { authErrMsg = e.message || String(e); }
      loadAdminUsers();
      if (dbOk && authOk)        toast(`${email} tamamen silindi`);
      else if (dbOk && !authOk)  toast(`DB silindi — Auth hatası: ${authErrMsg}`, 'error');
      else if (!dbOk && authOk)  toast(`Auth silindi — DB hatası: ${dbErrMsg}`, 'error');
      else                        toast(`Silme başarısız — DB: ${dbErrMsg}`, 'error');
    }
  );
}

export function onCreateUserTabOpen() {
  const warn = document.getElementById('create-user-service-warn');
  if (warn) warn.style.display = 'none';
  document.getElementById('cu-error').textContent = '';
  document.getElementById('cu-success').style.display = 'none';
  document.getElementById('cu-success').textContent = '';
}

export async function handleCreateUser(e) {
  e.preventDefault();
  const errEl    = document.getElementById('cu-error');
  const succEl   = document.getElementById('cu-success');
  const submitBtn = document.getElementById('cu-submit-btn');
  errEl.textContent = '';
  succEl.style.display = 'none';
  const fullName = document.getElementById('cu-name').value.trim();
  const email    = document.getElementById('cu-email').value.trim();
  const password = document.getElementById('cu-password').value;
  if (!fullName) { errEl.textContent = 'Ad Soyad zorunludur.'; return; }
  if (!email)    { errEl.textContent = 'E-posta zorunludur.'; return; }
  if (password.length < 6) { errEl.textContent = 'Şifre en az 6 karakter olmalı.'; return; }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Oluşturuluyor...';
  try {
    const result = await adminInvoke('create_user', { email, password, fullName });
    const newUserId = result.userId;
    const perms = { ...DEFAULT_PERMISSIONS, _name: fullName };
    const { error: permErr } = await sb.from('user_permissions').upsert({
      user_id: newUserId, email, role: 'user', permissions: perms,
      created_at: new Date().toISOString(), last_seen: null
    }, { onConflict: 'user_id' });
    if (permErr) console.warn('Yetki kaydı hatası:', permErr.message);
    document.getElementById('create-user-form').reset();
    succEl.textContent = `✓ "${fullName}" (${email}) başarıyla oluşturuldu. Yetkiler için Kullanıcılar sekmesine git.`;
    succEl.style.display = '';
    toast(`${fullName} eklendi`);
  } catch (err) {
    const msg = err.message || String(err);
    errEl.textContent = /already registered|already exists/i.test(msg) ? 'Bu e-posta zaten kayıtlı.' : 'Hata: ' + msg;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg> Kullanıcı Oluştur`;
  }
}

window.openAdminPanel    = openAdminPanel;
window.closeAdminPanel   = closeAdminPanel;
window.switchAdminTab    = switchAdminTab;
window.openUserDetail    = openUserDetail;
window.closeUserDetail   = closeUserDetail;
window.toggleUdEmailAlerts = toggleUdEmailAlerts;
window.saveUserDetail    = saveUserDetail;
window.loadAuditLogs     = loadAuditLogs;
window.openPermEditor    = openPermEditor;
window.togglePerm        = togglePerm;
window.toggleEmailAlerts = toggleEmailAlerts;
window.savePermissions   = savePermissions;
window.closePermModal    = closePermModal;
window.askDeleteUser     = askDeleteUser;
window.handleCreateUser  = handleCreateUser;
