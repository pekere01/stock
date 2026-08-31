import { sb, SUPABASE_URL, SUPABASE_KEY } from './supabase.js';
import { currentUser, currentPermissions, isAdmin, canDo, isViewOnly, logAction, bootstrapAuth } from './auth.js';
import {
  fmtTL, fmtTLShort, fmtEUR, fmtEURShort,
  escapeHtml, animateCounter, calcStatus, statusLabel,
  showTooltip, hideTooltip, toast, showConfirm, closeConfirmModal,
  friendlyError, lockBodyScroll, unlockBodyScroll
} from './ui.js';
import { closePermModal } from './admin.js';

const EUR_RATE_KEY = 'stok-dashboard-eur-rate';

const CATEGORY_PALETTE = [
  '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#10b981', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7', '#eab308', '#84cc16', '#0ea5e9'
];

let products = [];
let categories = [];
let editingId = null;
let stockOutId = null;
let editingCategoryName = null;
let eurRate = parseFloat(localStorage.getItem(EUR_RATE_KEY)) || 34.00;
let dashboardSummary = null;

/* import */
let importRows = [];
const IMPORT_COL_MAP = {
  name:     ['ürün adı','urun adi','ad','ürün','urun','name','product name','product','adi'],
  barcode:  ['barkod no','barkod','barcode','sku','stok kodu','kod'],
  category: ['kategori','category','grup','group'],
  depo:     ['depo','warehouse','raf','konum','location','depo/raf'],
  price:    ['satış fiyatı','satis fiyati','fiyat','sale price','price','satış','satiş fiyati (€)','satış fiyatı (€)'],
  cost:     ['alış fiyatı','alis fiyati','maliyet','cost','cost price','alış','alis fiyati (€)','alış fiyatı (€)'],
  stock:    ['stok','stock','adet','miktar','quantity','mevcut stok'],
  minStock: ['min. stok','min stok','minimum stok','min_stock','minstock','min stock','minimum','eşik'],
  sales7d:  ['7g satış','7g satis','satış','sales','sales7d','haftalık satış','haftalik satis']
};


/* history */
let historyProductId = null;
let historyRows = [];

/* pagination */
let currentPage      = 0;
const PAGE_SIZE      = 50;
let totalCount       = 0;
let pageSearch       = '';
let pageCatFilter    = '';
let pageStatusFilter = 'active';
let _searchTimer     = null;

/* ===== REALTIME ===== */
let _realtimeChannel = null;
let _realtimeTimer   = null;

function setupRealtime() {
  if (_realtimeChannel) return;
  _realtimeChannel = sb
    .channel('public:products')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
      clearTimeout(_realtimeTimer);
      _realtimeTimer = setTimeout(async () => {
        await loadData(currentPage, false);
        renderAll();
      }, 500);
    })
    .subscribe();
}

/* ===== DB HELPERS ===== */
function dbToProduct(row) {
  return {
    id:           row.id,
    name:         row.name,
    barcode:      row.barcode || '',
    category:     row.category || 'Genel',
    cost:         parseFloat(row.cost_price)  || 0,
    price:        parseFloat(row.sale_price)  || 0,
    stock:        row.stock        || 0,
    consignment:  row.consignment_stock || 0,
    minStock:     row.min_stock    || 0,
    sales7d:      row.sales7d      || 0,
    status:       row.status       || 'active',
    depo:         row.warehouse_info || '',
    purchaseRate: row.purchase_rate || null,
    saleRate:     row.sale_rate    || null,
    inTest:       row.in_test      || false,
    createdAt:    row.created_at
  };
}

function productToDb(p) {
  return {
    name:           p.name,
    barcode:        p.barcode   || null,
    category:       p.category,
    cost_price:     Number(p.cost)     || 0,
    sale_price:     Number(p.price)    || 0,
    stock:          Number(p.stock)    || 0,
    min_stock:      Number(p.minStock) || 0,
    sales7d:        Number(p.sales7d)  || 0,
    status:         p.status    || 'active',
    warehouse_info: p.depo      || null,
    purchase_rate:  p.purchaseRate || null,
    sale_rate:      p.saleRate  || null,
    in_test:        !!p.inTest
  };
}

export async function loadData(page = 0, recount = true) {
  if (!currentUser) return;
  setupRealtime();
  currentPage = page;
  const from = page * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;
  try {
    const safe          = (pageSearch || '').replace(/[*%,()]/g, '');
    const hasTextSearch = !!safe;
    const hasFilter     = !!(safe || pageCatFilter || pageStatusFilter);
    let q = sb.from('products')
      .select('*', (recount && hasFilter) ? { count: 'exact' } : { count: 'none' })
      .order('created_at', { ascending: false });
    if (safe)              q = q.or(`name.ilike.%${safe}%,barcode.ilike.%${safe}%`);
    if (pageCatFilter)     q = q.eq('category', pageCatFilter);
    if (pageStatusFilter === 'active') q = q.or('status.eq.active,status.eq.low_stock,status.is.null');
    else if (pageStatusFilter)         q = q.eq('status', pageStatusFilter);
    q = q.range(from, to);

    const [catsRes, prodsRes, rpcRes] = await Promise.all([
      sb.from('categories').select('*').order('name', { ascending: true }).range(0, 1999),
      q,
      sb.rpc('get_dashboard_summary')
    ]);
    if (catsRes.error) throw catsRes.error;
    if (prodsRes.error) throw prodsRes.error;
    categories = (catsRes.data || []).map(r => ({ name: r.name, color: r.color || '#3b82f6' }));
    products   = (prodsRes.data || []).map(dbToProduct);
    if (recount && hasFilter) totalCount = prodsRes.count ?? totalCount;
    if (!rpcRes.error && rpcRes.data) {
      dashboardSummary = rpcRes.data;
      if (!hasFilter) totalCount = rpcRes.data.total_products ?? totalCount;
    }
  } catch (err) {
    console.error('Veri yükleme hatası:', err.message || err);
    toast('Veriler yüklenemedi: ' + friendlyError(err), 'error');
    products   = [];
    categories = [];
  }
}

function getCategoryColor(name) {
  const c = categories.find(x => x.name === name);
  return c ? c.color : '#6b7280';
}
function pickNextColor() {
  const used = new Set(categories.map(c => c.color));
  return CATEGORY_PALETTE.find(c => !used.has(c)) || CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length];
}

/* ===== STATS ===== */
function renderStats() {
  const s             = dashboardSummary;
  const total         = s?.total_products    ?? totalCount;
  const totalQty      = s?.total_stock      ?? products.reduce((acc, p) => acc + (p.stock || 0), 0);
  const stockValueEUR = s?.total_cost_value ?? products.reduce((acc, p) => acc + p.stock * (p.cost || 0), 0);
  const lowCount      = s?.low_stock_count  ?? products.filter(p => p.stock <= p.minStock).length;
  const avgMargin     = s?.avg_margin       ?? (() => {
    const ms = products.filter(p => p.price > 0).map(p => ((p.price - p.cost) / p.price) * 100);
    return ms.length ? ms.reduce((a, x) => a + x, 0) / ms.length : 0;
  })();
  const priced = products.filter(p => p.price > 0);
  const avgUnitProfitEUR = priced.length
    ? priced.reduce((acc, p) => acc + ((p.price || 0) - (p.cost || 0)), 0) / priced.length
    : 0;

  const viewOnly = isViewOnly();
  animateCounter(document.getElementById('stat-total'), total);
  document.getElementById('stat-total-trend').textContent = `${total} çeşit · ${totalQty.toLocaleString('tr-TR')} adet toplam`;

  if (viewOnly) {
    document.getElementById('stat-value').textContent = '—';
    document.getElementById('stat-value-trend').textContent = 'Yetkisiz alan';
  } else {
    animateCounter(document.getElementById('stat-value'), stockValueEUR, 1500, v => fmtEURShort(v));
    const stockRevenueEUR = s?.total_sale_value ?? products.reduce((acc, p) => acc + p.stock * (p.price || 0), 0);
    document.getElementById('stat-value-trend').textContent = `TL eşd.: ${fmtTLShort(stockValueEUR * eurRate)} · Satış: ${fmtEURShort(stockRevenueEUR)}`;
  }

  animateCounter(document.getElementById('stat-low'), lowCount);
  document.getElementById('stat-low-trend').textContent = lowCount > 0 ? `${lowCount.toLocaleString('tr-TR')} ürün acil aksiyon gerekli` : 'Tüm stoklar yeterli';

  if (viewOnly) {
    document.getElementById('stat-margin').textContent = '—';
    document.getElementById('stat-margin-trend').textContent = 'Yetkisiz alan';
  } else {
    animateCounter(document.getElementById('stat-margin'), avgMargin, 1500, v => '%' + v.toFixed(1));
    document.getElementById('stat-margin-trend').textContent = avgUnitProfitEUR !== 0
      ? `Ort. birim kâr: ${fmtEURShort(avgUnitProfitEUR)}`
      : 'Tüm ürünler dahil';
  }
}

