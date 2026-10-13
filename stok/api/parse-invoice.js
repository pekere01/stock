// Fatura PDF ayrıştırma 2026-10-13'te devre dışı bırakıldı (otomasyon yapıyor; yetki kontrolü eksikti).
// Orijinal kod git geçmişinde (bu dosyanın bir önceki sürümü). Geri açmadan önce çağıranın
// add_products/make_sales iznini sunucuda kontrol et.
module.exports = function handler(req, res) {
  res.status(410).json({ error: 'Fatura yükleme devre dışı' });
};
