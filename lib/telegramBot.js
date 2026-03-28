// lib/telegramBot.js
// Core Telegram Bot logic for PortSyncro
// Handles all commands, Firestore operations, and Telegram API communication
// SYNCED: Uses same price fetching, exchange rate, and calculation logic as website

import { adminDb } from './firebaseAdmin';
import { fetchStockPrices, fetchCryptoPrices, fetchGoldPrices } from './fetchPrices';
import { fetchExchangeRate } from './fetchExchangeRate';
import { calculatePositionFromTransactions } from './utils';
import * as fmt from './telegramFormatter';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Vercel Hobby has a 10-second timeout. We need to finish within ~8s.
const VERCEL_SAFE_TIMEOUT = 8000;

/**
 * Race a promise against a timeout
 */
function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

/**
 * Fallback: Read cached assets directly from Firestore users doc
 * Used when live fetch times out
 */
async function getUserAssetsFallback(uid) {
  if (!adminDb) return null;
  try {
    // Attempt 1: Fetch the most recent history snapshot!
    // This perfectly replicates the last successful Telegram/Web sync.
    const historyRef = adminDb.collection('users').doc(uid).collection('history');
    const recentSnapshot = await historyRef.orderBy('timestamp', 'desc').limit(1).get();
    
    if (!recentSnapshot.empty) {
      const data = recentSnapshot.docs[0].data();
      return {
        assets: data.portfolio || { stocks: [], crypto: [], gold: [], cash: [] },
        exchangeRate: data.exchangeRate || 16500,
        prices: data.prices || {},
        transactions: [], // Not needed for fallback printing
        isCached: true
      };
    }

    // Attempt 2: Fallback to the user's base document if no history exists
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) return null;
    const data = userDoc.data();
    return {
      assets: data.assets || { stocks: [], crypto: [], gold: [], cash: [] },
      exchangeRate: data.exchangeRate || 16500,
      prices: {},
      transactions: [],
      isCached: true
    };
  } catch (error) {
    console.error('[TelegramBot] getUserAssetsFallback error:', error);
    return null;
  }
}

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
// LIVE DATA FETCHING (Same sources as website)
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch live exchange rate — uses same fetchExchangeRate() as website
 * Falls back to Firestore-saved rate, then hardcoded
 */
async function getLiveExchangeRate(uid) {
  try {
    // 1. Try live fetch (same API as website)
    const result = await fetchExchangeRate();
    if (result && result.rate && result.rate > 0) {
      console.log(`[TelegramBot] Live exchange rate: ${result.rate} (${result.source})`);
      return result.rate;
    }
  } catch (e) {
    console.warn('[TelegramBot] Live exchange rate fetch failed:', e.message);
  }

  // 2. Fallback to Firestore-saved rate
  if (uid && adminDb) {
    try {
      const userDoc = await adminDb.collection('users').doc(uid).get();
      const savedRate = userDoc.data()?.exchangeRate;
      if (savedRate && savedRate > 0) {
        console.log(`[TelegramBot] Using Firestore exchange rate: ${savedRate}`);
        return savedRate;
      }
    } catch (e) { /* continue */ }
  }

  // 3. Hardcoded fallback (matches fetchPrices.js fallback)
  console.warn('[TelegramBot] Using hardcoded fallback exchange rate');
  return 16500;
}

/**
 * Fetch live prices for user's assets — same logic as website's performPriceFetch
 */
async function getLivePrices(assets) {
  const prices = {};

  try {
    // Collect tickers
    const stockTickers = [];
    const cryptoSymbols = [];

    (assets?.stocks || []).forEach(s => {
      if (s.useManualPrice) return; // Skip manual-priced assets
      const tickerKey = s.market === 'US' ? s.ticker : `${s.ticker}.JK`;
      stockTickers.push(tickerKey);
    });

    (assets?.crypto || []).forEach(c => {
      if (c.useManualPrice) return;
      cryptoSymbols.push(c.symbol);
    });

    // Fetch in parallel with individual timeouts (same as website, but guarded for Vercel)
    const [stockPrices, cryptoPrices, goldPrices] = await Promise.allSettled([
      stockTickers.length > 0 ? withTimeout(fetchStockPrices(stockTickers), 5000, {}) : Promise.resolve({}),
      cryptoSymbols.length > 0 ? withTimeout(fetchCryptoPrices(cryptoSymbols), 5000, {}) : Promise.resolve({}),
      (assets?.gold || []).length > 0 ? withTimeout(fetchGoldPrices(), 5000, null) : Promise.resolve(null)
    ]);

    // Merge stock prices
    if (stockPrices.status === 'fulfilled' && stockPrices.value) {
      Object.assign(prices, stockPrices.value);
    }

    // Merge crypto prices
    if (cryptoPrices.status === 'fulfilled' && cryptoPrices.value) {
      Object.assign(prices, cryptoPrices.value);
    }

    // Merge gold prices
    if (goldPrices.status === 'fulfilled' && goldPrices.value) {
      prices.gold = goldPrices.value;
    }
  } catch (error) {
    console.error('[TelegramBot] getLivePrices error:', error);
  }

  return prices;
}

/**
 * Rebuild assets from transactions — SAME as portfolioStateManager
 * This ensures Telegram shows the same data as the website
 */
