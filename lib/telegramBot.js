// lib/telegramBot.js
// Core Telegram Bot logic for PortSyncro
// Handles all commands, Firestore operations, and Telegram API communication

import { adminDb } from './firebaseAdmin';
import { fetchStockPrices, fetchCryptoPrices, fetchGoldPrices } from './fetchPrices';
import * as fmt from './telegramFormatter';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ═══════════════════════════════════════════════════════════════
// TELEGRAM API METHODS
// ═══════════════════════════════════════════════════════════════

/**
 * Send a text message to a Telegram chat
 */
export async function sendMessage(chatId, text, options = {}) {
  try {
    const body = {
      chat_id: chatId,
      text: text,
      parse_mode: options.parseMode || 'HTML',
      disable_web_page_preview: true,
      ...options
    };

    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    if (!result.ok) {
      console.error('[TelegramBot] sendMessage error:', result.description);
    }
    return result;
  } catch (error) {
    console.error('[TelegramBot] sendMessage fetch error:', error);
    return null;
  }
}

/**
 * Send a message with inline keyboard buttons
 */
export async function sendMessageWithButtons(chatId, text, buttons) {
  return sendMessage(chatId, text, {
    reply_markup: JSON.stringify({
      inline_keyboard: buttons
    })
  });
}

/**
 * Send a "typing..." action indicator
 */
