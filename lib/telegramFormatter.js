// lib/telegramFormatter.js
// Beautiful message formatter for Telegram Bot responses
// Uses HTML parse mode for rich formatting

// ═══════════════════════════════════════════════════════════════
// NUMBER & CURRENCY FORMATTING
// ═══════════════════════════════════════════════════════════════

/**
 * Format number with thousand separators (Indonesian style)
 */
export function formatNumber(num, decimals = 0) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const fixed = Number(num).toFixed(decimals);
  const [integer, decimal] = fixed.split('.');
  const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimal ? `${formatted},${decimal}` : formatted;
}

/**
 * Format as IDR currency
 */
export function fmtIDR(value, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) return 'Rp 0';
  const prefix = value < 0 ? '-' : '';
  return `${prefix}Rp ${formatNumber(Math.abs(value), decimals)}`;
}

/**
 * Format as USD currency
 */
export function fmtUSD(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  const prefix = value < 0 ? '-' : '';
  return `${prefix}$${formatNumber(Math.abs(value), decimals)}`;
}

/**
 * Format percentage with +/- sign
 */
export function fmtPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '0.00%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(2)}%`;
}

/**
 * Get gain/loss emoji
 */
export function gainEmoji(value) {
  if (value > 0) return '📈';
  if (value < 0) return '📉';
  return '➖';
}

/**
 * Format gain with color indicator (emoji-based for Telegram)
 */