/* ===== PIE CHART ===== */
function renderPie() {
  const wrap   = document.getElementById('pie-wrap');
  const legend = document.getElementById('pie-legend');
  const counts = {};
  categories.forEach(c => counts[c.name] = 0);
  products.forEach(p => {
    if (counts[p.category] === undefined) counts[p.category] = 0;
    counts[p.category]++;
  });
  const allLabels = Array.from(new Set([...categories.map(c => c.name), ...Object.keys(counts)]));
  const data = allLabels
    .map(name => ({ label: name, value: counts[name] || 0, color: getCategoryColor(name) }))
    .filter(d => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 240, cx = size / 2, cy = size / 2, r = 95, ir = r * 0.6;
  let html = `<svg viewBox="0 0 ${size} ${size}" width="100%" style="max-width:280px;margin:0 auto;display:block;">`;

  if (total === 0) {
    html += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="#a0a0a0" font-size="14">Veri yok</text></svg>`;
    wrap.innerHTML = html;
    legend.innerHTML = '';
    return;
  }

  let cumAngle = -Math.PI / 2;
  data.forEach((d, i) => {
    const sliceAngle = (d.value / total) * Math.PI * 2;
    const endAngle = cumAngle + sliceAngle;
    const x1 = cx + r * Math.cos(cumAngle),  y1 = cy + r * Math.sin(cumAngle);
    const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + ir * Math.cos(endAngle), iy1 = cy + ir * Math.sin(endAngle);
    const ix2 = cx + ir * Math.cos(cumAngle), iy2 = cy + ir * Math.sin(cumAngle);
    const large = sliceAngle > Math.PI ? 1 : 0;
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${large} 0 ${ix2} ${iy2} Z`;
    const pct = ((d.value / total) * 100).toFixed(1);
    html += `<path d="${path}" fill="${d.color}" stroke="#1a1a1a" stroke-width="2" class="pie-slice"
      data-label="${escapeHtml(d.label)}" data-value="${d.value}" data-pct="${pct}"
      style="transform-origin:${cx}px ${cy}px;transition:transform 0.2s ease;opacity:0;animation:pieIn 0.6s ease ${i * 0.1}s forwards;cursor:pointer;"></path>`;
    cumAngle = endAngle;
  });

  html += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" dominant-baseline="middle" fill="#f5f5f5" font-size="28" font-weight="700">${total}</text>`;
  html += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" dominant-baseline="middle" fill="#a0a0a0" font-size="11">Toplam Ürün</text>`;
  html += `</svg>`;

  if (!document.getElementById('pie-anim-style')) {
    const s = document.createElement('style');
    s.id = 'pie-anim-style';
    s.textContent = `@keyframes pieIn{from{opacity:0;transform:scale(0.7) rotate(-45deg)}to{opacity:1;transform:scale(1) rotate(0)}} .pie-slice:hover{transform:scale(1.04)}`;
    document.head.appendChild(s);
  }

  wrap.innerHTML = html;
  legend.innerHTML = data.map(d => `
    <div class="legend-item">
      <span class="legend-color" style="background:${d.color}"></span>
      <span>${escapeHtml(d.label)} <span style="color:#f5f5f5;font-weight:600;">${d.value}</span></span>
    </div>`).join('');

  wrap.querySelectorAll('.pie-slice').forEach(el => {
    el.addEventListener('mousemove', e => showTooltip(e, `${escapeHtml(el.dataset.label)}<br><b>${escapeHtml(el.dataset.value)} ürün</b> · ${escapeHtml(el.dataset.pct)}%`));
    el.addEventListener('mouseleave', hideTooltip);
  });
}

/* ===== PIE CHART (RPC — tüm 127k ürün) =====
   DURUM: Pasif. Onay sonrası renderAll() içinde renderPie() ile değiştirilecek.
   Aktivasyon: renderAll() içindeki renderPie() → renderPieFromSummary() */
function renderPieFromSummary() {
  const wrap   = document.getElementById('pie-wrap');
  const legend = document.getElementById('pie-legend');
  if (!dashboardSummary?.category_distribution) { renderPie(); return; }

  const dist = dashboardSummary.category_distribution;
  const data = dist
    .map(d => ({ label: d.category, value: d.count, color: getCategoryColor(d.category) }))
    .filter(d => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 240, cx = size / 2, cy = size / 2, r = 95, ir = r * 0.6;
  let html = `<svg viewBox="0 0 ${size} ${size}" width="100%" style="max-width:280px;margin:0 auto;display:block;">`;

  if (total === 0) {
    html += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="#a0a0a0" font-size="14">Veri yok</text></svg>`;
    wrap.innerHTML = html;
    legend.innerHTML = '';
    return;
  }

  let cumAngle = -Math.PI / 2;
  data.forEach((d, i) => {
    const sliceAngle = (d.value / total) * Math.PI * 2;
    const endAngle   = cumAngle + sliceAngle;
    const x1  = cx + r  * Math.cos(cumAngle),  y1  = cy + r  * Math.sin(cumAngle);
    const x2  = cx + r  * Math.cos(endAngle),   y2  = cy + r  * Math.sin(endAngle);
    const ix1 = cx + ir * Math.cos(endAngle),   iy1 = cy + ir * Math.sin(endAngle);
    const ix2 = cx + ir * Math.cos(cumAngle),   iy2 = cy + ir * Math.sin(cumAngle);
    const large = sliceAngle > Math.PI ? 1 : 0;
    const path  = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${large} 0 ${ix2} ${iy2} Z`;
    const pct   = ((d.value / total) * 100).toFixed(1);
    html += `<path d="${path}" fill="${d.color}" stroke="#1a1a1a" stroke-width="2" class="pie-slice"
      data-label="${escapeHtml(d.label)}" data-value="${d.value}" data-pct="${pct}"
      style="transform-origin:${cx}px ${cy}px;transition:transform 0.2s ease;opacity:0;animation:pieIn 0.6s ease ${i * 0.1}s forwards;cursor:pointer;"></path>`;
    cumAngle = endAngle;
  });

  html += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" dominant-baseline="middle" fill="#f5f5f5" font-size="28" font-weight="700">${total}</text>`;
  html += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" dominant-baseline="middle" fill="#a0a0a0" font-size="11">Toplam Ürün</text>`;
  html += `</svg>`;

  if (!document.getElementById('pie-anim-style')) {
    const s = document.createElement('style');
    s.id = 'pie-anim-style';
    s.textContent = `@keyframes pieIn{from{opacity:0;transform:scale(0.7) rotate(-45deg)}to{opacity:1;transform:scale(1) rotate(0)}} .pie-slice:hover{transform:scale(1.04)}`;
    document.head.appendChild(s);
  }

  wrap.innerHTML = html;
  legend.innerHTML = data.map(d => `
    <div class="legend-item">
      <span class="legend-color" style="background:${d.color}"></span>
      <span>${escapeHtml(d.label)} <span style="color:#f5f5f5;font-weight:600;">${d.value}</span></span>
    </div>`).join('');

  wrap.querySelectorAll('.pie-slice').forEach(el => {
    el.addEventListener('mousemove', e => showTooltip(e, `${escapeHtml(el.dataset.label)}<br><b>${escapeHtml(el.dataset.value)} ürün</b> · ${escapeHtml(el.dataset.pct)}%`));
    el.addEventListener('mouseleave', hideTooltip);
  });
}

/* ===== BAR CHART ===== */
function renderBar() {
  const wrap = document.getElementById('bar-wrap');
  const top = dashboardSummary?.top_sales ?? [];
  if (top.length === 0) {
    wrap.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);">Satış verisi yok</div>`;
    return;
  }
  const w = 600, h = 280, pad = { l: 40, r: 16, t: 16, b: 60 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxVal = Math.max(...top.map(p => p.sales7d));
  const niceMax = Math.ceil(maxVal / 10) * 10 || 10;
  const barW = innerW / top.length * 0.6;
  const gap  = innerW / top.length * 0.4;
  const stepX = innerW / top.length;

  let html = `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;">`;
  for (let i = 0; i <= 5; i++) {
    const y = pad.t + (innerH * i / 5);
    const v = Math.round(niceMax * (1 - i / 5));
    html += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#2a2a2a" stroke-width="1"/>`;
    html += `<text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" fill="#a0a0a0" font-size="10">${v}</text>`;
  }
  top.forEach((p, i) => {
    const barH = (p.sales7d / niceMax) * innerH;
    const x = pad.l + i * stepX + gap / 2;
    const y = pad.t + innerH - barH;
    const shortName = p.name.length > 14 ? p.name.slice(0, 12) + '…' : p.name;
    const color = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
    html += `<rect x="${x}" y="${pad.t + innerH}" width="${barW}" height="0" rx="4"
      fill="${color}" class="bar-rect"
      data-label="${escapeHtml(p.name)}" data-value="${p.sales7d}"
      style="cursor:pointer;transition:fill 0.2s;">
      <animate attributeName="height" from="0" to="${barH}" dur="0.8s" begin="${i * 0.07}s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>
      <animate attributeName="y" from="${pad.t + innerH}" to="${y}" dur="0.8s" begin="${i * 0.07}s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>
    </rect>`;
    html += `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" fill="#f5f5f5" font-size="11" font-weight="600" opacity="0">
      ${p.sales7d}
      <animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="${0.8 + i * 0.07}s" fill="freeze"/>
    </text>`;
    html += `<text x="${x + barW / 2}" y="${pad.t + innerH + 18}" text-anchor="middle" fill="#a0a0a0" font-size="10" transform="rotate(-25 ${x + barW / 2} ${pad.t + innerH + 18})">${shortName}</text>`;
  });
  html += `</svg>`;
  wrap.innerHTML = html;
  wrap.querySelectorAll('.bar-rect').forEach(el => {
    el.addEventListener('mousemove', e => showTooltip(e, `${escapeHtml(el.dataset.label)}<br><b>${escapeHtml(el.dataset.value)} satış</b>`));
    el.addEventListener('mouseleave', () => { hideTooltip(); el.style.filter = ''; });
    el.addEventListener('mouseenter', () => el.style.filter = 'brightness(1.2)');
  });
}