async function sendTyping(chatId) {
  try {
    await fetch(`${TELEGRAM_API}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    });
  } catch (e) { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// ACCOUNT LINKING
// ═══════════════════════════════════════════════════════════════

/**
 * Get Firebase UID from Telegram chat ID
 */
async function getLinkedUid(chatId) {
  if (!adminDb) return null;

  try {
    const linkDoc = await adminDb.collection('telegram_links').doc(String(chatId)).get();
    if (linkDoc.exists) {
      return linkDoc.data().uid;
    }
    return null;
  } catch (error) {
    console.error('[TelegramBot] Error getting linked UID:', error);
    return null;
  }
}

/**
 * Link a Telegram chat ID to a Firebase UID using a verification code
 */
async function linkAccount(chatId, code, username) {
  if (!adminDb) return { success: false, error: 'Server error: Database not available' };

  try {
    // Find the link code in Firestore
    const codesRef = adminDb.collection('telegram_link_codes');
    const snapshot = await codesRef
      .where('code', '==', code.toUpperCase())
      .where('used', '==', false)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { success: false, error: 'Kode tidak valid atau sudah kedaluwarsa. Buat kode baru di web PortSyncro.' };
    }

    const codeDoc = snapshot.docs[0];
    const codeData = codeDoc.data();

    // Check expiry (10 minutes)
    const expiresAt = codeData.expiresAt?.toDate?.() || new Date(codeData.expiresAt);
    if (new Date() > expiresAt) {
      // Mark as used/expired
      await codeDoc.ref.update({ used: true, expiredAt: new Date().toISOString() });
      return { success: false, error: 'Kode sudah kedaluwarsa. Buat kode baru di web PortSyncro.' };
    }

    const uid = codeData.uid;
    const email = codeData.email || 'Unknown';

    // Create link mapping: Telegram chatId → Firebase UID
    await adminDb.collection('telegram_links').doc(String(chatId)).set({
      uid: uid,
      email: email,
      username: username || null,
      linkedAt: new Date().toISOString(),
      chatId: chatId
    });

    // Store reverse mapping in user document for web app to show link status
    await adminDb.collection('users').doc(uid).update({
      telegramChatId: chatId,
      telegramUsername: username || null,
      telegramLinkedAt: new Date().toISOString()
    });

    // Mark code as used
    await codeDoc.ref.update({ 
      used: true, 
      usedAt: new Date().toISOString(),
      usedByChatId: chatId 
    });

    return { success: true, email: email };
  } catch (error) {
    console.error('[TelegramBot] linkAccount error:', error);
    return { success: false, error: 'Terjadi kesalahan saat menghubungkan akun.' };
  }
}

/**
 * Unlink a Telegram chat ID
 */
async function unlinkAccount(chatId) {
  if (!adminDb) return false;

  try {
    const linkDoc = await adminDb.collection('telegram_links').doc(String(chatId)).get();
    if (!linkDoc.exists) return false;

    const uid = linkDoc.data().uid;

    // Remove link document
    await adminDb.collection('telegram_links').doc(String(chatId)).delete();

    // Remove from user document
    const admin = (await import('firebase-admin')).default;
    await adminDb.collection('users').doc(uid).update({
      telegramChatId: admin.firestore.FieldValue.delete(),
      telegramUsername: admin.firestore.FieldValue.delete(),
      telegramLinkedAt: admin.firestore.FieldValue.delete()
    });

    return true;
  } catch (error) {
    console.error('[TelegramBot] unlinkAccount error:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// USER DATA ACCESS (Firestore)
// ═══════════════════════════════════════════════════════════════

/**
 * Get user's portfolio assets from Firestore
 */
async function getUserAssets(uid) {
  if (!adminDb) return null;

  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) return null;
    return userDoc.data().assets || { stocks: [], crypto: [], gold: [], cash: [] };
  } catch (error) {
    console.error('[TelegramBot] getUserAssets error:', error);
    return null;
  }
}

/**
 * Get user's recent transactions from Firestore
 */
async function getUserTransactions(uid, limit = 10) {
  if (!adminDb) return [];

  try {
    const txRef = adminDb.collection('users').doc(uid).collection('transactions');
    const snapshot = await txRef.orderBy('timestamp', 'desc').limit(limit).get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('[TelegramBot] getUserTransactions error:', error);
    return [];
  }
}

/**
 * Add a transaction to user's portfolio
 */
async function addTransaction(uid, transaction) {
  if (!adminDb) return null;

  try {
    const txRef = adminDb.collection('users').doc(uid).collection('transactions');
    const docRef = await txRef.add({
      ...transaction,
      timestamp: transaction.timestamp || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      source: 'telegram' // Mark as bot-created
    });

    console.log(`[TelegramBot] Transaction added: ${docRef.id} for user ${uid}`);
    return docRef.id;
  } catch (error) {
    console.error('[TelegramBot] addTransaction error:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Main command router
 */
export async function handleUpdate(update) {
  // Handle message updates
  const message = update.message;
  if (!message?.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const username = message.from?.username || message.from?.first_name || null;

  // Parse command (handle @botname suffix)
  const commandPart = text.split(' ')[0].split('@')[0].toLowerCase();
  const args = text.split(' ').slice(1);

  // Show typing indicator for most commands
  if (commandPart !== '/start') {
    await sendTyping(chatId);
  }

  try {
    switch (commandPart) {
      // Public commands (no linking required)
      case '/start':
        return handleStart(chatId);
      case '/help':
        return handleHelp(chatId);
      case '/link':
        return handleLink(chatId, args, username);

      // Commands requiring linked account
      case '/unlink':
        return withAuth(chatId, () => handleUnlink(chatId));
      case '/status':
        return handleStatus(chatId);
      case '/p':
      case '/portfolio':
        return withAuth(chatId, (uid) => handlePortfolio(chatId, uid));
      case '/stocks':
      case '/saham':
        return withAuth(chatId, (uid) => handleStocks(chatId, uid));
      case '/crypto':
        return withAuth(chatId, (uid) => handleCrypto(chatId, uid));
      case '/gold':
      case '/emas':
        return withAuth(chatId, (uid) => handleGold(chatId, uid));
      case '/cash':
        return withAuth(chatId, (uid) => handleCash(chatId, uid));
      case '/buy':
      case '/beli':
        return withAuth(chatId, (uid) => handleBuy(chatId, uid, args));
      case '/sell':
      case '/jual':
        return withAuth(chatId, (uid) => handleSell(chatId, uid, args));
      case '/addcash':
        return withAuth(chatId, (uid) => handleAddCash(chatId, uid, args));
      case '/addgold':
        return withAuth(chatId, (uid) => handleAddGold(chatId, uid, args));
      case '/price':
      case '/harga':
        return handlePrice(chatId, args);
      case '/history':
      case '/riwayat':
        return withAuth(chatId, (uid) => handleHistory(chatId, uid));
      case '/pnl':
        return withAuth(chatId, (uid) => handlePnL(chatId, uid));

      default:
        // Check if it's a plain text (non-command)
        if (!text.startsWith('/')) return; // Ignore non-command messages
        return sendMessage(chatId, `❓ Perintah <b>${commandPart}</b> tidak dikenal.\n\nKetik /help untuk daftar perintah.`);
    }
  } catch (error) {
    console.error(`[TelegramBot] Error handling command ${commandPart}:`, error);
    return sendMessage(chatId, fmt.errorMessage('Terjadi kesalahan internal. Coba lagi nanti.'));
  }
}

/**
 * Middleware: Check if user is linked before executing command
 */
async function withAuth(chatId, handler) {
  const uid = await getLinkedUid(chatId);
  if (!uid) {
    return sendMessage(chatId, fmt.notLinkedMessage());
  }
  return handler(uid);
}

// ── Individual Command Handlers ──────────────────────────────

async function handleStart(chatId) {
  return sendMessage(chatId, fmt.welcomeMessage());
}

async function handleHelp(chatId) {
  return sendMessage(chatId, fmt.helpMessage());
}

async function handleLink(chatId, args, username) {
  if (args.length === 0) {
    return sendMessage(chatId, `
🔗 <b>Hubungkan Akun</b>

Untuk menghubungkan akun, kamu perlu kode verifikasi dari web app.

<b>Langkah:</b>
1. Buka web PortSyncro → Settings ⚙️
2. Klik "Link Telegram"
3. Salin kode 6 digit
4. Kirim di sini: <code>/link KODE</code>

<i>Kode berlaku selama 10 menit.</i>
    `.trim());
  }

  const code = args[0].toUpperCase();

  // Validate code format (6 alphanumeric characters)
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return sendMessage(chatId, '❌ Format kode tidak valid. Kode harus 6 karakter alfanumerik.\n\nContoh: <code>/link ABC123</code>');
  }

  // Check if already linked
  const existingUid = await getLinkedUid(chatId);
  if (existingUid) {
    return sendMessage(chatId, '⚠️ Akun Telegram ini sudah terhubung ke PortSyncro.\n\nGunakan /unlink dulu jika ingin menghubungkan ke akun lain.');
  }

  const result = await linkAccount(chatId, code, username);

  if (result.success) {
    return sendMessage(chatId, fmt.linkSuccess(result.email));
  } else {
    return sendMessage(chatId, `❌ ${result.error}`);
  }
}

async function handleUnlink(chatId) {
  const success = await unlinkAccount(chatId);
  if (success) {
    return sendMessage(chatId, '✅ Akun Telegram berhasil diputuskan dari PortSyncro.\n\nGunakan /link KODE untuk menghubungkan kembali.');
  }
  return sendMessage(chatId, '❌ Gagal memutuskan koneksi akun. Coba lagi nanti.');
}

async function handleStatus(chatId) {
  const uid = await getLinkedUid(chatId);
  if (!uid) {
    return sendMessage(chatId, '🔗 Status: <b>Tidak terhubung</b>\n\nGunakan /link KODE untuk menghubungkan akun.');
  }

  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const email = userDoc.exists ? userDoc.data().email : 'Unknown';
    return sendMessage(chatId, `🔗 Status: <b>Terhubung</b> ✅\n📧 Email: <code>${email}</code>\n🆔 UID: <code>${uid.substring(0, 8)}...</code>`);
  } catch {
    return sendMessage(chatId, `🔗 Status: <b>Terhubung</b> ✅\n🆔 UID: <code>${uid.substring(0, 8)}...</code>`);
  }
}

async function handlePortfolio(chatId, uid) {
  const assets = await getUserAssets(uid);
  if (!assets) {
    return sendMessage(chatId, fmt.errorMessage('Gagal memuat data portfolio'));
  }

  // Try to get exchange rate
  let exchangeRate = null;
  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    exchangeRate = userDoc.data()?.exchangeRate || 16500;
  } catch { exchangeRate = 16500; }

  return sendMessage(chatId, fmt.portfolioSummary(assets, exchangeRate));
}

async function handleStocks(chatId, uid) {
  const assets = await getUserAssets(uid);
  return sendMessage(chatId, fmt.stockList(assets?.stocks));
}

async function handleCrypto(chatId, uid) {
  const assets = await getUserAssets(uid);
  return sendMessage(chatId, fmt.cryptoList(assets?.crypto));
}

async function handleGold(chatId, uid) {
  const assets = await getUserAssets(uid);
  return sendMessage(chatId, fmt.goldList(assets?.gold));
}

async function handleCash(chatId, uid) {
  const assets = await getUserAssets(uid);
  return sendMessage(chatId, fmt.cashList(assets?.cash));
}

/**
 * Handle /buy command
 * Format: /buy stock TICKER LOTS PRICE [US]
 *         /buy crypto SYMBOL AMOUNT PRICE
 */
async function handleBuy(chatId, uid, args) {
  if (args.length < 4) {
    return sendMessage(chatId, `
📝 <b>Format Buy:</b>

<b>Saham IDX:</b>
<code>/buy stock BBCA 10 8500</code>
→ Beli 10 lot BBCA @Rp8.500

<b>Saham US:</b>
<code>/buy stock AAPL 5 190 US</code>
→ Beli 5 share AAPL @$190

<b>Crypto:</b>
<code>/buy crypto BTC 0.5 65000</code>
→ Beli 0.5 BTC @$65.000
    `.trim());
  }

  const assetType = args[0].toLowerCase();
  const ticker = args[1].toUpperCase();
  const amount = parseFloat(args[2]);
  const price = parseFloat(args[3]);
  const isUS = args[4]?.toUpperCase() === 'US';

  // Validate inputs
  if (isNaN(amount) || amount <= 0) {
    return sendMessage(chatId, '❌ Jumlah harus angka positif.');
  }
  if (isNaN(price) || price <= 0) {
    return sendMessage(chatId, '❌ Harga harus angka positif.');
  }

  let transaction = {};

  if (assetType === 'stock' || assetType === 'saham') {
    const market = isUS ? 'US' : 'IDX';
    const shares = isUS ? amount : amount * 100; // lots to shares for IDX

    transaction = {
      assetType: 'stock',
      type: 'buy',
      ticker: ticker,
      amount: shares,
      price: price,
      market: market,
      currency: isUS ? 'USD' : 'IDR',
      totalValue: shares * price,
    };
  } else if (assetType === 'crypto') {
    transaction = {
      assetType: 'crypto',
      type: 'buy',
      symbol: ticker,
      ticker: ticker,
      amount: amount,
      price: price,
      currency: 'USD',
      totalValue: amount * price,
    };
  } else {
    return sendMessage(chatId, '❌ Tipe aset harus <b>stock</b> atau <b>crypto</b>.\n\nContoh: /buy stock BBCA 10 8500');
  }

  const txId = await addTransaction(uid, transaction);
  if (!txId) {
    return sendMessage(chatId, fmt.errorMessage('Gagal menyimpan transaksi'));
  }

  return sendMessage(chatId, fmt.transactionConfirmation('buy', {
    ...transaction,
    assetType: transaction.assetType,
    ticker: transaction.ticker || transaction.symbol,
    symbol: transaction.symbol || transaction.ticker,
  }));
}

/**
 * Handle /sell command
 * Format: /sell stock TICKER LOTS PRICE [US]
 *         /sell crypto SYMBOL AMOUNT PRICE
 */
async function handleSell(chatId, uid, args) {
  if (args.length < 4) {
    return sendMessage(chatId, `
📝 <b>Format Sell:</b>

<b>Saham IDX:</b>
<code>/sell stock BBCA 5 9000</code>
→ Jual 5 lot BBCA @Rp9.000

<b>Saham US:</b>
<code>/sell stock AAPL 3 200 US</code>
→ Jual 3 share AAPL @$200

<b>Crypto:</b>
<code>/sell crypto BTC 0.1 70000</code>
→ Jual 0.1 BTC @$70.000
    `.trim());
  }

  const assetType = args[0].toLowerCase();
  const ticker = args[1].toUpperCase();
  const amount = parseFloat(args[2]);
  const price = parseFloat(args[3]);
  const isUS = args[4]?.toUpperCase() === 'US';

  if (isNaN(amount) || amount <= 0) {
    return sendMessage(chatId, '❌ Jumlah harus angka positif.');
  }
  if (isNaN(price) || price <= 0) {
    return sendMessage(chatId, '❌ Harga harus angka positif.');
  }

  let transaction = {};

  if (assetType === 'stock' || assetType === 'saham') {
    const market = isUS ? 'US' : 'IDX';
    const shares = isUS ? amount : amount * 100;

    transaction = {
      assetType: 'stock',
      type: 'sell',
      ticker: ticker,
      amount: shares,
      price: price,
      market: market,
      currency: isUS ? 'USD' : 'IDR',
      totalValue: shares * price,
    };
  } else if (assetType === 'crypto') {
    transaction = {
      assetType: 'crypto',
      type: 'sell',
      symbol: ticker,
      ticker: ticker,
      amount: amount,
      price: price,
      currency: 'USD',
      totalValue: amount * price,
    };
  } else {
    return sendMessage(chatId, '❌ Tipe aset harus <b>stock</b> atau <b>crypto</b>.');
  }

  const txId = await addTransaction(uid, transaction);
  if (!txId) {
    return sendMessage(chatId, fmt.errorMessage('Gagal menyimpan transaksi'));
  }

  return sendMessage(chatId, fmt.transactionConfirmation('sell', {
    ...transaction,
    assetType: transaction.assetType,
    ticker: transaction.ticker || transaction.symbol,
    symbol: transaction.symbol || transaction.ticker,
  }));
}

/**
 * Handle /addcash command
 * Format: /addcash BANK AMOUNT
 */
async function handleAddCash(chatId, uid, args) {
  if (args.length < 2) {
    return sendMessage(chatId, `
📝 <b>Format Add Cash:</b>

<code>/addcash BCA 5000000</code>
→ Tambah Rp5.000.000 ke BCA

<code>/addcash GOPAY 1000000</code>
→ Tambah Rp1.000.000 ke GoPay
    `.trim());
  }

  const bankName = args[0].toUpperCase();
  const amount = parseFloat(args[1]);

  if (isNaN(amount) || amount <= 0) {
    return sendMessage(chatId, '❌ Jumlah harus angka positif.');
  }

  const transaction = {
    assetType: 'cash',
    type: 'buy',
    ticker: bankName,
    amount: amount,
    price: 1,
    currency: 'IDR',
    totalValue: amount,
  };

  const txId = await addTransaction(uid, transaction);
  if (!txId) {
    return sendMessage(chatId, fmt.errorMessage('Gagal menyimpan transaksi'));
  }

  return sendMessage(chatId, fmt.transactionConfirmation('buy', {
    assetType: 'cash',
    ticker: bankName,
    amount: amount,
  }));
}

/**
 * Handle /addgold command
 * Format: /addgold TYPE GRAMS PRICE [BRAND]
 * TYPE: digital | physical
 * BRAND (for physical): antam | ubs | galeri24
 */
async function handleAddGold(chatId, uid, args) {
  if (args.length < 3) {
    return sendMessage(chatId, `
📝 <b>Format Add Gold:</b>

<b>Emas Digital:</b>
<code>/addgold digital 2 1500000</code>
→ Beli 2g emas digital @Rp1.500.000/g

<b>Emas Fisik:</b>
<code>/addgold physical 5 1700000 antam</code>
→ Beli 5g emas ANTAM @Rp1.700.000/g

Brand: antam, ubs, galeri24
    `.trim());
  }

  const subtype = args[0].toLowerCase();
  const grams = parseFloat(args[1]);
  const price = parseFloat(args[2]);
  const brand = args[3]?.toLowerCase() || 'pegadaian';

  if (!['digital', 'physical'].includes(subtype)) {
    return sendMessage(chatId, '❌ Tipe harus <b>digital</b> atau <b>physical</b>.');
  }
  if (isNaN(grams) || grams <= 0) {
    return sendMessage(chatId, '❌ Berat (gram) harus angka positif.');
  }
  if (isNaN(price) || price <= 0) {
    return sendMessage(chatId, '❌ Harga harus angka positif.');
  }

  // Generate ticker based on type
  const ticker = subtype === 'digital' ? 'GOLD-DIGITAL' : `GOLD-${brand.toUpperCase()}`;

  const transaction = {
    assetType: 'gold',
    type: 'buy',
    ticker: ticker,
    name: subtype === 'digital' ? 'Emas Digital' : `Emas ${brand.toUpperCase()}`,
    amount: grams,
    price: price,
    subtype: subtype,
    brand: brand,
    currency: 'IDR',
    market: 'Gold',
    totalValue: grams * price,
  };

  const txId = await addTransaction(uid, transaction);
  if (!txId) {
    return sendMessage(chatId, fmt.errorMessage('Gagal menyimpan transaksi'));
  }

  return sendMessage(chatId, fmt.transactionConfirmation('buy', {
    assetType: 'gold',
    ticker: ticker,
    amount: grams,
    price: price,
    totalValue: grams * price,
  }));
}

/**
 * Handle /price command
 * Format: /price TICKER
 *         /price gold
 */
async function handlePrice(chatId, args) {
  if (args.length === 0) {
    return sendMessage(chatId, `
📝 <b>Format Price:</b>

<code>/price BBCA</code> — Harga saham BBCA
<code>/price BTC</code> — Harga Bitcoin
<code>/price gold</code> — Harga emas hari ini
    `.trim());
  }

  const ticker = args[0].toUpperCase();

  // Special case: gold prices
  if (ticker === 'GOLD' || ticker === 'EMAS') {
    try {
      const goldPrices = await fetchGoldPrices();
      return sendMessage(chatId, fmt.goldPriceInfo(goldPrices));
    } catch (error) {
      return sendMessage(chatId, fmt.errorMessage('Gagal mengambil harga emas'));
    }
  }

  // Try crypto first (common symbols)
  const cryptoSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'DOGE', 'AVAX', 'MATIC',
    'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'FTM', 'ALGO', 'ICP', 'FIL', 'SAND',
    'MANA', 'AXS', 'SHIB', 'APE', 'OP', 'ARB', 'SUI', 'SEI', 'TIA', 'PAXG'];

  const isCrypto = cryptoSymbols.includes(ticker) || ticker.length <= 5;

  try {
    // Try both crypto and stock in parallel
    const [cryptoResult, stockResult] = await Promise.allSettled([
      isCrypto ? fetchCryptoPrices([ticker]) : Promise.resolve({}),
      fetchStockPrices([ticker.includes('.') ? ticker : `${ticker}.JK`])
    ]);

    const cryptoData = cryptoResult.status === 'fulfilled' ? cryptoResult.value : {};
    const stockData = stockResult.status === 'fulfilled' ? stockResult.value : {};

    // Check crypto result first
    if (cryptoData[ticker]?.price) {
      return sendMessage(chatId, fmt.priceInfo(ticker, cryptoData[ticker]));
    }

    // Check stock result
    const stockTicker = ticker.includes('.') ? ticker : `${ticker}.JK`;
    if (stockData[stockTicker]?.price) {
      return sendMessage(chatId, fmt.priceInfo(ticker, stockData[stockTicker]));
    }

    // Check if stock was found with original ticker (US stock)
    if (stockData[ticker]?.price) {
      return sendMessage(chatId, fmt.priceInfo(ticker, stockData[ticker]));
    }

    // Not found, try US stock explicitly
    const usResult = await fetchStockPrices([ticker]);
    if (usResult[ticker]?.price) {
      return sendMessage(chatId, fmt.priceInfo(ticker, usResult[ticker]));
    }

    return sendMessage(chatId, `❌ Harga untuk <b>${ticker}</b> tidak ditemukan.\n\nPastikan kode ticker benar. Contoh:\n• Saham IDX: BBCA, TLKM, BMRI\n• Saham US: AAPL, GOOGL, MSFT\n• Crypto: BTC, ETH, SOL`);
  } catch (error) {
    console.error('[TelegramBot] Price fetch error:', error);
    return sendMessage(chatId, fmt.errorMessage('Gagal mengambil data harga'));
  }
}

async function handleHistory(chatId, uid) {
  const transactions = await getUserTransactions(uid, 10);
  return sendMessage(chatId, fmt.transactionHistory(transactions));
}

async function handlePnL(chatId, uid) {
  const assets = await getUserAssets(uid);

  let exchangeRate = 16500;
  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    exchangeRate = userDoc.data()?.exchangeRate || 16500;
  } catch { /* use default */ }

  return sendMessage(chatId, fmt.pnlSummary(assets, exchangeRate));
}

// ═══════════════════════════════════════════════════════════════
// CALLBACK QUERY HANDLER (for inline keyboard buttons)
// ═══════════════════════════════════════════════════════════════

export async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data;

  if (!chatId || !data) return;

  // Answer callback to remove loading state
  try {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQuery.id })
    });
  } catch { /* ignore */ }

  // Route callback data
  const uid = await getLinkedUid(chatId);
  if (!uid) {
    return sendMessage(chatId, fmt.notLinkedMessage());
  }

  // Handle various callback data patterns
  if (data === 'portfolio') return handlePortfolio(chatId, uid);
  if (data === 'stocks') return handleStocks(chatId, uid);
  if (data === 'crypto') return handleCrypto(chatId, uid);
  if (data === 'gold') return handleGold(chatId, uid);
  if (data === 'cash') return handleCash(chatId, uid);
  if (data === 'pnl') return handlePnL(chatId, uid);
  if (data === 'history') return handleHistory(chatId, uid);
}
