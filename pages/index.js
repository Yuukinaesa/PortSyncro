// pages/index.js
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import Portfolio from '../components/Portfolio';
import StockInput from '../components/StockInput';
import CryptoInput from '../components/CryptoInput';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import { useAuth } from '../lib/authContext';
import { useLanguage } from '../lib/languageContext';
import { useRouter } from 'next/router';
import { collection, addDoc, query, orderBy, getDocs, doc, serverTimestamp, updateDoc, where, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FiLogOut, FiUser } from 'react-icons/fi';
import { calculatePortfolioValue, validateTransaction, isPriceDataAvailable, getRealPriceData, calculatePositionFromTransactions, formatIDR, formatUSD, validateIDXLots } from '../lib/utils';
import ErrorBoundary from '../components/ErrorBoundary';
import TransactionHistory from '../components/TransactionHistory';
import { fetchExchangeRate } from '../lib/fetchExchangeRate';
import Modal from '../components/Modal';
import AveragePriceCalculator from '../components/AveragePriceCalculator';
import refreshOptimizer from '../lib/refreshOptimizer';
import { usePortfolioState } from '../lib/usePortfolioState';

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
function buildAssetsFromTransactions(transactions, prices, currentAssets = { stocks: [], crypto: [] }) {
  console.log('buildAssetsFromTransactions called with:', {
    transactionsLength: transactions?.length || 0,
    pricesKeys: Object.keys(prices || {}),
    currentAssetsStocks: currentAssets?.stocks?.length || 0,
    currentAssetsCrypto: currentAssets?.crypto?.length || 0
  });
  
  // Early return if no transactions
  if (!transactions || transactions.length === 0) {
    console.log('No transactions, returning current assets');
    return currentAssets;
  }
  
  // Use Map for better performance with large datasets
  const stocksMap = new Map();
  const cryptoMap = new Map();

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
      }
    });
  }

  const stocks = Array.from(stocksMap.entries()).map(([ticker, txs]) => {
    const priceObj = prices[`${ticker}.JK`] || prices[ticker];
    const currentPrice = priceObj ? priceObj.price : 0;
    
    // Skip delete transactions when building assets
    const validTransactions = txs.filter(tx => tx.type !== 'delete');
    if (validTransactions.length === 0) {
      console.log(`Skipping ${ticker} - no valid transactions (only delete transactions)`);
      return null;
    }
    
    const pos = calculatePositionFromTransactions(validTransactions, currentPrice);
    
    // Check if the asset is fully sold (amount <= 0)
    if (pos.amount <= 0) {
      console.log(`Skipping ${ticker} - fully sold (amount: ${pos.amount})`);
      return null;
    }
    
    // Check if there's a manually set average price in current assets
    const existingAsset = currentAssets?.stocks?.find(s => s.ticker.toUpperCase() === ticker.toUpperCase());
    const useManualAvgPrice = existingAsset && existingAsset.avgPrice && existingAsset.avgPrice !== pos.avgPrice;
    
    return {
      ticker: ticker,
      lots: pos.amount,
      avgPrice: useManualAvgPrice ? existingAsset.avgPrice : pos.avgPrice,
      totalCost: pos.totalCost,
      currentPrice: currentPrice,
      gain: pos.gain,
      porto: pos.porto,
      gainPercentage: pos.gainPercentage || 0,
      lastUpdate: new Date().toISOString()
    };
  }).filter(Boolean);

  const crypto = Array.from(cryptoMap.entries()).map(([symbol, txs]) => {
    const priceObj = prices[symbol];
    const currentPrice = priceObj ? priceObj.price : 0;
    
    // Skip delete transactions when building assets
    const validTransactions = txs.filter(tx => tx.type !== 'delete');
    if (validTransactions.length === 0) {
      console.log(`Skipping ${symbol} - no valid transactions (only delete transactions)`);
      return null;
    }
    
    const pos = calculatePositionFromTransactions(validTransactions, currentPrice);
    
    // Check if the asset is fully sold (amount <= 0)
    if (pos.amount <= 0) {
      console.log(`Skipping ${symbol} - fully sold (amount: ${pos.amount})`);
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
      lastUpdate: new Date().toISOString()
    };
  }).filter(Boolean);

  return {
    stocks: stocks,
    crypto: crypto
  };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading, logout, getUserPortfolio, saveUserPortfolio } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [confirmModal, setConfirmModal] = useState(null);
  const [sellingLoading, setSellingLoading] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [showAverageCalculator, setShowAverageCalculator] = useState(false);
  
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
    rebuildPortfolio
  } = usePortfolioState();
  
  // Add missing isUpdatingPortfolio variable
  const isUpdatingPortfolio = portfolioLoading;
  
  // Add refs for intervals
  const refreshIntervalRef = useRef(null);
  const exchangeIntervalRef = useRef(null);

  // Memoize formatPrice function
  const formatPrice = useCallback((value, currency = 'IDR') => {
    try {
      if (value === undefined || value === null || isNaN(value) || value === 0) {
        return currency === 'IDR' ? 'Rp0' : '$0.00';
      }
      
      if (currency === 'IDR') {
        return formatIDR(value, 0);
      } else {
        return formatUSD(value, 2);
      }
    } catch (error) {
      console.error('Error formatting price:', error);
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
            console.log('Loaded portfolio from Firestore:', portfolio);
            
            // Initialize portfolio state manager
            initializePortfolio(portfolio);
          } catch (error) {
            console.error("Error loading portfolio:", error);
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
        console.log('No assets to fetch prices for');
        return;
      }
    
      // Filter valid stocks
      const validStocks = (assets?.stocks || []).filter(stock => {
        if (!stock || !stock.ticker || !stock.ticker.trim()) return false;
        if (stock.lots <= 0) return false; // Remove avgPrice check
        
        const usStockTickers = ['TSLA', 'NVDA', 'MSTR', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'INVALID'];
        const tickerUpper = stock.ticker.toUpperCase();
        return tickerUpper.length <= 4 && !usStockTickers.includes(tickerUpper);
      });
    
      const stockTickers = validStocks.map(stock => `${stock.ticker}.JK`);
      const cryptoSymbols = (assets?.crypto || [])
        .filter(crypto => crypto && crypto.symbol && crypto.symbol.trim() && crypto.symbol.toUpperCase() !== 'INVALID')
        .map(crypto => crypto.symbol);
    
      if (stockTickers.length === 0 && cryptoSymbols.length === 0) {
        console.log('No valid tickers to fetch');
        return;
      }
    
      const requestData = {
        stocks: stockTickers.filter(ticker => ticker && ticker.trim()),
        crypto: cryptoSymbols.filter(symbol => symbol && symbol.trim())
      };
    
      console.log('Fetching prices for:', requestData);
    
      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...requestData,
          exchangeRate: typeof exchangeRate === 'number' ? exchangeRate : null,
          userId: user?.uid || null
        }),
      });
    
      if (!response.ok) {
        if (response.status === 429) {
          console.warn('Rate limit hit, will retry later');
          return; // Don't throw error for rate limiting
        }
        console.warn(`API error: ${response.status}`);
        return;
      }
    
      const data = await response.json();
      console.log('Received prices:', data.prices);
      updatePrices(data.prices);
      
      // Force portfolio value update after price update
      setTimeout(() => {
        rebuildPortfolio();
      }, 100);
      
    } catch (error) {
      console.error('Error fetching prices:', error);
    } finally {
      setPricesLoading(false);
    }
  }, [exchangeRate, assets, user?.uid, updatePrices, rebuildPortfolio]);

  // Simplified price fetching function with debouncing and refresh optimizer
  const fetchPrices = useCallback(async (immediate = false) => {
    if (pricesLoading && !immediate) {
      console.log('Skipping fetch - already loading prices');
      return; // Prevent concurrent requests
    }
    
    // Use refresh optimizer to prevent excessive calls
    if (!immediate) {
      await refreshOptimizer.triggerRefresh(async () => {
        await performPriceFetch();
      });
    } else {
      await performPriceFetch();
    }
  }, [exchangeRate, assets, pricesLoading, user?.uid, updatePrices, performPriceFetch]);

  // Update exchange rate function - STABILIZED
  const fetchExchangeRateData = useCallback(async () => {
    try {
      const rateData = await fetchExchangeRate();
      if (rateData && rateData.rate) {
        updateExchangeRate(rateData.rate);
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      updateExchangeRate(null);
    }
  }, []); // No dependencies to prevent recreation

  // Manual refresh exchange rate function (for button clicks)
  const handleRefreshExchangeRate = useCallback(async () => {
    try {
      const rateData = await fetchExchangeRate();
      if (rateData && rateData.rate) {
        updateExchangeRate(rateData.rate);
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      updateExchangeRate(null);
    }
  }, []); // No dependencies to prevent recreation

  // Manual trigger for immediate refresh (prices only, not exchange rate)
  const triggerImmediateRefresh = useCallback(async () => {
    console.log('Manual refresh triggered (prices only)');
    try {
      await performPriceFetch(); // Force immediate refresh
      rebuildPortfolio();
      console.log('Manual refresh completed');
    } catch (error) {
      console.error('Error in manual refresh:', error);
    }
  }, []); // No dependencies to prevent recreation

  // Update prices function
  const triggerPriceUpdate = useCallback(async () => {
    if (assets?.stocks?.length > 0 || assets?.crypto?.length > 0) {
      await performPriceFetch();
    }
  }, []); // No dependencies to prevent recreation

  // Set up intervals for exchange rate and price updates - OPTIMIZED
  useEffect(() => {
    // Only set up intervals after initialization
    if (!isInitialized) return;
    
    // Prevent multiple setups using a ref
    if (exchangeIntervalRef.current || refreshIntervalRef.current) {
      console.log('Intervals already set up, skipping');
      return;
    }
    
    console.log('Setting up refresh intervals - isInitialized:', isInitialized);
    
    // Initial refresh when component mounts
    fetchExchangeRateData();
    
    // Initial refresh only when assets are available - ONCE ONLY
    const initialRefreshTimer = setTimeout(() => {
      if (assets?.stocks?.length > 0 || assets?.crypto?.length > 0) {
        console.log('INITIAL REFRESH triggered (first time only)');
        performPriceFetch();
      } else {
        console.log('No assets available for initial refresh, skipping');
      }
    }, 2000); // Reduced delay for faster initial load
    
    // Exchange rate update every 5 minutes (less frequent)
    exchangeIntervalRef.current = setInterval(fetchExchangeRateData, 300000);
    
    // Price refresh every 5 minutes (only if assets exist) - less frequent for idle users
    refreshIntervalRef.current = setInterval(() => {
      if (assets?.stocks?.length > 0 || assets?.crypto?.length > 0) {
        console.log('AUTOMATIC REFRESH triggered (5 minute interval)');
        performPriceFetch();
      }
    }, 300000); // Refresh every 5 minutes instead of 30 seconds

    // Clean up the initial timer only
    return () => {
      clearTimeout(initialRefreshTimer);
    };
  }, [isInitialized]); // Only depend on isInitialized to prevent multiple setups

  // Separate useEffect for cleanup on unmount only
  useEffect(() => {
    return () => {
      // Component is unmounting, clean up intervals
      console.log('Component unmounting - cleaning up intervals');
      if (exchangeIntervalRef.current) {
        clearInterval(exchangeIntervalRef.current);
        exchangeIntervalRef.current = null;
      }
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      refreshOptimizer.reset();
    };
  }, []); // Empty dependency array - only runs on mount/unmount

  // Save portfolio to Firestore whenever assets change
  useEffect(() => {
    if (user && !loading && !authLoading && saveUserPortfolio && assets && isInitialized) {
      saveUserPortfolio(assets);
    }
  }, [assets, user, loading, authLoading, saveUserPortfolio, isInitialized]);

  // Fetch transactions and update portfolio state
  useEffect(() => {
    if (!user) {
      console.log('No user found, skipping transaction fetch');
      return;
    }

    console.log('Fetching transactions for user:', user.uid);
    const q = query(
      collection(db, 'users', user.uid, 'transactions'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('Received transaction snapshot:', snapshot.size, 'documents');
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
      console.error('Error in transaction listener:', error);
    });

    return () => {
      console.log('Cleaning up transaction listener');
      unsubscribe();
    };
  }, [user, updateTransactions]);



  // This function is no longer needed as Firebase listener handles updates automatically

  const addStock = async (stock) => {
    try {
      console.log('Adding stock:', stock);
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Validate required fields
      if (!stock.ticker || !stock.lots) {
        throw new Error('Missing required fields: ticker or lots');
      }

      // Validate numeric values
      validateIDXLots(stock.lots);

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
      // For IDX stocks: price is per share, but we calculate based on lots
      let valueIDR, valueUSD;
      if (stock.currency === 'IDR') {
        valueIDR = stock.price * stock.lots * 100; // Calculate based on shares (1 lot = 100 shares)
        valueUSD = exchangeRate && exchangeRate > 0 ? valueIDR / exchangeRate : 0;
      } else {
        valueUSD = stock.price * stock.lots * 100; // Calculate based on shares (1 lot = 100 shares)
        valueIDR = exchangeRate && exchangeRate > 0 ? valueUSD * exchangeRate : 0;
      }
      
      // Create transaction data
      const transactionData = {
        type: 'buy',
        assetType: 'stock',
        ticker: stock.ticker,
        amount: stock.lots * 100, // Store amount in shares, not lots
        price: stock.price,
        valueIDR: valueIDR,
        valueUSD: valueUSD,
        date: formattedDate,
        timestamp: serverTimestamp(),
        currency: stock.currency,
        status: 'completed',
        userId: user.uid,
        ...(stock.entry && { entry: stock.entry })
      };
      
      // Save to Firestore
      const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      console.log('Transaction saved with ID:', transactionRef.id);
      
      // The Firebase listener will automatically update the portfolio state
      // No need to manually add to portfolio state manager
      
      // Refresh prices after adding stock
      setTimeout(async () => {
        await fetchPrices(true);
      }, 500);
      
      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: 'Success',
        message: `Berhasil menambahkan saham ${stock.ticker}`,
        type: 'success',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      console.error('Error in addStock:', error);
      setConfirmModal({
        isOpen: true,
        title: 'Error',
        message: 'Gagal menambahkan saham: ' + error.message,
        type: 'error',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
    }
  };
  
  const addCrypto = async (crypto) => {
    try {
      console.log('Adding crypto:', crypto);
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Fetch current crypto price
      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stocks: [],
          crypto: [crypto.symbol],
          exchangeRate: exchangeRate,
          userId: user?.uid || null
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch crypto price');
      }
      
      const data = await response.json();
      const cryptoPrice = data.prices[crypto.symbol];
      
      if (!cryptoPrice || !cryptoPrice.price) {
        throw new Error('Invalid crypto price data received');
      }
      
      console.log('Fetched crypto price:', cryptoPrice);
      
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
      
      // Calculate total value based on current API price
      const pricePerUnit = crypto.price || cryptoPrice.price;
      const totalValueUSD = pricePerUnit * crypto.amount;
      const totalValueIDR = exchangeRate && exchangeRate > 0 ? totalValueUSD * exchangeRate : 0;
      
      // Create transaction data
      const transactionData = {
        type: 'buy',
        assetType: 'crypto',
        symbol: crypto.symbol,
        amount: crypto.amount,
        price: pricePerUnit,
        valueIDR: totalValueIDR,
        valueUSD: totalValueUSD,
        date: formattedDate,
        timestamp: serverTimestamp(),
        currency: 'USD',
        status: 'completed',
        userId: user.uid,
        ...(crypto.entry && { entry: crypto.entry })
      };
      
      // Save to Firestore
      const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      console.log('Crypto transaction saved with ID:', transactionRef.id);
      
      // The Firebase listener will automatically update the portfolio state
      // No need to manually add to portfolio state manager
      
      // Refresh prices after adding crypto
      setTimeout(async () => {
        await fetchPrices(true);
      }, 500);
      
      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: 'Success',
        message: `Berhasil menambahkan kripto ${crypto.symbol}`,
        type: 'success',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      console.error('Error in addCrypto:', error);
      setConfirmModal({
        isOpen: true,
        title: 'Error',
        message: 'Gagal menambahkan kripto: ' + error.message,
        type: 'error',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
    }
  };

  // Portfolio State Manager handles all updates automatically
  const updateStock = (ticker, updatedStock) => {
    console.log('updateStock called for:', ticker, updatedStock);
    
    // Validate that lots is a whole number
    validateIDXLots(updatedStock.lots);
    
    // Create a transaction to update the average price
    const updateTransaction = {
      type: 'update',
      assetType: 'stock',
      ticker: ticker.toUpperCase(),
      amount: updatedStock.lots * 100, // Convert lots to shares for transaction
      price: updatedStock.avgPrice, // Use the new average price (per share)
      valueIDR: updatedStock.lots * 100 * updatedStock.avgPrice, // Convert to shares
      valueUSD: exchangeRate && exchangeRate > 0 ? (updatedStock.lots * 100 * updatedStock.avgPrice) / exchangeRate : 0,
      date: new Date().toLocaleString('id-ID'),
      timestamp: serverTimestamp(),
      currency: 'IDR',
      status: 'completed',
      userId: user.uid,
      description: 'Average price updated by user'
    };
    
    console.log('Update transaction created:', updateTransaction);
    
    // Save to Firestore first
    const saveToFirestore = async () => {
      try {
        const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), updateTransaction);
        console.log('Update transaction saved to Firestore with ID:', transactionRef.id);
        
        // Add to portfolio state manager
        addTransaction({
          id: transactionRef.id,
          ...updateTransaction,
          timestamp: new Date().toISOString()
        });
        
        // Force portfolio rebuild with multiple attempts
        console.log('Force portfolio rebuild after updating stock');
        
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
        console.error('Error saving update transaction to Firestore:', error);
      }
    };
    
    // Execute the save operation
    saveToFirestore();
  };

  const updateCrypto = (symbol, updatedCrypto) => {
    console.log('updateCrypto called for:', symbol, updatedCrypto);
    
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
      description: 'Average price updated by user'
    };
    
    console.log('Update transaction created:', updateTransaction);
    
    // Save to Firestore first
    const saveToFirestore = async () => {
      try {
        const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), updateTransaction);
        console.log('Update transaction saved to Firestore with ID:', transactionRef.id);
        
        // Add to portfolio state manager
        addTransaction({
          id: transactionRef.id,
          ...updateTransaction,
          timestamp: new Date().toISOString()
        });
        
        // Force portfolio rebuild with multiple attempts
        console.log('Force portfolio rebuild after updating crypto');
        
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
        console.error('Error saving update transaction to Firestore:', error);
      }
    };
    
    // Execute the save operation
    saveToFirestore();
  };
  
  const deleteStock = async (ticker) => {
    try {
      console.log('DELETE stock:', ticker);
      
      // Check if stock exists
      const stock = getAsset('stock', ticker);
      if (!stock) {
        console.error('Stock not found:', ticker);
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
        description: 'Asset deleted by user'
      };
      
      await addDoc(collection(db, 'users', user.uid, 'transactions'), deleteTransaction);
      
      // Delete from portfolio state manager
      deleteAsset('stock', ticker);
      
      // Force portfolio rebuild and refresh
      console.log('Force portfolio rebuild after deleting stock');
      
      // Wait a bit for the transaction to be processed
      setTimeout(async () => {
        // Refresh prices to ensure UI updates
        await fetchPrices(true); // Force immediate refresh
        
        // Force portfolio rebuild
        rebuildPortfolio();
      }, 100);
      
      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: 'Success',
        message: `Berhasil menghapus saham ${ticker}`,
        type: 'success',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
      
    } catch (error) {
      console.error('Error deleting stock:', error);
      setConfirmModal({
        isOpen: true,
        title: 'Error',
        message: 'Gagal menghapus saham: ' + error.message,
        type: 'error',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
    }
  };
  
  const deleteCrypto = async (symbol) => {
    try {
      console.log('DELETE crypto:', symbol);
      
      // Check if crypto exists
      const crypto = getAsset('crypto', symbol);
      if (!crypto) {
        console.error('Crypto not found:', symbol);
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
        description: 'Asset deleted by user'
      };
      
      await addDoc(collection(db, 'users', user.uid, 'transactions'), deleteTransaction);
      
      // Delete from portfolio state manager
      deleteAsset('crypto', symbol);
      
      // Force portfolio rebuild and refresh
      console.log('Force portfolio rebuild after deleting crypto');
      
      // Wait a bit for the transaction to be processed
      setTimeout(async () => {
        // Refresh prices to ensure UI updates
        await fetchPrices(true); // Force immediate refresh
        
        // Force portfolio rebuild
        rebuildPortfolio();
      }, 100);
      
      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: 'Success',
        message: `Berhasil menghapus kripto ${symbol}`,
        type: 'success',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });

    } catch (error) {
      console.error('Error deleting crypto:', error);
      setConfirmModal({
        isOpen: true,
        title: 'Error',
        message: 'Gagal menghapus kripto: ' + error.message,
        type: 'error',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
    } finally {
      // Portfolio state manager handles updates automatically
    }
  };

  const handleSellStock = async (ticker, asset, amountToSell) => {
    try {
      setSellingLoading(true);
      
      // Find the stock index by ticker
      const stockIndex = assets?.stocks?.findIndex(stock => stock.ticker === ticker);
      if (stockIndex === -1) {
        console.error('Stock not found:', ticker);
        return;
      }
      
      const stock = assets?.stocks?.[stockIndex];
      
      // Get current price from prices state using correct ticker format
      const tickerKey = `${asset.ticker}.JK`;
      
      let priceData = prices[tickerKey];
      if (!priceData) {
        // Try to fetch fresh price data before selling
        console.log('Price data not available, attempting to fetch fresh data...');
        
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
          } else {
            console.warn(`API error when fetching fresh price data: ${response.status}`);
          }
        } catch (fetchError) {
          console.error('Error fetching fresh price data:', fetchError);
        }
        
        // If still no price data after fresh fetch, throw error
        if (!priceData) {
          throw new Error('Data harga tidak tersedia. Silakan coba lagi dalam beberapa saat atau klik tombol refresh.');
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
        status: 'completed'
      };

      // Save transaction to Firestore
      if (user) {
        const docRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
        console.log('Sell transaction saved with ID:', docRef.id, 'Data:', transactionData);
      }

      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: 'Success',
        message: `Berhasil menjual ${amountToSell} lot ${asset.ticker}`,
        type: 'success',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
      
      // Force portfolio rebuild and refresh after selling
      setTimeout(async () => {
        console.log('Forcing portfolio rebuild after sell transaction');
        await fetchPrices(true); // Force immediate refresh
        rebuildPortfolio(); // Force portfolio rebuild
      }, 500);

    } catch (error) {
      console.error('Error selling stock:', error);
      setConfirmModal({
        isOpen: true,
        title: 'Error Selling Stock',
        message: 'Failed to sell stock: ' + error.message,
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
        console.error('Crypto not found:', symbol);
        return;
      }
      
      const crypto = assets?.crypto?.[cryptoIndex];
      if (!crypto) return;

      // Get current price
      let priceData = prices[crypto.symbol];
      if (!priceData) {
        // Try to fetch fresh price data before selling
        console.log('Crypto price data not available, attempting to fetch fresh data...');
        
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
          } else {
            console.warn(`API error when fetching fresh crypto price data: ${response.status}`);
          }
        } catch (fetchError) {
          console.error('Error fetching fresh crypto price data:', fetchError);
        }
        
        // If still no price data after fresh fetch, throw error
        if (!priceData) {
          throw new Error('Data harga kripto tidak tersedia. Silakan coba lagi dalam beberapa saat atau klik tombol refresh.');
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
        date: formattedDate,
        currency: 'USD',
        userId: user ? user.uid : null,
        status: 'completed'
      };

      // Save transaction to Firestore
      if (user) {
        const docRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transaction);
        console.log('Crypto sell transaction saved with ID:', docRef.id, 'Data:', transaction);
      }

      // Show success notification
      setConfirmModal({
        isOpen: true,
        title: 'Success',
        message: `Berhasil menjual ${amountToSell} ${crypto.symbol}`,
        type: 'success',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
      
      // Force portfolio rebuild and refresh after selling
      setTimeout(async () => {
        console.log('Forcing portfolio rebuild after sell transaction');
        await fetchPrices(true); // Force immediate refresh
        rebuildPortfolio(); // Force portfolio rebuild
      }, 500);

    } catch (error) {
      console.error('Error selling crypto:', error);
      setConfirmModal({
        isOpen: true,
        title: 'Error Selling Crypto',
        message: 'Failed to sell crypto: ' + error.message,
        type: 'error',
        onConfirm: () => setConfirmModal(null)
      });
    } finally {
      setSellingLoading(false);
      // Portfolio state manager handles updates automatically
    }
  };

  // Handle average price calculator result


  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-dark-900 dark:via-dark-800 dark:to-dark-900 text-gray-800 dark:text-white transition-all duration-300">
        <Head>
          <title>PortSyncro | {t('tagline')}</title>
          <meta name="description" content={t('tagline')} />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        </Head>
        
        <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6 lg:py-8 font-['Inter'] scrollbar-thin">
          {/* Header Section - Enhanced with PortSyncro Logo */}
          <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8">
            <div className="flex items-center justify-center sm:justify-start space-x-4">
              {/* Brand Name and Tagline with Design */}
              <div className="text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-teal-500 bg-clip-text text-transparent animate-fade-in">
                  PortSyncro
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base lg:text-lg mt-1 animate-fade-in">
                  {t('tagline')}
                </p>
              </div>
            </div>
            
            {/* User Controls - Enhanced */}
            <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:space-x-3">
              {/* Tab Navigation - Enhanced */}
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-full sm:w-auto shadow-lg">
                <button 
                  onClick={() => setActiveTab('portfolio')}
                  className={`nav-tab ${
                    activeTab === 'portfolio' 
                      ? 'nav-tab-active' 
                      : 'nav-tab-inactive'
                  }`}
                >
                  {t('portfolio')}
                </button>
                <button 
                  onClick={() => setActiveTab('add')}
                  className={`nav-tab ${
                    activeTab === 'add' 
                      ? 'nav-tab-active' 
                      : 'nav-tab-inactive'
                  }`}
                >
                  {t('addAsset')}
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`nav-tab ${
                    activeTab === 'history'
                      ? 'nav-tab-active'
                      : 'nav-tab-inactive'
                  }`}
                >
                  {t('history')}
                </button>
              </div>
              
              {/* Average Calculator Button - Enhanced */}
              <button
                onClick={() => setShowAverageCalculator(true)}
                className="btn-success px-4 py-2.5 sm:py-2 lg:py-2.5 text-sm font-medium flex items-center gap-2 hover-lift"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span>{t('averagePriceCalculator')}</span>
              </button>
              

              
              {/* User Info and Controls - Enhanced */}
              <div className="flex items-center justify-center sm:justify-end space-x-2 sm:space-x-3">
                <LanguageToggle />
                <ThemeToggle />
                
                {/* User Email - Enhanced */}
                <div className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-sm min-w-0 shadow-md hover:shadow-lg transition-all duration-200">
                  <FiUser className="text-gray-500 dark:text-gray-400 mr-2 flex-shrink-0" />
                  <span className="truncate max-w-[120px] sm:max-w-[150px] lg:max-w-[200px] text-gray-700 dark:text-gray-300 text-xs sm:text-sm">
                    {user?.email}
                  </span>
                </div>
                
                {/* Logout Button - Enhanced */}
                <button 
                  onClick={logout}
                  className="btn-ghost p-2.5 sm:p-2 rounded-full flex-shrink-0 hover-lift"
                  title={t('logout')}
                >
                  <FiLogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-center">
                <div className="spinner-glow w-12 h-12 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400 animate-pulse-soft">Loading portfolio...</p>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'add' ? (
                <div className="space-y-6 sm:space-y-8">
                  {/* Add Asset Header */}
                  <div className="text-center">
                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-2">
                      {t('addAsset')}
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">
                      {t('addAssetDesc') || 'Add your stocks and cryptocurrencies to track your portfolio'}
                    </p>
                  </div>
                  
                  {/* Asset Forms Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                    {/* Stock Input Card */}
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6 lg:p-8 hover:shadow-md transition-shadow duration-200">
                      <div className="flex items-center mb-4 sm:mb-6">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mr-3 sm:mr-4">
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                            {t('addStock')}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                            {t('addStockDesc') || 'Add Indonesian stocks to your portfolio'}
                          </p>
                        </div>
                      </div>
                      <ErrorBoundary>
                        <StockInput onAdd={addStock} onComplete={() => setActiveTab('portfolio')} />
                      </ErrorBoundary>
                    </div>
                    
                    {/* Crypto Input Card */}
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6 lg:p-8 hover:shadow-md transition-shadow duration-200">
                      <div className="flex items-center mb-4 sm:mb-6">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mr-3 sm:mr-4">
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                            {t('addCrypto')}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                            {t('addCryptoDesc') || 'Add cryptocurrencies to your portfolio'}
                          </p>
                        </div>
                      </div>
                      <ErrorBoundary>
                        <CryptoInput onAdd={addCrypto} onComplete={() => setActiveTab('portfolio')} exchangeRate={exchangeRate} />
                      </ErrorBoundary>
                    </div>
                  </div>
                  
                  {/* Quick Actions */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-4 sm:p-6 lg:p-8 border border-blue-100 dark:border-blue-800">
                    <div className="text-center">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2 sm:mb-3">
                        {t('quickActions') || 'Quick Actions'}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm mb-4 sm:mb-6">
                        {t('quickActionsDesc') || 'Need help calculating average prices or managing your portfolio?'}
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
                        <button
                          onClick={() => setShowAverageCalculator(true)}
                          className="px-4 sm:px-6 py-2 sm:py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 text-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="hidden sm:inline">{t('averagePriceCalculator')}</span>
                          <span className="sm:hidden">{t('averagePriceCalculator')}</span>
                        </button>
                        <button
                          onClick={() => setActiveTab('portfolio')}
                          className="px-4 sm:px-6 py-2 sm:py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 text-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          <span className="hidden sm:inline">{t('viewPortfolio') || 'View Portfolio'}</span>
                          <span className="sm:hidden">Portfolio</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeTab === 'portfolio' ? (
                <ErrorBoundary>
                  <Portfolio 
                    assets={assets} 
                    onUpdateStock={updateStock}
                    onUpdateCrypto={updateCrypto}
                    onAddAsset={() => setActiveTab('add')}
                    onSellStock={handleSellStock}
                    onSellCrypto={handleSellCrypto}
                    onDeleteStock={deleteStock}
                    onDeleteCrypto={deleteCrypto}
                                          onRefreshPrices={performPriceFetch}
                    onRefreshExchangeRate={handleRefreshExchangeRate}
                    prices={prices}
                    exchangeRate={exchangeRate}
                    sellingLoading={sellingLoading}
                    pricesLoading={pricesLoading}
                    isUpdatingPortfolio={isUpdatingPortfolio}
                  />
                </ErrorBoundary>
              ) : activeTab === 'history' ? (
                <ErrorBoundary>
                  <TransactionHistory 
                    transactions={transactions}
                    user={user}
                    onTransactionsUpdate={() => {
                      // The Firebase listener will automatically update the transactions
                      // No need to manually update here
                      console.log('Transaction updated, Firebase listener will handle refresh');
                    }}
                    exchangeRate={exchangeRate}
                  />
                </ErrorBoundary>
              ) : null}
            </>
          )}
        </main>
        
        {/* Data Sources Information */}
        <section className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
          <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 lg:py-8">
            <div className="max-w-4xl mx-auto">
              <h3 className="text-base sm:text-lg lg:text-xl font-semibold mb-3 sm:mb-4 text-gray-800 dark:text-white text-center">
                {t('dataSources')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                {/* Stock Data */}
                <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center mb-2 sm:mb-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mr-2 sm:mr-3">
                      <svg className="w-3 h-3 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-800 dark:text-white text-sm sm:text-base">{t('stockData')}</h4>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('stockDataSource')}</p>
                </div>

                {/* Crypto Data */}
                <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center mb-2 sm:mb-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center mr-2 sm:mr-3">
                      <svg className="w-3 h-3 sm:w-5 sm:h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-800 dark:text-white text-sm sm:text-base">{t('cryptoData')}</h4>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('cryptoDataSource')}</p>
                </div>

                {/* Exchange Rate */}
                <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center mb-2 sm:mb-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mr-2 sm:mr-3">
                      <svg className="w-3 h-3 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-800 dark:text-white text-sm sm:text-base">{t('exchangeRate')}</h4>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('exchangeRateSource')}</p>
                </div>
              </div>
              

            </div>
          </div>
        </section>
        
        <footer className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 lg:py-6 text-center text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs sm:text-sm">{t('copyright', { year: new Date().getFullYear() })}</p>
        </footer>
        
        {/* Modal for confirmations and errors */}
        <Modal 
          isOpen={confirmModal?.isOpen || false}
          title={confirmModal?.title || ''}
          type={confirmModal?.type || 'info'}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal?.onConfirm}
        >
          {confirmModal?.message && <p>{confirmModal.message}</p>}
        </Modal>
        
        {/* Average Price Calculator Modal */}
        {showAverageCalculator && (
          <AveragePriceCalculator
            isOpen={showAverageCalculator}
            onClose={() => setShowAverageCalculator(false)}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}