/* ===== PAGINATION CONTROLS ===== */
function renderPaginationControls() {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const wrap = document.getElementById('pagination-controls');
  if (!wrap) return;
  const from = currentPage * PAGE_SIZE + 1;
  const to   = Math.min((currentPage + 1) * PAGE_SIZE, totalCount);
  wrap.innerHTML = `
    <div class="pagination-info">${totalCount.toLocaleString('tr-TR')} üründen ${from}–${to} gösteriliyor</div>
    <div class="pagination-btns">
      <button class="pag-btn" onclick="window.goPage(${currentPage - 1})" ${currentPage === 0 ? 'disabled' : ''}>← Önceki</button>
      <span class="pag-page">${currentPage + 1} / ${totalPages}</span>
      <button class="pag-btn" onclick="window.goPage(${currentPage + 1})" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Sonraki →</button>
    </div>`;
}

/* ===== TABLE ===== */
function getFiltered() {
  return products; // filtering done server-side in loadData()
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  const list  = getFiltered();
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <div>Ürün bulunamadı</div>
    </div></td></tr>`;
    return;
  }
  const viewOnly = isViewOnly();
  const fragment = document.createDocumentFragment();
  list.forEach((p, idx) => {
    const status    = calcStatus(p);
    const margin    = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
    const marginCls = margin > 40 ? 'margin-good' : margin > 20 ? 'margin-mid' : 'margin-bad';
    const stockPct  = p.minStock > 0 ? Math.min(100, (p.stock / p.minStock) * 100) : 100;
    const barCls    = p.stock === 0 ? 'bad' : p.stock <= p.minStock ? 'mid' : 'good';
    const tr = document.createElement('tr');
    tr.className = status;
    tr.style.animationDelay = `${idx * 0.02}s`;
    tr.innerHTML = `
        <td>
          <div class="product-name">${escapeHtml(p.name)}${p.inTest ? '<span class="badge in-test" title="Test / Konsinye Takibinde">TEST</span>' : ''}</div>
          <div class="product-barcode">${escapeHtml(p.barcode)}</div>
        </td>
        <td><span class="badge" style="border-color:${getCategoryColor(p.category)}40;color:${getCategoryColor(p.category)}">${escapeHtml(p.category)}</span></td>
        <td><span style="font-size:12px;font-weight:500;color:var(--text-secondary)">${escapeHtml(p.depo || '—')}</span></td>
        <td>${viewOnly ? '<span style="color:var(--text-secondary)">—</span>' : `<strong>${fmtEUR(p.price)}</strong>`}</td>
        <td style="color:var(--text-secondary)">${viewOnly ? '—' : fmtEUR(p.cost)}</td>
        <td>${viewOnly ? '<span style="color:var(--text-secondary)">—</span>' : `<span class="${marginCls}">%${margin.toFixed(1)}</span>`}</td>
        <td>
          <div class="stock-cell">
            <div class="stock-row">
              <span class="stock-num">${p.stock}</span>
            </div>
            <div class="stock-bar"><div class="stock-bar-fill ${barCls}" style="width:${stockPct}%"></div></div>
          </div>
        </td>
        <td class="center"><strong>${p.sales7d}</strong></td>
        <td><span class="badge ${status}">${statusLabel(status)}</span></td>
        <td>
          <div class="row-actions">
            ${canDo('make_sales') ? `<button class="icon-btn warn" title="Stok Çıkar (Satış)" onclick="openStockOutModal(${p.id})" ${p.stock === 0 ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M13 18l6-6-6-6"></path></svg>
            </button>` : ''}
            ${canDo('add_products') ? `<button class="icon-btn" title="Düzenle" onclick="openEditModal(${p.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>` : ''}
            ${(isAdmin() || currentPermissions?.admin) ? `<button class="icon-btn danger" title="Sil" onclick="askDelete(${p.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
            </button>` : ''}
            ${canDo('view_history') ? `<button class="icon-btn" title="Hareket Geçmişi" onclick="openHistoryModal(${p.id})" style="opacity:0.7">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </button>` : ''}
          </div>
        </td>`;
    fragment.appendChild(tr);
  });
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
  renderPaginationControls();
}

export function populateFilters() {
  const sel = document.getElementById('filter-category');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">Tüm Kategoriler</option>' +
    categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  if (currentVal && categories.some(c => c.name === currentVal)) sel.value = currentVal;

  const fc = document.getElementById('f-category');
  const currentFc = fc.value;
  fc.innerHTML = '<option value="">Seçiniz...</option>' +
    categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  if (currentFc && categories.some(c => c.name === currentFc)) fc.value = currentFc;

  const ec = document.getElementById('export-category');
  if (ec) {
    const currentEc = ec.value;
    ec.innerHTML = '<option value="">Tüm Kategoriler</option>' +
      categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    if (currentEc && categories.some(c => c.name === currentEc)) ec.value = currentEc;
  }
}

/* ===== ALERT BANNER ===== */
function renderAlertBanner() {
  const banner   = document.getElementById('alert-banner');
  const outCount = dashboardSummary?.out_of_stock_count ?? products.filter(p => calcStatus(p) === 'out_of_stock').length;
  const lowCount = dashboardSummary?.low_stock_count    ?? products.filter(p => p.stock <= p.minStock).length;
  // low_stock_count artık zero-stock'u içeriyor; banner'da çift saymamak için farkı göster
  const belowMin = Math.max(0, lowCount - outCount);
  if (outCount === 0 && belowMin === 0) { banner.style.display = 'none'; return; }

  let html = '<span class="alert-banner-label">Stok Uyarısı:</span>';
  if (outCount > 0) {
    html += `<button class="alert-chip red" onclick="filterByStatus('out_of_stock')">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      ${outCount.toLocaleString('tr-TR')} ürün tükendi
    </button>`;
  }
  if (belowMin > 0) {
    html += `<button class="alert-chip amber" onclick="filterByStatus('low_stock')">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      ${belowMin.toLocaleString('tr-TR')} ürün düşük stok
    </button>`;
  }
  banner.innerHTML = html;
  banner.style.display = 'flex';
}

window.filterByStatus = async function(status) {
  document.getElementById('filter-status').value = status;
  pageStatusFilter = status;
  await loadData(0);
  renderAll();
  document.querySelector('.table-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export function renderAll() {
  renderAlertBanner();
  renderStats();
  renderPieFromSummary();
  renderBar();
  renderTable();
}

/* ===== ADD / EDIT MODAL ===== */
export function openAddModal() {
  if (categories.length === 0) {
    toast('Önce en az bir kategori ekleyin', 'error');
    openCategoryModal();
    return;
  }
  editingId = null;
  document.getElementById('modal-title').textContent = 'Yeni Ürün Ekle';
  document.getElementById('product-form').reset();
  document.getElementById('f-in-test').checked = false;
  document.getElementById('form-error').textContent = '';
  document.getElementById('price-field-wrapper').style.display = 'none';
  document.getElementById('product-modal').classList.add('visible');
  lockBodyScroll();
  setTimeout(() => document.getElementById('f-name').focus(), 100);
}
export function openEditModal(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Ürünü Düzenle';
  document.getElementById('f-name').value    = p.name;
  document.getElementById('f-barcode').value = p.barcode || '';
  document.getElementById('f-category').value = p.category;
  document.getElementById('f-stock').value   = p.stock;
  document.getElementById('f-minStock').value = p.minStock || '';
  document.getElementById('f-cost').value    = p.cost > 0 ? p.cost : '';
  document.getElementById('f-depo').value    = p.depo || '';
  document.getElementById('f-price').value   = p.price > 0 ? p.price : '';
  document.getElementById('f-in-test').checked = !!p.inTest;
  document.getElementById('form-error').textContent = '';
  document.getElementById('price-field-wrapper').style.display = '';
  const stockField = document.getElementById('f-stock').closest('.form-field');
  if (stockField) stockField.style.display = (isAdmin() || currentPermissions?.admin) ? '' : 'none';
  document.getElementById('product-modal').classList.add('visible');
  lockBodyScroll();
}
export function closeProductModal() { document.getElementById('product-modal').classList.remove('visible'); unlockBodyScroll(); }
export function closeProductModalOnOverlay(e) { if (e.target.id === 'product-modal') closeProductModal(); }

export async function submitProductForm(e) {
  e.preventDefault();
  const name     = document.getElementById('f-name').value.trim();
  const barcode  = document.getElementById('f-barcode').value.trim();
  const category = document.getElementById('f-category').value;
  const stock    = parseInt(document.getElementById('f-stock').value);
  const minStock = parseInt(document.getElementById('f-minStock').value) || 0;
  const cost     = parseFloat(document.getElementById('f-cost').value) || 0;
  const price    = parseFloat(document.getElementById('f-price').value) || 0;
  const depo     = document.getElementById('f-depo').value.trim();
  const inTest   = document.getElementById('f-in-test').checked;
  const errEl    = document.getElementById('form-error');
  const saveBtn  = e.target.querySelector('button[type="submit"]');
  errEl.textContent = '';

  if (isNaN(stock)) { errEl.textContent = 'Stok adedi geçerli olmalı.'; return; }
  if (stock < 0 || minStock < 0) { errEl.textContent = 'Negatif değer giremezsiniz.'; return; }
  if (price > 0 && cost > 0 && price < cost) { errEl.textContent = 'Satış fiyatı alış fiyatından düşük olamaz.'; return; }

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Kaydediliyor…'; }
  try {
    // server-side duplicate check — client-side products[] is only current page
    let dup = null, dupReason = '';
    if (barcode) {
      const { data: bRows } = await sb.from('products').select('*').ilike('barcode', barcode).neq('id', editingId || -1).limit(1);
      if (bRows?.length) { dup = dbToProduct(bRows[0]); dupReason = 'barkod'; }
    }
    if (!dup) {
      const { data: nRows } = await sb.from('products').select('*').ilike('name', name).neq('id', editingId || -1).limit(1);
      if (nRows?.length) { dup = dbToProduct(nRows[0]); dupReason = 'ürün adı'; }
    }

    if (dup && !editingId) {
      const newStock  = dup.stock + stock;
      const newStatus = calcStatus({ ...dup, stock: newStock });
      const upd = { stock: newStock, status: newStatus, purchase_rate: eurRate };
      if (cost > 0) upd.cost_price     = cost;
      if (depo)     upd.warehouse_info = depo;
      const { error } = await sb.from('products').update(upd).eq('id', dup.id);
      if (error) throw error;
      logMovement({ productId: dup.id, productName: dup.name, type: 'in', quantity: stock, oldStock: newStock - stock, newStock, notes: 'Eşleşme ile stok artışı' });
      closeProductModal();
      await loadData(currentPage); renderAll();
      toast(`"${dup.name}" — stok ${stock} adet artırıldı (${dupReason} eşleşti)`);
      return;
    }
    if (dup && editingId) { errEl.textContent = `Bu ${dupReason} zaten kullanımda: ${dup.name}`; return; }

    if (editingId) {
      const p = products.find(x => x.id === editingId);
      const dbRow = productToDb({ ...p, name, barcode, category, stock, minStock, cost, price, depo, inTest });
      const { error } = await sb.from('products').update(dbRow).eq('id', editingId);
      if (error) throw error;
      const oldStock = p.stock; const oldPrice = p.price;
      Object.assign(p, { name, barcode, category, stock, minStock, cost, price, depo, inTest });
      p.status = calcStatus(p);
      logMovement({ productId: p.id, productName: name, type: 'edit', oldStock, newStock: stock, oldPrice, newPrice: price });
      toast('Ürün güncellendi');
    } else {
      const newPdata = { name, barcode, category, depo, cost, price: 0, stock, minStock, sales7d: 0, purchaseRate: eurRate, inTest };
      newPdata.status = calcStatus({ stock, minStock });
      const { data, error } = await sb.from('products').insert(productToDb(newPdata)).select().single();
      if (error) throw error;
      totalCount++;
      products.push(dbToProduct(data));
      logMovement({ productId: data.id, productName: name, type: 'create', quantity: stock, oldStock: 0, newStock: stock });
      toast('Ürün eklendi');
    }
    closeProductModal(); renderAll();
  } catch (err) {
    errEl.textContent = 'Hata: ' + friendlyError(err);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Kaydet'; }
  }
}

/* ===== STOK ÇIKAR (SATIŞ) ===== */
export function openStockOutModal(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (p.stock <= 0) { toast('Bu ürün zaten tükendi'); return; }
  stockOutId = id;
  document.getElementById('stockout-product-name').textContent = `${p.name} (${p.barcode})`;
  document.getElementById('stockout-current').textContent = `${p.stock} adet`;
  document.getElementById('stockout-qty').value   = 1;
  document.getElementById('stockout-qty').max     = p.stock;
  document.getElementById('stockout-price').value = p.price > 0 ? p.price : '';
  document.getElementById('stockout-rate').value  = eurRate.toFixed(2);
  document.getElementById('stockout-error').textContent = '';
  document.getElementById('stockout-modal').classList.add('visible');
  lockBodyScroll();
  updateStockOutProfit();
  setTimeout(() => document.getElementById('stockout-qty').focus(), 100);
}
export function updateStockOutProfit() {
  const p = products.find(x => x.id === stockOutId);
  if (!p) return;
  const salePrice = parseFloat(document.getElementById('stockout-price').value) || 0;
  const saleRate  = parseFloat(document.getElementById('stockout-rate').value)  || eurRate;
  const qty       = parseInt(document.getElementById('stockout-qty').value) || 1;
  const display   = document.getElementById('stockout-profit-display');
  const valEl     = document.getElementById('stockout-profit-val');
  if (salePrice <= 0 || (p.cost || 0) <= 0) { display.style.display = 'none'; return; }
  const unitProfit = salePrice - (p.cost || 0);
  display.style.display = 'flex';
  valEl.textContent = `${fmtEUR(unitProfit)} × ${qty} = ${fmtEUR(unitProfit * qty)}`;
  valEl.className   = 'profit-val ' + (unitProfit >= 0 ? 'profit-pos' : 'profit-neg');
}
export function closeStockOutModal() {
  document.getElementById('stockout-modal').classList.remove('visible');
  unlockBodyScroll();
  stockOutId = null;
}
export function closeStockOutOnOverlay(e) { if (e.target.id === 'stockout-modal') closeStockOutModal(); }

export async function submitStockOut(e) {
  e.preventDefault();
  const errEl = document.getElementById('stockout-error');
  errEl.textContent = '';
  const p = products.find(x => x.id === stockOutId);
  if (!p) { closeStockOutModal(); return; }
  const qty = parseInt(document.getElementById('stockout-qty').value);
  if (isNaN(qty) || qty < 1) { errEl.textContent = 'Geçerli bir adet girin.'; return; }
  if (qty > p.stock) { errEl.textContent = `En fazla ${p.stock} adet çıkarabilirsiniz.`; return; }
  const salePrice = parseFloat(document.getElementById('stockout-price').value) || 0;
  const saleRate  = parseFloat(document.getElementById('stockout-rate').value)  || eurRate;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const newStock   = p.stock - qty;
    const newSales7d = (p.sales7d || 0) + qty;
    const newStatus  = calcStatus({ ...p, stock: newStock });
    const upd = { stock: newStock, sales7d: newSales7d, status: newStatus };
    if (salePrice > 0) { upd.sale_price = salePrice; upd.sale_rate = saleRate; }
    const { error } = await sb.from('products').update(upd).eq('id', p.id);
    if (error) throw error;
    const prevStock = p.stock;
    p.stock = newStock; p.sales7d = newSales7d; p.status = newStatus;
    if (salePrice > 0) { p.price = salePrice; p.saleRate = saleRate; }
    if (prevStock > (p.minStock || 0) && newStock <= (p.minStock || 0)) {
      triggerLowStockAlert(p);
    }
    const noteStr = salePrice > 0
      ? `Satış fiyatı: ${fmtEUR(salePrice)} (₺ eşd.: ${fmtTL(salePrice * saleRate)})`
      : '';
    logMovement({ productId: p.id, productName: p.name, type: 'sale', quantity: qty, oldStock: prevStock, newStock, newPrice: salePrice, notes: noteStr });
    closeStockOutModal(); renderAll();
    toast(`${qty} adet stoktan düşüldü`);
  } catch (err) {
    errEl.textContent = 'Hata: ' + friendlyError(err);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/* ===== LOW STOCK ALERT ===== */
async function triggerLowStockAlert(product) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token || SUPABASE_KEY;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-low-stock-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({
        productName:    product.name,
        productBarcode: product.barcode || '',
        newStock:       product.stock,
        minStock:       product.minStock || 0,
        depo:           product.depo || ''
      })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('Low stock alert failed:', resp.status, txt);
    }
  } catch (err) {
    console.warn('Low stock alert error:', err);
  }
}

/* ===== DELETE ===== */
export function askDelete(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  showConfirm(`"${p.name}" silinecek`, 'Bu işlem geri alınamaz. Ürün kalıcı olarak silinecek.', () => {
    const row = document.querySelector(`#table-body tr [onclick="askDelete(${id})"]`)?.closest('tr');
    if (row) {
      row.classList.add('deleting');
      setTimeout(() => doDelete(id), 380);
    } else {
      doDelete(id);
    }
  });
}
async function doDelete(id) {
  try {
    const p = products.find(x => x.id === id);
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) throw error;
    logMovement({ productId: id, productName: p?.name || '', type: 'delete', oldStock: p?.stock || 0, newStock: 0 });
    products = products.filter(x => x.id !== id);
    totalCount = Math.max(0, totalCount - 1);
    renderAll();
    toast('Ürün silindi');
  } catch (err) {
    toast('Silme hatası: ' + friendlyError(err), 'error');
  }
}