function rebuildAssetsFromTransactions(transactions, prices, exchangeRate) {
  if (!transactions || transactions.length === 0) {
    return { stocks: [], crypto: [], gold: [], cash: [] };
  }

  const stocksMap = new Map();
  const cryptoMap = new Map();
  const goldMap = new Map();
  const cashMap = new Map();

  // Filter out deleted-from-history transactions
  const validTransactions = transactions.filter(tx => tx.deletedFromHistory !== true);
  const sortedTransactions = [...validTransactions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  sortedTransactions.forEach(tx => {
    if (tx.assetType === 'stock' && tx.ticker) {
      const brokerKey = tx.broker ? `|${tx.broker.trim().toUpperCase()}` : '';
      const key = tx.ticker.toUpperCase() + brokerKey;
      if (!stocksMap.has(key)) stocksMap.set(key, []);
      stocksMap.get(key).push(tx);
    } else if (tx.assetType === 'crypto' && tx.symbol) {
      const exchangeKey = tx.exchange ? `|${tx.exchange.trim().toUpperCase()}` : '';
      const key = tx.symbol.toUpperCase() + exchangeKey;
      if (!cryptoMap.has(key)) cryptoMap.set(key, []);
      cryptoMap.get(key).push(tx);
    } else if (tx.assetType === 'cash' && tx.ticker) {
      const key = tx.ticker.toUpperCase();
      if (!cashMap.has(key)) cashMap.set(key, []);
      cashMap.get(key).push(tx);
    } else if (tx.assetType === 'gold' && tx.ticker) {
      const brokerKey = tx.broker ? `|${tx.broker.trim().toUpperCase()}` : '';
      const key = tx.ticker.toUpperCase() + brokerKey;
      if (!goldMap.has(key)) goldMap.set(key, []);
      goldMap.get(key).push(tx);
    }
  });

  // Build stocks
  const stocks = Array.from(stocksMap.entries()).map(([key, txs]) => {
    const firstTx = txs.find(t => t.ticker) || txs[0];
    const ticker = firstTx ? firstTx.ticker.toUpperCase() : key.split('|')[0];
    const broker = firstTx ? firstTx.broker : (key.includes('|') ? key.split('|')[1] : undefined);
    const sampleTx = txs.find(t => t.market) || txs[0];
    let market = sampleTx?.market || (sampleTx?.currency === 'USD' ? 'US' : 'IDX');

    const priceData = prices[`${ticker}.JK`] || prices[ticker];
    let currentPrice = priceData?.price || 0;

    const latestTx = txs[txs.length - 1];
    const useManualPrice = latestTx?.useManualPrice || false;
    const isManual = latestTx?.isManual || false;
    const manualPrice = latestTx?.manualPrice || null;

    if (useManualPrice && manualPrice !== null) {
      currentPrice = manualPrice;
    } else if (currentPrice === 0 && txs.length > 0) {
      currentPrice = latestTx.price || 0;
    }

    const position = calculatePositionFromTransactions(txs, currentPrice, exchangeRate);
    if (position.amount <= 0) return null;

    const totalShares = position.amount;
    let lots;
    if (market === 'US') {
      lots = totalShares;
    } else {
      lots = Math.floor(totalShares / 100);
    }

    return {
      ticker, lots, market,
      avgPrice: position.avgPrice,
      totalCost: position.totalCost,
      totalCostIDR: position.totalCostIDR,
      totalCostUSD: position.totalCostUSD,
      currentPrice,
      gain: position.gain,
      gainIDR: position.gainIDR,
      gainUSD: position.gainUSD,
      porto: position.porto,
      portoIDR: position.portoIDR,
      portoUSD: position.portoUSD,
      gainPercentage: position.gainPercentage,
      currency: market === 'US' ? 'USD' : 'IDR',
      assetType: 'stock',
      broker,
      useManualPrice, isManual, manualPrice,
    };
  }).filter(Boolean);

  // Build crypto
  const crypto = Array.from(cryptoMap.entries()).map(([key, txs]) => {
    const firstTx = txs.find(t => t.symbol) || txs[0];
    const symbol = firstTx ? firstTx.symbol.toUpperCase() : key.split('|')[0];
    const exchange = firstTx ? firstTx.exchange : (key.includes('|') ? key.split('|')[1] : undefined);

    let currentPrice = prices[symbol]?.price || 0;
    const latestTx = txs[txs.length - 1];
    const useManualPrice = latestTx?.useManualPrice || false;
    const isManual = latestTx?.isManual || false;
    const manualPrice = latestTx?.manualPrice || null;

    if (useManualPrice && manualPrice !== null) {
      currentPrice = manualPrice;
    } else if (currentPrice === 0 && txs.length > 0) {
      currentPrice = latestTx.price || 0;
    }

    const position = calculatePositionFromTransactions(txs, currentPrice, exchangeRate);
    if (position.amount <= 0) return null;

    return {
      symbol,
      amount: position.amount,
      avgPrice: position.avgPrice,
      totalCost: position.totalCost,
      totalCostIDR: position.totalCostIDR,
      totalCostUSD: position.totalCostUSD,
      currentPrice,
      gain: position.gain,
      gainIDR: position.gainIDR,
      gainUSD: position.gainUSD,
      porto: position.porto,
      portoIDR: position.portoIDR,
      portoUSD: position.portoUSD,
      gainPercentage: position.gainPercentage,
      currency: 'USD',
      assetType: 'crypto',
      exchange,
      useManualPrice, isManual, manualPrice,
    };
  }).filter(Boolean);

  // Build cash
  const cash = Array.from(cashMap.entries()).map(([ticker, txs]) => {
    const position = calculatePositionFromTransactions(txs, 1, exchangeRate);
    if (position.amount <= 0) return null;

    return {
      ticker,
      amount: position.amount,
      avgPrice: 1,
      totalCost: position.amount,
      currentPrice: 1,
      gain: 0,
      porto: position.amount,
      portoIDR: position.amount,
      portoUSD: exchangeRate > 0 ? Math.round((position.amount / exchangeRate) * 100) / 100 : 0,
      gainPercentage: 0,
      currency: 'IDR',
      assetType: 'cash',
    };
  }).filter(Boolean);

  // Build gold
  const goldPricesData = prices.gold || {};
  const gold = Array.from(goldMap.entries()).map(([key, txs]) => {
    let currentPrice = 0;
    const firstTx = txs.find(t => t.ticker) || txs[0];
    const ticker = firstTx ? firstTx.ticker.toUpperCase() : key.split('|')[0];
    const broker = firstTx ? firstTx.broker : (key.includes('|') ? key.split('|')[1] : undefined);
    const sampleTx = txs.find(t => t.type !== 'delete') || txs[0];
    const subtype = sampleTx.subtype || 'digital';
    let brand = sampleTx.brand || 'pegadaian';

    if (ticker && ticker.includes('-')) {
      const extractedBrand = ticker.split('-')[1]?.toLowerCase();
      if (['antam', 'ubs', 'galeri24'].includes(extractedBrand)) brand = extractedBrand;
    }

    const effectiveSubtype = ticker?.toUpperCase() === 'GOLD-DIGITAL' ? 'digital' :
      (ticker?.includes('-') && ['ANTAM', 'UBS', 'GALERI24'].includes(ticker.split('-')[1]?.toUpperCase()) ? 'physical' : subtype);

    let currentChange = null;
    if (effectiveSubtype === 'digital') {
      currentPrice = goldPricesData.digital?.sellPrice || goldPricesData.digital?.price || 0;
      currentChange = goldPricesData.digital?.change ?? null;
    } else {
      const b = (brand || '').toLowerCase().trim();
      if (goldPricesData.physical && goldPricesData.physical[b]) {
        currentPrice = goldPricesData.physical[b].price || 0;
        currentChange = goldPricesData.digital?.change ?? null;
      } else if (goldPricesData.digital?.sellPrice) {
        currentPrice = goldPricesData.digital.sellPrice;
        currentChange = goldPricesData.digital?.change ?? null;
      }
    }

    const latestTx = txs[txs.length - 1];
    const useManualPrice = latestTx?.useManualPrice || false;
    const manualPrice = latestTx?.manualPrice || null;

    if (useManualPrice && manualPrice !== null) {
      currentPrice = manualPrice;
      currentChange = null;
    } else if (currentPrice === 0 && txs.length > 0) {
      currentPrice = latestTx.currentPrice || latestTx.price || 0;
    }

    const pos = calculatePositionFromTransactions(txs, currentPrice, exchangeRate);
    if (pos.amount <= 0) return null;

    return {
      ticker, name: sampleTx.name || ticker,
      weight: pos.amount, amount: pos.amount, lots: pos.amount,
      avgPrice: pos.avgPrice,
      totalCost: pos.totalCost,
      currentPrice, change: currentChange,
      gain: pos.gain,
      gainIDR: pos.gain,
      gainUSD: exchangeRate ? pos.gain / exchangeRate : 0,
      porto: pos.porto,
      portoIDR: pos.porto,
      portoUSD: exchangeRate ? pos.porto / exchangeRate : 0,
      gainPercentage: pos.gainPercentage || 0,
      currency: 'IDR',
      assetType: 'gold',
      subtype, brand, broker,
      useManualPrice, manualPrice,
    };
  }).filter(Boolean);

  return { stocks, crypto, cash, gold };
}

// ═══════════════════════════════════════════════════════════════
// ACCOUNT LINKING
// ═══════════════════════════════════════════════════════════════

async function getLinkedUid(chatId) {
  if (!adminDb) return null;
  try {
    const linkDoc = await adminDb.collection('telegram_links').doc(String(chatId)).get();
    if (linkDoc.exists) return linkDoc.data().uid;
    return null;
  } catch (error) {
    console.error('[TelegramBot] Error getting linked UID:', error);
    return null;
  }
}

async function linkAccount(chatId, code, username) {
  if (!adminDb) return { success: false, error: 'Server error: Database not available' };
  try {
    const codesRef = adminDb.collection('telegram_link_codes');
    const snapshot = await codesRef.where('code', '==', code.toUpperCase()).where('used', '==', false).limit(1).get();
    if (snapshot.empty) return { success: false, error: 'Kode tidak valid atau sudah kedaluwarsa. Buat kode baru di web PortSyncro.' };

    const codeDoc = snapshot.docs[0];
    const codeData = codeDoc.data();
    const expiresAt = codeData.expiresAt?.toDate?.() || new Date(codeData.expiresAt);
    if (new Date() > expiresAt) {
      await codeDoc.ref.update({ used: true, expiredAt: new Date().toISOString() });
      return { success: false, error: 'Kode sudah kedaluwarsa. Buat kode baru di web PortSyncro.' };
    }

    const uid = codeData.uid;
    const email = codeData.email || 'Unknown';

    await adminDb.collection('telegram_links').doc(String(chatId)).set({
      uid, email, username: username || null,
      linkedAt: new Date().toISOString(), chatId
    });

    await adminDb.collection('users').doc(uid).update({
      telegramChatId: chatId, telegramUsername: username || null,
      telegramLinkedAt: new Date().toISOString()
    });

    await codeDoc.ref.update({ used: true, usedAt: new Date().toISOString(), usedByChatId: chatId });
    return { success: true, email };
  } catch (error) {
    console.error('[TelegramBot] linkAccount error:', error);
    return { success: false, error: 'Terjadi kesalahan saat menghubungkan akun.' };
  }
}

async function unlinkAccount(chatId) {
  if (!adminDb) return false;
  try {
    const linkDoc = await adminDb.collection('telegram_links').doc(String(chatId)).get();
    if (!linkDoc.exists) return false;
    const uid = linkDoc.data().uid;
    await adminDb.collection('telegram_links').doc(String(chatId)).delete();
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
// USER DATA ACCESS (Firestore) — Now reads TRANSACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get ALL user transactions from Firestore
 * The website builds portfolio from transactions, so Telegram must too
 */
async function getAllUserTransactions(uid) {
  if (!adminDb) return [];
  try {
    const txRef = adminDb.collection('users').doc(uid).collection('transactions');
    const snapshot = await txRef.orderBy('timestamp', 'asc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[TelegramBot] getAllUserTransactions error:', error);
    return [];
  }
}

/**
 * Get user's recent transactions for history display
 */
async function getRecentTransactions(uid, limit = 10) {
  if (!adminDb) return [];
  try {
    const txRef = adminDb.collection('users').doc(uid).collection('transactions');
    const snapshot = await txRef.orderBy('timestamp', 'desc').limit(limit).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[TelegramBot] getRecentTransactions error:', error);
    return [];
  }
}

/**
 * Build the complete portfolio state — same as website
 * 1. Fetch all transactions
 * 2. Fetch live exchange rate
 * 3. Rebuild assets from transactions
 * 4. Fetch live prices
 * 5. Update asset values with live prices
 */
async function getFullPortfolio(uid) {
  // Try live rebuild with timeout protection (Vercel Hobby = 10s max)
  const livePortfolio = await withTimeout(
    _getFullPortfolioLive(uid),
    VERCEL_SAFE_TIMEOUT - 1000, // Leave 1s buffer for response
    null
  );

  if (livePortfolio) return livePortfolio;

  // Fallback if live fetch timed out
  console.warn('[TelegramBot] Live portfolio fetch timed out, using cached data');
  const cached = await getUserAssetsFallback(uid);
  if (cached) return cached;

  // Ultimate fallback
  return { assets: { stocks: [], crypto: [], gold: [], cash: [] }, prices: {}, exchangeRate: 16500, transactions: [] };
}

/**
 * Internal: Full live portfolio fetch (may be slow)
 */
async function _getFullPortfolioLive(uid) {
  // Step 1 & 2: Get transactions and exchange rate in parallel
  const [transactions, exchangeRate] = await Promise.all([
    getAllUserTransactions(uid),
    getLiveExchangeRate(uid)
  ]);

  // Step 3: Do a preliminary build to know which tickers we need prices for
  const prelimAssets = rebuildAssetsFromTransactions(transactions, {}, exchangeRate);

  // Step 4: Fetch live prices for those tickers
  const prices = await getLivePrices(prelimAssets);

  // Step 5: Rebuild with live prices
  const assets = rebuildAssetsFromTransactions(transactions, prices, exchangeRate);

  return { assets, prices, exchangeRate, transactions };
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
      source: 'telegram'
    });
    console.log(`[TelegramBot] Transaction added: ${docRef.id} for user ${uid}`);
    return docRef.id;
  } catch (error) {
    console.error('[TelegramBot] addTransaction error:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════

export async function sendAuthMessage(chatId, uid, text, options = {}) {
  // Hanya ambil identitas (nama/email) dan tambahkan header JIKA dipanggil di Grup (chatId negatif)
  if (Number(chatId) < 0) {
    let identity = 'Akun Anda';
    if (uid && adminDb) {
      try {
        const uDoc = await adminDb.collection('users').doc(uid).get();
        if (uDoc.exists) {
          const data = uDoc.data();
          identity = data.telegramDisplayName || data.email || identity;
        }
      } catch(e) {}
    }
    return sendMessage(chatId, `📧 <b>${identity}</b>\n\n${text}`, options);
  }
  
  // Di Private Chat (chatId positif), langsung kirim pesannya saja tanpa email
  return sendMessage(chatId, text, options);
}

// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════

export async function handleUpdate(update) {
  const message = update.message;
  if (!message?.text) return;

  const chatId = message.chat.id;
  const fromId = message.from?.id;
  const text = message.text.trim();
  const username = message.from?.username || message.from?.first_name || null;

  const commandPart = text.split(' ')[0].split('@')[0].toLowerCase();
  const args = text.split(' ').slice(1);

  if (commandPart !== '/start') {
    await sendTyping(chatId);
  }

  try {
    switch (commandPart) {
      case '/start': return handleStart(chatId);
      case '/help': return handleHelp(chatId);
      case '/link': return handleLink(chatId, args, username);
      case '/unlink': return withAuth(chatId, fromId, (uid) => handleUnlink(chatId, fromId, uid));
      case '/status': return handleStatus(chatId, fromId);
      case '/p':
      case '/portfolio': return withAuth(chatId, fromId, (uid) => handlePortfolio(chatId, uid));
      case '/stocks':
      case '/saham': return withAuth(chatId, fromId, (uid) => handleStocks(chatId, uid));
      case '/crypto': return withAuth(chatId, fromId, (uid) => handleCrypto(chatId, uid));
      case '/gold':
      case '/emas': return withAuth(chatId, fromId, (uid) => handleGold(chatId, uid));
      case '/cash': return withAuth(chatId, fromId, (uid) => handleCash(chatId, uid));
      case '/buy':
      case '/beli': return withAuth(chatId, fromId, (uid) => handleBuy(chatId, uid, args));
      case '/sell':
      case '/jual': return withAuth(chatId, fromId, (uid) => handleSell(chatId, uid, args));
      case '/addcash': return withAuth(chatId, fromId, (uid) => handleAddCash(chatId, uid, args));
      case '/addgold': return withAuth(chatId, fromId, (uid) => handleAddGold(chatId, uid, args));
      case '/setname': return withAuth(chatId, fromId, (uid) => handleSetName(chatId, uid, args));
      case '/price':
      case '/harga': return handlePrice(chatId, args);
      case '/history':
      case '/riwayat': return withAuth(chatId, fromId, (uid) => handleHistory(chatId, uid));
      case '/pnl': return withAuth(chatId, fromId, (uid) => handlePnL(chatId, uid));
      case '/porto': return withAuth(chatId, fromId, (uid) => handlePorto(chatId, uid));
      case '/autopilot': return withAuth(chatId, fromId, (uid) => handleAutopilot(chatId, uid, args));
      default:
        if (!text.startsWith('/')) return;
        return sendMessage(chatId, `❓ Perintah <b>${commandPart}</b> tidak dikenal.\n\nKetik /help untuk daftar perintah.`);
    }
  } catch (error) {
    console.error(`[TelegramBot] Error handling command ${commandPart}:`, error);
    return sendMessage(chatId, fmt.errorMessage('Terjadi kesalahan internal. Coba lagi nanti.'));
  }
}

async function withAuth(chatId, fromId, handler) {
  // First check if the PERSON's Telegram ID is linked (they linked via private chat)
  let uid = null;
  if (fromId) uid = await getLinkedUid(fromId);
  
  // Fallback to checking if the CHAT ROOM is linked (legacy group linking)
  if (!uid) uid = await getLinkedUid(chatId);
  
  if (!uid) return sendMessage(chatId, fmt.notLinkedMessage());
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
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return sendMessage(chatId, '❌ Format kode tidak valid. Kode harus 6 karakter alfanumerik.\n\nContoh: <code>/link ABC123</code>');
  }

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

async function handleUnlink(chatId, fromId, uid) {
  let success = false;
  if (fromId) success = await unlinkAccount(fromId);
  if (!success) success = await unlinkAccount(chatId);
  
  if (success) {
    return sendMessage(chatId, '✅ Akun Telegram berhasil diputuskan dari PortSyncro.\n\nGunakan /link KODE untuk menghubungkan kembali.');
  }
  return sendMessage(chatId, '❌ Gagal memutuskan koneksi akun. Coba lagi nanti.');
}

async function handleStatus(chatId, fromId) {
  let uid = null;
  if (fromId) uid = await getLinkedUid(fromId);
  if (!uid) uid = await getLinkedUid(chatId);

  if (!uid) {
    return sendMessage(chatId, '🔗 Status: <b>Tidak terhubung</b>\n\nGunakan /link KODE untuk menghubungkan akun.');
  }
  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const autopilotDoc = await adminDb.collection('telegram_autopilot').doc(uid).get();
    
    const userData = userDoc.exists ? userDoc.data() : {};
    const autoData = autopilotDoc.exists ? autopilotDoc.data() : {};

    let msg = `🔗 <b>Status PortSyncro</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📧 <b>Email:</b> <code>${userData.email || 'Unknown'}</code>\n`;
    msg += `👤 <b>Nama:</b> <code>${userData.telegramDisplayName || 'Default (Email)'}</code>\n`;
    msg += `⚙️ <b>Autopilot:</b> ${autoData.enabled ? '✅ AKTIF' : '⏹ NONAKTIF'}\n`;
    
    if (autoData.lastSentAt) {
      msg += `📅 <b>Terakhir Kirim:</b> ${autoData.lastSentAt.replace('T', ' ')}\n`;
    }

    return sendMessage(chatId, msg);
  } catch (error) {
    console.error('[TelegramBot] handleStatus error:', error);
    return sendMessage(chatId, `🔗 Status: <b>Terhubung</b> ✅\n🆔 UID: <code>${uid.substring(0, 8)}...</code>`);
  }
}

/**
 * /portfolio — NOW rebuilds from transactions + live prices (same as website)
 */
async function handlePortfolio(chatId, uid) {
  const { assets, prices, exchangeRate } = await getFullPortfolio(uid);
  return sendMessage(chatId, fmt.portfolioSummary(assets, exchangeRate, prices));
}

async function handleStocks(chatId, uid) {
  const { assets, exchangeRate } = await getFullPortfolio(uid);
  return sendMessage(chatId, fmt.stockList(assets?.stocks, exchangeRate));
}

async function handleCrypto(chatId, uid) {
  const { assets, exchangeRate } = await getFullPortfolio(uid);
  return sendMessage(chatId, fmt.cryptoList(assets?.crypto, exchangeRate));
}

async function handleGold(chatId, uid) {
  const { assets } = await getFullPortfolio(uid);
  return sendMessage(chatId, fmt.goldList(assets?.gold));
}

async function handleCash(chatId, uid) {
  const { assets, exchangeRate } = await getFullPortfolio(uid);
  return sendMessage(chatId, fmt.cashList(assets?.cash, exchangeRate));
}

/**
 * /buy — Now includes valueIDR/valueUSD for proper website sync
 */
async function handleBuy(chatId, uid, args) {
  if (args.length < 4) {
    return sendAuthMessage(chatId, uid, `
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

  if (isNaN(amount) || amount <= 0) return sendMessage(chatId, '❌ Jumlah harus angka positif.');
  if (isNaN(price) || price <= 0) return sendMessage(chatId, '❌ Harga harus angka positif.');

  // Fetch live exchange rate for valueIDR/valueUSD calculation
  const exchangeRate = await getLiveExchangeRate(uid);

  let transaction = {};

  if (assetType === 'stock' || assetType === 'saham') {
    const market = isUS ? 'US' : 'IDX';
    const shares = isUS ? amount : amount * 100;
    const totalValue = shares * price;

    transaction = {
      assetType: 'stock', type: 'buy',
      ticker, amount: shares, price,
      market, currency: isUS ? 'USD' : 'IDR',
      totalValue,
      // SYNC: Include valueIDR/valueUSD like website does
      valueIDR: isUS ? totalValue * exchangeRate : totalValue,
      valueUSD: isUS ? totalValue : (exchangeRate > 0 ? totalValue / exchangeRate : 0),
    };
  } else if (assetType === 'crypto') {
    const totalValue = amount * price;
    transaction = {
      assetType: 'crypto', type: 'buy',
      symbol: ticker, ticker,
      amount, price,
      currency: 'USD',
      totalValue,
      valueIDR: totalValue * exchangeRate,
      valueUSD: totalValue,
    };
  } else {
    return sendMessage(chatId, '❌ Tipe aset harus <b>stock</b> atau <b>crypto</b>.\n\nContoh: /buy stock BBCA 10 8500');
  }

  const txId = await addTransaction(uid, transaction);
  if (!txId) return sendMessage(chatId, fmt.errorMessage('Gagal menyimpan transaksi'));

  return sendMessage(chatId, fmt.transactionConfirmation('buy', {
    ...transaction,
    assetType: transaction.assetType,
    ticker: transaction.ticker || transaction.symbol,
    symbol: transaction.symbol || transaction.ticker,
  }));
}

async function handleSell(chatId, uid, args) {
  if (args.length < 4) {
    return sendAuthMessage(chatId, uid, `
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

  if (isNaN(amount) || amount <= 0) return sendMessage(chatId, '❌ Jumlah harus angka positif.');
  if (isNaN(price) || price <= 0) return sendMessage(chatId, '❌ Harga harus angka positif.');

  const exchangeRate = await getLiveExchangeRate(uid);

  let transaction = {};

  if (assetType === 'stock' || assetType === 'saham') {
    const market = isUS ? 'US' : 'IDX';
    const shares = isUS ? amount : amount * 100;
    const totalValue = shares * price;

    transaction = {
      assetType: 'stock', type: 'sell',
      ticker, amount: shares, price,
      market, currency: isUS ? 'USD' : 'IDR',
      totalValue,
      valueIDR: isUS ? totalValue * exchangeRate : totalValue,
      valueUSD: isUS ? totalValue : (exchangeRate > 0 ? totalValue / exchangeRate : 0),
    };
  } else if (assetType === 'crypto') {
    const totalValue = amount * price;
    transaction = {
      assetType: 'crypto', type: 'sell',
      symbol: ticker, ticker,
      amount, price,
      currency: 'USD',
      totalValue,
      valueIDR: totalValue * exchangeRate,
      valueUSD: totalValue,
    };
  } else {
    return sendMessage(chatId, '❌ Tipe aset harus <b>stock</b> atau <b>crypto</b>.');
  }

  const txId = await addTransaction(uid, transaction);
  if (!txId) return sendMessage(chatId, fmt.errorMessage('Gagal menyimpan transaksi'));

  return sendMessage(chatId, fmt.transactionConfirmation('sell', {
    ...transaction,
    assetType: transaction.assetType,
    ticker: transaction.ticker || transaction.symbol,
    symbol: transaction.symbol || transaction.ticker,
  }));
}

async function handleAddCash(chatId, uid, args) {
  if (args.length < 2) {
    return sendAuthMessage(chatId, uid, `
📝 <b>Format Add Cash:</b>

<code>/addcash BCA 5000000</code>
→ Tambah Rp5.000.000 ke BCA

<code>/addcash GOPAY 1000000</code>
→ Tambah Rp1.000.000 ke GoPay
    `.trim());
  }

  const bankName = args[0].toUpperCase();
  const amount = parseFloat(args[1]);

  if (isNaN(amount) || amount <= 0) return sendMessage(chatId, '❌ Jumlah harus angka positif.');

  const transaction = {
    assetType: 'cash', type: 'buy',
    ticker: bankName, amount, price: 1,
    currency: 'IDR', totalValue: amount,
    valueIDR: amount,
    valueUSD: 0,
  };

  const txId = await addTransaction(uid, transaction);
  if (!txId) return sendMessage(chatId, fmt.errorMessage('Gagal menyimpan transaksi'));

  return sendMessage(chatId, fmt.transactionConfirmation('buy', {
    assetType: 'cash', ticker: bankName, amount,
  }));
}

async function handleAddGold(chatId, uid, args) {
  if (args.length < 3) {
    return sendAuthMessage(chatId, uid, `
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

  if (!['digital', 'physical'].includes(subtype)) return sendMessage(chatId, '❌ Tipe harus <b>digital</b> atau <b>physical</b>.');
  if (isNaN(grams) || grams <= 0) return sendMessage(chatId, '❌ Berat (gram) harus angka positif.');
  if (isNaN(price) || price <= 0) return sendMessage(chatId, '❌ Harga harus angka positif.');

  const ticker = subtype === 'digital' ? 'GOLD-DIGITAL' : `GOLD-${brand.toUpperCase()}`;
  const totalValue = grams * price;

  // Fetch live gold price for currentPrice field
  let currentPrice = price; // Default to purchase price
  try {
    const goldPrices = await fetchGoldPrices();
    if (subtype === 'digital') {
      currentPrice = goldPrices.digital?.sellPrice || goldPrices.digital?.price || price;
    } else {
      const b = brand.toLowerCase();
      currentPrice = goldPrices.physical?.[b]?.price || goldPrices.digital?.sellPrice || price;
    }
  } catch { /* use purchase price as fallback */ }

  const transaction = {
    assetType: 'gold', type: 'buy',
    ticker, name: subtype === 'digital' ? 'Emas Digital' : `Emas ${brand.toUpperCase()}`,
    amount: grams, price,
    currentPrice, // Live price at time of purchase
    subtype, brand,
    currency: 'IDR', market: 'Gold',
    totalValue,
    valueIDR: totalValue,
    valueUSD: 0,
  };

  const txId = await addTransaction(uid, transaction);
  if (!txId) return sendMessage(chatId, fmt.errorMessage('Gagal menyimpan transaksi'));

  return sendMessage(chatId, fmt.transactionConfirmation('buy', {
    assetType: 'gold', ticker, amount: grams, price, totalValue,
  }));
}

// ═══════════════════════════════════════════════════════════════
// /setname — Ganti identitas/header email di grup
// ═══════════════════════════════════════════════════════════════

async function handleSetName(chatId, uid, args) {
  if (args.length === 0) {
    return sendAuthMessage(chatId, uid, fmt.errorMessage('Format salah.\nGunakan: /setname [Nama Baru]\n\nAtau: /setname reset (Kembali ke Email default)'));
  }

  const newName = args.join(' ');
  if (!adminDb) return sendAuthMessage(chatId, uid, fmt.errorMessage('Database timeout.'));

  try {
    if (newName.toLowerCase() === 'reset') {
      const admin = (await import('firebase-admin')).default;
      await adminDb.collection('users').doc(uid).update({
        telegramDisplayName: admin.firestore.FieldValue.delete()
      });
      return sendMessage(chatId, `✅ Identitas berhasil di-reset. Akan menggunakan Email kamu kembali.`);
    }

    if (newName.length > 25) {
      return sendAuthMessage(chatId, uid, fmt.errorMessage('Maksimal nama adalah 25 karakter.'));
    }

    await adminDb.collection('users').doc(uid).update({
      telegramDisplayName: newName
    });

    return sendMessage(chatId, `✅ Identitas berhasil diubah menjadi: <b>${newName}</b>.\n\nSistem akan menggunakan identitas ini sebagai header di grup alih-alih menampilkan email aslimu.`);
  } catch (error) {
    console.error('[TelegramBot] handleSetName error:', error);
    return sendAuthMessage(chatId, uid, fmt.errorMessage('Gagal merubah identitas.'));
  }
}

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

  if (ticker === 'GOLD' || ticker === 'EMAS') {
    try {
      const goldPrices = await fetchGoldPrices();
      return sendMessage(chatId, fmt.goldPriceInfo(goldPrices));
    } catch (error) {
      return sendMessage(chatId, fmt.errorMessage('Gagal mengambil harga emas'));
    }
  }

  const cryptoSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOT', 'DOGE', 'AVAX', 'MATIC',
    'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'FTM', 'ALGO', 'ICP', 'FIL', 'SAND',
    'MANA', 'AXS', 'SHIB', 'APE', 'OP', 'ARB', 'SUI', 'SEI', 'TIA', 'PAXG'];

  const isCrypto = cryptoSymbols.includes(ticker) || ticker.length <= 5;

  try {
    const [cryptoResult, stockResult] = await Promise.allSettled([
      isCrypto ? fetchCryptoPrices([ticker]) : Promise.resolve({}),
      fetchStockPrices([ticker.includes('.') ? ticker : `${ticker}.JK`])
    ]);

    const cryptoData = cryptoResult.status === 'fulfilled' ? cryptoResult.value : {};
    const stockData = stockResult.status === 'fulfilled' ? stockResult.value : {};

    if (cryptoData[ticker]?.price) return sendMessage(chatId, fmt.priceInfo(ticker, cryptoData[ticker]));

    const stockTicker = ticker.includes('.') ? ticker : `${ticker}.JK`;
    if (stockData[stockTicker]?.price) return sendMessage(chatId, fmt.priceInfo(ticker, stockData[stockTicker]));
    if (stockData[ticker]?.price) return sendMessage(chatId, fmt.priceInfo(ticker, stockData[ticker]));

    const usResult = await fetchStockPrices([ticker]);
    if (usResult[ticker]?.price) return sendMessage(chatId, fmt.priceInfo(ticker, usResult[ticker]));

    return sendMessage(chatId, `❌ Harga untuk <b>${ticker}</b> tidak ditemukan.\n\nPastikan kode ticker benar. Contoh:\n• Saham IDX: BBCA, TLKM, BMRI\n• Saham US: AAPL, GOOGL, MSFT\n• Crypto: BTC, ETH, SOL`);
  } catch (error) {
    console.error('[TelegramBot] Price fetch error:', error);
    return sendMessage(chatId, fmt.errorMessage('Gagal mengambil data harga'));
  }
}

async function handleHistory(chatId, uid) {
  const transactions = await getRecentTransactions(uid, 10);
  return sendAuthMessage(chatId, uid, fmt.transactionHistory(transactions));
}

async function handlePnL(chatId, uid) {
  const { assets, prices, exchangeRate } = await getFullPortfolio(uid);
  return sendMessage(chatId, fmt.pnlSummary(assets, exchangeRate, prices));
}

// ═══════════════════════════════════════════════════════════════
// CALLBACK QUERY HANDLER (for inline keyboard buttons)
// ═══════════════════════════════════════════════════════════════

export async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data;
  if (!chatId || !data) return;

  try {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQuery.id })
    });
  } catch { /* ignore */ }

  const uid = await getLinkedUid(chatId);
  if (!uid) return sendMessage(chatId, fmt.notLinkedMessage());

  if (data === 'portfolio') return handlePortfolio(chatId, uid);
  if (data === 'stocks') return handleStocks(chatId, uid);
  if (data === 'crypto') return handleCrypto(chatId, uid);
  if (data === 'gold') return handleGold(chatId, uid);
  if (data === 'cash') return handleCash(chatId, uid);
  if (data === 'pnl') return handlePnL(chatId, uid);
  if (data === 'history') return handleHistory(chatId, uid);
  if (data === 'porto') return handlePorto(chatId, uid);
}

// ═══════════════════════════════════════════════════════════════
// /porto — WhatsApp-style financial recap
// ═══════════════════════════════════════════════════════════════

async function handlePorto(chatId, uid) {
  const { assets, prices, exchangeRate } = await getFullPortfolio(uid);

  // Send the WhatsApp-style recap
  const recapText = fmt.portoRecap(assets, exchangeRate, prices);
  await sendAuthMessage(chatId, uid, recapText, { parseMode: undefined }); // Plain text, no HTML

  // Also save a snapshot to history (same as Reports page)
  // This way, even without opening the web, the data gets recorded!
  try {
    await saveHistorySnapshot(uid, assets, prices, exchangeRate);
    console.log(`[TelegramBot] History snapshot saved for user ${uid}`);
  } catch (e) {
    console.warn(`[TelegramBot] Failed to save history snapshot:`, e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// /autopilot — Toggle daily auto-send at 00:00 WIB
// ═══════════════════════════════════════════════════════════════

async function handleAutopilot(chatId, uid, args) {
  if (!adminDb) return sendAuthMessage(chatId, uid, fmt.errorMessage('Database not available'));

  const action = args[0]?.toLowerCase();

  if (action === 'on') {
    await adminDb.collection('telegram_autopilot').doc(uid).set({
      uid,
      chatId, // Record which chat to send to
      enabled: true,
      enabledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return sendAuthMessage(chatId, uid, `✅ <b>Autopilot AKTIF</b>\n\nRekap portfolio akan dikirim otomatis setiap hari pukul <b>00:00 WIB</b>.\n\nGunakan <code>/autopilot off</code> untuk mematikan.`);
  }

  if (action === 'off') {
    await adminDb.collection('telegram_autopilot').doc(uid).set({
      uid,
      chatId,
      enabled: false,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return sendAuthMessage(chatId, uid, `⏹ <b>Autopilot NONAKTIF</b>\n\nRekap harian sudah dimatikan.\nGunakan <code>/autopilot on</code> untuk mengaktifkan kembali.`);
  }

  // Show current status
  try {
    const doc = await adminDb.collection('telegram_autopilot').doc(uid).get();
    const isEnabled = doc.exists && doc.data()?.enabled === true;

    return sendAuthMessage(chatId, uid, `
⚙️ <b>Autopilot Settings</b>

Status: ${isEnabled ? '✅ AKTIF' : '⏹ NONAKTIF'}
Jadwal: Setiap hari pukul 00:00 WIB

<b>Cara pakai:</b>
<code>/autopilot on</code> — Aktifkan kirim harian
<code>/autopilot off</code> — Matikan kirim harian

<i>💡 Setiap user dijeda 5 detik untuk menghindari rate limit.</i>
<i>📊 Data juga otomatis ter-record ke Reports walaupun tidak buka web!</i>
    `.trim());
  } catch {
    return sendAuthMessage(chatId, uid, fmt.errorMessage('Gagal memuat status autopilot'));
  }
}

// ═══════════════════════════════════════════════════════════════
// HISTORY SNAPSHOT — Record portfolio data for Reports page
// Same as captureSnapshot in pages/reports.js
// ═══════════════════════════════════════════════════════════════

async function saveHistorySnapshot(uid, assets, prices, exchangeRate) {
  if (!adminDb) return;

  const safeRate = exchangeRate || 16500;
  const stocks = assets?.stocks || [];
  const crypto = assets?.crypto || [];
  const gold = assets?.gold || [];
  const cash = assets?.cash || [];

  // Calculate totals (same logic as reports page)
  let totalValueIDR = 0, totalValueUSD = 0, totalInvestedIDR = 0;

  const enrichedStocks = stocks.map(s => {
    const shareCount = s.market === 'US' ? parseFloat(s.lots) : parseFloat(s.lots) * 100;
    const currentPrice = s.currentPrice || 0;
    const avgPrice = parseFloat(s.avgPrice) || 0;
    let portoIDR, portoUSD, totalCostIDR;

    if (s.market === 'US') {
      const valUSD = currentPrice * shareCount;
      portoUSD = valUSD; portoIDR = valUSD * safeRate;
      totalCostIDR = avgPrice * shareCount * safeRate;
    } else {
      const valIDR = currentPrice * shareCount;
      portoIDR = valIDR; portoUSD = valIDR / safeRate;
      totalCostIDR = avgPrice * shareCount;
    }
    totalValueIDR += portoIDR; totalValueUSD += portoUSD;
    totalInvestedIDR += totalCostIDR;

    return { ...s, currentPrice, portoIDR: Math.round(portoIDR), portoUSD: Math.round(portoUSD * 100) / 100, totalCostIDR: Math.round(totalCostIDR) };
  });

  const enrichedCrypto = crypto.map(c => {
    const price = c.currentPrice || 0;
    const amount = parseFloat(c.amount) || 0;
    const avgPrice = parseFloat(c.avgPrice) || 0;
    const valUSD = price * amount;
    const portoIDR = valUSD * safeRate;
    const costIDR = avgPrice * amount * safeRate;
    totalValueIDR += portoIDR; totalValueUSD += valUSD;
    totalInvestedIDR += costIDR;

    return { ...c, currentPrice: price, portoIDR: Math.round(portoIDR), portoUSD: Math.round(valUSD * 100) / 100, totalCostIDR: Math.round(costIDR) };
  });

  const enrichedGold = gold.map(g => {
    const price = g.currentPrice || 0;
    const amount = parseFloat(g.amount) || 0;
    const avgPrice = parseFloat(g.avgPrice) || 0;
    const valIDR = price * amount;
    const costIDR = avgPrice * amount;
    totalValueIDR += valIDR; totalValueUSD += valIDR / safeRate;
    totalInvestedIDR += costIDR;

    return { ...g, portoIDR: Math.round(valIDR), portoUSD: Math.round((valIDR / safeRate) * 100) / 100, totalCostIDR: Math.round(costIDR) };
  });

  const enrichedCash = cash.map(c => {
    const amount = parseFloat(c.amount) || 0;
    totalValueIDR += amount; totalValueUSD += amount / safeRate;
    return { ...c, portoIDR: Math.round(amount), portoUSD: Math.round((amount / safeRate) * 100) / 100 };
  });

  // Clean undefined values
  const clean = (obj) => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(clean).filter(i => i !== null && i !== undefined);
    if (typeof obj === 'object') {
      const c = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) c[k] = clean(v);
      }
      return c;
    }
    return obj;
  };

  // Use Jakarta timezone for date
  const jakartaDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

  const snapshotData = clean({
    date: jakartaDate,
    totalValueIDR: Math.round(totalValueIDR),
    totalValueUSD: totalValueUSD,
    totalInvestedIDR: Math.round(totalInvestedIDR),
    exchangeRate: safeRate,
    prices: prices || {},
    timestamp: new Date().toISOString(),
    source: 'telegram',
    portfolio: {
      stocks: enrichedStocks,
      crypto: enrichedCrypto,
      gold: enrichedGold,
      cash: enrichedCash
    }
  });

  await adminDb.collection('users').doc(uid).collection('history').doc(jakartaDate).set(snapshotData);
}

// ═══════════════════════════════════════════════════════════════
// DAILY AUTO-SEND — Called by cron API endpoint
// Sends /porto to all users with autopilot enabled
// Staggered: 1 minute between each user to avoid rate limits
// ═══════════════════════════════════════════════════════════════

export async function sendDailyReports() {
  if (!adminDb) {
    console.error('[TelegramBot] sendDailyReports: adminDb not available');
    return { success: false, error: 'Database not available' };
  }

  try {
    // 1. Get ALL registered users for Autosnapshot
    const usersSnapshot = await adminDb.collection('users').get();
    if (usersSnapshot.empty) {
      return { success: true, sent: 0, snapped: 0 };
    }
    const allUsers = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

    // 2. Get users who enabled Autopilot Telegram Messages
    const autopilotSnapshot = await adminDb.collection('telegram_autopilot')
      .where('enabled', '==', true)
      .get();
    const autopilotMap = new Map();
    autopilotSnapshot.docs.forEach(doc => {
      const data = doc.data();
      autopilotMap.set(data.uid, data);
    });

    console.log(`[Cron] Autosnapshot processing ${allUsers.length} total users (${autopilotMap.size} with autopilot)`);

    let sent = 0;
    let failed = 0;
    let snapped = 0;

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const currentUTCHour = new Date().getUTCHours();
    
    // We send Telegram Messages only during the "Night" run (roughly 17:00 UTC / 00:00 WIB)
    // The midday run is for "Silent Snapshot" to keep data fresh.
    const isNightRun = currentUTCHour >= 15 && currentUTCHour <= 19; // 17:00 UTC is mid-window

    // Adaptive Delay: Stagger based on user count to stay within Vercel's 60s Hobby limit
    // If we have many users, we need to be faster. 100 users * 500ms = 50s.
    const adaptiveDelay = allUsers.length > 50 ? 300 : 500;

    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const uid = user.uid;
      const autopilotData = autopilotMap.get(uid);
      
      try {
        // ALWAYS Autosnapshot everyone, twice a day.
        const { assets, prices, exchangeRate } = await getFullPortfolio(uid);
        await saveHistorySnapshot(uid, assets, prices, exchangeRate);
        snapped++;

        // Send Telegram Message ONLY if it's the Night Run OR specifically requested by the logic
        if (isNightRun && autopilotData && autopilotData.chatId) {
          if (autopilotData.lastSentAt && autopilotData.lastSentAt.startsWith(today)) {
            console.log(`[Cron] Skipping msg for ${uid}, already sent today`);
          } else {
            console.log(`[Cron] Sending Nightly report to chatId ${autopilotData.chatId} for UID ${uid}`);
            const recapText = fmt.portoRecap(assets, exchangeRate, prices);
            await sendAuthMessage(autopilotData.chatId, uid, `📅 <b>Rekap Harian (Autopilot)</b>\n\n${recapText}`, { parseMode: undefined });
            
            await adminDb.collection('telegram_autopilot').doc(uid).update({
              lastSentAt: new Date().toLocaleString('en-CA', { timeZone: 'Asia/Jakarta' }).replace(', ', 'T')
            });
            sent++;
          }
        }

        // Adaptive staggered delay
        if (i < allUsers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
        }

      } catch (error) {
        console.error(`[Cron] Failed processing for UID ${uid}:`, error.message);
        failed++;
      }
    }

    console.log(`[Cron] Complete: ${snapped} snapped, ${sent} msgs sent, ${failed} failed (Run: ${isNightRun ? 'Night/Message' : 'Day/Silent'})`);
    return { success: true, snapped, sent, failed, totalUsers: allUsers.length, mode: isNightRun ? 'night' : 'day' };
  } catch (error) {
    console.error('[Cron] sendDailyReports error:', error);
    return { success: false, error: error.message };
  }
}
