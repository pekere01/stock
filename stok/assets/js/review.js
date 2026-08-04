import { sb } from './supabase.js';

async function fetchReviewItems(kategori) {
  const { data, error } = await sb.rpc('get_review_items', { p_kategori: kategori });

  if (error) {
    console.error('İnceleme listesi çekilemedi:', error);
    return [];
  }
  return data;
}

function daysSince(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function renderReviewRows(items, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';
  if (items.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'İnceleme bekleyen kayıt yok.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const tr = document.createElement('tr');
    const tdStok = document.createElement('td');
    tdStok.textContent = item.stok_kod;
    const tdIrsaliye = document.createElement('td');
    tdIrsaliye.textContent = item.irsaliye_no || '-';
    const tdMiktar = document.createElement('td');
    tdMiktar.textContent = item.miktar;
    const tdGun = document.createElement('td');
    tdGun.textContent = `${daysSince(item.processed_at)} gün`;
    const tdIslem = document.createElement('td');
    const btnReverse = document.createElement('button');
    btnReverse.className = 'btn btn-secondary';
    btnReverse.textContent = 'Stoktan Düş';
    btnReverse.onclick = () => window.reverseReviewItem(item.mikro_sth_guid);
    const btnDismiss = document.createElement('button');
    btnDismiss.className = 'btn btn-secondary';
    btnDismiss.textContent = 'Bekletmeye Devam Et';
    btnDismiss.onclick = () => window.dismissReviewItem(item.mikro_sth_guid);
    tdIslem.appendChild(btnReverse);
    tdIslem.appendChild(btnDismiss);
    tr.append(tdStok, tdIrsaliye, tdMiktar, tdGun, tdIslem);
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
}

export async function loadReviewPanel() {
  const [sct, diger] = await Promise.all([
    fetchReviewItems('sct'),
    fetchReviewItems('diger'),
  ]);
  renderReviewRows(sct, 'review-table-sct-body');
  renderReviewRows(diger, 'review-table-diger-body');
}

export function openReviewPanel() {
  const panel = document.getElementById('review-panel');
  panel.classList.remove('hidden');
  loadReviewPanel();
  requestAnimationFrame(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export function closeReviewPanel() {
  document.getElementById('review-panel').classList.add('hidden');
}

export async function reverseReviewItem(guid) {
  if (!confirm('Bu irsaliyenin stoğunu geri almak istediğinize emin misiniz?')) return;
  const { data, error } = await sb.rpc('manual_reverse_review', { p_guid: guid });
  if (error || data?.error) {
    alert('Hata: ' + (error?.message || data.error));
    return;
  }
  await loadReviewPanel();
}

export async function dismissReviewItem(guid) {
  const { error } = await sb.rpc('dismiss_review', { p_guid: guid });
  if (error) {
    alert('Hata: ' + error.message);
    return;
  }
  await loadReviewPanel();
}

window.openReviewPanel = openReviewPanel;
window.closeReviewPanel = closeReviewPanel;
window.reverseReviewItem = reverseReviewItem;
window.dismissReviewItem = dismissReviewItem;