/* ===== KATEGORİ YÖNETİMİ ===== */
export function openCategoryModal() {
  if (!canDo('manage_categories')) { toast('Bu işlem için yetkiniz yok', 'error'); return; }
  editingCategoryName = null;
  document.getElementById('category-error').textContent = '';
  document.getElementById('new-category-name').value = '';
  renderCategoryList();
  document.getElementById('category-modal').classList.add('visible');
  lockBodyScroll();
  setTimeout(() => document.getElementById('new-category-name').focus(), 100);
}
export function closeCategoryModal() {
  document.getElementById('category-modal').classList.remove('visible');
  unlockBodyScroll();
  editingCategoryName = null;
}
export function closeCategoryOnOverlay(e) { if (e.target.id === 'category-modal') closeCategoryModal(); }

function renderCategoryList() {
  const wrap = document.getElementById('category-list');
  if (categories.length === 0) {
    wrap.innerHTML = `<div class="category-empty">Henüz kategori yok. Aşağıdan ilk kategorini ekle.</div>`;
    return;
  }
  wrap.innerHTML = categories.map((c, i) => {
    const count = products.filter(p => p.category === c.name).length;
    const isEditing = editingCategoryName === c.name;
    return `
      <div class="category-row" data-idx="${i}">
        <span class="category-swatch" data-act="color" style="background:${c.color}" title="Renk değiştir"></span>
        ${isEditing
          ? `<input class="category-name-input" data-act="rename-input" type="text" value="${escapeHtml(c.name)}" maxlength="40">`
          : `<span class="category-name">${escapeHtml(c.name)}</span>`}
        <span class="category-count">${count} ürün</span>
        <div class="category-actions">
          <button class="icon-btn" data-act="edit" title="Düzenle">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="icon-btn danger" data-act="delete" title="Sil">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
          </button>
        </div>
      </div>`;
  }).join('');
  if (editingCategoryName) {
    const inp = wrap.querySelector('.category-name-input');
    if (inp) { inp.focus(); inp.select(); }
  }
}