export function fmtGain(value, currency = 'IDR') {
  const emoji = gainEmoji(value);
  const formatted = currency === 'IDR' ? fmtIDR(value) : fmtUSD(value);
  return `${emoji} ${formatted}`;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES
// ═══════════════════════════════════════════════════════════════

/**
 * Format welcome message
 */
export function welcomeMessage() {
  return `
🚀 <b>Selamat datang di PortSyncro Bot!</b>

Bot ini memungkinkan kamu mengelola portfolio investasi langsung dari Telegram.

<b>📋 Langkah pertama:</b>
1️⃣ Buka web PortSyncro → Settings
2️⃣ Klik "Link Telegram"
3️⃣ Salin kode yang muncul
4️⃣ Kirim: <code>/link KODE_KAMU</code>

Ketik /help untuk melihat semua perintah.
`.trim();
}

/**
 * Format help message
 */
export function helpMessage() {
  return `
📖 <b>Daftar Perintah PortSyncro Bot</b>

<b>🔗 Akun</b>
/start - Mulai & info bot
/link KODE - Hubungkan akun Telegram
/unlink - Putuskan koneksi akun
/status - Status koneksi akun

<b>📊 Lihat Portfolio</b>
/p - Ringkasan portfolio
/stocks - Detail saham
/crypto - Detail crypto
/gold - Detail emas
/cash - Detail cash/tunai
/pnl - Profit & Loss

<b>💰 Transaksi</b>
/buy stock BBCA 10 8500 - Beli 10 lot BBCA @Rp8.500
/buy stock AAPL 5 190 US - Beli 5 share AAPL @$190
/buy crypto BTC 0.5 65000 - Beli 0.5 BTC @$65.000
/sell stock BBCA 5 9000 - Jual 5 lot BBCA @Rp9.000
/sell crypto BTC 0.1 70000 - Jual 0.1 BTC @$70.000
/addcash BCA 5000000 - Tambah cash Rp5jt
/addgold digital 2 1500000 - Beli 2g emas @Rp1.5jt

<b>📈 Harga Real-time</b>
/price BBCA - Harga saham BBCA
/price BTC - Harga Bitcoin
/price gold - Harga emas

<b>📜 Riwayat</b>
/history - 10 transaksi terakhir

<i>💡 Semua transaksi otomatis sync dengan web app!</i>
`.trim();
}

/**
 * Format portfolio summary
 */
export function portfolioSummary(assets, exchangeRate) {
  if (!assets) return '❌ Data portfolio tidak tersedia.';

  const stocks = assets.stocks || [];
  const crypto = assets.crypto || [];
  const gold = assets.gold || [];
  const cash = assets.cash || [];

  // Calculate totals in IDR
  let totalPortoIDR = 0;
  let totalCostIDR = 0;

  stocks.forEach(s => {
    totalPortoIDR += s.portoIDR || s.porto || 0;
    totalCostIDR += s.totalCostIDR || s.totalCost || 0;
  });

  crypto.forEach(c => {
    const portoIDR = c.portoIDR || (c.porto && exchangeRate ? c.porto * exchangeRate : 0);
    const costIDR = c.totalCostIDR || (c.totalCost && exchangeRate ? c.totalCost * exchangeRate : 0);
    totalPortoIDR += portoIDR;
    totalCostIDR += costIDR;
  });

  gold.forEach(g => {
    totalPortoIDR += g.portoIDR || g.porto || 0;
    totalCostIDR += g.totalCost || 0;
  });

  cash.forEach(c => {
    totalPortoIDR += c.portoIDR || c.porto || c.amount || 0;
    totalCostIDR += c.totalCost || c.amount || 0;
  });

  const totalGain = totalPortoIDR - totalCostIDR;
  const totalGainPct = totalCostIDR > 0 ? (totalGain / totalCostIDR) * 100 : 0;

  let msg = `📊 <b>Portfolio Summary</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Total
  msg += `💰 <b>Total Nilai:</b> ${fmtIDR(totalPortoIDR)}\n`;
  msg += `💵 <b>Total Modal:</b> ${fmtIDR(totalCostIDR)}\n`;
  msg += `${gainEmoji(totalGain)} <b>P/L:</b> ${fmtIDR(totalGain)} (${fmtPercent(totalGainPct)})\n\n`;

  // Asset breakdown
  msg += `📋 <b>Komposisi Aset:</b>\n`;

  if (stocks.length > 0) {
    const stocksTotal = stocks.reduce((sum, s) => sum + (s.portoIDR || s.porto || 0), 0);
    const stocksPct = totalPortoIDR > 0 ? (stocksTotal / totalPortoIDR * 100) : 0;
    msg += `  📈 Saham: ${fmtIDR(stocksTotal)} (${stocksPct.toFixed(1)}%) — ${stocks.length} aset\n`;
  }

  if (crypto.length > 0) {
    const cryptoTotal = crypto.reduce((sum, c) => sum + (c.portoIDR || (c.porto && exchangeRate ? c.porto * exchangeRate : 0)), 0);
    const cryptoPct = totalPortoIDR > 0 ? (cryptoTotal / totalPortoIDR * 100) : 0;
    msg += `  🪙 Crypto: ${fmtIDR(cryptoTotal)} (${cryptoPct.toFixed(1)}%) — ${crypto.length} aset\n`;
  }

  if (gold.length > 0) {
    const goldTotal = gold.reduce((sum, g) => sum + (g.portoIDR || g.porto || 0), 0);
    const goldPct = totalPortoIDR > 0 ? (goldTotal / totalPortoIDR * 100) : 0;
    msg += `  🥇 Emas: ${fmtIDR(goldTotal)} (${goldPct.toFixed(1)}%) — ${gold.length} aset\n`;
  }

  if (cash.length > 0) {
    const cashTotal = cash.reduce((sum, c) => sum + (c.amount || 0), 0);
    const cashPct = totalPortoIDR > 0 ? (cashTotal / totalPortoIDR * 100) : 0;
    msg += `  💵 Cash: ${fmtIDR(cashTotal)} (${cashPct.toFixed(1)}%) — ${cash.length} akun\n`;
  }

  if (stocks.length === 0 && crypto.length === 0 && gold.length === 0 && cash.length === 0) {
    msg += `  <i>Belum ada aset. Mulai dengan /buy atau /addcash</i>\n`;
  }

  if (exchangeRate) {
    msg += `\n💱 Kurs: 1 USD = ${fmtIDR(exchangeRate)}`;
  }

  msg += `\n\n⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

  return msg;
}

/**
 * Format stock list
 */
export function stockList(stocks) {
  if (!stocks || stocks.length === 0) {
    return '📈 <b>Saham</b>\n\n<i>Belum ada saham dalam portfolio.</i>\nGunakan: /buy stock BBCA 10 8500';
  }

  let msg = `📈 <b>Detail Saham (${stocks.length} aset)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  stocks.forEach((s, i) => {
    const isUS = s.market === 'US' || s.currency === 'USD';
    const fmt = isUS ? fmtUSD : fmtIDR;
    const unit = isUS ? 'share' : 'lot';
    const emoji = gainEmoji(s.gain || 0);

    msg += `<b>${i + 1}. ${s.ticker}</b>`;
    if (s.broker) msg += ` <i>(${s.broker})</i>`;
    if (isUS) msg += ` 🇺🇸`;
    msg += `\n`;
    msg += `   ${s.lots} ${unit} × ${fmt(s.currentPrice)}\n`;
    msg += `   Avg: ${fmt(s.avgPrice)} | Porto: ${fmt(s.porto)}\n`;
    msg += `   ${emoji} P/L: ${fmt(s.gain)} (${fmtPercent(s.gainPercentage)})\n\n`;
  });

  return msg.trim();
}

/**
 * Format crypto list
 */
export function cryptoList(cryptos) {
  if (!cryptos || cryptos.length === 0) {
    return '🪙 <b>Crypto</b>\n\n<i>Belum ada crypto dalam portfolio.</i>\nGunakan: /buy crypto BTC 0.5 65000';
  }

  let msg = `🪙 <b>Detail Crypto (${cryptos.length} aset)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  cryptos.forEach((c, i) => {
    const emoji = gainEmoji(c.gain || 0);

    msg += `<b>${i + 1}. ${c.symbol}</b>`;
    if (c.exchange) msg += ` <i>(${c.exchange})</i>`;
    msg += `\n`;
    msg += `   ${c.amount} × ${fmtUSD(c.currentPrice)}\n`;
    msg += `   Avg: ${fmtUSD(c.avgPrice)} | Porto: ${fmtUSD(c.porto)}\n`;
    msg += `   ${emoji} P/L: ${fmtUSD(c.gain)} (${fmtPercent(c.gainPercentage)})\n\n`;
  });

  return msg.trim();
}

/**
 * Format gold list
 */
export function goldList(golds) {
  if (!golds || golds.length === 0) {
    return '🥇 <b>Emas</b>\n\n<i>Belum ada emas dalam portfolio.</i>\nGunakan: /addgold digital 2 1500000';
  }

  let msg = `🥇 <b>Detail Emas (${golds.length} aset)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  golds.forEach((g, i) => {
    const emoji = gainEmoji(g.gain || 0);
    const typeLabel = g.subtype === 'digital' ? '💎 Digital' : `🪙 ${(g.brand || 'Physical').toUpperCase()}`;

    msg += `<b>${i + 1}. ${g.ticker || g.name}</b> [${typeLabel}]\n`;
    msg += `   ${g.weight || g.amount}g × ${fmtIDR(g.currentPrice)}/g\n`;
    msg += `   Avg: ${fmtIDR(g.avgPrice)} | Porto: ${fmtIDR(g.porto)}\n`;
    msg += `   ${emoji} P/L: ${fmtIDR(g.gain)} (${fmtPercent(g.gainPercentage)})\n\n`;
  });

  return msg.trim();
}

/**
 * Format cash list
 */
export function cashList(cashes) {
  if (!cashes || cashes.length === 0) {
    return '💵 <b>Cash</b>\n\n<i>Belum ada cash dalam portfolio.</i>\nGunakan: /addcash BCA 5000000';
  }

  let msg = `💵 <b>Detail Cash (${cashes.length} akun)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  let totalCash = 0;
  cashes.forEach((c, i) => {
    totalCash += c.amount || 0;
    msg += `<b>${i + 1}. ${c.ticker}</b>\n`;
    msg += `   Saldo: ${fmtIDR(c.amount)}\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 <b>Total Cash:</b> ${fmtIDR(totalCash)}`;

  return msg;
}

/**
 * Format transaction confirmation
 */
export function transactionConfirmation(type, details) {
  const emoji = type === 'buy' ? '✅' : type === 'sell' ? '📤' : '💰';
  const label = type === 'buy' ? 'BELI' : type === 'sell' ? 'JUAL' : 'TAMBAH';

  let msg = `${emoji} <b>Transaksi ${label} Berhasil!</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (details.assetType === 'stock') {
    const isUS = details.market === 'US';
    const fmt = isUS ? fmtUSD : fmtIDR;
    const unit = isUS ? 'share' : 'lot';
    msg += `📈 <b>${details.ticker}</b> (${details.market})\n`;
    msg += `   ${type === 'sell' ? 'Jual' : 'Beli'}: ${details.amount} ${unit}\n`;
    msg += `   Harga: ${fmt(details.price)}\n`;
    msg += `   Total: ${fmt(details.totalValue)}\n`;
  } else if (details.assetType === 'crypto') {
    msg += `🪙 <b>${details.symbol}</b>\n`;
    msg += `   ${type === 'sell' ? 'Jual' : 'Beli'}: ${details.amount}\n`;
    msg += `   Harga: ${fmtUSD(details.price)}\n`;
    msg += `   Total: ${fmtUSD(details.totalValue)}\n`;
  } else if (details.assetType === 'gold') {
    msg += `🥇 <b>${details.ticker}</b>\n`;
    msg += `   ${type === 'sell' ? 'Jual' : 'Beli'}: ${details.amount}g\n`;
    msg += `   Harga: ${fmtIDR(details.price)}/g\n`;
    msg += `   Total: ${fmtIDR(details.totalValue)}\n`;
  } else if (details.assetType === 'cash') {
    msg += `💵 <b>${details.ticker}</b>\n`;
    msg += `   Tambah: ${fmtIDR(details.amount)}\n`;
  }

  msg += `\n📱 <i>Otomatis sync ke web app!</i>`;
  msg += `\n⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

  return msg;
}

/**
 * Format price info
 */
export function priceInfo(ticker, priceData) {
  if (!priceData || !priceData.price) {
    return `❌ Harga untuk <b>${ticker}</b> tidak ditemukan.`;
  }

  const fmt = priceData.currency === 'USD' ? fmtUSD : fmtIDR;
  const emoji = gainEmoji(priceData.change || 0);

  let msg = `💹 <b>${ticker.toUpperCase()}</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `💰 Harga: <b>${fmt(priceData.price)}</b>\n`;
  if (priceData.change !== null && priceData.change !== undefined) {
    msg += `${emoji} Perubahan: ${fmtPercent(priceData.change)}\n`;
  }
  msg += `📡 Sumber: ${priceData.source || 'N/A'}\n`;
  msg += `⏰ ${priceData.lastUpdate || new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

  return msg;
}

/**
 * Format gold price info
 */
export function goldPriceInfo(goldPrices) {
  if (!goldPrices || (!goldPrices.digital && !goldPrices.physical)) {
    return '❌ Data harga emas tidak tersedia.';
  }

  let msg = `🥇 <b>Harga Emas Hari Ini</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (goldPrices.digital) {
    msg += `💎 <b>Emas Digital (Pegadaian)</b>\n`;
    msg += `   Beli: ${fmtIDR(goldPrices.digital.price)}/g\n`;
    msg += `   Jual: ${fmtIDR(goldPrices.digital.sellPrice)}/g\n`;
    if (goldPrices.digital.change !== null && goldPrices.digital.change !== undefined) {
      msg += `   ${gainEmoji(goldPrices.digital.change)} ${fmtPercent(goldPrices.digital.change)}\n`;
    }
    msg += `\n`;
  }

  if (goldPrices.physical) {
    msg += `🪙 <b>Emas Fisik</b>\n`;
    if (goldPrices.physical.antam) msg += `   ANTAM: ${fmtIDR(goldPrices.physical.antam.price)}/g\n`;
    if (goldPrices.physical.ubs) msg += `   UBS: ${fmtIDR(goldPrices.physical.ubs.price)}/g\n`;
    if (goldPrices.physical.galeri24) msg += `   Galeri24: ${fmtIDR(goldPrices.physical.galeri24.price)}/g\n`;
    msg += `\n`;
  }

  msg += `📡 Sumber: ${goldPrices.source || 'Pegadaian'}\n`;
  msg += `⏰ ${goldPrices.lastUpdate || new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

  return msg;
}

/**
 * Format transaction history
 */
export function transactionHistory(transactions) {
  if (!transactions || transactions.length === 0) {
    return '📜 <b>Riwayat Transaksi</b>\n\n<i>Belum ada transaksi.</i>';
  }

  let msg = `📜 <b>Riwayat Transaksi (${Math.min(transactions.length, 10)} terbaru)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  const recent = transactions.slice(-10).reverse();

  recent.forEach((tx, i) => {
    const typeEmoji = tx.type === 'buy' ? '🟢' : tx.type === 'sell' ? '🔴' : '⚪';
    const typeLabel = tx.type === 'buy' ? 'BELI' : tx.type === 'sell' ? 'JUAL' : tx.type?.toUpperCase() || '?';
    const ticker = tx.ticker || tx.symbol || 'N/A';
    const isUS = tx.market === 'US' || tx.currency === 'USD';
    const fmt = (tx.assetType === 'crypto' || isUS) ? fmtUSD : fmtIDR;

    const date = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric'
    }) : 'N/A';

    msg += `${typeEmoji} <b>${typeLabel}</b> ${ticker}`;
    if (tx.source === 'telegram') msg += ` 🤖`;
    msg += `\n`;
    msg += `   ${tx.amount || 0} × ${fmt(tx.price || 0)} — ${date}\n\n`;
  });

  return msg.trim();
}

/**
 * Format P&L summary
 */
export function pnlSummary(assets, exchangeRate) {
  if (!assets) return '❌ Data portfolio tidak tersedia.';

  const stocks = assets.stocks || [];
  const crypto = assets.crypto || [];
  const gold = assets.gold || [];

  let msg = `📊 <b>Profit & Loss Summary</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Stocks P&L
  if (stocks.length > 0) {
    const stockGain = stocks.reduce((sum, s) => sum + (s.gainIDR || s.gain || 0), 0);
    const stockCost = stocks.reduce((sum, s) => sum + (s.totalCostIDR || s.totalCost || 0), 0);
    const stockPct = stockCost > 0 ? (stockGain / stockCost * 100) : 0;
    msg += `📈 <b>Saham:</b> ${fmtIDR(stockGain)} (${fmtPercent(stockPct)})\n`;

    // Top gainer & loser
    const sorted = [...stocks].sort((a, b) => (b.gainPercentage || 0) - (a.gainPercentage || 0));
    if (sorted.length > 0) {
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      msg += `   🏆 Best: ${top.ticker} ${fmtPercent(top.gainPercentage)}\n`;
      if (sorted.length > 1) {
        msg += `   🔻 Worst: ${bottom.ticker} ${fmtPercent(bottom.gainPercentage)}\n`;
      }
    }
    msg += `\n`;
  }

  // Crypto P&L
  if (crypto.length > 0) {
    const cryptoGainUSD = crypto.reduce((sum, c) => sum + (c.gain || 0), 0);
    const cryptoCostUSD = crypto.reduce((sum, c) => sum + (c.totalCost || 0), 0);
    const cryptoPct = cryptoCostUSD > 0 ? (cryptoGainUSD / cryptoCostUSD * 100) : 0;
    const cryptoGainIDR = exchangeRate ? cryptoGainUSD * exchangeRate : 0;
    msg += `🪙 <b>Crypto:</b> ${fmtUSD(cryptoGainUSD)} / ${fmtIDR(cryptoGainIDR)} (${fmtPercent(cryptoPct)})\n`;

    const sorted = [...crypto].sort((a, b) => (b.gainPercentage || 0) - (a.gainPercentage || 0));
    if (sorted.length > 0) {
      msg += `   🏆 Best: ${sorted[0].symbol} ${fmtPercent(sorted[0].gainPercentage)}\n`;
      if (sorted.length > 1) {
        const bottom = sorted[sorted.length - 1];
        msg += `   🔻 Worst: ${bottom.symbol} ${fmtPercent(bottom.gainPercentage)}\n`;
      }
    }
    msg += `\n`;
  }

  // Gold P&L
  if (gold.length > 0) {
    const goldGain = gold.reduce((sum, g) => sum + (g.gain || 0), 0);
    const goldCost = gold.reduce((sum, g) => sum + (g.totalCost || 0), 0);
    const goldPct = goldCost > 0 ? (goldGain / goldCost * 100) : 0;
    msg += `🥇 <b>Emas:</b> ${fmtIDR(goldGain)} (${fmtPercent(goldPct)})\n\n`;
  }

  // Overall
  let totalGain = 0;
  let totalCost = 0;
  stocks.forEach(s => { totalGain += s.gainIDR || s.gain || 0; totalCost += s.totalCostIDR || s.totalCost || 0; });
  crypto.forEach(c => { totalGain += (c.gain || 0) * (exchangeRate || 1); totalCost += (c.totalCost || 0) * (exchangeRate || 1); });
  gold.forEach(g => { totalGain += g.gain || 0; totalCost += g.totalCost || 0; });

  const totalPct = totalCost > 0 ? (totalGain / totalCost * 100) : 0;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${gainEmoji(totalGain)} <b>TOTAL P/L:</b> ${fmtIDR(totalGain)} (${fmtPercent(totalPct)})`;

  return msg;
}

/**
 * Format error message
 */
export function errorMessage(error) {
  return `❌ <b>Error:</b> ${error}\n\n<i>Coba lagi atau ketik /help untuk bantuan.</i>`;
}

/**
 * Format link success message
 */
export function linkSuccess(email) {
  return `
✅ <b>Akun Terhubung!</b>

Telegram kamu sudah terhubung ke:
📧 <code>${email}</code>

Sekarang kamu bisa menggunakan semua fitur bot.
Ketik /help untuk melihat perintah yang tersedia.
`.trim();
}

/**
 * Not linked message
 */
export function notLinkedMessage() {
  return `
🔗 <b>Akun Belum Terhubung</b>

Kamu perlu menghubungkan akun Telegram ke PortSyncro terlebih dahulu.

<b>Cara menghubungkan:</b>
1️⃣ Buka web PortSyncro → Settings ⚙️
2️⃣ Klik "Link Telegram"  
3️⃣ Salin kode 6 digit
4️⃣ Kirim di sini: <code>/link KODE</code>

<i>Kode berlaku selama 10 menit.</i>
`.trim();
}
