// lib/telegramFormatter.js
// Beautiful message formatter for Telegram Bot responses
// Uses HTML parse mode for rich formatting
// SYNCED with website formatting logic (lib/utils.js)

// ═══════════════════════════════════════════════════════════════
// NUMBER & CURRENCY FORMATTING (Matched to lib/utils.js)
// ═══════════════════════════════════════════════════════════════

/**
 * Format number with thousand separators (Indonesian style)
 * Matches: lib/utils.js → formatNumber()
 */
export function formatNumber(num, decimals = 0) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const fixed = Number(num).toFixed(decimals);
  const [integer, decimal] = fixed.split('.');
  const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimal ? `${formatted},${decimal}` : formatted;
}

/**
 * Format number USD-style (comma thousands, dot decimal)
 * Matches: lib/utils.js → formatNumberUSD()
 */
export function formatNumberUSD(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '0.00';
  const fixed = Number(Math.abs(num)).toFixed(decimals);
  const [integer, decimal] = fixed.split('.');
  const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal && decimals > 0 ? `${formatted}.${decimal}` : formatted;
}

/**
 * Format as IDR currency
 * Matches: lib/utils.js → formatIDR() — uses "Rp." (dot, no space)
 */
export function fmtIDR(value, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) return 'Rp.0';
  const prefix = value < 0 ? '-' : '';
  return `${prefix}Rp.${formatNumber(Math.abs(value), decimals)}`;
}

/**
 * Format as USD currency
 * Matches: lib/utils.js → formatUSD() — uses "$" with US comma format
 */
export function fmtUSD(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  const prefix = value < 0 ? '-' : '';
  return `${prefix}$${formatNumberUSD(Math.abs(value), decimals)}`;
}

/**
 * Format quantity (like crypto amounts) with smart decimals
 * Matches: lib/utils.js → formatQuantity()
 */
export function fmtQuantity(num) {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '0';
  const n = typeof num === 'string' ? parseFloat(num) : num;
  // Use up to 8 decimals for crypto precision, trim trailing zeros
  if (n < 1) {
    return n.toFixed(8).replace(/\.?0+$/, '').replace('.', ',');
  }
  if (n % 1 !== 0) {
    // Has decimals
    const fixed = n.toFixed(4).replace(/\.?0+$/, '');
    const [integer, decimal] = fixed.split('.');
    const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decimal ? `${formatted},${decimal}` : formatted;
  }
  return formatNumber(n, 0);
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

/**
 * Format date consistently — matches website's Indonesian format
 * @param {Date|string} date
 * @returns {string} like "29 Mar 2026, 00:35 WIB"
 */
export function fmtDate(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }) + ' WIB';
}

/**
 * Short date — "29 Mar 2026"
 */