function handleCategoryListClick(e) {
  const row = e.target.closest('.category-row');
  if (!row) return;
  const idx = parseInt(row.dataset.idx);
  const cat = categories[idx];
  if (!cat) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'color')  cycleCategoryColor(cat.name);
  else if (act === 'edit')   startEditCategory(cat.name);
  else if (act === 'delete') askDeleteCategory(cat.name);
}
function handleCategoryListKeydown(e) {
  if (!e.target.matches('[data-act="rename-input"]')) return;
  const row = e.target.closest('.category-row');
  const idx = parseInt(row?.dataset.idx);
  const cat = categories[idx];
  if (!cat) return;
  if (e.key === 'Enter')  { e.preventDefault(); commitCategoryRename(cat.name, e.target.value); }
  else if (e.key === 'Escape') { editingCategoryName = null; renderCategoryList(); }
}
function handleCategoryListBlur(e) {
  if (!e.target.matches('[data-act="rename-input"]')) return;
  const row = e.target.closest('.category-row');
  const idx = parseInt(row?.dataset.idx);
  const cat = categories[idx];
  if (!cat) return;
  commitCategoryRename(cat.name, e.target.value);
}

export async function submitNewCategory(e) {
  e.preventDefault();
  const errEl = document.getElementById('category-error');
  errEl.textContent = '';
  const name = document.getElementById('new-category-name').value.trim();
  if (!name) { errEl.textContent = 'Kategori adı boş olamaz.'; return; }
  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    errEl.textContent = 'Bu isimde bir kategori zaten var.'; return;
  }
  try {
    const color = pickNextColor();
    const { error } = await sb.from('categories').insert({ name, color });
    if (error) throw error;
    categories.push({ name, color });
    document.getElementById('new-category-name').value = '';
    renderCategoryList(); populateFilters();
    toast('Kategori eklendi');
  } catch (err) {
    errEl.textContent = 'Hata: ' + friendlyError(err);
  }
}

function startEditCategory(name) {
  editingCategoryName = name;
  document.getElementById('category-error').textContent = '';
  renderCategoryList();
}
async function commitCategoryRename(oldName, rawNew) {
  const newName = (rawNew || '').trim();
  const errEl = document.getElementById('category-error');
  errEl.textContent = '';
  if (!newName) { errEl.textContent = 'Kategori adı boş olamaz.'; editingCategoryName = null; renderCategoryList(); return; }
  if (newName === oldName) { editingCategoryName = null; renderCategoryList(); return; }
  if (categories.some(c => c.name.toLowerCase() === newName.toLowerCase() && c.name !== oldName)) {
    errEl.textContent = 'Bu isimde bir kategori zaten var.'; return;
  }
  try {
    const { error: catErr } = await sb.from('categories').update({ name: newName }).eq('name', oldName);
    if (catErr) throw catErr;
    const affectedIds = products.filter(p => p.category === oldName).map(p => p.id);
    if (affectedIds.length > 0) {
      const { error: prodErr } = await sb.from('products').update({ category: newName }).eq('category', oldName);
      if (prodErr) throw prodErr;
      products.forEach(p => { if (p.category === oldName) p.category = newName; });
    }
    const cat = categories.find(c => c.name === oldName);
    if (cat) cat.name = newName;
    editingCategoryName = null;
    await loadData(currentPage);
    renderCategoryList(); populateFilters(); renderAll();
    toast('Kategori güncellendi');
  } catch (err) {
    errEl.textContent = 'Hata: ' + friendlyError(err);
  }
}
function askDeleteCategory(name) {
  const count = products.filter(p => p.category === name).length;
  if (count > 0) {
    document.getElementById('category-error').textContent =
      `Önce bu kategorideki ${count} ürünü başka kategoriye taşı veya sil.`;
    return;
  }
  showConfirm(`"${name}" silinecek`, 'Bu kategori kalıcı olarak silinecek.', async () => {
    try {
      const { error } = await sb.from('categories').delete().eq('name', name);
      if (error) throw error;
      categories = categories.filter(c => c.name !== name);
      renderCategoryList(); populateFilters(); renderAll();
      toast('Kategori silindi');
    } catch (err) {
      toast('Hata: ' + friendlyError(err), 'error');
    }
  });
}
async function cycleCategoryColor(name) {
  const cat = categories.find(c => c.name === name);
  if (!cat) return;
  const idx      = CATEGORY_PALETTE.indexOf(cat.color);
  const newColor = CATEGORY_PALETTE[(idx + 1) % CATEGORY_PALETTE.length];
  try {
    const { error } = await sb.from('categories').update({ color: newColor }).eq('name', name);
    if (error) throw error;
    cat.color = newColor;
    renderCategoryList(); renderAll();
  } catch (err) {
    toast('Hata: ' + friendlyError(err), 'error');
  }
}

/* ===== CSV EXPORT ===== */
const EXPORT_FILTER_SUFFIX = {
  '':             'tum-urunler',
  active:         'aktif',
  low_stock:      'dusuk-stok',
  out_of_stock:   'tukendi',
};

export function openExportModal() {
  document.getElementById('export-modal').classList.add('visible');
  lockBodyScroll();
}
export function closeExportModal() {
  document.getElementById('export-modal').classList.remove('visible');
  unlockBodyScroll();
}
export function closeExportOnOverlay(e) { if (e.target.id === 'export-modal') closeExportModal(); }

export async function exportCSV(status = '') {
  const categoryEl = document.getElementById('export-category');
  const category = categoryEl ? categoryEl.value : '';
  closeExportModal();
  toast('Excel hazırlanıyor…');
  try {
    const rows = await fetchAllProductsForExport(status, category);
    if (!rows.length) { toast('Bu filtrede ürün bulunamadı', 'warn'); return; }
    const suffix = category
      ? `${EXPORT_FILTER_SUFFIX[status] ?? 'tum-urunler'}-${slugify(category)}`
      : (EXPORT_FILTER_SUFFIX[status] ?? 'tum-urunler');
    downloadProductsCSV(rows, suffix);
  } catch (err) {
    toast('Dışa aktarma hatası: ' + friendlyError(err), 'error');
  }
}

