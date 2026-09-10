import { sb } from './supabase.js';
import { canDo } from './auth.js';
import { friendlyError, lockBodyScroll, unlockBodyScroll, showConfirm, showQtyPrompt, toast } from './ui.js';

function canMoveStock() {
  return canDo('add_products') || canDo('make_sales');
}

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

function renderReviewRows(items, tbodyId, isSct = false) {
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
    btnReverse.textContent = 'Ürünü Stoğa Geri Ekle';
    btnReverse.onclick = () => window.reverseReviewItem(item.mikro_sth_guid);
    const btnDismiss = document.createElement('button');
    btnDismiss.className = 'btn btn-secondary';
    btnDismiss.textContent = 'Bekletmeye Devam Et';
    btnDismiss.onclick = () => window.dismissReviewItem(item.mikro_sth_guid);
    tdIslem.appendChild(btnReverse);
    tdIslem.appendChild(btnDismiss);
    if (isSct) {
      const btnKonsinye = document.createElement('button');
      btnKonsinye.className = 'btn btn-secondary';
      btnKonsinye.textContent = 'Konsinye Deposuna Aktar';
      btnKonsinye.onclick = () => window.konsinyeFromReview(item.mikro_sth_guid);
      tdIslem.appendChild(btnKonsinye);
    }
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
    toast('Hata: ' + friendlyError(error), 'error');
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
  renderReviewRows(sct, 'review-table-sct-body', true);
  renderReviewRows(diger, 'review-table-diger-body');
  renderInTestRows(inTest);
}

export function konsinyeFromReview(guid) {
  showConfirm('Konsinye Deposuna Aktar', 'Bu irsaliyeyi konsinye deposuna aktarmak istediğinize emin misiniz?', async () => {
    const { data, error } = await sb.rpc('konsinye_from_review', { p_guid: guid });
    if (error || data?.error) {
      toast('Hata: ' + (data?.error || friendlyError(error)), 'error');
      return;
    }
    await loadReviewPanel();
  });
}

/* ===== KONSİNYE DEPOSU PANELİ ===== */
async function fetchKonsinyeProducts() {
  const { data, error } = await sb.from('products')
    .select('id, name, barcode, stock, consignment_stock')
    .gt('consignment_stock', 0)
    .order('name', { ascending: true })
    .range(0, 4999);

  if (error) {
    console.error('Konsinye ürünleri çekilemedi:', error);
    return [];
  }
  return data;
}

function renderKonsinyeRows(items) {
  const tbody = document.getElementById('konsinye-table-body');
  tbody.innerHTML = '';
  if (items.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'Konsinye deposunda ürün yok.';
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
    const tdKonsinye = document.createElement('td');
    tdKonsinye.textContent = item.consignment_stock;
    const tdIslem = document.createElement('td');
    const btnReturn = document.createElement('button');
    btnReturn.className = 'btn btn-secondary';
    btnReturn.textContent = 'Ana Stoğa İade';
    btnReturn.onclick = () => window.konsinyeReturn(item.id, item.consignment_stock);
    const btnInvoice = document.createElement('button');
    btnInvoice.className = 'btn btn-secondary';
    btnInvoice.textContent = 'Faturalandı';
    btnInvoice.onclick = () => window.konsinyeInvoice(item.id, item.consignment_stock);
    tdIslem.appendChild(btnReturn);
    tdIslem.appendChild(btnInvoice);
    tr.append(tdName, tdBarcode, tdStock, tdKonsinye, tdIslem);
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
}

export async function loadKonsinyePanel() {
  const items = await fetchKonsinyeProducts();
  renderKonsinyeRows(items);
}

export function openKonsinyePanel() {
  if (!canMoveStock()) { toast('Bu işlem için yetkiniz yok', 'error'); return; }
  document.getElementById('konsinye-panel').classList.add('visible');
  lockBodyScroll();
  loadKonsinyePanel();
}

export function closeKonsinyePanel() {
  document.getElementById('konsinye-panel').classList.remove('visible');
  unlockBodyScroll();
}

export function closeKonsinyeOnOverlay(e) {
  if (e.target.id === 'konsinye-panel') closeKonsinyePanel();
}

export function konsinyeReturn(productId, maxQty) {
  showQtyPrompt('Ana Stoğa İade — Miktar', maxQty, async (qty) => {
    const { data, error } = await sb.rpc('konsinye_return', { p_product_id: productId, p_qty: qty });
    if (error || data?.error) {
      toast('Hata: ' + (data?.error || friendlyError(error)), 'error');
      return;
    }
    await loadKonsinyePanel();
    if (window.loadData && window.renderAll) {
      await window.loadData(0);
      window.renderAll();
    }
  });
}

export function konsinyeInvoice(productId, maxQty) {
  showQtyPrompt('Faturalandı — Miktar', maxQty, async (qty) => {
    const { data, error } = await sb.rpc('konsinye_invoice', { p_product_id: productId, p_qty: qty });
    if (error || data?.error) {
      toast('Hata: ' + (data?.error || friendlyError(error)), 'error');
      return;
    }
    await loadKonsinyePanel();
  });
}

export function openReviewPanel() {
  if (!canMoveStock()) { toast('Bu işlem için yetkiniz yok', 'error'); return; }
  document.getElementById('review-panel').classList.add('visible');
  lockBodyScroll();
  loadReviewPanel();
}

export function closeReviewPanel() {
  document.getElementById('review-panel').classList.remove('visible');
  unlockBodyScroll();
}

export function closeReviewOnOverlay(e) {
  if (e.target.id === 'review-panel') closeReviewPanel();
}

export function reverseReviewItem(guid) {
  showConfirm('Ürünü Stoğa Geri Ekle', 'Bu irsaliyenin stoğunu geri almak istediğinize emin misiniz?', async () => {
    const { data, error } = await sb.rpc('manual_reverse_review', { p_guid: guid });
    if (error || data?.error) {
      toast('Hata: ' + (data?.error || friendlyError(error)), 'error');
      return;
    }
    await loadReviewPanel();
  });
}

export async function dismissReviewItem(guid) {
  const { error } = await sb.rpc('dismiss_review', { p_guid: guid });
  if (error) {
    toast('Hata: ' + friendlyError(error), 'error');
    return;
  }
  await loadReviewPanel();
}

window.openReviewPanel = openReviewPanel;
window.closeReviewPanel = closeReviewPanel;
window.closeReviewOnOverlay = closeReviewOnOverlay;
window.reverseReviewItem = reverseReviewItem;
window.dismissReviewItem = dismissReviewItem;
window.clearInTestFlag = clearInTestFlag;
window.konsinyeFromReview = konsinyeFromReview;
window.openKonsinyePanel = openKonsinyePanel;
window.closeKonsinyePanel = closeKonsinyePanel;
window.closeKonsinyeOnOverlay = closeKonsinyeOnOverlay;
window.konsinyeReturn = konsinyeReturn;
window.konsinyeInvoice = konsinyeInvoice;
