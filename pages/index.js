// pages/index.js
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import Portfolio from '../components/Portfolio';
import StockInput from '../components/StockInput';
import CryptoInput from '../components/CryptoInput';
import GoldInput from '../components/GoldInput';
import CashInput from '../components/CashInput';
import SettingsModal from '../components/SettingsModal';
import { useAuth } from '../lib/authContext';
import { useLanguage } from '../lib/languageContext';
import { useRouter } from 'next/router';
import { collection, addDoc, query, orderBy, getDocs, doc, serverTimestamp, updateDoc, where, onSnapshot, setDoc, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FiLogOut, FiUser, FiCreditCard, FiSettings } from 'react-icons/fi';
import { calculatePortfolioValue, validateTransaction, isPriceDataAvailable, getRealPriceData, calculatePositionFromTransactions, formatIDR, formatUSD, validateIDXLots } from '../lib/utils';
import ErrorBoundary from '../components/ErrorBoundary';
import TransactionHistory from '../components/TransactionHistory';
import { fetchExchangeRate } from '../lib/fetchExchangeRate';
import Modal from '../components/Modal';
import AveragePriceCalculator from '../components/AveragePriceCalculator';
import AssetAllocationModal from '../components/AssetAllocationModal';
import refreshOptimizer from '../lib/refreshOptimizer';
import { usePortfolioState } from '../lib/usePortfolioState';
import Notification from '../components/Notification';
import { secureLogger } from './../lib/security';

// Helper function to clean undefined values from objects
const cleanUndefinedValues = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefinedValues(item)).filter(item => item !== null);
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = cleanUndefinedValues(value);
    }
  }
  return cleaned;
};