function slugify(s) {
  return String(s).trim().toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function fetchAllProductsForExport(status, category = '') {
  const CHUNK = 1000;
  let from = 0, all = [];
  while (true) {
    let q = sb.from('products').select('*').order('created_at', { ascending: false });
    if (status === 'active') q = q.or('status.eq.active,status.eq.low_stock,status.is.null');
    else if (status)         q = q.eq('status', status);
    if (category)            q = q.eq('category', category);
    q = q.range(from, from + CHUNK - 1);
    const { data, error } = await q;
    if (error) throw error;
    all = all.concat((data || []).map(dbToProduct));
    if (!data || data.length < CHUNK) break;
    from += CHUNK;
  }
  return all;
}

function downloadProductsCSV(rows, suffix) {
  const headers = ['ID', 'Ürün Adı', 'Barkod No', 'Kategori', 'Depo', 'Fiyat (€)', 'Maliyet (€)', 'Kar Marji (%)', 'Stok', 'Min. Stok', '7g Satış', 'Stok Değeri', 'Durum'];
  const csvRows = rows.map(p => {
    const margin = p.price > 0 ? ((p.price - p.cost) / p.price * 100).toFixed(2) : 0;
    return [
      p.id, p.name, p.barcode, p.category, p.depo || '',
      p.price.toFixed(2).replace('.', ','), p.cost.toFixed(2).replace('.', ','),
      String(margin).replace('.', ','),
      p.stock, p.minStock, p.sales7d,
      (p.stock * p.cost).toFixed(2).replace('.', ','),
      statusLabel(calcStatus(p))
    ];
  });
  const csv = [headers, ...csvRows].map(row =>
    row.map(cell => {
      const s = String(cell);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';')
  ).join('\r\n');
  const BOM  = '﻿';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `stok-raporu-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`${rows.length} ürün indirildi`);
}

/* ===== EUR/TRY KURU ===== */
export async function fetchAndUpdateEurRate() {
  const icon  = document.getElementById('eur-refresh-icon');
  const valEl = document.getElementById('eur-rate-val');
  const dateEl = document.getElementById('eur-rate-date');
  if (icon) icon.classList.add('spinning');

  async function trySource(url, extract) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return extract(await res.json());
    } finally {
      clearTimeout(tid);
    }
  }
  try {
    let result = null;
    try {
      result = await trySource(
        'https://api.frankfurter.dev/v1/latest?from=EUR&to=TRY',
        j => ({ rate: j.rates?.TRY, date: j.date })
      );
    } catch (_) {
      result = await trySource(
        'https://open.er-api.com/v6/latest/EUR',
        j => ({ rate: j.rates?.TRY, date: j.time_last_update_utc?.slice(0, 10) })
      );
    }
    if (result?.rate && result.rate > 0) {
      eurRate = result.rate;
      localStorage.setItem(EUR_RATE_KEY, String(eurRate));
      if (valEl)  valEl.textContent  = eurRate.toFixed(2);
      if (dateEl) dateEl.textContent = result.date || '';
      renderAll();
    } else {
      throw new Error('Geçersiz kur verisi');
    }
  } catch (err) {
    console.warn('EUR kuru alınamadı:', err);
    if (valEl)  valEl.textContent  = eurRate.toFixed(2);
    if (dateEl) dateEl.textContent = 'önbellek';
  } finally {
    if (icon) icon.classList.remove('spinning');
  }
}

/* ===== INIT ===== */
function init() {
  const statusSel = document.getElementById('filter-status');
  if (statusSel) statusSel.value = pageStatusFilter;

  const valEl = document.getElementById('eur-rate-val');
  if (valEl) {
    valEl.textContent = eurRate.toFixed(2);
    const cached = localStorage.getItem(EUR_RATE_KEY);
    const dateEl = document.getElementById('eur-rate-date');
    if (cached && dateEl) dateEl.textContent = 'önbellek';
  }
  document.getElementById('search-input').addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(async () => {
      pageSearch = e.target.value.trim();
      await loadData(0);
      renderAll();
    }, 400);
  });
  document.getElementById('filter-category').addEventListener('change', async e => {
    pageCatFilter = e.target.value;
    await loadData(0);
    renderAll();
  });
  document.getElementById('filter-status').addEventListener('change', async e => {
    pageStatusFilter = e.target.value;
    await loadData(0);
    renderAll();
  });
  const catList = document.getElementById('category-list');
  catList.addEventListener('click', handleCategoryListClick);
  catList.addEventListener('keydown', handleCategoryListKeydown);
  catList.addEventListener('blur', handleCategoryListBlur, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDropdowns();
      closeProductModal();
      closeConfirmModal();
      closeStockOutModal();
      closeCategoryModal();
      closePermModal();
      closeImportModal();
      closeHistoryModal();
    }
  });
  document.getElementById('invoice-file-in')?.addEventListener('change',   e => handleInvoiceUpload(e, 'in'));
  document.getElementById('invoice-file-sale')?.addEventListener('change', e => handleInvoiceUpload(e, 'sale'));
  document.addEventListener('click', e => { if (!e.target.closest('.dropdown')) closeDropdowns(); });
}

/* ===== DROPDOWN ===== */
function toggleDropdown(id) {
  document.querySelectorAll('.dropdown').forEach(d => {
    if (d.id !== `dropdown-${id}`) d.classList.remove('open');
  });
  const dropdown = document.getElementById(`dropdown-${id}`);
  dropdown?.classList.toggle('open');
  if (dropdown?.classList.contains('open')) clampDropdownToViewport(dropdown);
}
function closeDropdowns() {
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
}
// Dar ekranlarda dropdown-menu (right:0 ankajlı) viewport'un solundan taşabiliyor — açılınca ölçüp düzelt.
function clampDropdownToViewport(dropdown) {
  const menu = dropdown.querySelector('.dropdown-menu');
  if (!menu) return;
  menu.style.left = '';
  const rect = menu.getBoundingClientRect();
  const margin = 8;
  if (rect.left < margin) {
    menu.style.right = 'auto';
    menu.style.left = `${margin - dropdown.getBoundingClientRect().left}px`;
  }
}

/* ===== PAGINATION BRIDGE ===== */
window.goPage = async function(page) {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  if (page < 0 || page >= totalPages) return;
  await loadData(page, false);
  renderAll();
  document.querySelector('.table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ===== LOG MOVEMENT ===== */
async function logMovement({ productId, productName, type, quantity = 0, oldStock = null, newStock = null, oldPrice = null, newPrice = null, oldCost = null, newCost = null, notes = '' }) {
  if (!currentUser) return;
  try {
    await sb.from('stock_movements').insert({
      product_id:   productId || null,
      product_name: productName,
      user_id:      currentUser.id,
      user_email:   currentUser.email,
      type,
      quantity,
      old_stock:    oldStock,
      new_stock:    newStock,
      old_price:    oldPrice,
      new_price:    newPrice,
      old_cost:     oldCost,
      new_cost:     newCost,
      notes
    });
  } catch (e) {
    console.warn('logMovement failed:', e);
  }
}

/* ===== E-FATURA PDF OKUMA ===== */
async function handleInvoiceUpload(e, mode) {
  if (!canDo('make_sales')) { toast('Bu işlem için yetkiniz yok', 'error'); return; }
  const files = Array.from(e.target.files);
  e.target.value = '';
  if (!files.length) { toast('Lütfen bir dosya yükleyin', 'error'); return; }

  const textEl    = document.getElementById(mode === 'in' ? 'invoice-in-text'  : 'invoice-sale-text');
  const labelEl   = document.getElementById(mode === 'in' ? 'invoice-in-label' : 'invoice-sale-label');
  const invoiceType = mode === 'in' ? 'alis' : 'satis';

  if (textEl)  textEl.textContent = '⏳ Yapay zeka faturayı okuyor ve stokları güncelliyor...';
  if (labelEl) labelEl.style.pointerEvents = 'none';

  let totalProcessed = 0, totalErrors = 0;

  try {
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      try {
        if (ext === 'xml') {
          const xmlText = await file.text();
          const items = extractInvoiceItemsFromXml(xmlText);
          const { updated, notFound } = await applyInvoiceStock(items, mode);
          totalProcessed += updated; totalErrors += notFound;
          continue;
        }
        if (ext === 'zip') {
          const { default: JSZip } = await import('https://esm.sh/jszip@3.10.1');
          const zip = await JSZip.loadAsync(file);
          for (const [entryName, entry] of Object.entries(zip.files)) {
            if (!entryName.toLowerCase().endsWith('.xml')) continue;
            const xmlText = await entry.async('text');
            if (!xmlText.includes('InvoiceLine')) continue;
            const items = extractInvoiceItemsFromXml(xmlText);
            const { updated, notFound } = await applyInvoiceStock(items, mode);
            totalProcessed += updated; totalErrors += notFound;
            break;
          }
          continue;
        }
        // PDF → Supabase Edge Function (2-dakika timeout)
        const base64 = await fileToBase64(file);
        const session = (await sb.auth.getSession()).data.session;
        const token = session?.access_token || SUPABASE_KEY;
        const fetchRes = await fetch(`${SUPABASE_URL}/functions/v1/parse-invoice-pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_KEY,
          },
          body: JSON.stringify({ pdf_base64: base64, invoice_type: invoiceType }),
        });
        const result = await fetchRes.json();
        if (!fetchRes.ok || result?.error) throw new Error(result?.error || `HTTP ${fetchRes.status}`);
        totalProcessed += result.processed || 0;
        totalErrors    += (result.total || 0) - (result.processed || 0);
        for (const item of (result.items || [])) {
          logMovement({
            productId:   item.id,
            productName: item.name,
            type:        mode === 'in' ? 'in' : 'sale',
            quantity:    item.qty,
            oldStock:    item.old_stock,
            newStock:    item.new_stock,
            notes:       'Fatura girişi',
          });
        }
      } catch (fileErr) {
        console.warn(`[INVOICE] ${file.name} işlenemedi:`, fileErr.message);
        totalErrors++;
      }
    }

    const verb    = mode === 'in' ? 'stoka eklendi' : 'stoktan düşüldü';
    const errInfo = totalErrors > 0 ? ` · ${totalErrors} hata` : '';
    toast(`${totalProcessed} kalem ${verb}${errInfo}`, totalProcessed > 0 ? 'success' : 'error');
    await loadData(currentPage);
    renderAll();
  } catch (err) {
    console.error('Invoice upload error:', err);
    toast('Fatura işlenemedi: ' + friendlyError(err), 'error');
  } finally {
    if (textEl)  textEl.textContent         = mode === 'in' ? 'Alım Faturası' : 'Satış Faturası';
    if (labelEl) labelEl.style.pointerEvents = '';
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function extractInvoiceItemsFromXml(xmlText) {
  const items = [];
  const lineBlocks = xmlText.match(/<cac:InvoiceLine[\s\S]*?<\/cac:InvoiceLine>/g) || [];
  for (const block of lineBlocks) {
    const idMatch   = block.match(/<cac:SellersItemIdentification>[\s\S]*?<cbc:ID>(\d{7})<\/cbc:ID>/);
    const nameMatch = block.match(/<cbc:Name>([^<]+)<\/cbc:Name>/);
    const barcode   = idMatch?.[1] ?? '';
    const name      = nameMatch?.[1]?.trim() ?? '';
    if (!barcode && !name) continue;
    const qtyMatch  = block.match(/<cbc:InvoicedQuantity[^>]*>([\d.,]+)<\/cbc:InvoicedQuantity>/);
    if (!qtyMatch) continue;
    const qty = Math.round(parseFloat(qtyMatch[1].replace(',', '.')));
    if (qty <= 0 || qty > 99999) continue;
    const key      = barcode || name;
    const existing = items.find(x => (x.barcode || x.name) === key);
    if (existing) existing.qty += qty;
    else items.push({ barcode, name, qty });
  }
  return items;
}


async function applyInvoiceStock(items, mode) {
  let updated = 0, notFound = 0;
  const isAlim = mode === 'in';
  for (const { barcode = '', name = '', qty } of items) {
    const { data, error } = await sb.rpc('handle_invoice_stock', {
      p_barcode: (barcode || name || '').trim(),
      p_name:    (name || barcode || '').trim(),
      p_qty:     parseInt(qty),
      p_type:    isAlim ? 0 : 1,
    });
    if (error || !data) { notFound++; continue; }
    // handle_invoice_stock artık kendi audit satırını yazıyor (auth.uid() ile) —
    // burada tekrar logMovement çağırmak çift kayıt oluşturur.
    updated++;
  }
  return { updated, notFound };
}

/* ===== CSV IMPORT ===== */
function openImportModal() {
  if (!canDo('add_products')) { toast('Bu işlem için yetkiniz yok', 'error'); return; }
  importRows = [];
  document.getElementById('import-step-1').style.display = '';
  document.getElementById('import-step-2').style.display = 'none';
  document.getElementById('import-step-3').style.display = 'none';
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-error').textContent = '';
  document.getElementById('import-modal').classList.add('visible');
  lockBodyScroll();
}
function closeImportModal() {
  document.getElementById('import-modal').classList.remove('visible');
  unlockBodyScroll();
  importRows = [];
}
function closeImportOnOverlay(e) { if (e.target.id === 'import-modal') closeImportModal(); }

function goImportStep1() {
  document.getElementById('import-step-2').style.display = 'none';
  document.getElementById('import-step-1').style.display = '';
  document.getElementById('import-error').textContent = '';
  document.getElementById('import-file-input').value = '';
}

function downloadImportTemplate() {
  const headers = ['Ürün Adı','Barkod No','Kategori','Depo','Satış Fiyatı (€)','Alış Fiyatı (€)','Stok','Min. Stok','7g Satış'];
  const example = ['Örnek Ürün','BRK-001','Elektronik','A Rafı','29.99','15.00','50','10','5'];
  const csv = [headers, example].map(row =>
    row.map(c => /[",;\n]/.test(String(c)) ? `"${String(c).replace(/"/g,'""')}"` : String(c)).join(';')
  ).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'stok-import-sablonu.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('Şablon indirildi');
}

function _normalizeHdr(h) {
  return String(h).toLowerCase().trim().replace(/\s+/g,' ').replace(/[()€₺%*]/g,'').trim();
}

function _detectMapping(headers) {
  const norm = headers.map(_normalizeHdr);
  const map = {};
  for (const [field, aliases] of Object.entries(IMPORT_COL_MAP)) {
    for (let i = 0; i < norm.length; i++) {
      if (aliases.includes(norm[i])) {
        if (!(field in map)) { map[field] = i; break; }
      }
    }
  }
  return map;
}

function handleImportFileDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processImportFile(file);
}
function handleImportFileSelect(e) {
  const file = e.target.files[0];
  if (file) processImportFile(file);
}

async function processImportFile(file) {
  const errEl = document.getElementById('import-error');
  errEl.textContent = '';
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx','xls','csv'].includes(ext)) {
    errEl.textContent = 'Sadece .xlsx, .xls veya .csv desteklenir.'; return;
  }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (raw.length < 2) { errEl.textContent = 'Dosya boş veya yalnızca başlık satırı var.'; return; }

    const headers = raw[0].map(h => String(h));
    const colMap  = _detectMapping(headers);

    if (!('name' in colMap)) {
      errEl.textContent = '"Ürün Adı" sütunu bulunamadı. Şablonu indirip doğru başlıklarla doldurun.';
      return;
    }

    const get    = (row, field) => colMap[field] !== undefined ? String(row[colMap[field]] ?? '').trim() : '';
    const getNum = (row, field) => { const v = get(row, field).replace(',', '.'); return parseFloat(v) || 0; };

    const rows = raw.slice(1)
      .filter(row => row.some(c => String(c).trim() !== ''))
      .map(row => {
        const name = get(row, 'name');
        if (!name) return null;
        return {
          name,
          barcode:  get(row, 'barcode'),
          category: get(row, 'category') || 'Genel',
          depo:     get(row, 'depo'),
          price:    getNum(row, 'price'),
          cost:     getNum(row, 'cost'),
          stock:    Math.max(0, Math.round(getNum(row, 'stock'))),
          minStock: Math.max(0, Math.round(getNum(row, 'minStock'))),
          sales7d:  Math.max(0, Math.round(getNum(row, 'sales7d'))),
        };
      })
      .filter(Boolean);

    if (rows.length === 0) { errEl.textContent = 'Geçerli ürün satırı bulunamadı.'; return; }

    importRows = rows;
    renderImportPreview(rows);
    document.getElementById('import-step-1').style.display = 'none';
    document.getElementById('import-step-2').style.display = '';
  } catch (err) {
    errEl.textContent = 'Dosya okunamadı: ' + friendlyError(err);
  }
}

function _findExisting(row) {
  if (row.barcode) {
    const m = products.find(p => p.barcode && p.barcode.toLowerCase() === row.barcode.toLowerCase());
    if (m) return m;
  }
  return products.find(p => p.name.toLowerCase() === row.name.toLowerCase()) || null;
}

function renderImportPreview(rows) {
  let newCount = 0, updateCount = 0;
  rows.forEach(r => { _findExisting(r) ? updateCount++ : newCount++; });
  document.getElementById('import-count-new').textContent    = newCount;
  document.getElementById('import-count-update').textContent = updateCount;
  document.getElementById('import-count-total').textContent  = rows.length;
  const tbody   = document.getElementById('import-preview-body');
  const preview = rows.slice(0, 25);
  tbody.innerHTML = preview.map(row => {
    const existing = _findExisting(row);
    const actionHtml = existing
      ? `<span style="color:var(--warning);font-weight:500">+${row.stock} stok</span>`
      : `<span style="color:var(--success);font-weight:500">Yeni</span>`;
    return `<tr>
      <td>${escapeHtml(row.name)}</td>
      <td style="color:var(--text-secondary)">${escapeHtml(row.barcode || '—')}</td>
      <td>${escapeHtml(row.category)}</td>
      <td style="text-align:right">${row.price > 0 ? fmtEUR(row.price) : '—'}</td>
      <td style="text-align:right">${row.cost > 0 ? fmtEUR(row.cost) : '—'}</td>
      <td style="text-align:right;font-weight:600">${row.stock}</td>
      <td>${actionHtml}</td>
    </tr>`;
  }).join('');
  if (rows.length > 25) {
    tbody.innerHTML += `<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:12px 10px">… ve ${rows.length - 25} satır daha</td></tr>`;
  }
}

async function executeImport() {
  if (importRows.length === 0) return;
  const btn   = document.getElementById('import-confirm-btn');
  const errEl = document.getElementById('import-error-2');
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'İçe Aktarılıyor…';
  let newCount = 0, updateCount = 0, skipCount = 0;
  try {
    const neededCats = [...new Set(importRows.map(r => r.category).filter(Boolean))];
    for (const catName of neededCats) {
      if (!categories.some(c => c.name.toLowerCase() === catName.toLowerCase())) {
        const color = pickNextColor();
        const { error } = await sb.from('categories').insert({ name: catName, color });
        if (!error) categories.push({ name: catName, color });
      }
    }
    const toInsert = [];
    const seenKeys = new Set();
    for (const row of importRows) {
      try {
        const existing = _findExisting(row);
        if (existing) {
          const oldExStock = existing.stock;
          const newStock  = existing.stock + row.stock;
          const newStatus = calcStatus({ ...existing, stock: newStock });
          const upd = { stock: newStock, status: newStatus };
          if (row.cost > 0)  upd.cost_price     = row.cost;
          if (row.price > 0) upd.sale_price      = row.price;
          if (row.depo)      upd.warehouse_info  = row.depo;
          const { error } = await sb.from('products').update(upd).eq('id', existing.id);
          if (error) throw error;
          existing.stock = newStock; existing.status = newStatus;
          if (row.cost > 0)  existing.cost  = row.cost;
          if (row.price > 0) existing.price = row.price;
          if (row.depo)      existing.depo  = row.depo;
          updateCount++;
          logMovement({ productId: existing.id, productName: existing.name, type: 'import', quantity: row.stock, oldStock: oldExStock, newStock });
        } else {
          const key = (row.barcode || '').toLowerCase() || row.name.toLowerCase();
          if (seenKeys.has(key)) {
            const queued = toInsert.find(r => (r.barcode?.toLowerCase() || r.name.toLowerCase()) === key);
            if (queued) queued.stock += row.stock;
          } else {
            seenKeys.add(key);
            toInsert.push({
              name:           row.name,
              barcode:        row.barcode || null,
              category:       row.category,
              cost_price:     row.cost,
              sale_price:     row.price,
              stock:          row.stock,
              min_stock:      row.minStock,
              sales7d:        row.sales7d,
              status:         calcStatus({ stock: row.stock, minStock: row.minStock }),
              warehouse_info: row.depo || null,
              purchase_rate:  eurRate,
            });
          }
        }
      } catch (_) { skipCount++; }
    }
    const CHUNK = 50;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { data, error } = await sb.from('products').insert(chunk).select();
      if (error) throw error;
      const newProds = (data || []).map(dbToProduct);
      products.push(...newProds);
      newCount += chunk.length;
      for (const np of newProds) {
        logMovement({ productId: np.id, productName: np.name, type: 'import', quantity: np.stock, oldStock: 0, newStock: np.stock, newPrice: np.price, newCost: np.cost });
      }
    }
    populateFilters();
    renderAll();
    document.getElementById('import-step-2').style.display = 'none';
    document.getElementById('import-step-3').style.display = '';
    document.getElementById('import-result-new').textContent    = newCount;
    document.getElementById('import-result-update').textContent = updateCount;
    document.getElementById('import-result-error').textContent  = skipCount;
    const errRow = document.getElementById('import-result-error-row');
    if (errRow) errRow.style.color = skipCount > 0 ? 'var(--error)' : 'var(--text-secondary)';
  } catch (err) {
    errEl.textContent = 'İçe aktarma hatası: ' + friendlyError(err);
  } finally {
    btn.disabled = false; btn.textContent = 'İçe Aktar';
  }
}

/* ===== STOK HAREKET GEÇMİŞİ ===== */
async function openHistoryModal(productId = null) {
  if (!canDo('view_history') && !isAdmin()) return;
  historyProductId = productId || null;
  const titleEl = document.getElementById('history-modal-title');
  if (historyProductId) {
    const p = products.find(x => x.id === historyProductId);
    if (titleEl && p) titleEl.textContent = `Hareket Geçmişi — ${p.name}`;
  } else {
    if (titleEl) titleEl.textContent = 'Stok Hareket Geçmişi';
  }
  document.getElementById('history-filter-type').value = '';
  document.getElementById('history-filter-search').value = '';
  document.getElementById('history-modal').classList.add('visible');
  lockBodyScroll();
  await loadHistory();
}
function closeHistoryModal() {
  document.getElementById('history-modal').classList.remove('visible');
  unlockBodyScroll();
  historyProductId = null;
  historyRows = [];
}
function closeHistoryOnOverlay(e) { if (e.target.id === 'history-modal') closeHistoryModal(); }

async function loadHistory() {
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary)">Yükleniyor…</td></tr>';
  try {
    let q = sb.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(200);
    if (historyProductId) q = q.eq('product_id', historyProductId);
    const { data, error } = await q;
    if (error) throw error;
    historyRows = data || [];
    renderHistory();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--error)">${escapeHtml(friendlyError(e))}</td></tr>`;
  }
}

function renderHistory() {
  const tbody = document.getElementById('history-tbody');
  const typeFilter = document.getElementById('history-filter-type').value;
  const searchQ    = document.getElementById('history-filter-search').value.toLowerCase().trim();
  let rows = historyRows;
  if (typeFilter) rows = rows.filter(r => r.type === typeFilter);
  if (searchQ)    rows = rows.filter(r => (r.product_name || '').toLowerCase().includes(searchQ));
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary)">Hareket kaydı bulunamadı</td></tr>';
    return;
  }
  const TYPE_META = {
    create:       { label: 'Oluşturuldu',     color: 'var(--success)' },
    delete:       { label: 'Silindi',          color: 'var(--error)' },
    in:           { label: '↑ Stok Girişi',    color: 'var(--success)' },
    out:          { label: '↓ Stok Çıkışı',    color: 'var(--error)' },
    sale:         { label: '🛒 Satış',          color: '#f97316' },
    bileme_kaplama: { label: '🔧 Bileme/Kaplama', color: '#a855f7' },
    edit:         { label: 'Düzenlendi',        color: 'var(--accent)' },
    price_change: { label: 'Fiyat Değişti',     color: 'var(--warning)' },
    import:       { label: '↑ İçe Aktarıldı',  color: '#8b5cf6' },
    konsinye_out:    { label: '📦 Konsinyeye Çıktı',  color: '#0ea5e9' },
    konsinye_return: { label: '↩️ Konsinyeden İade', color: 'var(--success)' },
    konsinye_sale:   { label: '🧾 Konsinye Fatura',   color: '#f97316' },
  };
  tbody.innerHTML = rows.map(r => {
    const meta = TYPE_META[r.type] || { label: r.type, color: 'var(--text-secondary)' };
    const d = new Date(r.created_at);
    const dateStr = d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    let stockHtml = '—';
    if (r.old_stock !== null && r.new_stock !== null) {
      const delta = r.new_stock - r.old_stock;
      const sign = delta >= 0 ? '+' : '';
      const col = delta >= 0 ? 'var(--success)' : 'var(--error)';
      stockHtml = `<span style="color:${col};font-weight:600">${sign}${delta}</span> <span style="color:var(--text-secondary);font-size:11px">(${r.old_stock}→${r.new_stock})</span>`;
    } else if (r.quantity) {
      stockHtml = `<span style="color:var(--text-secondary)">${r.quantity} adet</span>`;
    }
    let detailHtml = escapeHtml(r.notes || '');
    if (r.old_price !== null && r.new_price !== null && r.old_price !== r.new_price) {
      detailHtml = `${fmtEUR(r.old_price)} → ${fmtEUR(r.new_price)}`;
    } else if (!detailHtml && r.new_price) {
      detailHtml = fmtEUR(r.new_price);
    }
    return `<tr>
      <td style="white-space:nowrap;color:var(--text-secondary);font-size:11px">${dateStr}</td>
      <td style="font-weight:500">${escapeHtml(r.product_name || '—')}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${escapeHtml(r.user_email || '—')}</td>
      <td><span style="color:${meta.color};font-size:12px;font-weight:500">${meta.label}</span></td>
      <td>${stockHtml}</td>
      <td style="font-size:11px;color:var(--text-secondary);max-width:200px;white-space:normal;word-break:break-word">${detailHtml || '—'}</td>
    </tr>`;
  }).join('');
}


