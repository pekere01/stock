export function fmtTL(n) {
  return '₺' + Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtTLShort(n) {
  return '₺' + Math.round(Number(n)).toLocaleString('tr-TR');
}
export function fmtEUR(n) {
  return '€' + Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtEURShort(n) {
  return '€' + Math.round(Number(n)).toLocaleString('tr-TR');
}

export function calcStatus(p) {
  if (p.stock === 0) return 'out_of_stock';
  if (p.stock <= p.minStock) return 'low_stock';
  return 'active';
}
export function statusLabel(s) {
  return { active: 'Aktif', low_stock: 'Düşük', out_of_stock: 'Tükendi' }[s] || s;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function animateCounter(el, target, duration = 1500, formatter = null) {
  const startTime = performance.now();
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const v = target * easeOut(t);
    el.textContent = formatter ? formatter(v) : Math.round(v).toLocaleString('tr-TR');
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = formatter ? formatter(target) : Math.round(target).toLocaleString('tr-TR');
  }
  requestAnimationFrame(step);
}

export function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
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

const tooltipEl = document.getElementById('tooltip');
export function showTooltip(e, html) {
  tooltipEl.innerHTML = html;
  tooltipEl.classList.add('visible');
  tooltipEl.style.left = (e.clientX + 12) + 'px';
  tooltipEl.style.top  = (e.clientY + 12) + 'px';
}
export function hideTooltip() { tooltipEl.classList.remove('visible'); }

let pendingConfirm = null;

export function showConfirm(title, text, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent  = text;
  pendingConfirm = onConfirm;
  document.getElementById('confirm-modal').classList.add('visible');
}
export function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('visible');
  pendingConfirm = null;
}
export function closeConfirmOnOverlay(e) {
  if (e.target.id === 'confirm-modal') closeConfirmModal();
}

document.getElementById('confirm-btn').addEventListener('click', () => {
  if (pendingConfirm) pendingConfirm();
  closeConfirmModal();
});

window.closeConfirmModal     = closeConfirmModal;
window.closeConfirmOnOverlay = closeConfirmOnOverlay;