// Simplified function to build assets from transactions
function buildAssetsFromTransactions(transactions, prices, currentAssets = { stocks: [], crypto: [], gold: [], cash: [] }) {
  secureLogger.log('buildAssetsFromTransactions called with:', {
    transactionsLength: transactions?.length || 0,
    pricesKeys: Object.keys(prices || {}),
    currentAssetsStocks: currentAssets?.stocks?.length || 0,
    currentAssetsCrypto: currentAssets?.crypto?.length || 0,
    currentAssetsCash: currentAssets?.cash?.length || 0
  });

  // Early return if no transactions
  if (!transactions || transactions.length === 0) {
    secureLogger.log('No transactions, returning current assets');
    return currentAssets;
  }

  // Use Map for better performance with large datasets
  const stocksMap = new Map();
  const cryptoMap = new Map();
  const goldMap = new Map(); // New Map for Gold
  const cashMap = new Map();

  // Process transactions in batches for better performance
  const batchSize = 100;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);

    batch.forEach(tx => {
      if (tx.assetType === 'stock' && tx.ticker) {
        const key = tx.ticker.toUpperCase();
        if (!stocksMap.has(key)) stocksMap.set(key, []);
        stocksMap.get(key).push(tx);
      } else if (tx.assetType === 'crypto' && tx.symbol) {
        const key = tx.symbol.toUpperCase();
        if (!cryptoMap.has(key)) cryptoMap.set(key, []);
        cryptoMap.get(key).push(tx);
      } else if (tx.assetType === 'gold' && tx.ticker) {
        const key = tx.ticker.toUpperCase();
        if (!goldMap.has(key)) goldMap.set(key, []);
        goldMap.get(key).push(tx);
      } else if (tx.assetType === 'cash' && tx.ticker) {
        const key = tx.ticker.toUpperCase();
        if (!cashMap.has(key)) cashMap.set(key, []);
        cashMap.get(key).push(tx);
      }
    });
  }

  const stocks = Array.from(stocksMap.entries()).map(([ticker, txs]) => {
    const priceObj = prices[`${ticker}.JK`] || prices[ticker];
    const currentPrice = priceObj ? priceObj.price : 0;

    // Skip delete transactions when building assets
    const validTransactions = txs.filter(tx => tx.type !== 'delete');
    if (validTransactions.length === 0) {
      secureLogger.log(`Skipping ${ticker} - no valid transactions (only delete transactions)`);
      return null;
    }

    const pos = calculatePositionFromTransactions(validTransactions, currentPrice);

    // Get market from transactions (assuming all txs for a ticker have same market)
    const market = validTransactions[0]?.market || 'IDX';

    // Check if the asset is fully sold (amount <= 0)
    if (pos.amount <= 0) {
      secureLogger.log(`Skipping ${ticker} - fully sold (amount: ${pos.amount})`);
      return null;
    }

    // Check if there's a manually set average price in current assets
    const existingAsset = currentAssets?.stocks?.find(s => s.ticker.toUpperCase() === ticker.toUpperCase());
    const useManualAvgPrice = existingAsset && existingAsset.avgPrice && existingAsset.avgPrice !== pos.avgPrice;

    return {
      ticker: ticker,
      lots: market === 'US' ? pos.amount : pos.amount / 100, // Display lots for IDX, raw shares for US (if considered 'lots' in UI, keep as is or adjust)
      // Display lots for IDX, raw shares for US
      avgPrice: useManualAvgPrice ? existingAsset.avgPrice : pos.avgPrice,
      totalCost: pos.totalCost,
      currentPrice: currentPrice,
      gain: pos.gain,
      porto: pos.porto,
      gainPercentage: pos.gainPercentage || 0,
      currency: market === 'US' ? 'USD' : 'IDR',
      market: market,
      type: 'stock',
      lastUpdate: new Date().toISOString()
    };
  }).filter(Boolean);

  const crypto = Array.from(cryptoMap.entries()).map(([symbol, txs]) => {
    const priceObj = prices[symbol];
    const currentPrice = priceObj ? priceObj.price : 0;

    // Skip delete transactions when building assets
    const validTransactions = txs.filter(tx => tx.type !== 'delete');
    if (validTransactions.length === 0) {
      secureLogger.log(`Skipping ${symbol} - no valid transactions (only delete transactions)`);
      return null;
    }

    const pos = calculatePositionFromTransactions(validTransactions, currentPrice);

    // Check if the asset is fully sold (amount <= 0)
    if (pos.amount <= 0) {
      secureLogger.log(`Skipping ${symbol} - fully sold (amount: ${pos.amount})`);
      return null;
    }

    // Check if there's a manually set average price in current assets
    const existingAsset = currentAssets?.crypto?.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
    const useManualAvgPrice = existingAsset && existingAsset.avgPrice && existingAsset.avgPrice !== pos.avgPrice;

    return {
      symbol: symbol,
      amount: pos.amount,
      avgPrice: useManualAvgPrice ? existingAsset.avgPrice : pos.avgPrice,
      totalCost: pos.totalCost,
      currentPrice: currentPrice,
      gain: pos.gain,
      porto: pos.porto,
      gainPercentage: pos.gainPercentage || 0,
      currency: 'USD', // Crypto default to USD
      type: 'crypto',
      lastUpdate: new Date().toISOString()
    };
  }).filter(Boolean);

  const gold = Array.from(goldMap.entries()).map(([ticker, txs]) => {
    // Determine price using fetched 'gold' structure in 'prices'
    // The prices object structure for gold is slightly complex: prices.gold = { digital: {...}, physical: {...} }
    // But here 'prices' is likely the specific gold asset price if flattened?
    // No, updatePrices(data.prices) spreads results.
    // In api/prices.js, 'gold' is a separate key in the result: prices = { ...stock, ...crypto, gold: ... }

    // We need to access prices.gold structure.
    // However, the 'prices' argument here is flattened by key usually for stocks/crypto... 
    // Wait, updatePrices in usePortfolioState spreads the input. 
    // If api returned { prices: { ...stocks, gold: { ... } } }, then 'prices' state has 'gold' property.

    // So we access prices.gold
    const goldPrices = prices.gold || {};
    let currentPrice = 0;

    const sampleTx = txs.find(t => t.type !== 'delete') || txs[0];
    const subtype = sampleTx.subtype || 'digital';
    const brand = sampleTx.brand || 'pegadaian';

    if (subtype === 'digital') {
      currentPrice = goldPrices.digital?.sellPrice || goldPrices.digital?.price || 0; // Use sellPrice (Buyback) for valuation? Standard is usually Sell Price.
      // Actually valuation usually uses Buyback price (what we can sell it for).
      // Let's use sellPrice if available, else price.
    } else {
      const b = brand.toLowerCase();
      if (goldPrices.physical && goldPrices.physical[b]) {
        currentPrice = goldPrices.physical[b].price || 0;
      } else {
        currentPrice = goldPrices.digital?.sellPrice || 0;
      }
    }

    // Skip delete transactions when building assets
    const validTransactions = txs.filter(tx => tx.type !== 'delete');
    if (validTransactions.length === 0) return null;

    const pos = calculatePositionFromTransactions(validTransactions, currentPrice);

    if (pos.amount <= 0) return null;

    return {
      ticker: ticker,
      name: sampleTx.name || ticker,
      weight: pos.amount, // Weight in grams
      amount: pos.amount, // Required for AssetTable
      lots: pos.amount, // reuse lots field for generic amount if needed by table
      avgPrice: pos.avgPrice,
      totalCost: pos.totalCost,
      currentPrice: currentPrice,
      gain: pos.gain,
      porto: pos.porto,
      gainPercentage: pos.gainPercentage || 0,
      currency: 'IDR',
      market: 'Gold',
      type: 'gold',
      subtype: subtype,
      brand: brand,
      lastUpdate: new Date().toISOString()
    };
  }).filter(Boolean);

  const cash = Array.from(cashMap.entries()).map(([ticker, txs]) => {
    // For cash, price is always 1 (as it is the base currency value itself)
    // We treat 'ticker' as the Bank/Wallet name
    const currentPrice = 1;

    // Skip delete transactions when building assets
    const validTransactions = txs.filter(tx => tx.type !== 'delete');
    if (validTransactions.length === 0) {
      return null;
    }

    const pos = calculatePositionFromTransactions(validTransactions, currentPrice);

    if (pos.amount <= 0) {
      return null;
    }

    return {
      ticker: ticker, // Bank Name
      amount: pos.amount, // Total Balance
      avgPrice: 1, // Always 1 for cash
      totalCost: pos.amount, // Cost is same as amount for cash
      currentPrice: 1,
      gain: 0, // No gain/loss on cash holdings usually (unless currency diff, but here simplified)
      porto: pos.amount,
      portoIDR: pos.amount, // Assume IDR for now
      portoUSD: exchangeRate && exchangeRate > 0 ? Math.round((pos.amount / exchangeRate) * 100) / 100 : 0,
      gainPercentage: 0,
      currency: 'IDR',
      type: 'cash',
      lastUpdate: new Date().toISOString()
    };
  }).filter(Boolean);

  return {
    stocks: stocks,
    crypto: crypto,
    gold: gold,
    cash: cash
  };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading, logout, logoutAllSessions, getUserPortfolio, saveUserPortfolio } = useAuth();
  const { t, language } = useLanguage();
  const router = useRouter();
  const [confirmModal, setConfirmModal] = useState(null);
  const [sellingLoading, setSellingLoading] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [showAverageCalculator, setShowAverageCalculator] = useState(false);
  const [rateLimitNotification, setRateLimitNotification] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [resetProgress, setResetProgress] = useState(0);
  const [resetStatus, setResetStatus] = useState('');
  const [restoreComplete, setRestoreComplete] = useState(false);
  const restoreInProgressRef = useRef(false); // Flag to prevent race condition during restore



  // Hide Balance State (Lifted from Portfolio)
  const [hideBalance, setHideBalance] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hideBalance');
      return saved === 'true';
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('hideBalance', hideBalance);
  }, [hideBalance]);

  // Prevent accidental close during operations
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (resetProgress > 0 && resetProgress < 100) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [resetProgress]);

  // Use Portfolio State Manager
  const {
    assets,
    transactions,
    prices,
    exchangeRate,
    lastUpdate,
    isInitialized,
    isLoading: portfolioLoading,
    initialize: initializePortfolio,
    updateTransactions,
    updatePrices,
    updateExchangeRate,
    addTransaction,
    deleteAsset,
    getAsset,
    getPortfolioSummary,
    rebuildPortfolio,
    reset
  } = usePortfolioState();

  // Add refs for intervals
  const refreshIntervalRef = useRef(null);
  const exchangeIntervalRef = useRef(null);
  const initialRefreshDoneRef = useRef(false);
  const isInitializingRef = useRef(false);

  // Memoize formatPrice function
  const formatPrice = useCallback((value, currency = 'IDR') => {
    try {
      if (value === undefined || value === null || isNaN(value) || value === 0) {
        return currency === 'IDR' ? formatIDR(0) : formatUSD(0);
      }

      if (currency === 'IDR') {
        return formatIDR(value, 0);
      } else {
        return formatUSD(value, 2);
      }
    } catch (error) {
      secureLogger.error('Error formatting price:', error);
      return value.toString();
    }
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    const checkAuth = async () => {
      if (!authLoading) {
        if (!user) {
          router.push('/login');
        } else {
          try {
            setLoading(true);
            const portfolio = await getUserPortfolio();
            secureLogger.log('Loaded portfolio from Firestore:', portfolio);

            // Initialize portfolio state manager
            initializePortfolio(portfolio);
          } catch (error) {
            secureLogger.error("Error loading portfolio:", error);
          } finally {
            setLoading(false);
          }
        }
      }
    };

    checkAuth();
  }, [user, authLoading, router, getUserPortfolio, initializePortfolio]);

  // Separate function for actual price fetching
  const performPriceFetch = useCallback(async () => {
    setPricesLoading(true);

    try {
      if (!assets) {
        secureLogger.log('No assets to fetch prices for');
        return;
      }

      // Filter valid stocks and prepare tickers
      const validStocks = (assets?.stocks || []).filter(stock => {
        if (!stock || !stock.ticker || !stock.ticker.trim()) return false;
        if (stock.lots <= 0) return false;
        return true;
      });

      const stockTickers = validStocks.map(stock => {
        // Respect the market property if available
        if (stock.market === 'US') {
          return stock.ticker;
        }
        // Fallback/Default to IDX
        // If ticker already has .JK, leave it. If not, append .JK.
        // This ensures compatibility with existing data that might be IDX implied.
        const cleanTicker = stock.ticker.trim().toUpperCase();
        return cleanTicker.endsWith('.JK') ? cleanTicker : `${cleanTicker}.JK`;
      });

      const cryptoSymbols = (assets?.crypto || [])
        .filter(crypto => crypto && crypto.symbol && crypto.symbol.trim() && crypto.symbol.toUpperCase() !== 'INVALID')
        .map(crypto => crypto.symbol);

      if (stockTickers.length === 0 && cryptoSymbols.length === 0) {
        secureLogger.log('No valid tickers to fetch');
        return;
      }

      const requestData = {
        stocks: stockTickers.filter(ticker => ticker && ticker.trim()),
        crypto: cryptoSymbols.filter(symbol => symbol && symbol.trim()),
        gold: (assets?.gold?.length > 0 || activeTab === 'add') // Fetch gold if assets exist OR if on add tab (simplification)
      };

      secureLogger.log('Fetching prices for:', requestData);

      const token = user ? await user.getIdToken() : null;

      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          ...requestData,
          exchangeRate: typeof exchangeRate === 'number' ? exchangeRate : null,
          // userId is now redundant if token is verified, but keeping for backward compat if needed temporarily
          userId: user?.uid || null
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          secureLogger.warn('Rate limit hit, will retry later');
          // Mark rate limit hit in refresh optimizer
          refreshOptimizer.markRateLimitHit();

          // Show rate limit notification with retry option
          setRateLimitNotification({
            isOpen: true,
            title: t('rateLimitExceeded'),
            message: t('rateLimitMessage') + ' Click OK to retry in 30 seconds.',
            type: 'warning',
            onConfirm: () => {
              setRateLimitNotification(null);
              // Retry after 30 seconds
              setTimeout(async () => {
                try {
                  await performPriceFetch();
                } catch (retryError) {
                  secureLogger.error('Retry failed:', retryError);
                }
              }, 30000);
            }
          });

          return; // Don't throw error for rate limiting
        }
        secureLogger.warn(`API error: ${response.status}`);
        return;
      }

      const data = await response.json();
      secureLogger.log('Received prices:', data.prices);

      // Reset rate limit status on successful request
      refreshOptimizer.resetRateLimit();

      updatePrices(data.prices);



      // Force portfolio value update after price update - Removed to prevent wiping state if transactions not ready
      // updatePrices already calls updatePortfolioValues() internally which is safe
      // setTimeout(() => {
      //   rebuildPortfolio();
      // }, 100);

    } catch (error) {
      secureLogger.error('Error fetching prices:', error);
    } finally {
      setPricesLoading(false);
    }
  }, [exchangeRate, assets, user?.uid, updatePrices, rebuildPortfolio, t]);

  // Simplified price fetching function with debouncing and refresh optimizer
  const fetchPrices = useCallback(async (immediate = false) => {
    if (pricesLoading && !immediate) {
      secureLogger.log('Skipping fetch - already loading prices');
      return; // Prevent concurrent requests
    }

    // Use refresh optimizer to prevent excessive calls
    if (!immediate) {
      await refreshOptimizer.triggerRefresh(async () => {
        await performPriceFetch();
      });
    } else {
      // For immediate refresh, check if we can refresh or queue it
      if (refreshOptimizer.canRefresh()) {
        await performPriceFetch();
      } else {
        secureLogger.log('Rate limited, queuing immediate refresh');
        refreshOptimizer.queueRefresh(async () => {
          await performPriceFetch();
        });
      }
    }
  }, [pricesLoading, performPriceFetch]);

  // Update exchange rate function - STABILIZED
  const fetchExchangeRateData = useCallback(async () => {
    try {
      const rateData = await fetchExchangeRate();
      if (rateData && rateData.rate) {
        updateExchangeRate(rateData.rate);
      }
    } catch (error) {
      secureLogger.error('Error fetching exchange rate:', error);
      updateExchangeRate(null);
    }
  }, [updateExchangeRate]); // Add back the dependency

  // Manual refresh exchange rate function (for button clicks)
  const handleRefreshExchangeRate = useCallback(async () => {
    try {
      const rateData = await fetchExchangeRate();
      if (rateData && rateData.rate) {
        updateExchangeRate(rateData.rate);
      }
    } catch (error) {
      secureLogger.error('Error fetching exchange rate:', error);
      updateExchangeRate(null);
    }
  }, [updateExchangeRate]); // Add back the dependency

  // Manual trigger for immediate refresh (prices only, not exchange rate)
  const triggerImmediateRefresh = useCallback(async () => {
    secureLogger.log('Manual refresh triggered (prices only)');
    try {
      await performPriceFetch(); // Force immediate refresh
      rebuildPortfolio();
      secureLogger.log('Manual refresh completed');
    } catch (error) {
      secureLogger.error('Error in manual refresh:', error);
    }
  }, [performPriceFetch, rebuildPortfolio]); // Add back the dependencies

  // Update prices function
  const triggerPriceUpdate = useCallback(async () => {
    if (assets?.stocks?.length > 0 || assets?.crypto?.length > 0) {
      await performPriceFetch();
    }
  }, [assets?.stocks?.length, assets?.crypto?.length, performPriceFetch]); // Add back the dependencies

  // Auto-refresh prices after restore when assets are populated
  useEffect(() => {
    if (restoreComplete) {
      const hasAssets = (assets?.stocks?.length > 0 || assets?.crypto?.length > 0);
      if (hasAssets) {
        secureLogger.log('Assets updated after restore, fetching prices...');
        performPriceFetch(true); // Immediate fetch
        setRestoreComplete(false);
      }
    }
  }, [assets, restoreComplete, performPriceFetch]);

  // Set up intervals for exchange rate and price updates - OPTIMIZED
  useEffect(() => {
    // Only set up intervals after initialization
    if (!isInitialized) return;

    secureLogger.log('Setting up refresh intervals - isInitialized:', isInitialized);

    // Initial refresh when component mounts (immediate) - ONLY ONCE
    if (!initialRefreshDoneRef.current && !isInitializingRef.current) {
      isInitializingRef.current = true;

      fetchExchangeRateData();

      // Immediate price refresh when web is first opened - ONLY ONCE
      if (assets?.stocks?.length > 0 || assets?.crypto?.length > 0) {
        secureLogger.log('IMMEDIATE REFRESH triggered (first time opening web)');
        performPriceFetch();
      } else {
        secureLogger.log('No assets available for immediate refresh, skipping');
      }

      initialRefreshDoneRef.current = true;
      isInitializingRef.current = false;
    }

    // Exchange rate update every 5 minutes (less frequent)
    exchangeIntervalRef.current = setInterval(() => {
      secureLogger.log('AUTOMATIC EXCHANGE RATE REFRESH triggered (5 minute interval)');
      fetchExchangeRateData();
    }, 300000);

    // Price refresh every 5 minutes (only if assets exist) - less frequent for idle users
    refreshIntervalRef.current = setInterval(() => {
      if (assets?.stocks?.length > 0 || assets?.crypto?.length > 0) {
        secureLogger.log('AUTOMATIC PRICE REFRESH triggered (5 minute interval)');
        performPriceFetch();
      }
    }, 300000); // Refresh every 5 minutes instead of 30 seconds

    // Clean up intervals on unmount
    return () => {
      secureLogger.log('Cleaning up refresh intervals');
      if (exchangeIntervalRef.current) {
        clearInterval(exchangeIntervalRef.current);
        exchangeIntervalRef.current = null;
      }
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [isInitialized]); // Remove dependencies that cause re-renders

  // Manual refresh functions

  // Save portfolio to Firestore whenever assets change
  useEffect(() => {
    if (user && !loading && !authLoading && saveUserPortfolio && assets && isInitialized) {
      saveUserPortfolio(assets);
    }
  }, [assets, user, loading, authLoading, saveUserPortfolio, isInitialized]);

  // Fetch transactions and update portfolio state
  useEffect(() => {
    if (!user) {
      secureLogger.log('No user found, skipping transaction fetch');
      return;
    }

    secureLogger.log('Fetching transactions for user:', user.uid);
    const q = query(
      collection(db, 'users', user.uid, 'transactions'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Skip processing if restore is in progress to prevent race condition
      if (restoreInProgressRef.current) {
        secureLogger.log('Restore in progress, skipping snapshot processing');
        return;
      }

      // Safeguard log for empty snapshot
      if (snapshot.docs.length === 0) {
        secureLogger.log('Warning: Snapshot received 0 documents. User ID:', user.uid);
      }

      secureLogger.log('Received transaction snapshot:', snapshot.size, 'documents');
      const newTransactions = snapshot.docs.map(doc => {
        const data = doc.data();
        const timestamp = data.timestamp;
        const timestampISO = timestamp ? (timestamp.toDate ? timestamp.toDate().toISOString() : timestamp) : new Date().toISOString();

        return {
          id: doc.id,
          ...data,
          timestamp: timestampISO
        };
      });

      // Update portfolio state manager
      updateTransactions(newTransactions);
    }, (error) => {
      secureLogger.error('Error in transaction listener:', error);
    });

    return () => {
      secureLogger.log('Cleaning up transaction listener');
      unsubscribe();
    };
  }, [user, updateTransactions]);

  // Daily Snapshot Logic
  // Reusable Snapshot Function
  const recordDailySnapshot = useCallback(async (force = false) => {
    if (!user || loading || authLoading || !assets || !isInitialized) {
      if (force) {
        setConfirmModal({
          isOpen: true,
          title: t('pleaseWait') || 'Mohon Tunggu',
          message: language === 'en' ? 'Data is not ready yet. Please try again shortly.' : 'Data belum siap, coba sesaat lagi.',
          type: 'warning',
          confirmText: t('ok') || 'OK',
          onConfirm: () => setConfirmModal(null)
        });
      }
      return;
    }

    // Use Local Date
    const dateObj = new Date();
    const today = dateObj.toLocaleDateString('en-CA');
    const snapshotRef = doc(db, 'users', user.uid, 'history', today);

    try {
      const docSnap = await getDoc(snapshotRef);

      // CRITICAL: Calculate values using LIVE PRICES, exactly like Portfolio.js does!
      // This ensures snapshot matches what user sees in Portfolio
      const safeExchangeRate = exchangeRate && exchangeRate > 0 ? exchangeRate : 16000;

      const stocks = assets.stocks || [];
      const crypto = assets.crypto || [];
      const gold = assets.gold || [];
      const cash = assets.cash || [];

      // Calculate STOCKS using LIVE prices (same logic as Portfolio.js)
      let stocksValueIDR = 0;
      let stocksValueUSD = 0;
      let stocksInvestedIDR = 0;
      stocks.forEach(stock => {
        // Get live price from prices state (same as Portfolio.js)
        const priceKey = stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`;
        const realtimePrice = prices[priceKey];
        let currentPrice = stock.entryPrice || 0;
        if (realtimePrice && realtimePrice.price) {
          currentPrice = realtimePrice.price;
        }

        const shareCount = stock.market === 'US' ? (stock.lots || 0) : (stock.lots || 0) * 100;

        if (stock.market === 'US') {
          const valueUSD = currentPrice * shareCount;
          stocksValueUSD += valueUSD;
          stocksValueIDR += valueUSD * safeExchangeRate;
        } else {
          const valueIDR = currentPrice * shareCount;
          stocksValueIDR += valueIDR;
          stocksValueUSD += valueIDR / safeExchangeRate;
        }

        // Calculate invested from average price (cost basis)
        const avgPrice = stock.avgPrice || stock.entryPrice || 0;
        if (stock.market === 'US') {
          stocksInvestedIDR += avgPrice * shareCount * safeExchangeRate;
        } else {
          stocksInvestedIDR += avgPrice * shareCount;
        }
      });

      // Calculate CRYPTO using LIVE prices (same logic as Portfolio.js)
      let cryptoValueIDR = 0;
      let cryptoValueUSD = 0;
      let cryptoInvestedIDR = 0;
      crypto.forEach(c => {
        // Get live price from prices state
        let price;
        if ((c.useManualPrice || c.isManual) && (c.manualPrice || c.price || c.avgPrice)) {
          price = c.manualPrice || c.price || c.avgPrice;
        } else {
          price = prices[c.symbol]?.price || c.currentPrice || 0;
        }

        const amount = parseFloat(c.amount) || 0;
        const valUSD = price * amount;
        cryptoValueUSD += valUSD;
        cryptoValueIDR += valUSD * safeExchangeRate;

        // Calculate invested from average price
        const avgPrice = c.avgPrice || c.entryPrice || 0;
        cryptoInvestedIDR += avgPrice * amount * safeExchangeRate;
      });

      // Calculate GOLD
      let goldValueIDR = 0;
      let goldValueUSD = 0;
      let goldInvestedIDR = 0;
      gold.forEach(g => {
        const price = g.currentPrice || 0;
        const amount = parseFloat(g.weight) || 0;
        const valIDR = price * amount;

        goldValueIDR += valIDR;
        goldValueUSD += valIDR / safeExchangeRate;

        // Calculate invested
        const avgPrice = g.avgPrice || g.entryPrice || 0;
        goldInvestedIDR += avgPrice * amount;
      });

      // Calculate CASH (no P/L, just value)
      let cashValueIDR = 0;
      let cashValueUSD = 0;
      cash.forEach(c => {
        const amount = parseFloat(c.amount) || 0;
        if (c.currency === 'USD') {
          cashValueUSD += amount;
          cashValueIDR += amount * safeExchangeRate;
        } else {
          cashValueIDR += amount;
          cashValueUSD += amount / safeExchangeRate;
        }
      });

      // Total Value includes ALL assets (including cash)
      const totalValueIDR = stocksValueIDR + cryptoValueIDR + goldValueIDR + cashValueIDR;
      const totalValueUSD = stocksValueUSD + cryptoValueUSD + goldValueUSD + cashValueUSD;

      // Total Invested EXCLUDES cash - cash is not an investment, has no P/L
      const totalInvestedIDR = stocksInvestedIDR + cryptoInvestedIDR + goldInvestedIDR;


      // DEBUG: Log what we're calculating
      console.log('[SNAPSHOT DEBUG] Using LIVE PRICES - Asset counts:', {
        stocks: stocks.length,
        crypto: crypto.length,
        gold: gold.length,
        cash: cash.length
      });
      console.log('[SNAPSHOT DEBUG] Value breakdown (IDR) with LIVE prices:', {
        stocksValueIDR: Math.round(stocksValueIDR),
        cryptoValueIDR: Math.round(cryptoValueIDR),
        goldValueIDR: Math.round(goldValueIDR),
        cashValueIDR: Math.round(cashValueIDR),
        totalValueIDR: Math.round(totalValueIDR)
      });
      console.log('[SNAPSHOT DEBUG] Invested breakdown (IDR):', {
        stocksInvestedIDR: Math.round(stocksInvestedIDR),
        cryptoInvestedIDR: Math.round(cryptoInvestedIDR),
        goldInvestedIDR: Math.round(goldInvestedIDR),
        totalInvestedIDR: Math.round(totalInvestedIDR)
      });

      // Create ENRICHED portfolio with correct values calculated from LIVE PRICES
      // This ensures when reports.js reads the snapshot, values match what Portfolio displayed
      const enrichedPortfolio = {
        stocks: stocks.map(stock => {
          const priceKey = stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`;
          const realtimePrice = prices[priceKey];
          let currentPrice = stock.entryPrice || 0;
          if (realtimePrice && realtimePrice.price) {
            currentPrice = realtimePrice.price;
          }
          const shareCount = stock.market === 'US' ? (stock.lots || 0) : (stock.lots || 0) * 100;
          const avgPrice = stock.avgPrice || stock.entryPrice || 0;

          let portoIDR, portoUSD, totalCostIDR;
          if (stock.market === 'US') {
            const valueUSD = currentPrice * shareCount;
            portoUSD = valueUSD;
            portoIDR = valueUSD * safeExchangeRate;
            totalCostIDR = avgPrice * shareCount * safeExchangeRate;
          } else {
            const valueIDR = currentPrice * shareCount;
            portoIDR = valueIDR;
            portoUSD = valueIDR / safeExchangeRate;
            totalCostIDR = avgPrice * shareCount;
          }

          return {
            ...stock,
            currentPrice,
            porto: portoIDR,
            portoIDR: Math.round(portoIDR),
            portoUSD: Math.round(portoUSD * 100) / 100,
            totalCost: totalCostIDR,
            totalCostIDR: Math.round(totalCostIDR)
          };
        }),
        crypto: crypto.map(c => {
          let price;
          if ((c.useManualPrice || c.isManual) && (c.manualPrice || c.price || c.avgPrice)) {
            price = c.manualPrice || c.price || c.avgPrice;
          } else {
            price = prices[c.symbol]?.price || c.currentPrice || 0;
          }
          const amount = parseFloat(c.amount) || 0;
          const avgPrice = c.avgPrice || c.entryPrice || 0;

          const valUSD = price * amount;
          const portoIDR = valUSD * safeExchangeRate;
          const totalCostIDR = avgPrice * amount * safeExchangeRate;

          return {
            ...c,
            currentPrice: price,
            porto: valUSD,
            portoUSD: Math.round(valUSD * 100) / 100,
            portoIDR: Math.round(portoIDR),
            totalCost: avgPrice * amount,
            totalCostIDR: Math.round(totalCostIDR)
          };
        }),
        gold: gold.map(g => {
          const price = g.currentPrice || 0;
          const amount = parseFloat(g.weight) || 0;
          const avgPrice = g.avgPrice || g.entryPrice || 0;

          const valIDR = price * amount;
          const totalCostIDR = avgPrice * amount;

          return {
            ...g,
            porto: valIDR,
            portoIDR: Math.round(valIDR),
            portoUSD: Math.round((valIDR / safeExchangeRate) * 100) / 100,
            totalCost: totalCostIDR,
            totalCostIDR: Math.round(totalCostIDR)
          };
        }),
        cash: cash.map(c => {
          const amount = parseFloat(c.amount) || 0;
          let portoIDR, portoUSD;
          if (c.currency === 'USD') {
            portoUSD = amount;
            portoIDR = amount * safeExchangeRate;
          } else {
            portoIDR = amount;
            portoUSD = amount / safeExchangeRate;
          }
          return {
            ...c,
            porto: portoIDR,
            portoIDR: Math.round(portoIDR),
            portoUSD: Math.round(portoUSD * 100) / 100
          };
        })
      };

      const snapshotData = {
        date: today,
        totalValueIDR: Math.round(totalValueIDR),
        totalValueUSD: totalValueUSD,
        totalInvestedIDR: Math.round(totalInvestedIDR),
        timestamp: serverTimestamp(),
        portfolio: cleanUndefinedValues(enrichedPortfolio)
      };

      if (force || !docSnap.exists()) {
        secureLogger.log(`Recording daily snapshot (${force ? 'Manual' : 'Auto'}):`, today);
        // Use full overwrite (no merge) to prevent portfolio array duplication
        await setDoc(snapshotRef, snapshotData);
        if (force) {
          setConfirmModal({
            isOpen: true,
            title: t('success') || 'Berhasil',
            message: language === 'en' ? 'Snapshot saved successfully!' : 'Snapshot berhasil disimpan!',
            type: 'success',
            confirmText: t('ok') || 'OK',
            onConfirm: () => setConfirmModal(null)
          });
        }
      } else {
        // Auto-update throttle: Only update if last update was > 1 minute ago
        const lastData = docSnap.data();
        // Handle Firestore Timestamp or standard Date string/object
        let lastTime = new Date(0);
        if (lastData.timestamp?.toDate) {
          lastTime = lastData.timestamp.toDate();
        } else if (lastData.timestamp) {
          lastTime = new Date(lastData.timestamp);
        }

        const now = new Date();
        const diffMs = now - lastTime;
        // Check if last update was more than 10 seconds ago (User Request: "setiap 10 detik")
        const diffSeconds = diffMs / 1000;

        if (diffSeconds >= 10) {
          secureLogger.log(`Auto-updating daily snapshot (throttle: ${diffSeconds.toFixed(1)}s passed)`);
          // Use full overwrite (no merge) to prevent portfolio array duplication
          await setDoc(snapshotRef, snapshotData);
        } else {
          // secureLogger.log('Skipping auto-update: throttled (< 10 seconds)');
        }
      }
    } catch (err) {
      secureLogger.error('Error saving daily snapshot:', err);
      if (force) {
        setConfirmModal({
          isOpen: true,
          title: t('error') || 'Gagal',
          message: (language === 'en' ? 'Failed to save snapshot: ' : 'Gagal menyimpan snapshot: ') + err.message,
          type: 'error',
          confirmText: t('ok') || 'OK',
          onConfirm: () => setConfirmModal(null)
        });
      }
    }
  }, [user, assets, prices, loading, authLoading, isInitialized, exchangeRate, t, language]);

  // Daily Snapshot Logic (Auto - Debounce on Change)
  useEffect(() => {
    // Debounce check for changes
    const timeoutId = setTimeout(() => {
      if (!loading && !authLoading && assets && isInitialized) {
        recordDailySnapshot(false);
      }
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [recordDailySnapshot, loading, authLoading, assets, isInitialized]);

  // Active Daily Snapshot Sync (Periodic 10-second heartbeat)
  useEffect(() => {
    if (!loading && !authLoading && isInitialized && user) {
      const intervalId = setInterval(() => {
        // secureLogger.log('Heartbeat: Triggering daily snapshot check (10s)');
        recordDailySnapshot(false);
      }, 10000); // Check every 10 seconds as requested

      return () => clearInterval(intervalId);
    }
  }, [recordDailySnapshot, loading, authLoading, isInitialized, user]);



  // This function is no longer needed as Firebase listener handles updates automatically

  const addStock = async (stock) => {
    try {
      secureLogger.log('Adding stock:', stock);

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Validate required fields
      if (!stock.ticker || !stock.lots) {
        throw new Error('Missing required fields: ticker or lots');
      }

      // Validate numeric values ONLY for IDX
      // For US, lots is shares/100 (can be fractional), so skip this validation or use different one
      if (stock.market !== 'US') {
        validateIDXLots(stock.lots);
      }

      // Format timestamp
      const now = new Date();
      const formattedDate = now.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Calculate values based on currency
      let valueIDR, valueUSD;
      const shareCount = stock.market === 'US' ? stock.lots : stock.lots * 100;

      // Use Manual Average Price if available (User Input), otherwise use Current Market Price
      // This ensures the Cost Basis is recorded correctly as per user input
      const transactionPrice = stock.avgPrice || stock.price;

      if (stock.currency === 'IDR') {
        valueIDR = transactionPrice * shareCount;
        valueUSD = exchangeRate && exchangeRate > 0 ? valueIDR / exchangeRate : 0;
      } else { // USD
        valueUSD = transactionPrice * shareCount;
        valueIDR = exchangeRate && exchangeRate > 0 ? valueUSD * exchangeRate : 0;
      }

      // Create transaction data
      const transactionData = {
        type: 'buy',
        assetType: 'stock',
        ticker: stock.ticker,
        amount: stock.market === 'US' ? stock.lots : stock.lots * 100, // Store amount in shares
        price: transactionPrice, // Use the determined transaction price for cost basis
        valueIDR: valueIDR,
        valueUSD: valueUSD,
        date: formattedDate,
        timestamp: serverTimestamp(),
        currency: stock.currency,
        market: stock.market || 'IDX', // Store market info
        status: 'completed',
        userId: user.uid,
        broker: stock.broker || null, // Create asset with broker info
        ...(stock.entry && { entry: stock.entry })
      };

      // Save to Firestore
      const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      secureLogger.log('Transaction saved with ID:', transactionRef.id);

      // Immediately update portfolio with current price (keep using current market price for display)
      const currentPrices = { ...prices };
      // Use proper key based on market
      const priceKey = stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`;

      currentPrices[priceKey] = {
        price: stock.price, // Keep tracking CURRENT price for value, but cost basis is in transaction
        currency: stock.currency || (stock.market === 'US' ? 'USD' : 'IDR'),
        change: 0,
        changeTime: '24h',
        lastUpdate: new Date().toISOString()
      };
      updatePrices(currentPrices);

      // Rebuild portfolio immediately to reflect the new price
      setTimeout(() => {
        rebuildPortfolio();
      }, 100);

      // Smart refresh - only fetch prices for the newly added asset
      setTimeout(async () => {
        try {
          const token = user ? await user.getIdToken() : null;
          const response = await fetch('/api/prices', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token && { 'Authorization': `Bearer ${token}` })
            },
            body: JSON.stringify({
              stocks: [priceKey],
              crypto: [],
              exchangeRate: exchangeRate,
              userId: user?.uid || null
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const newPrices = { ...prices, ...data.prices };
            updatePrices(newPrices);
            rebuildPortfolio();
          }
        } catch (error) {
          secureLogger.error('Error fetching updated price for new stock:', error);
        }
      }, 2000); // Wait 2 seconds before fetching updated price

      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: t('stockSuccessfullyAdded', { ticker: stock.ticker }),
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      secureLogger.error('Error in addStock:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: t('failedToAddStock', { error: error.message }),
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  const addCrypto = async (crypto) => {
    try {
      secureLogger.log('Adding crypto:', crypto);

      if (!user) {
        throw new Error('User not authenticated');
      }

      let cryptoPrice = null;

      // Ensure we don't re-fetch for manual assets or if price is already reliable
      if (crypto.isManual) {
        cryptoPrice = { price: crypto.price, change: 0 };
        secureLogger.log('Using manual price for crypto:', cryptoPrice);
      } else {
        // Fetch current crypto price
        try {
          const token = user ? await user.getIdToken() : null;
          const response = await fetch('/api/prices', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token && { 'Authorization': `Bearer ${token}` })
            },
            body: JSON.stringify({
              stocks: [],
              crypto: [crypto.symbol],
              exchangeRate: exchangeRate,
              userId: user?.uid || null
            }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              secureLogger.warn('Rate limit hit while adding crypto, will retry later');
              // Mark rate limit hit in refresh optimizer
              refreshOptimizer.markRateLimitHit();

              // Show rate limit notification with retry option
              setConfirmModal({
                isOpen: true,
                title: t('rateLimitExceeded'),
                message: t('rateLimitMessage') + ' Click OK to retry in 30 seconds.',
                type: 'warning',
                confirmText: 'OK',
                onConfirm: () => {
                  setConfirmModal(null);
                  // Retry after 30 seconds
                  setTimeout(async () => {
                    try {
                      await addCrypto(crypto);
                    } catch (retryError) {
                      secureLogger.error('Retry failed:', retryError);
                    }
                  }, 30000);
                }
              });
              return;
            }

            // Handle other API errors - Log but don't crash if we have a fallback
            secureLogger.warn(`Failed to fetch crypto price (HTTP ${response.status})`);
          } else {
            const data = await response.json();
            if (data.prices && data.prices[crypto.symbol]) {
              cryptoPrice = data.prices[crypto.symbol];
            }
          }
        } catch (fetchErr) {
          secureLogger.warn('Error fetching crypto price in addCrypto:', fetchErr);
        }
      }

      // Fallback if API failed but we have a manual/user price
      if ((!cryptoPrice || !cryptoPrice.price) && crypto.price > 0) {
        secureLogger.log('Falling back to provided crypto price (Manual):', crypto.price);
        cryptoPrice = { price: crypto.price, change: 0 };
        // Force manual flag if it wasn't set, as we are now using manual price
        crypto.isManual = true;
      }

      if (!cryptoPrice || !cryptoPrice.price) {
        throw new Error('Invalid crypto price data received. Please provide a manual price.');
      }

      secureLogger.log('Fetched crypto price:', cryptoPrice);

      // Format timestamp
      const now = new Date();
      const formattedDate = now.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Calculate total value based on average price (Cost Basis) or current API price
      // Use Manual Average Price if available (User Input), otherwise use Current Market Price
      const transactionPrice = crypto.avgPrice || crypto.price || cryptoPrice.price;

      const totalValueUSD = transactionPrice * crypto.amount;
      const totalValueIDR = exchangeRate && exchangeRate > 0 ? totalValueUSD * exchangeRate : 0;

      // Create transaction data
      const transactionData = {
        type: 'buy',
        assetType: 'crypto',
        symbol: crypto.symbol,
        amount: crypto.amount,
        price: transactionPrice, // Use cost basis price
        valueIDR: totalValueIDR,
        valueUSD: totalValueUSD,
        date: formattedDate,
        timestamp: serverTimestamp(),
        currency: 'USD',
        status: 'completed',
        userId: user.uid,
        exchange: crypto.exchange || null, // Create asset with exchange info
        ...(crypto.entry && { entry: crypto.entry })
      };

      // Save to Firestore
      const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      secureLogger.log('Crypto transaction saved with ID:', transactionRef.id);

      // The Firebase listener will automatically update the portfolio state
      // No need to manually add to portfolio state manager

      // Immediately update portfolio with current price
      const currentPrices = { ...prices };
      currentPrices[crypto.symbol] = {
        price: crypto.price,
        currency: 'USD',
        change: 0,
        changeTime: '24h',
        lastUpdate: new Date().toISOString()
      };
      updatePrices(currentPrices);
      rebuildPortfolio();

      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: t('cryptoSuccessfullyAdded', { symbol: crypto.symbol }),
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      secureLogger.error('Error in addCrypto:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: t('failedToAddCrypto', { error: error.message }),
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  const addGold = async (gold) => {
    try {
      secureLogger.log('Adding gold:', gold);
      if (!user) throw new Error('User not authenticated');

      const transactionData = {
        type: 'buy',
        assetType: 'gold',
        ticker: gold.ticker,
        name: gold.name,
        amount: gold.weight, // Grams
        price: gold.price,
        valueIDR: gold.price * gold.weight,
        valueUSD: (gold.price * gold.weight) / (exchangeRate || 16500),
        date: new Date().toLocaleString('id-ID'),
        timestamp: serverTimestamp(),
        currency: 'IDR',
        market: 'Gold',
        subtype: gold.subtype,
        brand: gold.brand,
        broker: gold.broker,
        status: 'completed',
        userId: user.uid
      };

      const docRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      secureLogger.log('Gold transaction saved:', docRef.id);

      // Trigger immediate refresh for gold prices
      setTimeout(() => performPriceFetch(), 500);

      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: `Berhasil menambahkan ${gold.name} (${gold.weight}g)`,
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      secureLogger.error('Error adding gold:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: 'Gagal menambahkan emas: ' + error.message,
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  const addCash = async (cashAsset) => {
    try {
      secureLogger.log('Adding cash:', cashAsset);

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Format timestamp
      const now = new Date();
      const formattedDate = now.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Create transaction data for Cash
      const transactionData = {
        type: 'buy', // Treated as buy/deposit
        assetType: 'cash',
        ticker: cashAsset.ticker, // Bank Name
        amount: cashAsset.amount,
        price: 1, // 1:1 for cash
        valueIDR: cashAsset.amount,
        valueUSD: exchangeRate && exchangeRate > 0 ? cashAsset.amount / exchangeRate : 0,
        date: formattedDate,
        timestamp: serverTimestamp(),
        currency: 'IDR',
        status: 'completed',
        userId: user.uid
      };

      // Save to Firestore
      const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      secureLogger.log('Cash transaction saved with ID:', transactionRef.id);

      // Success Notification
      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: 'Aset kas berhasil ditambahkan',
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

      // Rebuild
      setTimeout(() => {
        rebuildPortfolio();
      }, 100);

    } catch (error) {
      secureLogger.error('Error in addCash:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: error.message,
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  // Portfolio State Manager handles all updates automatically
  const updateStock = (ticker, updatedStock, oldAsset = null) => {
    secureLogger.log('updateStock called for:', ticker, updatedStock, oldAsset);

    // Determine market (default to IDX if not specified)
    const isUS = updatedStock.market === 'US';
    const shareCount = isUS ? parseFloat(updatedStock.lots) : parseFloat(updatedStock.lots) * 100;

    // Validate that lots is a whole number ONLY for IDX
    if (!isUS) {
      validateIDXLots(updatedStock.lots);
    }

    // Create a transaction to update the average price
    const updateTransaction = {
      type: 'update',
      assetType: 'stock',
      ticker: ticker.toUpperCase(),
      amount: shareCount, // Store amount in shares
      price: updatedStock.avgPrice, // Use the new average price (per share)
      valueIDR: isUS
        ? (exchangeRate && exchangeRate > 0 ? (shareCount * updatedStock.avgPrice * exchangeRate) : 0)
        : (shareCount * updatedStock.avgPrice),
      valueUSD: isUS
        ? (shareCount * updatedStock.avgPrice)
        : (exchangeRate && exchangeRate > 0 ? (shareCount * updatedStock.avgPrice) / exchangeRate : 0),
      date: new Date().toLocaleString('id-ID'),
      timestamp: serverTimestamp(),
      currency: isUS ? 'USD' : 'IDR',
      status: 'completed',
      userId: user.uid,
      description: 'Average price updated by user',
      broker: updatedStock.broker || null, // Save broker info
      // Save manual price settings if present
      useManualPrice: updatedStock.useManualPrice || false,
      manualPrice: updatedStock.manualPrice || null
    };

    secureLogger.log('Update transaction created:', updateTransaction);

    // Save to Firestore first
    const saveToFirestore = async () => {
      try {
        // Handle Broker Change: If broker changed, delete the old asset first
        if (oldAsset && oldAsset.broker !== updatedStock.broker) {
          secureLogger.log(`Broker changed from ${oldAsset.broker} to ${updatedStock.broker}. Deleting old asset...`);

          const deleteTransaction = {
            type: 'delete',
            assetType: 'stock',
            ticker: ticker.toUpperCase(),
            amount: 0,
            price: 0,
            total: 0,
            userId: user.uid,
            timestamp: serverTimestamp(),
            description: 'Asset moved to new broker',
            broker: oldAsset.broker // Delete specific holding by OLD broker
          };

          await addDoc(collection(db, 'users', user.uid, 'transactions'), deleteTransaction);
          secureLogger.log('Old asset deleted successfully due to broker change');
        }

        const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), updateTransaction);
        secureLogger.log('Update transaction saved to Firestore with ID:', transactionRef.id);

        // Add to portfolio state manager
        addTransaction({
          id: transactionRef.id,
          ...updateTransaction,
          timestamp: new Date().toISOString()
        });

        // Force portfolio rebuild with multiple attempts
        secureLogger.log('Force portfolio rebuild after updating stock');

        // First attempt - immediate
        rebuildPortfolio();

        // Second attempt - after a short delay
        setTimeout(() => {
          rebuildPortfolio();
        }, 300);

        // Third attempt - ensure portfolio values are updated
        setTimeout(() => {
          rebuildPortfolio();
        }, 800);

        // Force immediate refresh to update UI
        setTimeout(async () => {
          await triggerImmediateRefresh();
        }, 500);

      } catch (error) {
        secureLogger.error('Error saving update transaction to Firestore:', error);
      }
    };

    // Execute the save operation
    saveToFirestore();
  };

  const updateCrypto = (symbol, updatedCrypto, oldAsset = null) => {
    secureLogger.log('updateCrypto called for:', symbol, updatedCrypto, oldAsset);

    // Create a transaction to update the average price
    const updateTransaction = {
      type: 'update',
      assetType: 'crypto',
      symbol: symbol.toUpperCase(),
      amount: updatedCrypto.amount,
      price: updatedCrypto.avgPrice, // Use the new average price (per unit)
      valueIDR: exchangeRate && exchangeRate > 0 ? (updatedCrypto.amount * updatedCrypto.avgPrice) * exchangeRate : 0,
      valueUSD: updatedCrypto.amount * updatedCrypto.avgPrice,
      date: new Date().toLocaleString('id-ID'),
      timestamp: serverTimestamp(),
      currency: 'USD',
      status: 'completed',
      userId: user.uid,
      description: 'Average price updated by user',
      exchange: updatedCrypto.exchange || null, // Save exchange info
      // Save manual price settings if present
      useManualPrice: updatedCrypto.useManualPrice || false,
      manualPrice: updatedCrypto.manualPrice || null
    };
    secureLogger.log('Update transaction created:', updateTransaction);

    // Save to Firestore first
    const saveToFirestore = async () => {
      try {
        // Handle Exchange Change: If exchange changed, delete the old asset first
        if (oldAsset && oldAsset.exchange !== updatedCrypto.exchange) {
          secureLogger.log(`Exchange changed from ${oldAsset.exchange} to ${updatedCrypto.exchange}. Deleting old asset...`);

          const deleteTransaction = {
            type: 'delete',
            assetType: 'crypto',
            symbol: symbol.toUpperCase(),
            amount: 0,
            price: 0,
            total: 0,
            userId: user.uid,
            timestamp: serverTimestamp(),
            description: 'Asset moved to new exchange',
            exchange: oldAsset.exchange // Delete specific holding by OLD exchange
          };

          await addDoc(collection(db, 'users', user.uid, 'transactions'), deleteTransaction);
          secureLogger.log('Old asset deleted successfully due to exchange change');
        }

        const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), updateTransaction);
        secureLogger.log('Update transaction saved to Firestore with ID:', transactionRef.id);

        // Add to portfolio state manager
        addTransaction({
          id: transactionRef.id,
          ...updateTransaction,
          timestamp: new Date().toISOString()
        });

        // Force portfolio rebuild with multiple attempts
        secureLogger.log('Force portfolio rebuild after updating crypto');

        // First attempt - immediate
        rebuildPortfolio();

        // Second attempt - after a short delay
        setTimeout(() => {
          rebuildPortfolio();
        }, 300);

        // Third attempt - ensure portfolio values are updated
        setTimeout(() => {
          rebuildPortfolio();
        }, 800);

        // Force immediate refresh to update UI
        setTimeout(async () => {
          await triggerImmediateRefresh();
        }, 500);

      } catch (error) {
        secureLogger.error('Error saving update transaction to Firestore:', error);
      }
    };

    // Execute the save operation
    saveToFirestore();
  };

  const updateGold = (ticker, updatedGold, oldAsset = null) => {
    secureLogger.log('updateGold called for:', ticker, updatedGold, oldAsset);

    // Create a transaction to update the average price
    const updateTransaction = {
      type: 'update',
      assetType: 'gold',
      ticker: ticker.toUpperCase(),
      amount: parseFloat(updatedGold.amount), // Grams
      price: updatedGold.avgPrice, // Costs per gram
      valueIDR: parseFloat(updatedGold.amount) * updatedGold.avgPrice,
      valueUSD: (parseFloat(updatedGold.amount) * updatedGold.avgPrice) / (exchangeRate || 16500),
      date: new Date().toLocaleString('id-ID'),
      timestamp: serverTimestamp(),
      currency: 'IDR',
      status: 'completed',
      userId: user.uid,
      description: 'Average price updated by user',
      broker: updatedGold.broker || null, // Broker/Location
      subtype: updatedGold.subtype || null,
      brand: updatedGold.brand || null,
      useManualPrice: updatedGold.useManualPrice || false,
      manualPrice: updatedGold.manualPrice || null
    };

    secureLogger.log('Update transaction created (Gold):', updateTransaction);

    const saveToFirestore = async () => {
      try {
        // If broker/location changed, create a delete record for the old entry (if it had a broker)
        if (oldAsset && oldAsset.broker && oldAsset.broker !== updatedGold.broker) {
          secureLogger.log(`Broker changed from ${oldAsset.broker} to ${updatedGold.broker}. Deleting old asset...`);
          const deleteTransaction = {
            type: 'delete',
            assetType: 'gold',
            ticker: ticker.toUpperCase(),
            amount: 0,
            price: 0,
            total: 0,
            userId: user.uid,
            timestamp: serverTimestamp(),
            description: 'Asset moved to new location',
            broker: oldAsset.broker
          };
          await addDoc(collection(db, 'users', user.uid, 'transactions'), deleteTransaction);
        }

        const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), updateTransaction);
        secureLogger.log('Update transaction saved to Firestore with ID:', transactionRef.id);

        addTransaction({
          id: transactionRef.id,
          ...updateTransaction,
          timestamp: new Date().toISOString()
        });

        secureLogger.log('Force portfolio rebuild after updating gold');

        // Force portfolio rebuild with multiple attempts (matching updateStock pattern)
        rebuildPortfolio();
        setTimeout(() => rebuildPortfolio(), 300);
        setTimeout(() => rebuildPortfolio(), 800);

        // Force immediate refresh to update UI
        setTimeout(async () => {
          await triggerImmediateRefresh();
        }, 500);

        // Notify success
        setConfirmModal({
          isOpen: true,
          title: t('success') || 'Sukses',
          message: t('successUpdated') || 'Aset berhasil diperbarui',
          type: 'success',
          confirmText: t('ok') || 'OK',
          onConfirm: () => setConfirmModal(null)
        });

      } catch (error) {
        secureLogger.error('Error saving updated gold:', error);
        setConfirmModal({
          isOpen: true,
          title: t('error') || 'Error',
          message: `Gagal menyimpan: ${error.message}`,
          type: 'error',
          confirmText: t('ok') || 'OK',
          onConfirm: () => setConfirmModal(null)
        });
      }
    };

    // Execute the save operation
    saveToFirestore();
  };


  const deleteStock = async (ticker, asset) => {
    try {
      secureLogger.log('DELETE stock:', ticker, asset);

      // Check if stock exists
      const stock = getAsset('stock', ticker);
      if (!stock) {
        secureLogger.error('Stock not found:', ticker);
        return;
      }

      // Add delete transaction to Firestore
      const deleteTransaction = {
        assetType: 'stock',
        ticker: ticker.toUpperCase(),
        type: 'delete',
        amount: 0,
        price: 0,
        total: 0,
        userId: user.uid,
        timestamp: serverTimestamp(),
        description: 'Asset deleted by user',
        broker: asset?.broker || null // Delete specific holding by broker
      };

      await addDoc(collection(db, 'users', user.uid, 'transactions'), deleteTransaction);

      // Don't manually delete from portfolio state manager - let the transaction listener handle it
      // This ensures consistency with the transaction-based approach

      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: t('stockSuccessfullyDeleted', { ticker: ticker }),
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      secureLogger.error('Error deleting stock:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: t('failedToDeleteStock', { error: error.message }),
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  const deleteCrypto = async (symbol, asset) => {
    try {
      secureLogger.log('DELETE crypto:', symbol, asset);

      // Check if crypto exists
      const crypto = getAsset('crypto', symbol);
      if (!crypto) {
        secureLogger.error('Crypto not found:', symbol);
        return;
      }

      // Add delete transaction to Firestore
      const deleteTransaction = {
        assetType: 'crypto',
        symbol: symbol.toUpperCase(),
        type: 'delete',
        amount: 0,
        price: 0,
        total: 0,
        userId: user.uid,
        timestamp: serverTimestamp(),
        description: 'Asset deleted by user',
        exchange: asset?.exchange || null // Delete specific holding by exchange
      };

      await addDoc(collection(db, 'users', user.uid, 'transactions'), deleteTransaction);

      // Don't manually delete from portfolio state manager - let the transaction listener handle it
      // This ensures consistency with the transaction-based approach

      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: t('cryptoSuccessfullyDeleted', { symbol: symbol }),
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      secureLogger.error('Error deleting crypto:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: t('failedToDeleteCrypto', { error: error.message }),
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  const deleteGold = async (ticker, asset) => {
    try {
      secureLogger.log('DELETE gold:', ticker, asset);
      const gold = getAsset('gold', ticker);
      if (!gold) {
        secureLogger.error('Gold not found:', ticker);
        return;
      }

      const deleteTransaction = {
        assetType: 'gold',
        ticker: ticker.toUpperCase(),
        type: 'delete',
        amount: 0,
        price: 0,
        total: 0,
        userId: user.uid,
        timestamp: serverTimestamp(),
        description: 'Asset deleted by user',
        broker: asset?.broker || null
      };

      await addDoc(collection(db, 'users', user.uid, 'transactions'), deleteTransaction);

      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: `Berhasil menghapus emas ${ticker}`,
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      secureLogger.error('Error deleting gold:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: 'Gagal menghapus emas: ' + error.message,
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  const handleSellStock = async (ticker, asset, amountToSell) => {
    try {
      setSellingLoading(true);

      // Find the stock index by ticker
      const stockIndex = assets?.stocks?.findIndex(stock => stock.ticker === ticker);
      if (stockIndex === -1) {
        secureLogger.error('Stock not found:', ticker);
        return;
      }

      const stock = assets?.stocks?.[stockIndex];

      // Get current price from prices state using correct ticker format
      const tickerKey = `${asset.ticker}.JK`;

      let priceData = prices[tickerKey];
      if (!priceData) {
        // Try to fetch fresh price data before selling
        secureLogger.log('Price data not available, attempting to fetch fresh data...');

        // Fetch fresh prices immediately without debounce
        const stockTickers = [`${asset.ticker}.JK`];
        const requestData = {
          stocks: stockTickers,
          crypto: [],
          exchangeRate: exchangeRate
        };

        try {
          const response = await fetch('/api/prices', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...requestData,
              userId: user?.uid || null
            }),
          });

          if (response.ok) {
            const data = await response.json();
            // Update prices state with fresh data
            updatePrices(data.prices);
            // Get the fresh price data
            priceData = data.prices[tickerKey];
          } else if (response.status === 429) {
            secureLogger.warn('Rate limit hit when fetching fresh price data for selling');
            // Don't throw error, just use existing price data if available
            priceData = asset.currentPrice ? { price: asset.currentPrice, currency: asset.currency || 'IDR' } : null;
          } else {
            secureLogger.warn(`API error when fetching fresh price data: ${response.status}`);
          }
        } catch (fetchError) {
          secureLogger.error('Error fetching fresh price data:', fetchError);
        }

        // If still no price data after fresh fetch, throw error
        if (!priceData) {
          throw new Error(t('priceDataUnavailable'));
        }
      }

      const shareCount = amountToSell * 100;
      let valueIDR, valueUSD;

      if (priceData.currency === 'IDR') {
        valueIDR = priceData.price * shareCount;
        valueUSD = exchangeRate && exchangeRate > 0 ? valueIDR / exchangeRate : 0;
      } else {
        valueUSD = priceData.price * shareCount;
        valueIDR = exchangeRate && exchangeRate > 0 ? valueUSD * exchangeRate : 0;
      }

      // Portfolio state manager will handle asset updates automatically based on transactions

      // Add transaction (SELL) to Firestore
      const now = new Date();
      const formattedDate = now.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const transactionData = {
        type: 'sell',
        ticker: asset.ticker,
        amount: shareCount, // Store amount in shares, not lots
        price: priceData.price,
        avgPrice: asset.avgPrice,
        valueIDR,
        valueUSD,
        timestamp: serverTimestamp(), // Use serverTimestamp for consistency
        assetType: 'stock',
        currency: priceData.currency,
        date: formattedDate,
        userId: user ? user.uid : null,
        status: 'completed',
        broker: asset.broker || null // Add broker to identify specific holding
      };

      // Save transaction to Firestore
      if (user) {
        const docRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
        secureLogger.log('Sell transaction saved with ID:', docRef.id, 'Data:', transactionData);
      }

      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: t('stockSuccessfullySold', { amount: amountToSell, ticker: asset.ticker }),
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

      // Force portfolio rebuild and refresh after selling
      setTimeout(async () => {
        secureLogger.log('Forcing portfolio rebuild after sell transaction');
        await fetchPrices(true); // Force immediate refresh
        rebuildPortfolio(); // Force portfolio rebuild
      }, 500);

    } catch (error) {
      secureLogger.error('Error selling stock:', error);
      setConfirmModal({
        isOpen: true,
        title: t('errorSellingStock'),
        message: t('failedToSellStock', { error: error.message }),
        type: 'error',
        onConfirm: () => setConfirmModal(null)
      });
    } finally {
      setSellingLoading(false);
      // Portfolio state manager handles updates automatically
    }
  };

  const handleSellCrypto = async (symbol, asset, amountToSell) => {
    try {
      setSellingLoading(true);

      // Find the crypto index by symbol
      const cryptoIndex = assets?.crypto?.findIndex(crypto => crypto.symbol === symbol);
      if (cryptoIndex === -1) {
        secureLogger.error('Crypto not found:', symbol);
        return;
      }

      const crypto = assets?.crypto?.[cryptoIndex];
      if (!crypto) return;

      // Get current price
      let priceData = prices[crypto.symbol];
      if (!priceData) {
        // Try to fetch fresh price data before selling
        secureLogger.log('Crypto price data not available, attempting to fetch fresh data...');

        // Fetch fresh prices immediately without debounce
        const cryptoSymbols = [crypto.symbol];
        const requestData = {
          stocks: [],
          crypto: cryptoSymbols,
          exchangeRate: exchangeRate
        };

        try {
          const response = await fetch('/api/prices', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...requestData,
              userId: user?.uid || null
            }),
          });

          if (response.ok) {
            const data = await response.json();
            // Update prices state with fresh data
            updatePrices(data.prices);
            // Get the fresh price data
            priceData = data.prices[crypto.symbol];
          } else if (response.status === 429) {
            secureLogger.warn('Rate limit hit when fetching fresh crypto price data for selling');
            // Don't throw error, just use existing price data if available
            priceData = asset.currentPrice ? { price: asset.currentPrice, currency: 'USD' } : null;
          } else {
            secureLogger.warn(`API error when fetching fresh crypto price data: ${response.status}`);
          }
        } catch (fetchError) {
          secureLogger.error('Error fetching fresh crypto price data:', fetchError);
        }

        // If still no price data after fresh fetch, throw error
        if (!priceData) {
          throw new Error(t('cryptoPriceUnavailable'));
        }
      }

      // Calculate values
      const valueUSD = priceData.price * amountToSell;
      const valueIDR = exchangeRate && exchangeRate > 0 ? valueUSD * exchangeRate : 0;

      // Portfolio state manager will handle asset updates automatically based on transactions

      // Add transaction (SELL) to Firestore
      const now = new Date();
      const formattedDate = now.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const transaction = {
        type: 'sell',
        assetType: 'crypto',
        symbol: crypto.symbol,
        amount: amountToSell,
        price: priceData.price,
        avgPrice: crypto.avgPrice,
        valueIDR,
        valueUSD,
        timestamp: serverTimestamp(), // Use serverTimestamp for consistency
        currency: asset.currency || 'USD',
        date: formattedDate,
        userId: user ? user.uid : null,
        status: 'completed',
        exchange: asset.exchange || null // Add exchange to identify specific holding
      };

      // Save transaction to Firestore
      if (user) {
        await addDoc(collection(db, 'users', user.uid, 'transactions'), transaction);
      }

      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: t('cryptoSuccessfullySold', { amount: amountToSell, symbol: symbol }),
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

      // Force portfolio rebuild and refresh after selling
      setTimeout(async () => {
        await fetchPrices(true);
        rebuildPortfolio();
      }, 500);

    } catch (error) {
      secureLogger.error('Error selling crypto:', error);
      setConfirmModal({
        isOpen: true,
        title: t('errorSellingCrypto'),
        message: t('failedToSellCrypto', { error: error.message }),
        type: 'error',
        onConfirm: () => setConfirmModal(null)
      });
    } finally {
      setSellingLoading(false);
    }
  };

  const handleSellGold = async (ticker, asset, amountToSell) => {
    try {
      setSellingLoading(true);

      const gold = getAsset('gold', ticker);
      if (!gold) return;

      // Enhanced price extraction for gold (handling nested structure)
      let currentPrice = 0;

      // 1. Try exact ticker match
      if (prices[ticker] && prices[ticker].price) {
        currentPrice = prices[ticker].price;
      }
      // 2. Try global gold object (digital/physical logic)
      else if (prices.gold) {
        // Determine subtype from asset (default to digital)
        const subtype = asset.subtype || 'digital';
        const brand = (asset.brand || '').toLowerCase();

        if (subtype === 'digital') {
          currentPrice = prices.gold.digital?.sellPrice || prices.gold.digital?.price || 0;
        } else if (subtype === 'physical') {
          if (prices.gold.physical && prices.gold.physical[brand]) {
            currentPrice = prices.gold.physical[brand].price || 0;
          } else {
            currentPrice = prices.gold.digital?.sellPrice || 0; // Fallback
          }
        }
      }
      // 3. Fallback to asset's last known current price
      else if (asset.currentPrice) {
        currentPrice = asset.currentPrice;
      }

      if (!currentPrice || currentPrice <= 0) {
        // Final attempt to refresh
        await performPriceFetch();
        // quick re-check... simplified for brevity, assume fetch might update prices ref
        if (prices.gold?.digital?.sellPrice) currentPrice = prices.gold.digital.sellPrice;
      }

      if (!currentPrice || currentPrice <= 0) throw new Error('Harga emas tidak tersedia');

      const valueIDR = currentPrice * amountToSell;
      const valueUSD = valueIDR / (exchangeRate || 16500);

      const now = new Date();
      const formattedDate = now.toLocaleString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      const transaction = {
        type: 'sell',
        assetType: 'gold',
        ticker: ticker.toUpperCase(),
        amount: amountToSell,
        price: currentPrice,
        avgPrice: gold.avgPrice || 0,
        valueIDR,
        valueUSD,
        timestamp: serverTimestamp(),
        currency: 'IDR',
        date: formattedDate,
        userId: user ? user.uid : null,
        status: 'completed',
        broker: asset.broker || null
      };

      if (user) {
        await addDoc(collection(db, 'users', user.uid, 'transactions'), transaction);
      }

      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: `Berhasil menjual ${amountToSell}g emas`,
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

      setTimeout(async () => {
        await performPriceFetch();
        rebuildPortfolio();
      }, 500);

    } catch (error) {
      secureLogger.error('Error selling gold:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: 'Gagal menjual emas: ' + error.message,
        type: 'error',
        onConfirm: () => setConfirmModal(null)
      });
    } finally {
      setSellingLoading(false);
    }
  };



  // Handle average price calculator result


  const handleWithdrawCash = async (ticker, asset, amountToWithdraw) => {
    try {
      setSellingLoading(true);

      // Save transaction (SELL/WITHDRAW) to Firestore
      const now = new Date();
      const formattedDate = now.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const transactionData = {
        type: 'sell', // Use 'sell' logic for withdrawal (subtracts amount)
        ticker: ticker, // Bank Name
        assetType: 'cash',
        amount: amountToWithdraw,
        price: 1,
        avgPrice: 1,
        valueIDR: amountToWithdraw,
        valueUSD: exchangeRate && exchangeRate > 0 ? amountToWithdraw / exchangeRate : 0,
        timestamp: serverTimestamp(),
        currency: 'IDR',
        date: formattedDate,
        userId: user ? user.uid : null,
        status: 'completed',
        description: 'Cash withdrawal'
      };

      if (user) {
        const docRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
        secureLogger.log('Cash withdrawal transaction saved with ID:', docRef.id);
      }

      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: `Berhasil menarik ${formatIDR(amountToWithdraw)} dari ${ticker}`,
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

      // Force portfolio rebuild
      setTimeout(async () => {
        rebuildPortfolio();
      }, 500);

    } catch (error) {
      secureLogger.error('Error withdrawing cash:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: error.message,
        type: 'error',
        onConfirm: () => setConfirmModal(null)
      });
    } finally {
      setSellingLoading(false);
    }
  };


  // Handle cash updates
  const updateCash = async (ticker, updatedAsset) => {
    secureLogger.log('updateCash called for:', ticker, updatedAsset.amount);
    try {
      if (!user) return;

      const newAmount = parseFloat(updatedAsset.amount);
      const currentAsset = assets?.cash?.find(c => c.ticker === ticker);
      const currentAmount = currentAsset ? parseFloat(currentAsset.amount) : 0;

      if (isNaN(newAmount) || newAmount < 0) {
        throw new Error('Invalid amount');
      }

      const diff = newAmount - currentAmount;
      if (Math.abs(diff) < 0.01) return; // No change

      const type = diff > 0 ? 'buy' : 'sell'; // buy=Deposit, sell=Withdraw
      const amount = Math.abs(diff);

      const transaction = {
        assetType: 'cash',
        ticker: ticker.toUpperCase(),
        type: type,
        amount: amount,
        price: 1,
        total: amount,
        userId: user.uid,
        timestamp: serverTimestamp(),
        description: 'Manual Balance Correction'
      };

      await addDoc(collection(db, 'users', user.uid, 'transactions'), transaction);

      // Show success
      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: `Saldo ${ticker} berhasil diperbarui`,
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

      // Refresh
      setTimeout(() => rebuildPortfolio(), 500);

    } catch (error) {
      secureLogger.error('Error updating cash:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: 'Gagal memperbarui saldo: ' + error.message,
        type: 'error',
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  const deleteCash = async (ticker) => {
    try {
      secureLogger.log('DELETE cash:', ticker);

      // Check if cash asset exists
      // const cash = getAsset('cash', ticker); // getAsset might need update

      // Add delete transaction to Firestore
      const deleteTransaction = {
        assetType: 'cash',
        ticker: ticker.toUpperCase(), // Bank Name
        type: 'delete',
        amount: 0,
        price: 1,
        total: 0,
        userId: user.uid,
        timestamp: serverTimestamp(),
        description: 'Asset deleted by user'
      };

      await addDoc(collection(db, 'users', user.uid, 'transactions'), deleteTransaction);

      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: t('success'),
        message: t('assetSuccessfullyDeleted', { asset: ticker }),
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      secureLogger.error('Error deleting cash:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: t('failedToDeleteAsset', { error: error.message }),
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  const handleResetPortfolio = async () => {
    try {
      if (!user) return;

      setResetStatus(t('initializingReset') || 'Initializing reset...');
      setResetProgress(5);

      // 1. Delete all transactions from Firestore using Batch (FAST)
      const transactionsRef = collection(db, 'users', user.uid, 'transactions');
      const transactionsSnapshot = await getDocs(transactionsRef);
      const totalDocs = transactionsSnapshot.docs.length;

      setResetStatus(`Deleting ${totalDocs} transactions...`);
      setResetProgress(10);

      if (totalDocs > 0) {
        const batchSize = 500;
        const chunks = [];

        // Chunk docs into 500s
        for (let i = 0; i < totalDocs; i += batchSize) {
          chunks.push(transactionsSnapshot.docs.slice(i, i + batchSize));
        }

        // Process batches
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const batch = writeBatch(db);

          chunk.forEach(docSnap => {
            batch.delete(docSnap.ref);
          });

          await batch.commit();

          // Update progress
          const processed = Math.min((i + 1) * batchSize, totalDocs);
          const progress = 10 + (processed / totalDocs * 80); // 10% to 90%
          setResetProgress(progress);
          setResetStatus(`Deleted ${processed} of ${totalDocs} items...`);
        }
      }

      setResetProgress(95);
      setResetStatus('Clearing portfolio data...');

      // 2. Clear portfolio state and save empty portfolio
      const emptyPortfolio = { stocks: [], crypto: [], cash: [] };
      reset(); // Reset local state first
      initializePortfolio(emptyPortfolio);
      await saveUserPortfolio(emptyPortfolio);

      // 3. Clear local transactions state
      updateTransactions([]);

      setResetProgress(100);
      setResetStatus('Complete!');

      // Small delay to show 100%
      await new Promise(resolve => setTimeout(resolve, 500));

      setResetProgress(0);
      setResetStatus('');
      setIsSettingsOpen(false); // Close settings manually since modal handles its own open state usually

      setConfirmModal({
        isOpen: true,
        title: t('success') || 'Success',
        message: t('portfolioResetSuccess') || 'Portfolio reset successfully',
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      secureLogger.error('Error resetting portfolio:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error') || 'Error',
        message: t('portfolioResetFailed') || 'Failed to reset portfolio',
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  // Backup Portfolio to JSON
  // Backup Portfolio to JSON
  const handleBackup = async () => {
    try {
      setResetStatus('Preparing backup data...');
      setResetProgress(10);

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Fetch ALL transactions directly from Firestore to ensure completeness
      // This solves the issue of incomplete backups due to partial local state
      const transactionsRef = collection(db, 'users', user.uid, 'transactions');
      const q = query(transactionsRef, orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);

      setResetStatus('Processing transactions...');
      setResetProgress(30);

      const allTransactions = snapshot.docs.map(doc => {
        const data = doc.data();
        const timestamp = data.timestamp;
        const timestampISO = timestamp ? (timestamp.toDate ? timestamp.toDate().toISOString() : timestamp) : new Date().toISOString();

        return {
          id: doc.id,
          ...data,
          timestamp: timestampISO
        };
      });

      // Simulate async preparation if dataset is large, or just for UX smoothness
      await new Promise(resolve => setTimeout(resolve, 200));

      const backupData = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        portfolio: assets,
        transactions: allTransactions
      };

      setResetProgress(50);
      setResetStatus('Generating file...');

      await new Promise(resolve => setTimeout(resolve, 300));

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portsyncro_backup_${new Date().toISOString().split('T')[0]}.json`;

      setResetProgress(80);
      setResetStatus('Downloading...');

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setResetProgress(100);
      setResetStatus('Complete!');

      // Delay before closing
      await new Promise(resolve => setTimeout(resolve, 500));
      setResetProgress(0);
      setResetStatus('');

      setConfirmModal({
        isOpen: true,
        title: t('success') || 'Success',
        message: language === 'en' ? 'Portfolio backed up successfully' : 'Portfolio berhasil di-backup',
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    } catch (error) {
      secureLogger.error('Backup error:', error);
      setResetProgress(0);
      setResetStatus('');

      setConfirmModal({
        isOpen: true,
        title: t('error') || 'Error',
        message: language === 'en' ? 'Failed to backup portfolio' : 'Gagal backup portfolio',
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  // Restore Portfolio from JSON (supports legacy format)
  const handleRestore = async (file) => {
    // Set flag to prevent race condition with Firestore listener
    restoreInProgressRef.current = true;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // FIX: Pre-seed prices from backup to support "Manual" assets or offline assets
      // This ensures that assets with prices that cannot be fetched from API 
      // (like manual inputs) still display their value after restore
      if (data.portfolio && (data.portfolio.stocks || data.portfolio.crypto)) {
        secureLogger.log('Restore: Seeding prices from backup portfolio...');
        const seedPrices = { ...prices }; // Start with current or empty
        let seededCount = 0;

        // Seed stocks
        (data.portfolio.stocks || []).forEach(stock => {
          if (stock.currentPrice && stock.currentPrice > 0) {
            const ticker = stock.ticker;
            // Handle both IDX and US formats in key
            const cleanTicker = ticker.trim().toUpperCase();
            // Try to match default key logic
            const key = stock.market === 'US' ? cleanTicker : (cleanTicker.endsWith('.JK') ? cleanTicker : `${cleanTicker}.JK`);

            seedPrices[key] = {
              price: stock.currentPrice,
              change: 0,
              changeTime: '24h',
              currency: stock.currency || (stock.market === 'US' ? 'USD' : 'IDR'),
              lastUpdate: new Date().toISOString(),
              fromBackup: true // Flag to indicate source
            };
            seededCount++;
          }
        });

        // Seed crypto
        (data.portfolio.crypto || []).forEach(crypto => {
          if (crypto.currentPrice && crypto.currentPrice > 0) {
            seedPrices[crypto.symbol] = {
              price: crypto.currentPrice,
              change: 0,
              changeTime: '24h',
              currency: 'USD',
              lastUpdate: new Date().toISOString(),
              fromBackup: true
            };
            seededCount++;
          }
        });

        if (seededCount > 0) {
          updatePrices(seedPrices);
          secureLogger.log(`Restore: Prices seeded from backup (${seededCount} assets).`);
        }
      }

      // Ensure we have a valid exchange rate before processing
      let currentExchangeRate = exchangeRate;
      if (!currentExchangeRate || currentExchangeRate <= 0) {
        secureLogger.log('Restore: Exchange rate missing, fetching...');
        try {
          const rateData = await fetchExchangeRate();
          if (rateData && rateData.rate) {
            currentExchangeRate = rateData.rate;
            updateExchangeRate(currentExchangeRate); // Update state too
          } else {
            secureLogger.warn('Restore: Failed to fetch exchange rate, using fallback 16000');
            currentExchangeRate = 16000; // Fallback to reasonable default for IDR/USD
          }
        } catch (e) {
          secureLogger.error('Restore: Error fetching exchange rate', e);
          currentExchangeRate = 16000;
        }
      }
      secureLogger.log('Restore: Using exchange rate:', currentExchangeRate);

      let transactionsData = [];

      // Check if it's new format (v2.0) or legacy format
      if (data.version === '2.0' && data.portfolio) {
        // New format - use transactions directly
        transactionsData = data.transactions || [];
      } else if (Array.isArray(data)) {
        // Legacy format - convert to transaction format
        const now = new Date();
        const formattedDate = now.toLocaleString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        data.forEach(item => {
          if (item.category === 'stock') {
            // Convert legacy stock to transaction
            const isUS = item.market === 'us' || item.market === 'US';
            const avgPrice = item.avgPrice ? parseFloat(item.avgPrice) : 0;
            let shareCount = 0;

            // Robustly parse quantity/amount fields
            const rawQty = item.qty ? parseFloat(item.qty) : 0;
            const rawLots = item.lots ? parseFloat(item.lots) : 0;
            const rawAmount = item.amount ? parseFloat(item.amount) : 0;
            const currentPrice = item.currentPrice ? parseFloat(item.currentPrice) : avgPrice;

            // IMPORTANT: Legacy format interpretation
            // For IDX stocks: qty is in LOTS (not shares!)
            // Proof: qty: 303, avgPrice: 199, amount: 6120600
            //        303 lots × 100 shares × Rp202 = Rp6,120,600 ✓
            // For US stocks: qty is fractional shares

            if (isUS) {
              // US stocks: qty is in fractional shares directly
              if (rawQty > 0) {
                shareCount = rawQty;
              } else if (rawAmount > 0 && avgPrice > 0) {
                // Fallback: calculate from total value
                shareCount = rawAmount / avgPrice;
              }
            } else {
              // IDX stocks: qty is in LOTS, need to multiply by 100 to get shares
              if (rawQty > 0) {
                shareCount = rawQty * 100; // Convert lots to shares
              } else if (rawLots > 0) {
                shareCount = rawLots * 100;
              } else if (rawAmount > 0 && currentPrice > 0) {
                // Fallback: Calculate shareCount from current market value
                // amount = currentPrice × shares → shares = amount / currentPrice
                shareCount = rawAmount / currentPrice;
              }
            }

            // Calculate values and correct price logic
            let valueIDR, valueUSD, txPrice;

            if (isUS) {
              // US stock - price logic
              // Check if avgPrice is likely IDR (e.g. > 1000 and avgPriceUsd exists or logic dictates)
              const legacyPriceIsIDR = avgPrice > 1000; // Heuristic: US stocks rarely > $1000/share unless BRK.A, but common in IDR
              const avgPriceUsd = item.avgPriceUsd ? parseFloat(item.avgPriceUsd) : 0;

              if (avgPriceUsd > 0) {
                // Use explicit USD price if available
                txPrice = avgPriceUsd;
              } else if (legacyPriceIsIDR && exchangeRate && exchangeRate > 0) {
                // Convert IDR price to USD
                txPrice = avgPrice / currentExchangeRate;
              } else {
                // Assume it's already USD
                txPrice = avgPrice;
              }

              valueUSD = txPrice * shareCount;
              valueIDR = currentExchangeRate && currentExchangeRate > 0 ? valueUSD * currentExchangeRate : rawAmount;
            } else {
              // IDX stock - price is in IDR (per share)
              txPrice = avgPrice;
              valueIDR = avgPrice * shareCount;
              valueUSD = currentExchangeRate && currentExchangeRate > 0 ? valueIDR / currentExchangeRate : 0;
            }

            secureLogger.log(`Legacy restore stock: ${item.name}, isUS: ${isUS}, rawQty: ${rawQty}, shareCount: ${shareCount}, avgPrice: ${avgPrice}, txPrice: ${txPrice}`);

            if (shareCount > 0) {
              transactionsData.push({
                type: 'buy',
                assetType: 'stock',
                ticker: item.name.toUpperCase(),
                amount: shareCount, // Amount in shares
                price: txPrice, // Store correctly converted price
                valueIDR: valueIDR,
                valueUSD: valueUSD,
                date: formattedDate,
                currency: isUS ? 'USD' : 'IDR',
                market: isUS ? 'US' : 'IDX',
                status: 'completed',
                userId: user?.uid,
                broker: item.source || null,
                legacy_imported: true
              });
            }
          } else if (item.category === 'crypto') {
            // Convert legacy crypto to transaction
            // Extract symbol from name (e.g., "Koin Pintu (PTU)" -> "PTU", "BTC" -> "BTC")
            let symbol = item.name;
            const match = item.name.match(/\(([^)]+)\)/);
            if (match) {
              symbol = match[1];
            }

            // For crypto, qty is the actual amount of crypto units
            const rawQty = item.qty ? parseFloat(item.qty) : 0;
            let avgPrice = item.avgPrice ? parseFloat(item.avgPrice) : 0;
            const rawTotalValue = item.amount ? parseFloat(item.amount) : 0;
            const currentPrice = item.currentPrice ? parseFloat(item.currentPrice) : 0;

            let amount = rawQty;

            // Fallback: Calculate amount from current market value if qty is missing/zero
            if ((!amount || amount === 0) && rawTotalValue > 0 && currentPrice > 0) {
              amount = rawTotalValue / currentPrice;
            }

            // Crypto price logic - Legacy avgPrice is almost always in IDR for Indonesian users
            let txPrice, totalValueUSD, totalValueIDR;

            // IMPORTANT: Handle avgPrice = 0 case (like BNB in legacy format)
            // If avgPrice is 0 but we have the total value (amount field) and qty,
            // we can estimate the avgPrice (in IDR) as: totalValue / qty
            // This treats the "amount" field as the cost basis in IDR
            if (avgPrice === 0 && rawTotalValue > 0 && amount > 0) {
              // Estimate avgPrice from total value and quantity
              avgPrice = rawTotalValue / amount; // This gives IDR price per unit
              secureLogger.log(`Estimated avgPrice for ${symbol}: ${avgPrice} IDR (from amount ${rawTotalValue} / qty ${amount})`);
            }

            // Determine if avgPrice is in IDR or USD
            // Legacy format from Indonesian apps (Pintu, Tokocrypto, etc.) uses IDR
            // avgPrice > 100 is likely IDR (even cheap coins like PTU at Rp2644)
            const avgPriceUsd = item.avgPriceUsd ? parseFloat(item.avgPriceUsd) : 0;

            if (avgPriceUsd > 0) {
              // Explicit USD price available
              txPrice = avgPriceUsd;
            } else if (avgPrice > 0 && currentExchangeRate && currentExchangeRate > 0) {
              // Convert IDR avgPrice to USD
              // Legacy avgPrice is in IDR (e.g., BTC at 1,020,037,000 IDR, PTU at 2,644 IDR)
              txPrice = avgPrice / currentExchangeRate;
            } else {
              // Fallback: No cost basis available - set to 0 (P/L will show as N/A)
              txPrice = 0;
            }

            totalValueUSD = txPrice * amount;
            totalValueIDR = currentExchangeRate && currentExchangeRate > 0 ? totalValueUSD * currentExchangeRate : rawTotalValue;

            secureLogger.log(`Legacy restore crypto: ${symbol}, amount: ${amount}, avgPrice (IDR): ${avgPrice}, txPrice (USD): ${txPrice}`);

            if (amount > 0) {
              transactionsData.push({
                type: 'buy',
                assetType: 'crypto',
                symbol: symbol.toUpperCase(),
                amount: amount,
                price: txPrice, // Store USD price
                valueIDR: totalValueIDR,
                valueUSD: totalValueUSD,
                date: formattedDate,
                currency: 'USD',
                status: 'completed',
                userId: user?.uid,
                exchange: item.source || null,
                legacy_imported: true
              });
            }
          } else if (item.category === 'cash') {
            // Convert legacy cash to transaction
            const amount = item.amount ? parseFloat(item.amount) : 0;

            if (amount > 0) {
              transactionsData.push({
                type: 'buy',
                assetType: 'cash',
                ticker: item.name.toUpperCase(),
                amount: amount,
                price: 1,
                valueIDR: amount,
                valueUSD: currentExchangeRate && currentExchangeRate > 0 ? amount / currentExchangeRate : 0,
                date: formattedDate,
                currency: 'IDR',
                status: 'completed',
                userId: user?.uid
              });
            }
          }
        });
      } else {
        throw new Error('Invalid backup format');
      }

      // 2. Clear existing data first using Batch (FAST)
      if (user) {
        setResetStatus('Cleaning old data...');
        setResetProgress(10);

        const transactionsRef = collection(db, 'users', user.uid, 'transactions');
        const existingTransactions = await getDocs(transactionsRef);

        if (!existingTransactions.empty) {
          const batchSize = 500;
          const deleteChunks = [];
          const totalDelete = existingTransactions.docs.length;

          for (let i = 0; i < totalDelete; i += batchSize) {
            deleteChunks.push(existingTransactions.docs.slice(i, i + batchSize));
          }

          for (let i = 0; i < deleteChunks.length; i++) {
            const batch = writeBatch(db);
            deleteChunks[i].forEach(docSnap => batch.delete(docSnap.ref));
            await batch.commit();

            // Progress 10 -> 30%
            const processed = Math.min((i + 1) * batchSize, totalDelete);
            const progress = 10 + (processed / totalDelete * 20);
            setResetProgress(progress);
          }
        }

        // Also clear portfolio document
        const emptyPortfolio = { stocks: [], crypto: [], cash: [] };
        // reset(); // Clear local - Removed to prevent de-initialization issues
        await saveUserPortfolio(emptyPortfolio);
      }

      setResetProgress(30);
      setResetStatus(`Restoring ${transactionsData.length} transactions...`);

      // 3. Save transactions to Firestore using Batch (FAST)
      const importedTransactions = [];
      if (user && transactionsData.length > 0) {
        const batchSize = 500;
        const totalRestore = transactionsData.length;
        const chunks = [];

        for (let i = 0; i < totalRestore; i += batchSize) {
          chunks.push(transactionsData.slice(i, i + batchSize));
        }

        for (let i = 0; i < chunks.length; i++) {
          const batch = writeBatch(db);
          const chunk = chunks[i];

          chunk.forEach(tx => {
            // Use original ID if available, otherwise generate new
            const docId = tx.id || doc(collection(db, 'users', user.uid, 'transactions')).id;
            const newDocRef = doc(db, 'users', user.uid, 'transactions', docId);

            // Restore original timestamp
            // For v2.0: tx.timestamp is ISO string -> convert to Date
            // For Legacy: tx.timestamp might be missing or sentinel -> use new Date() if missing
            // We avoid serverTimestamp() here to ensure the restored data has concrete time values
            // compatible with our sorting logic immediately
            let timestamp;
            if (tx.timestamp && typeof tx.timestamp === 'string') {
              timestamp = new Date(tx.timestamp);
            } else if (tx.timestamp && typeof tx.timestamp.toDate === 'function') {
              timestamp = tx.timestamp.toDate();
            } else {
              timestamp = new Date(); // Fallback for legacy import creation time
            }

            batch.set(newDocRef, {
              ...tx,
              timestamp: timestamp
            });

            // Capture for local update
            importedTransactions.push({
              ...tx,
              id: docId,
              timestamp: timestamp.toISOString()
            });
          });

          await batch.commit();

          // Progress 30 -> 90%
          const processed = Math.min((i + 1) * batchSize, totalRestore);
          const progress = 30 + (processed / totalRestore * 60);
          setResetProgress(progress);
          setResetStatus(`Restored ${processed} of ${totalRestore} items...`);
        }
      }

      setResetStatus('Finalizing...');
      setResetProgress(95);

      // No need to manually updateTransactions(importedTransactions) here
      // The onSnapshot listener (line 578) will automatically pick up the new batches 
      // and call updateTransactions(newTransactions) which triggers rebuildPortfolio()

      // Manually update local state for immediate feedback
      // This ensures the UI updates even if the Firestore listener is slow
      updateTransactions(importedTransactions);

      // Force a rebuild just in case
      setTimeout(() => {
        rebuildPortfolio();

        // Signal that restore is done so we can fetch prices once assets update
        setRestoreComplete(true);
      }, 500);

      setResetProgress(100);
      setResetStatus('Complete!');

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 500));

      setResetProgress(0);
      setResetStatus('');
      setIsSettingsOpen(false);

      // Count items for message
      const stockCount = transactionsData.filter(tx => tx.assetType === 'stock').length;
      const cryptoCount = transactionsData.filter(tx => tx.assetType === 'crypto').length;
      const cashCount = transactionsData.filter(tx => tx.assetType === 'cash').length;
      const goldCount = transactionsData.filter(tx => tx.assetType === 'gold').length;

      setConfirmModal({
        isOpen: true,
        title: t('success') || 'Success',
        message: language === 'en'
          ? `Portfolio restored successfully! ${stockCount} stocks, ${cryptoCount} crypto, ${goldCount} gold, ${cashCount} cash accounts imported. The page will now reload.`
          : `Portfolio berhasil di-restore! ${stockCount} saham, ${cryptoCount} kripto, ${goldCount} emas, ${cashCount} akun kas diimport. Halaman akan dimuat ulang.`,
        type: 'success',
        confirmText: t('ok'),
        onConfirm: () => {
          window.onbeforeunload = null;
          window.location.reload();
        }
      });

      // Portfolio will rebuild automatically from Firebase listener
      // But also trigger manual rebuild after a delay
      setTimeout(() => {
        rebuildPortfolio();
        // Re-enable Firestore listener after restore is fully complete
        restoreInProgressRef.current = false;
      }, 2000);

    } catch (error) {
      // Reset flag on error
      restoreInProgressRef.current = false;

      secureLogger.error('Restore error:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error') || 'Error',
        message: language === 'en' ? `Failed to restore portfolio: ${error.message}` : `Gagal restore portfolio: ${error.message}`,
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-white font-sans selection:bg-blue-500/30">
        <Head>
          <title>{`PortSyncro | ${t('tagline')}`}</title>
          <meta name="description" content={t('tagline')} />
        </Head>

        {/* Header - Sticky & Blurred */}
        <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-[#0d1117]/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 transition-all duration-300">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            {/* Logo area */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">PortSyncro</h1>
                <p className="text-[10px] font-medium text-gray-500 leading-tight max-w-[180px] sm:max-w-none">{t('tagline')}</p>
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                title={t('settings') || "Settings"}
              >
                <FiSettings className="w-5 h-5" />
              </button>

              <div className="h-8 w-[1px] bg-gray-800 mx-1 hidden sm:block"></div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{user?.email?.split('@')[0]}</span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all"
                  title={t('logout')}
                >
                  <FiLogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 pb-20">

          {/* Navigation Controls (Sticky) */}
          <div className="sticky top-16 z-30 flex justify-center mb-8 -mx-4 px-4 py-3 bg-gray-50/80 dark:bg-[#0d1117]/80 backdrop-blur-xl">
            <div className="flex items-center p-1.5 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20">
              {[
                { id: 'portfolio', label: t('portfolio'), icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg> },
                { id: 'add', label: t('addAsset'), icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> },
                { id: 'history', label: t('history'), icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                     relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300
                     ${activeTab === tab.id
                      ? 'text-white bg-blue-600 shadow-lg shadow-blue-900/20'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#0d1117]'}
                   `}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-white/20 rounded-full animate-spin mb-6"></div>
              <p className="text-gray-400 font-medium animate-pulse">{t('loadingPortfolio')}</p>
            </div>
          ) : (
            <div className="animate-fade-in-up">
              {activeTab === 'add' ? (
                <div className="space-y-8 max-w-6xl mx-auto">
                  <div className="text-center space-y-2">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{t('addAsset')}</h2>
                    <p className="text-gray-500 dark:text-gray-400">{t('addAssetDesc') || 'Expand your portfolio by adding new assets'}</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                    {/* Bank/Cash */}
                    <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 hover:border-blue-500/30 transition-all duration-300 group shadow-sm">
                      <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-green-600 group-hover:text-white transition-all text-green-600 dark:text-green-500">
                        <FiCreditCard className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{t('addCash') || 'Bank & E-Wallet'}</h3>
                      <p className="text-sm text-gray-500 mb-6">{t('addCashDesc')}</p>
                      <ErrorBoundary>
                        <CashInput onAdd={addCash} onComplete={() => setActiveTab('portfolio')} />
                      </ErrorBoundary>
                    </div>

                    {/* Stock */}
                    <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 hover:border-blue-500/30 transition-all duration-300 group shadow-sm">
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-all text-blue-600 dark:text-blue-500">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{t('addStock')}</h3>
                      <p className="text-sm text-gray-500 mb-6">{t('addStockDesc') || 'Indonesian & US Stocks'}</p>
                      <ErrorBoundary>
                        <StockInput onAdd={addStock} onComplete={() => setActiveTab('portfolio')} exchangeRate={exchangeRate} />
                      </ErrorBoundary>
                    </div>

                    {/* Crypto */}
                    <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 hover:border-purple-500/30 transition-all duration-300 group shadow-sm">
                      <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition-all text-purple-600 dark:text-purple-500">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{t('addCrypto')}</h3>
                      <p className="text-sm text-gray-500 mb-6">{t('addCryptoDesc')}</p>
                      <ErrorBoundary>
                        <CryptoInput onAdd={addCrypto} onComplete={() => setActiveTab('portfolio')} exchangeRate={exchangeRate} />
                      </ErrorBoundary>
                    </div>

                    {/* Gold */}
                    <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-3xl p-6 hover:border-yellow-500/30 transition-all duration-300 group shadow-sm">
                      <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/20 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-yellow-600 group-hover:text-white transition-all text-yellow-600 dark:text-yellow-500">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Emas (Gold)</h3>
                      <p className="text-sm text-gray-500 mb-6">Tabungan Emas & Batangan</p>
                      <ErrorBoundary>
                        <GoldInput onAdd={addGold} onComplete={() => setActiveTab('portfolio')} />
                      </ErrorBoundary>
                    </div>
                  </div>

                  <div className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-900/30 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white">{t('quickActions')}</h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('quickActionsDesc')}</p>
                    </div>
                    <button
                      onClick={() => setShowAverageCalculator(true)}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20 rounded-xl"
                    >
                      {t('averagePriceCalculator')}
                    </button>
                  </div>
                </div>
              ) : activeTab === 'portfolio' ? (
                <ErrorBoundary>
                  <Portfolio
                    assets={assets}
                    onUpdateStock={updateStock}
                    onUpdateCrypto={updateCrypto}
                    onUpdateGold={updateGold}
                    onUpdateCash={updateCash}
                    onAddAsset={() => setActiveTab('add')}
                    onSellStock={handleSellStock}
                    onSellCrypto={handleSellCrypto}
                    onSellGold={handleSellGold}
                    onSellCash={handleWithdrawCash}
                    onDeleteStock={deleteStock}
                    onDeleteCrypto={deleteCrypto}
                    onDeleteGold={deleteGold}
                    onDeleteCash={deleteCash}
                    onRefreshPrices={performPriceFetch}
                    onRefreshExchangeRate={handleRefreshExchangeRate}
                    prices={prices}
                    exchangeRate={exchangeRate}
                    sellingLoading={sellingLoading}
                    pricesLoading={pricesLoading}
                    isUpdatingPortfolio={portfolioLoading}
                    hideBalance={hideBalance}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                  />
                </ErrorBoundary>
              ) : activeTab === 'history' ? (
                <ErrorBoundary>
                  <TransactionHistory
                    transactions={transactions}
                    user={user}
                    onTransactionsUpdate={() => { }}
                    exchangeRate={exchangeRate}
                  />
                </ErrorBoundary>
              ) : null}
            </div>
          )}
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            hideBalance={hideBalance}
            onToggleHideBalance={() => setHideBalance(!hideBalance)}
            onOpenCalculator={() => setShowAverageCalculator(true)}
            onOpenAllocation={() => setIsAllocationModalOpen(true)}
            onResetPortfolio={handleResetPortfolio}
            onBackup={handleBackup}
            onRestore={handleRestore}
            onLogoutAllSessions={logoutAllSessions}
            onOpenReports={() => router.push('/reports')}
            progress={resetProgress}
            processingStatus={resetStatus}
          />
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117] mt-12 py-12 transition-colors duration-300">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8 text-sm">
              <div>
                <h5 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </div>
                  {t('stockData')}
                </h5>
                <p className="text-gray-500 leading-relaxed">{t('stockDataSource')}</p>
              </div>
              <div>
                <h5 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  {t('cryptoData')}
                </h5>
                <p className="text-gray-500 leading-relaxed">{t('cryptoDataSource')}</p>
              </div>
              <div>
                <h5 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  {t('exchangeRate')}
                </h5>
                <p className="text-gray-500 leading-relaxed">{t('exchangeRateSource')}</p>
              </div>
              <div>
                <h5 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  {t('goldData')}
                </h5>
                <p className="text-gray-500 leading-relaxed">{t('goldDataSource')}</p>
              </div>
            </div>

            <div className="pt-8 border-t border-gray-200 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-gray-500 dark:text-gray-600">{t('copyright', { year: new Date().getFullYear() })}</p>
              <div className="flex items-center gap-4">
              </div>
            </div>
          </div>
        </footer>

        <Modal
          isOpen={confirmModal?.isOpen || false}
          title={confirmModal?.title || ''}
          type={confirmModal?.type || 'info'}
          onClose={() => setConfirmModal(null)}
        >
          <div className="space-y-6">
            {confirmModal?.message && (
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{confirmModal.message}</p>
            )}
            <div className="flex justify-end gap-3">
              {confirmModal?.onConfirm && (
                <button
                  onClick={() => {
                    if (confirmModal?.onConfirm) confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className={`px-6 py-2.5 font-bold rounded-xl transition-all duration-200 shadow-lg ${confirmModal?.type === 'error'
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20'
                    : confirmModal?.type === 'success'
                      ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/20'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                    }`}
                >
                  {confirmModal?.confirmText || t('ok')}
                </button>
              )}
            </div>
          </div>
        </Modal>

        {showAverageCalculator && (
          <AveragePriceCalculator
            isOpen={showAverageCalculator}
            onClose={() => setShowAverageCalculator(false)}
          />
        )}

        {isAllocationModalOpen && (
          <AssetAllocationModal
            isOpen={isAllocationModalOpen}
            onClose={() => setIsAllocationModalOpen(false)}
            assets={assets}
            prices={prices}
            exchangeRate={exchangeRate}
            hideBalance={hideBalance}
          />
        )}

        <Notification
          notification={rateLimitNotification}
          onClose={() => setRateLimitNotification(null)}
        />
      </div>
    </ErrorBoundary>
  );
}