/* ===== WINDOW BRIDGES ===== */
window.toggleDropdown            = toggleDropdown;
window.closeDropdowns            = closeDropdowns;
window.loadData                  = loadData;
window.populateFilters           = populateFilters;
window.renderAll                 = renderAll;
window.fetchAndUpdateEurRate     = fetchAndUpdateEurRate;
window.openAddModal              = openAddModal;
window.openEditModal             = openEditModal;
window.closeProductModal         = closeProductModal;
window.closeProductModalOnOverlay = closeProductModalOnOverlay;
window.submitProductForm         = submitProductForm;
window.openStockOutModal         = openStockOutModal;
window.closeStockOutModal        = closeStockOutModal;
window.closeStockOutOnOverlay    = closeStockOutOnOverlay;
window.updateStockOutProfit      = updateStockOutProfit;
window.submitStockOut            = submitStockOut;
window.askDelete                 = askDelete;
window.openCategoryModal         = openCategoryModal;
window.closeCategoryModal        = closeCategoryModal;
window.closeCategoryOnOverlay    = closeCategoryOnOverlay;
window.submitNewCategory         = submitNewCategory;
window.exportCSV                 = exportCSV;
window.openExportModal           = openExportModal;
window.closeExportModal          = closeExportModal;
window.closeExportOnOverlay      = closeExportOnOverlay;
window.openImportModal           = openImportModal;
window.closeImportModal          = closeImportModal;
window.closeImportOnOverlay      = closeImportOnOverlay;
window.goImportStep1             = goImportStep1;
window.downloadImportTemplate    = downloadImportTemplate;
window.handleImportFileDrop      = handleImportFileDrop;
window.handleImportFileSelect    = handleImportFileSelect;
window.executeImport             = executeImport;
window.openHistoryModal          = openHistoryModal;
window.closeHistoryModal         = closeHistoryModal;
window.closeHistoryOnOverlay     = closeHistoryOnOverlay;
window.renderHistory             = renderHistory;

init();
bootstrapAuth();