export function fmtDateShort(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  return d.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// ═══════════════════════════════════════════════════════════════
// PORTFOLIO VALUE CALCULATION (Synced with Portfolio.js totals)
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate portfolio totals — mirrors Portfolio.js useMemo(totals)
 * This ensures Telegram shows the EXACT same numbers as the website.
 */
export function calculateTotals(assets, prices, exchangeRate) {
  const safeRate = exchangeRate || 0;
  let totalStocksIDR = 0, totalStocksUSD = 0;
  let totalCryptoIDR = 0, totalCryptoUSD = 0;
  let totalGoldIDR = 0, totalGoldUSD = 0;
  let totalCashIDR = 0, totalCashUSD = 0;
  let totalCostIDR = 0, totalCostUSD = 0;

  // Cash
  (assets?.cash || []).forEach(cash => {
    const amount = parseFloat(cash.amount) || 0;
    totalCashIDR += amount;
    if (safeRate > 0) totalCashUSD += amount / safeRate;
    totalCostIDR += amount; // Cash cost = cash amount
  });

  // Stocks — mirror Portfolio.js logic
  (assets?.stocks || []).forEach(stock => {
    const tickerKey = stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`;
    let priceVal;
    if ((stock.useManualPrice || stock.isManual) && (stock.manualPrice || stock.price || stock.avgPrice)) {
      priceVal = stock.manualPrice || stock.price || stock.avgPrice;
    } else {
      priceVal = prices?.[tickerKey]?.price || stock.currentPrice || 0;
    }

    const shareCount = stock.market === 'US' ? parseFloat(stock.lots) : parseFloat(stock.lots) * 100;
    const costBasis = (parseFloat(stock.avgPrice) || 0) * shareCount;

    if (stock.market === 'US') {
      const valUSD = priceVal * shareCount;
      totalStocksUSD += valUSD;
      totalStocksIDR += valUSD * safeRate;
      totalCostUSD += costBasis;
    } else {
      const valIDR = priceVal * shareCount;
      totalStocksIDR += valIDR;
      if (safeRate > 0) totalStocksUSD += valIDR / safeRate;
      totalCostIDR += costBasis;
    }
  });

  // Crypto — mirror Portfolio.js logic
  (assets?.crypto || []).forEach(crypto => {
    let price;
    if ((crypto.useManualPrice || crypto.isManual) && (crypto.manualPrice || crypto.price || crypto.avgPrice)) {
      price = crypto.manualPrice || crypto.price || crypto.avgPrice;
    } else {
      price = prices?.[crypto.symbol]?.price || crypto.currentPrice || 0;
    }
    const amount = parseFloat(crypto.amount) || 0;
    const costBasis = (parseFloat(crypto.avgPrice) || 0) * amount;
    const valUSD = price * amount;
    totalCryptoUSD += valUSD;
    totalCryptoIDR += valUSD * safeRate;
    totalCostUSD += costBasis;
  });

  // Gold — mirror Portfolio.js logic
  (assets?.gold || []).forEach(gold => {
    const price = gold.currentPrice || 0;
    const amount = parseFloat(gold.amount) || 0;
    const costBasis = (parseFloat(gold.avgPrice) || 0) * amount;
    const valIDR = price * amount;
    totalGoldIDR += valIDR;
    if (safeRate > 0) totalGoldUSD += valIDR / safeRate;
    totalCostIDR += costBasis;
  });

  const totalIDR = totalStocksIDR + totalCryptoIDR + totalGoldIDR + totalCashIDR;
  const totalUSD = totalStocksUSD + totalCryptoUSD + totalGoldUSD + totalCashUSD;
  const totalCostNormIDR = totalCostIDR + (totalCostUSD * safeRate);
  const totalGainIDR = totalIDR - totalCostNormIDR;
  const totalGainPct = totalCostNormIDR > 0 ? (totalGainIDR / totalCostNormIDR) * 100 : 0;

  return {
    totalIDR: Math.round(totalIDR),
    totalUSD,
    totalStocksIDR, totalStocksUSD,
    totalCryptoIDR, totalCryptoUSD,
    totalGoldIDR, totalGoldUSD,
    totalCashIDR, totalCashUSD,
    totalCostNormIDR,
    totalGainIDR,
    totalGainPct,
    stocksPercent: totalIDR > 0 ? (totalStocksIDR / totalIDR) * 100 : 0,
    cryptoPercent: totalIDR > 0 ? (totalCryptoIDR / totalIDR) * 100 : 0,
    goldPercent: totalIDR > 0 ? (totalGoldIDR / totalIDR) * 100 : 0,
    cashPercent: totalIDR > 0 ? (totalCashIDR / totalIDR) * 100 : 0,
  };
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
/portfolio - Ringkasan portfolio
/porto - Rekap keuangan (format WhatsApp)
/saham - Detail saham
/crypto - Detail crypto
/emas - Detail emas
/cash - Detail cash/tunai
/pnl - Profit & Loss

<b>💰 Transaksi</b>
/beli stock BBCA 10 8500 - Beli 10 lot BBCA @Rp8.500
/beli stock AAPL 5 190 US - Beli 5 share AAPL @$190
/beli crypto BTC 0.5 65000 - Beli 0.5 BTC @$65.000
/jual stock BBCA 5 9000 - Jual 5 lot BBCA @Rp9.000
/jual crypto BTC 0.1 70000 - Jual 0.1 BTC @$70.000
/addcash BCA 5000000 - Tambah cash Rp5jt
/setcash BCA 2000000 - Set mutlak kas Rp2jt
/addgold digital 2 1500000 - Beli 2g emas @Rp1.5jt

<b>🗑️ Hapus Aset</b>
/hapus stock BBCA - Hapus saham BBCA
/hapus crypto BTC - Hapus crypto BTC
/hapus gold GOLD-DIGITAL - Hapus emas digital
/hapus cash BCA - Hapus kas BCA

<b>📈 Harga Real-time</b>
/hargaporto - Harga terkini aset dalam portomu
/harga BBCA - Harga saham BBCA
/harga BTC - Harga Bitcoin
/harga gold - Harga emas

<b>📜 Riwayat</b>
/riwayat - 10 transaksi terakhir

<b>⚙️ Autopilot</b>
/autopilot on - Kirim rekap harian otomatis (setiap malam)
/autopilot off - Matikan kirim harian
/setname Nama - Ganti identitas di grup (setname reset untuk balik ke email)

<i>💡 Semua transaksi otomatis sync dengan web app!</i>
<i>📊 /porto otomatis record data ke Reports!</i>
`.trim();
}

/**
 * Format portfolio summary
 * NOW uses calculateTotals() for exact website-matching numbers
 */
export function portfolioSummary(assets, exchangeRate, prices) {
  if (!assets) return '❌ Data portfolio tidak tersedia.';

  const stocks = assets.stocks || [];
  const crypto = assets.crypto || [];
  const gold = assets.gold || [];
  const cash = assets.cash || [];

  // Use identical calculation logic as website
  const totals = calculateTotals(assets, prices, exchangeRate);

  let msg = `📊 <b>Portfolio Summary</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Total
  msg += `💰 <b>Total Nilai:</b> ${fmtIDR(totals.totalIDR)}\n`;
  if (exchangeRate > 0) {
    msg += `💵 <b>Total (USD):</b> ${fmtUSD(totals.totalUSD)}\n`;
  }
  msg += `📦 <b>Total Modal:</b> ${fmtIDR(totals.totalCostNormIDR)}\n`;
  msg += `${gainEmoji(totals.totalGainIDR)} <b>P/L:</b> ${fmtIDR(totals.totalGainIDR)} (${fmtPercent(totals.totalGainPct)})\n\n`;

  // Asset breakdown
  msg += `📋 <b>Komposisi Aset:</b>\n`;

  if (stocks.length > 0) {
    msg += `  📈 Saham: ${fmtIDR(totals.totalStocksIDR)} (${totals.stocksPercent.toFixed(1)}%) — ${stocks.length} aset\n`;
  }

  if (crypto.length > 0) {
    msg += `  🪙 Crypto: ${fmtIDR(totals.totalCryptoIDR)} (${totals.cryptoPercent.toFixed(1)}%) — ${crypto.length} aset\n`;
  }

  if (gold.length > 0) {
    msg += `  🥇 Emas: ${fmtIDR(totals.totalGoldIDR)} (${totals.goldPercent.toFixed(1)}%) — ${gold.length} aset\n`;
  }

  if (cash.length > 0) {
    msg += `  💵 Cash: ${fmtIDR(totals.totalCashIDR)} (${totals.cashPercent.toFixed(1)}%) — ${cash.length} akun\n`;
  }

  if (stocks.length === 0 && crypto.length === 0 && gold.length === 0 && cash.length === 0) {
    msg += `  <i>Belum ada aset. Mulai dengan /buy atau /addcash</i>\n`;
  }

  if (exchangeRate) {
    msg += `\n💱 Kurs: 1 USD = ${fmtIDR(exchangeRate)}`;
  }

  msg += `\n\n⏰ ${fmtDate(new Date())}`;

  return msg;
}

/**
 * Format stock list
 * Fixed: Shows IDR value for ALL stocks (US converted to IDR) for consistency
 */
export function stockList(stocks, exchangeRate) {
  if (!stocks || stocks.length === 0) {
    return '📈 <b>Saham</b>\n\n<i>Belum ada saham dalam portfolio.</i>\nGunakan: /buy stock BBCA 10 8500';
  }

  let msg = `📈 <b>Detail Saham (${stocks.length} aset)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  let totalPortoIDR = 0;

  stocks.forEach((s, i) => {
    const isUS = s.market === 'US' || s.currency === 'USD';
    const priceFmt = isUS ? fmtUSD : fmtIDR;
    const unit = isUS ? 'share' : 'lot';
    const emoji = gainEmoji(s.gain || 0);

    // Calculate IDR values consistently
    const portoIDR = isUS && exchangeRate
      ? (s.portoUSD || s.porto || 0) * exchangeRate
      : (s.portoIDR || s.porto || 0);
    const gainIDR = isUS && exchangeRate
      ? (s.gainUSD || s.gain || 0) * exchangeRate
      : (s.gainIDR || s.gain || 0);

    totalPortoIDR += portoIDR;

    msg += `<b>${i + 1}. ${s.ticker}</b>`;
    if (s.broker) msg += ` <i>(${s.broker})</i>`;
    if (isUS) msg += ` 🇺🇸`;
    msg += `\n`;
    msg += `   ${s.lots} ${unit} × ${priceFmt(s.currentPrice)}\n`;
    msg += `   Avg: ${priceFmt(s.avgPrice)} | Porto: ${fmtIDR(portoIDR)}\n`;
    if (isUS) {
      msg += `   Porto (USD): ${fmtUSD(s.portoUSD || s.porto)}\n`;
    }
    msg += `   ${emoji} P/L: ${fmtIDR(gainIDR)} (${fmtPercent(s.gainPercentage)})\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 <b>Total Saham:</b> ${fmtIDR(totalPortoIDR)}`;

  return msg;
}

/**
 * Format crypto list
 * Fixed: Shows both USD and IDR values
 */
export function cryptoList(cryptos, exchangeRate) {
  if (!cryptos || cryptos.length === 0) {
    return '🪙 <b>Crypto</b>\n\n<i>Belum ada crypto dalam portfolio.</i>\nGunakan: /buy crypto BTC 0.5 65000';
  }

  let msg = `🪙 <b>Detail Crypto (${cryptos.length} aset)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  let totalPortoUSD = 0;
  let totalPortoIDR = 0;

  cryptos.forEach((c, i) => {
    const emoji = gainEmoji(c.gain || 0);
    const portoUSD = c.portoUSD || c.porto || 0;
    const portoIDR = c.portoIDR || (portoUSD * (exchangeRate || 0));
    const gainUSD = c.gainUSD || c.gain || 0;
    const gainIDR = c.gainIDR || (gainUSD * (exchangeRate || 0));

    totalPortoUSD += portoUSD;
    totalPortoIDR += portoIDR;

    msg += `<b>${i + 1}. ${c.symbol}</b>`;
    if (c.exchange) msg += ` <i>(${c.exchange})</i>`;
    msg += `\n`;
    msg += `   ${fmtQuantity(c.amount)} × ${fmtUSD(c.currentPrice)}\n`;
    msg += `   Avg: ${fmtUSD(c.avgPrice)}\n`;
    msg += `   Porto: ${fmtUSD(portoUSD)} (${fmtIDR(portoIDR)})\n`;
    msg += `   ${emoji} P/L: ${fmtUSD(gainUSD)} (${fmtPercent(c.gainPercentage)})\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 <b>Total Crypto:</b> ${fmtUSD(totalPortoUSD)}`;
  if (exchangeRate > 0) {
    msg += ` (${fmtIDR(totalPortoIDR)})`;
  }

  return msg;
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

  let totalPorto = 0;

  golds.forEach((g, i) => {
    const emoji = gainEmoji(g.gain || 0);
    const typeLabel = g.subtype === 'digital' ? '💎 Digital' : `🪙 ${(g.brand || 'Physical').toUpperCase()}`;
    const porto = g.portoIDR || g.porto || 0;
    totalPorto += porto;

    msg += `<b>${i + 1}. ${g.ticker || g.name}</b> [${typeLabel}]\n`;
    if (g.broker) msg += `   Broker: ${g.broker}\n`;
    msg += `   ${fmtQuantity(g.weight || g.amount)}g × ${fmtIDR(g.currentPrice)}/g\n`;
    msg += `   Avg: ${fmtIDR(g.avgPrice)} | Porto: ${fmtIDR(porto)}\n`;
    msg += `   ${emoji} P/L: ${fmtIDR(g.gain)} (${fmtPercent(g.gainPercentage)})\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 <b>Total Emas:</b> ${fmtIDR(totalPorto)}`;

  return msg;
}

/**
 * Format cash list
 */
export function cashList(cashes, exchangeRate) {
  if (!cashes || cashes.length === 0) {
    return '💵 <b>Cash</b>\n\n<i>Belum ada cash dalam portfolio.</i>\nGunakan: /addcash BCA 5000000';
  }

  let msg = `💵 <b>Detail Cash (${cashes.length} akun)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  let totalCash = 0;
  cashes.forEach((c, i) => {
    const amount = c.amount || 0;
    totalCash += amount;
    msg += `<b>${i + 1}. ${c.ticker}</b>\n`;
    msg += `   Saldo: ${fmtIDR(amount)}`;
    if (exchangeRate > 0) {
      msg += ` (${fmtUSD(amount / exchangeRate)})`;
    }
    msg += `\n\n`;
  });

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 <b>Total Cash:</b> ${fmtIDR(totalCash)}`;
  if (exchangeRate > 0) {
    msg += ` (${fmtUSD(totalCash / exchangeRate)})`;
  }

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
    const priceFmt = isUS ? fmtUSD : fmtIDR;
    const unit = isUS ? 'share' : 'lot';
    const displayAmount = isUS ? details.amount : details.amount / 100; // Convert shares to lots for display
    msg += `📈 <b>${details.ticker}</b> (${details.market})\n`;
    msg += `   ${type === 'sell' ? 'Jual' : 'Beli'}: ${displayAmount} ${unit}\n`;
    msg += `   Harga: ${priceFmt(details.price)}\n`;
    msg += `   Total: ${priceFmt(details.totalValue)}\n`;
  } else if (details.assetType === 'crypto') {
    msg += `🪙 <b>${details.symbol}</b>\n`;
    msg += `   ${type === 'sell' ? 'Jual' : 'Beli'}: ${fmtQuantity(details.amount)}\n`;
    msg += `   Harga: ${fmtUSD(details.price)}\n`;
    msg += `   Total: ${fmtUSD(details.totalValue)}\n`;
  } else if (details.assetType === 'gold') {
    msg += `🥇 <b>${details.ticker}</b>\n`;
    msg += `   ${type === 'sell' ? 'Jual' : 'Beli'}: ${fmtQuantity(details.amount)}g\n`;
    msg += `   Harga: ${fmtIDR(details.price)}/g\n`;
    msg += `   Total: ${fmtIDR(details.totalValue)}\n`;
  } else if (details.assetType === 'cash') {
    msg += `💵 <b>${details.ticker}</b>\n`;
    msg += `   Tambah: ${fmtIDR(details.amount)}\n`;
  }

  msg += `\n📱 <i>Otomatis sync ke web app!</i>`;
  msg += `\n⏰ ${fmtDate(new Date())}`;

  return msg;
}

/**
 * Format price info
 */
export function priceInfo(ticker, priceData) {
  if (!priceData || !priceData.price) {
    return `❌ Harga untuk <b>${ticker}</b> tidak ditemukan.`;
  }

  const priceFmt = priceData.currency === 'USD' ? fmtUSD : fmtIDR;
  const emoji = gainEmoji(priceData.change || 0);

  let msg = `💹 <b>${ticker.toUpperCase()}</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `💰 Harga: <b>${priceFmt(priceData.price)}</b>\n`;
  if (priceData.change !== null && priceData.change !== undefined) {
    msg += `${emoji} Perubahan: ${fmtPercent(priceData.change)}\n`;
  }
  msg += `📡 Sumber: ${priceData.source || 'N/A'}\n`;
  msg += `⏰ ${fmtDate(new Date())}`;

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
  msg += `⏰ ${fmtDate(goldPrices.lastUpdate || new Date())}`;

  return msg;
}

/**
 * Format live prices of all assets inside portfolio
 */
export function portfolioPrices(assets, prices, exchangeRate) {
  const { stocks = [], crypto = [], gold = [] } = assets;
  
  if (stocks.length === 0 && crypto.length === 0 && gold.length === 0) {
    return '❌ Portfolio kamu kosong.\n\nTidak ada aset untuk dicek harganya.';
  }

  let msg = `💹 <b>Harga Terkini Asetmu</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // STOCKS — Deduplicate by ticker (multi-broker positions show ONE price)
  if (stocks.length > 0) {
    msg += `📈 <b>Saham</b>\n`;
    
    // Group by ticker to avoid duplicates
    const stockByTicker = new Map();
    stocks.forEach(s => {
      const ticker = (s.ticker || '').toUpperCase();
      if (!stockByTicker.has(ticker)) {
        stockByTicker.set(ticker, { ticker, market: s.market, positions: [] });
      }
      stockByTicker.get(ticker).positions.push(s);
    });

    stockByTicker.forEach(({ ticker, market, positions }) => {
      const tickerKey = market === 'US' ? ticker : `${ticker}.JK`;
      const priceData = prices?.[tickerKey];
      
      // Use ONLY live market price from the prices API, NOT fallback to avgPrice
      const currentPrice = priceData?.price || positions[0]?.currentPrice || 0;
      // Use actual market change from the prices API (24h change), NOT user's gain%
      const marketChange = priceData?.change ?? null;
      
      // Calculate total amount across all brokers
      let totalAmount = 0;
      positions.forEach(s => {
        totalAmount += market === 'US' ? parseFloat(s.lots || 0) : parseFloat(s.lots || 0);
      });
      const unit = market === 'US' ? 'share' : 'lot';

      const priceFmt = market === 'US' ? fmtUSD : fmtIDR;
      msg += `• ${ticker}: ${priceFmt(currentPrice)}`;
      if (marketChange !== undefined && marketChange !== null) {
        msg += ` (${gainEmoji(marketChange)}${fmtPercent(marketChange)})`;
      }
      if (totalAmount > 0) {
        msg += ` — ${formatNumber(totalAmount)} ${unit}`;
      }
      msg += `\n`;
    });
    msg += `\n`;
  }

  // CRYPTO — Deduplicate by symbol (multi-exchange positions show ONE price)
  if (crypto.length > 0) {
    msg += `🪙 <b>Crypto</b>\n`;
    
    // Group by symbol to avoid duplicates
    const cryptoBySymbol = new Map();
    crypto.forEach(c => {
      const symbol = (c.symbol || '').toUpperCase();
      if (!cryptoBySymbol.has(symbol)) {
        cryptoBySymbol.set(symbol, { symbol, positions: [] });
      }
      cryptoBySymbol.get(symbol).positions.push(c);
    });

    cryptoBySymbol.forEach(({ symbol, positions }) => {
      const priceData = prices?.[symbol];
      const currentPrice = priceData?.price || positions[0]?.currentPrice || 0;
      const marketChange = priceData?.change ?? null;
      
      // Calculate total amount across all exchanges
      let totalAmount = 0;
      positions.forEach(c => {
        totalAmount += parseFloat(c.amount || 0);
      });

      msg += `• ${symbol}: ${fmtUSD(currentPrice)}`;
      if (marketChange !== undefined && marketChange !== null) {
        msg += ` (${gainEmoji(marketChange)}${fmtPercent(marketChange)})`;
      }
      if (totalAmount > 0) {
        msg += ` — ${fmtQuantity(totalAmount)}`;
      }
      msg += `\n`;
    });
    msg += `\n`;
  }

  // GOLD — Use live gold prices
  if (gold.length > 0) {
    msg += `🥇 <b>Emas</b>\n`;
    const goldPriceData = prices?.gold || {};
    
    // Show digital gold price
    if (goldPriceData.digital) {
      const digitalPrice = goldPriceData.digital.sellPrice || goldPriceData.digital.price || 0;
      const digitalChange = goldPriceData.digital.change ?? null;
      msg += `• Emas Digital: ${fmtIDR(digitalPrice)}/g`;
      if (digitalChange !== undefined && digitalChange !== null) {
        msg += ` (${gainEmoji(digitalChange)}${fmtPercent(digitalChange)})`;
      }
      msg += `\n`;
    } else {
      // Fallback to asset's stored price
      const goldPrice = gold.length > 0 ? gold[0].currentPrice : 0;
      msg += `• Emas: ${fmtIDR(goldPrice)}/g\n`;
    }
    
    // Show physical gold prices if different brands exist
    if (goldPriceData.physical) {
      Object.entries(goldPriceData.physical).forEach(([brand, data]) => {
        if (data.price) {
          msg += `• ${brand.toUpperCase()}: ${fmtIDR(data.price)}/g\n`;
        }
      });
    }
    msg += `\n`;
  }

  msg += `<i>Nilai didapat dari live market PortSyncro.</i>\n`;
  msg += `⏰ ${fmtDate(new Date())}`;

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

  // Transactions are already ordered desc from Firestore query, just take first 10
  const recent = transactions.slice(0, 10);

  recent.forEach((tx, i) => {
    const typeEmoji = tx.type === 'buy' ? '🟢' : tx.type === 'sell' ? '🔴' : tx.type === 'delete' ? '🗑️' : '⚪';
    const typeLabel = tx.type === 'buy' ? 'BELI' : tx.type === 'sell' ? 'JUAL' : tx.type === 'delete' ? 'HAPUS' : (tx.type?.toUpperCase() || '?');
    const ticker = tx.ticker || tx.symbol || 'N/A';
    const isUSD = tx.assetType === 'crypto' || tx.market === 'US' || tx.currency === 'USD';
    const priceFmt = isUSD ? fmtUSD : fmtIDR;
    const date = tx.timestamp ? fmtDateShort(tx.timestamp) : 'N/A';

    msg += `${typeEmoji} <b>${typeLabel}</b> ${ticker}`;
    if (tx.source === 'telegram') msg += ` 🤖`;
    msg += `\n`;

    if (tx.assetType === 'cash') {
      msg += `   ${fmtIDR(tx.amount || 0)} — ${date}\n`;
    } else {
      const amountDisplay = tx.assetType === 'crypto' ? fmtQuantity(tx.amount) : (tx.amount || 0);
      msg += `   ${amountDisplay} × ${priceFmt(tx.price || 0)} — ${date}\n`;
    }
    msg += `   ✏️ /edit_${tx.id} | 🗑️ /del_${tx.id}\n\n`;
  });

  return msg.trim();
}

/**
 * Format P&L summary — uses same calculation logic as website
 */
export function pnlSummary(assets, exchangeRate, prices) {
  if (!assets) return '❌ Data portfolio tidak tersedia.';

  const stocks = assets.stocks || [];
  const crypto = assets.crypto || [];
  const gold = assets.gold || [];

  let msg = `📊 <b>Profit & Loss Summary</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  let overallGainIDR = 0;
  let overallCostIDR = 0;

  // Stocks P&L
  if (stocks.length > 0) {
    let stockGainIDR = 0;
    let stockCostIDR = 0;
    stocks.forEach(s => {
      const isUS = s.market === 'US';
      const shareCount = isUS ? parseFloat(s.lots) : parseFloat(s.lots) * 100;
      const currentPrice = s.currentPrice || 0;
      const avgPrice = parseFloat(s.avgPrice) || 0;
      const currentVal = currentPrice * shareCount;
      const costBasis = avgPrice * shareCount;
      if (isUS && exchangeRate) {
        stockGainIDR += (currentVal - costBasis) * exchangeRate;
        stockCostIDR += costBasis * exchangeRate;
      } else {
        stockGainIDR += currentVal - costBasis;
        stockCostIDR += costBasis;
      }
    });
    const stockPct = stockCostIDR > 0 ? (stockGainIDR / stockCostIDR * 100) : 0;
    overallGainIDR += stockGainIDR;
    overallCostIDR += stockCostIDR;

    msg += `📈 <b>Saham:</b> ${fmtIDR(stockGainIDR)} (${fmtPercent(stockPct)})\n`;

    const sorted = [...stocks].sort((a, b) => (b.gainPercentage || 0) - (a.gainPercentage || 0));
    if (sorted.length > 0) {
      msg += `   🏆 Best: ${sorted[0].ticker} ${fmtPercent(sorted[0].gainPercentage)}\n`;
      if (sorted.length > 1) {
        const bottom = sorted[sorted.length - 1];
        msg += `   🔻 Worst: ${bottom.ticker} ${fmtPercent(bottom.gainPercentage)}\n`;
      }
    }
    msg += `\n`;
  }

  // Crypto P&L
  if (crypto.length > 0) {
    let cryptoGainUSD = 0;
    let cryptoCostUSD = 0;
    crypto.forEach(c => {
      const currentPrice = c.currentPrice || 0;
      const amount = parseFloat(c.amount) || 0;
      const avgPrice = parseFloat(c.avgPrice) || 0;
      cryptoGainUSD += (currentPrice * amount) - (avgPrice * amount);
      cryptoCostUSD += avgPrice * amount;
    });
    const cryptoPct = cryptoCostUSD > 0 ? (cryptoGainUSD / cryptoCostUSD * 100) : 0;
    const cryptoGainIDR = exchangeRate ? cryptoGainUSD * exchangeRate : 0;
    overallGainIDR += cryptoGainIDR;
    overallCostIDR += (cryptoCostUSD * (exchangeRate || 0));

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
    let goldGainIDR = 0;
    let goldCostIDR = 0;
    gold.forEach(g => {
      const currentPrice = g.currentPrice || 0;
      const amount = parseFloat(g.amount) || 0;
      const avgPrice = parseFloat(g.avgPrice) || 0;
      goldGainIDR += (currentPrice * amount) - (avgPrice * amount);
      goldCostIDR += avgPrice * amount;
    });
    const goldPct = goldCostIDR > 0 ? (goldGainIDR / goldCostIDR * 100) : 0;
    overallGainIDR += goldGainIDR;
    overallCostIDR += goldCostIDR;
    msg += `🥇 <b>Emas:</b> ${fmtIDR(goldGainIDR)} (${fmtPercent(goldPct)})\n\n`;
  }

  // Overall
  const totalPct = overallCostIDR > 0 ? (overallGainIDR / overallCostIDR * 100) : 0;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${gainEmoji(overallGainIDR)} <b>TOTAL P/L:</b> ${fmtIDR(overallGainIDR)} (${fmtPercent(totalPct)})`;
  msg += `\n\n⏰ ${fmtDate(new Date())}`;

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

// ═══════════════════════════════════════════════════════════════
// PORTO RECAP — Exact same format as WhatsApp button in Portfolio.js
// ═══════════════════════════════════════════════════════════════

/**
 * Generate the financial recap message — mirrors baseCopyToWhatsApp in Portfolio.js
 * This is the SAME format used by the WhatsApp share button on the website
 */
export function portoRecap(assets, exchangeRate, prices) {
  const now = new Date();
  const dateString = now.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric', month: 'short', year: 'numeric'
  });

  // Calculate totals
  const totals = calculateTotals(assets, prices, exchangeRate);

  let text = `Rekap Keuangan — ${dateString}\n\n`;
  text += `💰 Total: ${fmtIDR(totals.totalIDR)}\n\n`;

  if (assets?.cash?.length) text += `Bank: ${fmtIDR(totals.totalCashIDR)}\n`;
  if (assets?.stocks?.length) text += `Saham: ${fmtIDR(totals.totalStocksIDR)}\n`;
  if (assets?.crypto?.length) text += `Crypto: ${fmtIDR(totals.totalCryptoIDR)}\n`;
  if (assets?.gold?.length) text += `Emas: ${fmtIDR(totals.totalGoldIDR)}\n`;

  const hasAssets = assets?.cash?.length || assets?.stocks?.length || assets?.crypto?.length || assets?.gold?.length;
  if (hasAssets) text += '\n';

  // Helper for sorting assets by value descending
  const sortByValue = (a, b) => (b.valueIDR || 0) - (a.valueIDR || 0);

  // 1. BANK
  if (assets?.cash?.length) {
    text += "🏦 BANK\n\n";
    const cashList = assets.cash.map(c => ({
      ...c, valueIDR: parseFloat(c.amount) || 0
    })).sort(sortByValue);

    cashList.forEach(b => {
      text += `• ${(b.ticker || '').toUpperCase()}: ${fmtIDR(b.valueIDR)}\n`;
    });
    text += "\n";
  }

  // 2. SAHAM — Group by Ticker (exactly like website)
  if (assets?.stocks?.length) {
    text += "📈 SAHAM\n\n";

    const stocksByTicker = {};
    assets.stocks.forEach(stock => {
      const key = (stock.ticker || '').toUpperCase();
      if (!stocksByTicker[key]) {
        stocksByTicker[key] = { ticker: key, holdings: [], totalValueIDR: 0 };
      }

      let valIDR = stock.portoIDR || stock.porto;
      if ((stock.currency === 'USD' || stock.market === 'US') && !stock.portoIDR) {
        valIDR = (stock.porto || 0) * (exchangeRate || 1);
      }
      if (!valIDR) {
        const tickerKey = stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`;
        const price = prices?.[tickerKey]?.price || stock.currentPrice || 0;
        const shareCount = stock.market === 'US' ? parseFloat(stock.lots) : parseFloat(stock.lots) * 100;
        valIDR = price * shareCount;
        if (stock.market === 'US' && exchangeRate) valIDR *= exchangeRate;
      }

      stocksByTicker[key].holdings.push({ ...stock, valueIDR: valIDR });
      stocksByTicker[key].totalValueIDR += valIDR;
    });

    const sortedTickers = Object.values(stocksByTicker).sort((a, b) => b.totalValueIDR - a.totalValueIDR);

    sortedTickers.forEach(group => {
      const sortedHoldings = group.holdings.sort((a, b) => b.valueIDR - a.valueIDR);

      if (sortedHoldings.length > 1) {
        text += `${group.ticker}\n`;
        sortedHoldings.forEach(stock => {
          const lotDisplay = stock.market === 'US' ? fmtQuantity(stock.lots) : `${stock.lots} Lot`;
          const lotStr = stock.market === 'US' ? ` (${lotDisplay} Share)` : ` (${lotDisplay})`;
          text += `• ${stock.broker || 'Manual'}: ${fmtIDR(stock.valueIDR)}${lotStr}\n`;
        });
      } else {
        const stock = sortedHoldings[0];
        const lotDisplay = stock.market === 'US' ? fmtQuantity(stock.lots) : `${stock.lots} Lot`;
        const lotStr = stock.market === 'US' ? ` (${lotDisplay} Share)` : ` (${lotDisplay})`;
        text += `${group.ticker} — ${stock.broker || 'Manual'}: ${fmtIDR(stock.valueIDR)}${lotStr}\n`;
      }
    });
    text += "\n";
  }

  // 3. CRYPTO — Group by Symbol
  if (assets?.crypto?.length) {
    text += "🪙 CRYPTO\n\n";

    const cryptoBySymbol = {};
    assets.crypto.forEach(crypto => {
      const key = (crypto.symbol || '').toUpperCase();
      if (!cryptoBySymbol[key]) {
        cryptoBySymbol[key] = { symbol: key, holdings: [], totalValueIDR: 0 };
      }

      let valIDR = crypto.portoIDR;
      if (!valIDR) {
        const price = prices?.[crypto.symbol]?.price || crypto.currentPrice || 0;
        const valUSD = price * crypto.amount;
        valIDR = valUSD * (exchangeRate || 1);
      }

      cryptoBySymbol[key].holdings.push({ ...crypto, valueIDR: valIDR });
      cryptoBySymbol[key].totalValueIDR += valIDR;
    });

    const sortedCrypto = Object.values(cryptoBySymbol).sort((a, b) => b.totalValueIDR - a.totalValueIDR);

    sortedCrypto.forEach(group => {
      const sortedHoldings = group.holdings.sort((a, b) => b.valueIDR - a.valueIDR);

      if (sortedHoldings.length > 1) {
        text += `${group.symbol}\n`;
        sortedHoldings.forEach(crypto => {
          const unitDisplay = fmtQuantity(crypto.amount);
          text += `• ${crypto.exchange || 'Manual'}: ${fmtIDR(crypto.valueIDR)} (${unitDisplay} Unit)\n`;
        });
      } else {
        const crypto = sortedHoldings[0];
        const unitDisplay = fmtQuantity(crypto.amount);
        text += `${group.symbol} — ${crypto.exchange || 'Manual'}: ${fmtIDR(crypto.valueIDR)} (${unitDisplay} Unit)\n`;
      }
    });
    text += "\n";
  }

  // 4. GOLD — Group by Ticker/Brand
  if (assets?.gold?.length) {
    text += "🏅 EMAS\n\n";

    const goldByTicker = {};
    assets.gold.forEach(gold => {
      const key = (gold.ticker || 'GOLD').toUpperCase();
      if (!goldByTicker[key]) {
        goldByTicker[key] = {
          ticker: key.replace(/GOLD/g, 'Gold'),
          holdings: [], totalValueIDR: 0
        };
      }

      let valIDR = gold.portoIDR || gold.porto;
      if (!valIDR) {
        valIDR = (gold.currentPrice || 0) * (gold.amount || 0);
      }

      goldByTicker[key].holdings.push({ ...gold, valueIDR: valIDR });
      goldByTicker[key].totalValueIDR += valIDR;
    });

    const sortedGold = Object.values(goldByTicker).sort((a, b) => b.totalValueIDR - a.totalValueIDR);

    sortedGold.forEach(group => {
      const sortedHoldings = group.holdings.sort((a, b) => b.valueIDR - a.valueIDR);

      if (sortedHoldings.length > 1) {
        text += `${group.ticker}\n`;
        sortedHoldings.forEach(gold => {
          const gramDisplay = fmtQuantity(gold.amount);
          const name = gold.broker || gold.exchange || gold.brand;
          const label = gold.subtype === 'digital' ? (name || 'Digital') : (name ? `${name} (Fisik/Batangan)` : '(Fisik/Batangan)');
          text += `• ${label}: ${fmtIDR(gold.valueIDR)} (${gramDisplay} gram)\n`;
        });
      } else {
        const gold = sortedHoldings[0];
        const gramDisplay = fmtQuantity(gold.amount);
        const name = gold.broker || gold.exchange || gold.brand;
        const label = gold.subtype === 'digital' ? (name || 'Digital') : (name ? `${name} (Fisik/Batangan)` : '(Fisik/Batangan)');
        text += `${group.ticker} — ${label}: ${fmtIDR(gold.valueIDR)} (${gramDisplay} gram)\n`;
      }
    });
  }

  return text.trim();
}
