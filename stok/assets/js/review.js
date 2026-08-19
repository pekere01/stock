import { sb } from './supabase.js';
import { friendlyError } from './ui.js';

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

async function fetchInTestProducts() {
  const { data, error } = await sb.from('products')
    .select('id, name, barcode, stock')
    .eq('in_test', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Manuel işaretli ürünler çekilemedi:', error);
    return [];
  }
  return data;
}

function renderInTestRows(items) {
  const tbody = document.getElementById('review-table-intest-body');
  tbody.innerHTML = '';
  if (items.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = 'Manuel işaretli ürün yok.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = item.name;
    const tdBarcode = document.createElement('td');
    tdBarcode.textContent = item.barcode || '-';
    const tdStock = document.createElement('td');
    tdStock.textContent = item.stock;
    const tdIslem = document.createElement('td');
    const btnClear = document.createElement('button');
    btnClear.className = 'btn btn-secondary';
    btnClear.textContent = 'İşareti Kaldır';
    btnClear.onclick = () => window.clearInTestFlag(item.id);
    tdIslem.appendChild(btnClear);
    tr.append(tdName, tdBarcode, tdStock, tdIslem);
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
}

export async function clearInTestFlag(id) {
  const { error } = await sb.from('products').update({ in_test: false }).eq('id', id);
  if (error) {
    alert('Hata: ' + friendlyError(error));
    return;
  }
  await loadReviewPanel();
}

export async function loadReviewPanel() {
  const [sct, diger, inTest] = await Promise.all([
    fetchReviewItems('sct'),
    fetchReviewItems('diger'),
    fetchInTestProducts(),
  ]);
  renderReviewRows(sct, 'review-table-sct-body');
  renderReviewRows(diger, 'review-table-diger-body');
  renderInTestRows(inTest);
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
    alert('Hata: ' + (data?.error || friendlyError(error)));
    return;
  }
  await loadReviewPanel();
}

export async function dismissReviewItem(guid) {
  const { error } = await sb.rpc('dismiss_review', { p_guid: guid });
  if (error) {
    alert('Hata: ' + friendlyError(error));
    return;
  }
  await loadReviewPanel();
}

window.openReviewPanel = openReviewPanel;
window.closeReviewPanel = closeReviewPanel;
window.reverseReviewItem = reverseReviewItem;
window.dismissReviewItem = dismissReviewItem;
window.clearInTestFlag = clearInTestFlag;
