// pages/index.js
import { useState, useEffect, useCallback, useMemo } from 'react';
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
// Removed debounce import
import { useRef } from 'react';
import { calculatePortfolioValue, validateTransaction, isPriceDataAvailable, getRealPriceData, calculatePositionFromTransactions, formatIDR, formatUSD } from '../lib/utils';
import ErrorBoundary from '../components/ErrorBoundary';
import TransactionHistory from '../components/TransactionHistory';
import { fetchExchangeRate } from '../lib/fetchPrices';
import Modal from '../components/Modal';
import AveragePriceCalculator from '../components/AveragePriceCalculator';

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

// Tambahkan fungsi untuk membangun ulang aset dari transaksi
function buildAssetsFromTransactions(transactions, prices, currentAssets = { stocks: [], crypto: [] }) {
  const stocksMap = {};
  const cryptoMap = {};

  transactions.forEach(tx => {
    if (tx.assetType === 'stock') {
      const key = tx.ticker.toUpperCase();
      if (!stocksMap[key]) stocksMap[key] = [];
      stocksMap[key].push(tx);
    } else if (tx.assetType === 'crypto') {
      const key = tx.symbol.toUpperCase();
      if (!cryptoMap[key]) cryptoMap[key] = [];
      cryptoMap[key].push(tx);
    }
  });

  const stocks = Object.entries(stocksMap).map(([ticker, txs]) => {
    const priceObj = prices[ticker] || prices[`${ticker}.JK`];
    const currentPrice = priceObj ? priceObj.price : 0;
    
    // Skip delete transactions when building assets - they don't affect portfolio
    const validTransactions = txs.filter(tx => tx.type !== 'delete');
    if (validTransactions.length === 0) {
      console.log(`Skipping ${ticker} - no valid transactions (only delete transactions)`);
      return null; // Don't preserve existing assets when no valid transactions
    }
    
    const pos = calculatePositionFromTransactions(validTransactions, currentPrice);
    
    // Check if the asset is fully sold (amount <= 0)
    if (pos.amount <= 0) {
      console.log(`Skipping ${ticker} - fully sold (amount: ${pos.amount})`);
      return null; // Skip this asset
    }
    
    // Check if there's a manually set average price in current assets
    const existingAsset = currentAssets.stocks.find(s => s.ticker === ticker);
    const useManualAvgPrice = existingAsset && existingAsset.avgPrice && existingAsset.avgPrice !== pos.avgPrice;
    
    // Use manually set average price if it exists and is different from calculated
    const finalAvgPrice = useManualAvgPrice ? existingAsset.avgPrice : pos.avgPrice;
    const finalTotalCost = finalAvgPrice * pos.amount;
    const finalGain = pos.porto - finalTotalCost;
    
    // If we have an existing asset with manual edits, preserve all its data
    if (existingAsset && useManualAvgPrice) {
      console.log(`Preserving manual edits for ${ticker} - using existing asset data`);
      return {
        ...existingAsset, // Preserve ALL existing data
        currentPrice: currentPrice, // Only update current price
        porto: pos.porto, // Update portfolio value
        totalCost: finalTotalCost, // Update total cost
        gain: finalGain // Update gain/loss
      };
    }
    
    return {
      ticker,
      lots: pos.amount, // untuk saham, 1 lot = 100 saham (IDX)
      avgPrice: finalAvgPrice,
      totalCost: finalTotalCost,
      gain: finalGain,
      porto: pos.porto,
      currentPrice: currentPrice, // Use currentPrice instead of price
      currency: priceObj ? priceObj.currency : 'IDR',
      type: 'stock',
      transactions: validTransactions,
      // Only add entry if it exists and is not undefined
      ...(pos.entryPrice && pos.entryPrice !== undefined && { entry: pos.entryPrice })
    };
  }).filter(Boolean); // Remove null entries

  const crypto = Object.entries(cryptoMap).map(([symbol, txs]) => {
    const priceObj = prices[symbol];
    const currentPrice = priceObj ? priceObj.price : 0;
    
    // Skip delete transactions when building assets - they don't affect portfolio
    const validTransactions = txs.filter(tx => tx.type !== 'delete');
    if (validTransactions.length === 0) {
      console.log(`Skipping ${symbol} - no valid transactions (only delete transactions)`);
      return null; // Don't preserve existing assets when no valid transactions
    }
    
    const pos = calculatePositionFromTransactions(validTransactions, currentPrice);
    
    // Check if the asset is fully sold (amount <= 0)
    if (pos.amount <= 0) {
      console.log(`Skipping ${symbol} - fully sold (amount: ${pos.amount})`);
      return null; // Skip this asset
    }
    
    // Check if there's a manually set average price in current assets
    const existingAsset = currentAssets.crypto.find(c => c.symbol === symbol);
    const useManualAvgPrice = existingAsset && existingAsset.avgPrice && existingAsset.avgPrice !== pos.avgPrice;
    
    // Use manually set average price if it exists and is different from calculated
    const finalAvgPrice = useManualAvgPrice ? existingAsset.avgPrice : pos.avgPrice;
    const finalTotalCost = finalAvgPrice * pos.amount;
    const finalGain = pos.porto - finalTotalCost;
    
    // If we have an existing asset with manual edits, preserve all its data
    if (existingAsset && useManualAvgPrice) {
      console.log(`Preserving manual edits for ${symbol} - using existing asset data`);
      return {
        ...existingAsset, // Preserve ALL existing data
        currentPrice: currentPrice, // Only update current price
        porto: pos.porto, // Update portfolio value
        totalCost: finalTotalCost, // Update total cost
        gain: finalGain // Update gain/loss
      };
    }
    
    return {
      symbol,
      amount: pos.amount,
      avgPrice: finalAvgPrice,
      totalCost: finalTotalCost,
      gain: finalGain,
      porto: pos.porto,
      currentPrice: currentPrice, // Use currentPrice instead of price
      currency: 'USD',
      type: 'crypto',
      transactions: validTransactions,
      // Only add entry if it exists and is not undefined
      ...(pos.entryPrice && pos.entryPrice !== undefined && { entry: pos.entryPrice })
    };
  }).filter(Boolean); // Remove null entries

  // REMOVED: Preserve existing assets logic to prevent duplicates
  // Assets should only be built from transactions to ensure consistency

  return { stocks, crypto };
}

export default function Home() {
  const [assets, setAssets] = useState({
    stocks: [],
    crypto: []
  });
  const [activeTab, setActiveTab] = useState('portfolio'); // portfolio, add, history
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading, logout, getUserPortfolio, saveUserPortfolio } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [prices, setPrices] = useState({});
  const [exchangeRate, setExchangeRate] = useState(null); // Aktifkan kembali untuk konversi crypto
  const [transactions, setTransactions] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);
  const [sellingLoading, setSellingLoading] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [isUpdatingPortfolio, setIsUpdatingPortfolio] = useState(false);
  const [lastManualUpdate, setLastManualUpdate] = useState(null);
  const rebuildTimeoutRef = useRef(null);
  const [portfolioProtected, setPortfolioProtected] = useState(false);
  const [showAverageCalculator, setShowAverageCalculator] = useState(false);
  const [previousTransactionCount, setPreviousTransactionCount] = useState(0);

  // Log initial state
  // console.log('Home component initialized with:', {
  //   assets,
  //   transactions: transactions.length,
  //   prices: Object.keys(prices).length,
  //   user: !!user,
  //   loading,
  //   authLoading,
  //   exchangeRate
  // });

  // Memoize formatPrice function
  const formatPrice = useCallback((value, currency = 'IDR') => {
    try {
      if (value === undefined || value === null || isNaN(value) || value === 0) {
        return currency === 'IDR' ? 'Rp0' : '$0.00';
      }
      
      if (currency === 'IDR') {
        // Use Indonesian format for IDR (dots for thousands, comma for decimal)
        return formatIDR(value, 0);
      } else {
        // Use US format for USD (comma for thousands, period for decimal)
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
            setAssets(portfolio);
          } catch (error) {
            console.error("Error loading portfolio:", error);
          } finally {
            setLoading(false);
          }
        }
      }
    };

    checkAuth();
  }, [user, authLoading, router, getUserPortfolio]);

  // Direct price fetching function (no debounce)
  const fetchPrices = useCallback(async () => {
    setPricesLoading(true);
    try {
      // Validate assets structure
      if (!assets || !assets.stocks || !assets.crypto) {
        console.error('Invalid assets structure:', assets);
        return;
      }
    
      console.log('Fetching prices for assets:', {
        stocks: assets.stocks.map(s => s.ticker),
        crypto: assets.crypto.map(c => c.symbol)
      });
    
      // Filter out US stocks and invalid data
      const validStocks = assets.stocks.filter(stock => {
        if (!stock || !stock.ticker || !stock.ticker.trim()) {
          console.log('Filtering out invalid stock:', stock);
          return false;
        }
        
        // Remove US stocks that we removed
        const usStockTickers = ['TSLA', 'NVDA', 'MSTR', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'INVALID'];
        const tickerUpper = stock.ticker.toUpperCase();
        
        // Only allow valid IDX stocks (4 characters or less, not US stocks)
        const isValid = tickerUpper.length <= 4 && !usStockTickers.includes(tickerUpper);
        if (!isValid) {
          console.log('Filtering out stock:', stock.ticker, 'reason: invalid format or US stock');
        }
        return isValid;
      });
    
      const stockTickers = validStocks
        .map(stock => `${stock.ticker}.JK`);
        
      const cryptoSymbols = assets.crypto
        .filter(crypto => {
          if (!crypto || !crypto.symbol || !crypto.symbol.trim() || crypto.symbol.toUpperCase() === 'INVALID') {
            console.log('Filtering out invalid crypto:', crypto);
            return false;
          }
          return true;
        })
        .map(crypto => crypto.symbol);
    
      console.log('Valid tickers for API:', { stockTickers, cryptoSymbols });
    
      if (stockTickers.length === 0 && cryptoSymbols.length === 0) {
        console.log('No valid tickers to fetch');
        return;
      }
    
      // Validate data before sending
      const requestData = {
        stocks: stockTickers.filter(ticker => ticker && ticker.trim()),
        crypto: cryptoSymbols.filter(symbol => symbol && symbol.trim())
      };
    
      // Additional validation
      if (requestData.stocks.length === 0 && requestData.crypto.length === 0) {
        console.log('No valid request data after filtering');
        return;
      }
    
      // Validate each ticker/symbol format
      const invalidStocks = requestData.stocks.filter(ticker => !ticker.includes('.JK'));
      const invalidCrypto = requestData.crypto.filter(symbol => !symbol || symbol.length === 0);
    
      if (invalidStocks.length > 0 || invalidCrypto.length > 0) {
        console.error('Invalid data format:', { invalidStocks, invalidCrypto });
        return;
      }
    
      console.log('Sending API request with data:', requestData);
    
      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...requestData,
          exchangeRate: exchangeRate
        }),
      });
    
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        // Don't throw error, just log it and continue
        console.warn(`API error: ${response.status} - ${errorText}`);
        return; // Exit early without throwing
      }
    
      const data = await response.json();
      console.log('API response received:', {
        receivedPrices: Object.keys(data.prices),
        expectedPrices: [...stockTickers, ...cryptoSymbols],
        missingPrices: [...stockTickers, ...cryptoSymbols].filter(key => !data.prices[key])
      });
      
      setPrices(data.prices);
      
      // ADDED: Auto-refresh exchange rate when prices are updated
      setTimeout(() => {
        console.log('Auto-refreshing exchange rate after price update');
        updateExchangeRate();
      }, 1000); // 1 second delay
    } catch (error) {
      console.error('Error fetching prices:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        stockTickers,
        cryptoSymbols
      });
    } finally {
      setPricesLoading(false);
    }
  }, [assets.stocks.length, assets.crypto.length, exchangeRate]); // Only depend on length, not entire objects

  // Direct fetch prices function for immediate refresh (bypasses debounce)
  const fetchPricesImmediate = useCallback(async () => {
    setPricesLoading(true);
    try {
      // Validate assets structure
      if (!assets || !assets.stocks || !assets.crypto) {
        console.error('Invalid assets structure:', assets);
        return;
      }
    
      // Filter out US stocks and invalid data
      const validStocks = assets.stocks.filter(stock => {
        if (!stock || !stock.ticker || !stock.ticker.trim()) return false;
        
        // Remove US stocks that we removed
        const usStockTickers = ['TSLA', 'NVDA', 'MSTR', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'INVALID'];
        const tickerUpper = stock.ticker.toUpperCase();
        
        // Only allow valid IDX stocks (4 characters or less, not US stocks)
        return tickerUpper.length <= 4 && !usStockTickers.includes(tickerUpper);
      });
      
      const stockTickers = validStocks
        .map(stock => `${stock.ticker}.JK`);
        
      const cryptoSymbols = assets.crypto
        .filter(crypto => crypto && crypto.symbol && crypto.symbol.trim() && crypto.symbol.toUpperCase() !== 'INVALID')
        .map(crypto => crypto.symbol);
      
      if (stockTickers.length === 0 && cryptoSymbols.length === 0) {
        return;
      }
      
      // Validate data before sending
      const requestData = {
        stocks: stockTickers.filter(ticker => ticker && ticker.trim()),
        crypto: cryptoSymbols.filter(symbol => symbol && symbol.trim())
      };
      
      // Additional validation
      if (requestData.stocks.length === 0 && requestData.crypto.length === 0) {
        return;
      }
      
      // Validate each ticker/symbol format
      const invalidStocks = requestData.stocks.filter(ticker => !ticker.includes('.JK'));
      const invalidCrypto = requestData.crypto.filter(symbol => !symbol || symbol.length === 0);
      
      if (invalidStocks.length > 0 || invalidCrypto.length > 0) {
        console.error('Invalid data format:', { invalidStocks, invalidCrypto });
        return;
      }
      
      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...requestData,
          exchangeRate: exchangeRate
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        // Don't throw error, just log it and continue
        console.warn(`API error: ${response.status} - ${errorText}`);
        return; // Exit early without throwing
      }
      
      const data = await response.json();
      setPrices(data.prices);
      
      // ADDED: Auto-refresh exchange rate when prices are updated (immediate)
      setTimeout(() => {
        console.log('Auto-refreshing exchange rate after immediate price update');
        updateExchangeRate();
      }, 1000); // 1 second delay
    } catch (error) {
      console.error('Error fetching prices:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        stockTickers,
        cryptoSymbols
      });
    } finally {
      setPricesLoading(false);
    }
  }, [assets.stocks.length, assets.crypto.length, exchangeRate]); // Only depend on length, not entire objects

  // Update exchange rate function
  const updateExchangeRate = useCallback(async () => {
    try {
      const rateData = await fetchExchangeRate();
      if (rateData && rateData.rate) {
        setExchangeRate(rateData.rate);
      } else {
        throw new Error('Invalid exchange rate data received');
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      setExchangeRate(null);
    }
  }, []);

  // Update prices function
  const updatePrices = useCallback(async (immediate = false) => {
    if (assets.stocks.length > 0 || assets.crypto.length > 0) {
      if (immediate) {
        // For manual refresh, use direct fetch function
        await fetchPricesImmediate();
        // Force rebuild assets after manual refresh
        setLastManualUpdate({
          timestamp: Date.now(),
          type: 'price_refresh'
        });
      } else {
        fetchPrices();
      }
    }
  }, [fetchPrices, fetchPricesImmediate]); // Remove assets dependency to prevent infinite loop

  // Set up intervals for exchange rate and price updates
  useEffect(() => {
    // Initial fetch
    updateExchangeRate();
    updatePrices(false); // Pass false for non-immediate update
    
    const exchangeInterval = setInterval(updateExchangeRate, 60000); // 1 minute
    const priceInterval = setInterval(() => updatePrices(false), 60000); // 1 minute

    return () => {
      clearInterval(exchangeInterval);
      clearInterval(priceInterval);
    };
  }, []); // Remove dependencies to prevent infinite loops

  // ADDED: Auto-refresh prices when assets change
  useEffect(() => {
    if (assets.stocks.length > 0 || assets.crypto.length > 0) {
      // Debounce auto-refresh to prevent excessive API calls
      const timeoutId = setTimeout(() => {
        console.log('Auto-refreshing prices due to assets change');
        updatePrices(false);
      }, 1000); // 1 second debounce

      return () => clearTimeout(timeoutId);
    }
  }, [assets.stocks.length, assets.crypto.length]); // Only trigger on length changes

  // Fetch prices for assets - removed to prevent infinite loops
  // Prices are now fetched via intervals and manual refresh only

  // Save portfolio to Firebase whenever it changes
  useEffect(() => {
    const savePortfolio = async () => {
      if (user && !loading && !authLoading) {
        await saveUserPortfolio(assets);
      }
    };

    savePortfolio();
  }, [assets.stocks.length, assets.crypto.length, user, loading, authLoading, saveUserPortfolio]); // Only depend on length, not entire objects

  // Update portfolio value calculation - REMOVED to prevent infinite loops
  // Portfolio value is calculated on-demand in the UI components

  // Fetch transactions
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
        // Convert Firestore timestamp to ISO string
        const timestampISO = timestamp ? (timestamp.toDate ? timestamp.toDate().toISOString() : timestamp) : new Date().toISOString();
        
        return {
          id: doc.id,
          ...data,
          timestamp: timestampISO
        };
      });
      
      console.log('Processed transactions:', newTransactions);
      
      // Check if transactions are being deleted (count is decreasing)
      if (newTransactions.length < previousTransactionCount && (assets.stocks.length > 0 || assets.crypto.length > 0)) {
        console.log('Transaction count decreased, protecting portfolio from rebuild');
        setPortfolioProtected(true);
      }
      
      setPreviousTransactionCount(newTransactions.length);
      setTransactions(newTransactions);
      
      // ADDED: Auto-refresh prices when transactions change
      if (newTransactions.length > 0) {
        setTimeout(() => {
          console.log('Auto-refreshing prices due to transactions change');
          updatePrices(false);
        }, 1000); // 1 second debounce
      }
    }, (error) => {
      console.error('Error in transaction listener:', error);
      setConfirmModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to load transactions: ' + error.message,
        type: 'error',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
    });

    return () => {
      console.log('Cleaning up transaction listener');
      unsubscribe();
    };
  }, [user]); // Remove problematic dependencies

  // Pada bagian useEffect yang update assets berdasarkan transaksi dan harga
  useEffect(() => {
    // Clear any existing timeout
    if (rebuildTimeoutRef.current) {
      clearTimeout(rebuildTimeoutRef.current);
    }
    
    // ADDED: Prevent infinite loop by checking if we're already rebuilding
    if (rebuildTimeoutRef.current) {
      console.log('Skipping portfolio rebuild - rebuild already in progress');
      return;
    }
    
    // Skip rebuilding if we're currently updating portfolio manually
    if (isUpdatingPortfolio) {
      console.log('Skipping portfolio rebuild - manual update in progress');
      return;
    }
    
    // ENHANCED PROTECTION: Check for manual updates with protection duration
    if (lastManualUpdate) {
      const timeSinceUpdate = Date.now() - lastManualUpdate.timestamp;
      const protectionDuration = lastManualUpdate.protectionDuration || 1000; // Changed to 1 second
      
      if (timeSinceUpdate < protectionDuration) {
        const isPriceRefresh = lastManualUpdate.type === 'price_refresh';
        if (!isPriceRefresh) {
          console.log(`Skipping portfolio rebuild - manual update protection active (${Math.round(protectionDuration/1000)}s)`);
          console.log('Manual update type:', lastManualUpdate.type);
          console.log('Manual update operation:', lastManualUpdate.operation);
          console.log(`Time since update: ${Math.round(timeSinceUpdate/1000)}s`);
          return;
        } else {
          console.log('Allowing rebuild after manual price refresh');
        }
      }
    }
    
    // Skip rebuilding if transactions are empty (to preserve portfolio when transactions are deleted)
    if (!transactions || transactions.length === 0) {
      console.log('Skipping portfolio rebuild - no transactions available');
      return;
    }
    
    // Skip rebuilding if we already have assets and transactions are being deleted
    if (assets.stocks.length > 0 || assets.crypto.length > 0) {
      const hasBuyTransactions = transactions.some(tx => tx.type === 'buy');
      const hasDeleteTransactions = transactions.some(tx => tx.type === 'delete');
      
      // If we have assets but no buy transactions, don't rebuild
      if (!hasBuyTransactions) {
        console.log('Skipping portfolio rebuild - no buy transactions but portfolio exists');
        setPortfolioProtected(true);
        return;
      }
      
      // If we have delete transactions and assets exist, be more careful about rebuilding
      if (hasDeleteTransactions) {
        console.log('Skipping portfolio rebuild - delete transactions detected, preserving existing portfolio');
        setPortfolioProtected(true);
        return;
      }
      
      // Additional protection: if we have assets and the number of transactions is decreasing
      const currentTransactionCount = transactions.length;
      const currentAssetCount = assets.stocks.length + assets.crypto.length;
      
      if (currentTransactionCount < currentAssetCount) {
        console.log('Skipping portfolio rebuild - transaction count decreased, preserving existing portfolio');
        setPortfolioProtected(true);
        return;
      }
      
      // Check if we're deleting transaction history
      if (currentAssetCount > 0 && currentTransactionCount < previousTransactionCount) {
        console.log('Skipping portfolio rebuild - transaction history deletion detected, preserving existing portfolio');
        setPortfolioProtected(true);
        return;
      }
    }
    
    // If portfolio is protected, don't rebuild
    if (portfolioProtected) {
      console.log('Skipping portfolio rebuild - portfolio is protected');
      return;
    }
    
    // Check for recent deletions
    if (assets.stocks.length > 0 || assets.crypto.length > 0) {
      const hasRecentDeletions = transactions.some(tx => 
        tx.type === 'delete' && 
        new Date(tx.timestamp) > new Date(Date.now() - 30000) // Last 30 seconds
      );
      
      if (hasRecentDeletions) {
        console.log('Skipping portfolio rebuild - recent deletions detected, protecting existing portfolio');
        setPortfolioProtected(true);
        return;
      }
    }
    
          // Direct rebuild without debounce
      if (transactions && prices && Object.keys(prices).length > 0) {
        try {
          console.log('Building assets from transactions and prices');
          console.log('Current transactions:', transactions.map(tx => `${tx.type} ${tx.assetType} ${tx.ticker || tx.symbol} ${tx.amount}`));
          
          // ADDED: Set rebuild flag to prevent concurrent rebuilds (1 second)
          rebuildTimeoutRef.current = setTimeout(() => {
            rebuildTimeoutRef.current = null;
          }, 1000);
          
          // Get current assets from state to preserve manual prices
          setAssets(currentAssets => {
            const newAssets = buildAssetsFromTransactions(transactions, prices, currentAssets);
            console.log('New assets built:', newAssets);
            
            // Reset portfolio protection when rebuilding successfully
            setPortfolioProtected(false);
            
            // Filter out assets with zero amount (fully sold)
            const filteredStocks = newAssets.stocks.filter(stock => {
              const isValid = stock.lots > 0;
              if (!isValid) {
                console.log(`Filtering out stock ${stock.ticker} - lots: ${stock.lots} (fully sold)`);
              }
              return isValid;
            });
            const filteredCrypto = newAssets.crypto.filter(crypto => {
              const isValid = crypto.amount > 0;
              if (!isValid) {
                console.log(`Filtering out crypto ${crypto.symbol} - amount: ${crypto.amount} (fully sold)`);
              }
              return isValid;
            });
            
            const filteredAssets = {
              stocks: filteredStocks,
              crypto: filteredCrypto
            };
            
            console.log('Filtered assets (removed zero amounts):', filteredAssets);
            
            // REMOVED: Preserve existing assets when new assets are empty
            // This was causing sold assets to remain in portfolio
            
            // Always update with filtered assets to ensure sold assets are removed
            console.log('Updating portfolio with filtered assets');
            console.log('Previous stocks:', currentAssets.stocks.map(s => `${s.ticker}: ${s.lots}`));
            console.log('New stocks:', filteredAssets.stocks.map(s => `${s.ticker}: ${s.lots}`));
            console.log('Previous crypto:', currentAssets.crypto.map(c => `${c.symbol}: ${c.amount}`));
            console.log('New crypto:', filteredAssets.crypto.map(c => `${c.symbol}: ${c.amount}`));
            
            return filteredAssets;
          });
        } catch (error) {
          console.error('Error building assets from transactions:', error);
          // Don't use fallback to prevent overriding manual updates
        }
      }
    
    // No cleanup needed since we removed debounce
  }, [transactions, prices, isUpdatingPortfolio, lastManualUpdate, portfolioProtected]); // Remove previousTransactionCount to prevent infinite loop

  const addTransaction = async (transaction) => {
    try {
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Validate required fields
      if (!transaction.price || isNaN(transaction.price)) {
        throw new Error('Invalid price value');
      }
      
      const transactionData = {
        ...transaction,
        userId: user.uid,
        timestamp: serverTimestamp(),
        price: Number(transaction.price),
        total: Number(transaction.price) * Number(transaction.amount)
      };
      
      const docRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      console.log('Transaction saved with ID:', docRef.id);
      
      // Reset portfolio protection when adding new transaction
      setPortfolioProtected(false);
      setPreviousTransactionCount(prev => prev + 1);
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }
  };

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
      if (isNaN(stock.lots) || stock.lots <= 0) {
        throw new Error('Invalid lots value');
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
      // For IDX stocks: 1 lot = 100 shares
      const totalShares = stock.lots * 100;
      let valueIDR, valueUSD;
      if (stock.currency === 'IDR') {
        valueIDR = stock.price * totalShares;
        valueUSD = exchangeRate && exchangeRate > 0 ? valueIDR / exchangeRate : 0;
      } else {
        valueUSD = stock.price * totalShares;
        valueIDR = exchangeRate && exchangeRate > 0 ? valueUSD * exchangeRate : 0;
      }
      
      // Create transaction data
      const transactionData = {
        type: 'buy',
        assetType: 'stock',
        ticker: stock.ticker,
        amount: stock.lots,
        price: stock.price,
        valueIDR: valueIDR,
        valueUSD: valueUSD,
        date: formattedDate,
        timestamp: serverTimestamp(),
        currency: stock.currency,
        status: 'completed',
        shares: totalShares,
        userId: user.uid,
        ...(stock.entry && { entry: stock.entry })
      };
      
      // Save to Firestore
      const transactionRef = await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      console.log('Transaction saved with ID:', transactionRef.id);
      
      // Update local state
      setTransactions(prev => [{
        id: transactionRef.id,
        ...transactionData,
        timestamp: now.toISOString()
      }, ...prev]);
      
      // Update assets with actual values
      const updatedStock = {
        ticker: stock.ticker,
        lots: stock.lots,
        shares: totalShares,
        currentPrice: stock.price, // Use currentPrice for the asset
        avgPrice: stock.price, // Use purchase price as average price
        purchasePrice: stock.price,
        valueIDR: valueIDR,
        valueUSD: valueUSD,
        lastUpdate: formattedDate,
        currency: stock.currency,
        type: 'stock',
        userId: user.uid,
        ...(stock.entry && { entry: stock.entry })
      };
      
      // Update local state
      const normalizedNewTicker = stock.ticker.toUpperCase();
      setAssets(prev => {
        const existingStockIndex = prev.stocks.findIndex(s => s.ticker.toUpperCase() === normalizedNewTicker);
        if (existingStockIndex >= 0) {
          const updatedStocks = [...prev.stocks];
          const existingStock = updatedStocks[existingStockIndex];
          
          // Calculate new average price based on weighted average
          const totalLots = existingStock.lots + stock.lots;
          const totalValue = (existingStock.avgPrice * existingStock.lots) + (stock.price * stock.lots);
          const newAvgPrice = totalValue / totalLots;
          
          updatedStocks[existingStockIndex] = {
            ...existingStock,
            lots: totalLots,
            shares: existingStock.shares + totalShares,
            avgPrice: newAvgPrice, // Use calculated weighted average
            valueIDR: existingStock.valueIDR + valueIDR,
            valueUSD: existingStock.valueUSD + valueUSD,
            lastUpdate: formattedDate,
            currentPrice: stock.price, // Use currentPrice for the asset
            ticker: normalizedNewTicker // always store normalized
          };
          return {
            ...prev,
            stocks: updatedStocks
          };
        }
        return {
          ...prev,
          stocks: [...prev.stocks, {
            ...updatedStock,
            ticker: normalizedNewTicker,
            ...(stock.entry && { entry: stock.entry })
          }]
        };
      });

      // Save assets to Firestore using the updated state
      const userRef = doc(db, 'users', user.uid);
      setAssets(prev => {
        const currentAssets = {
          stocks: prev.stocks.map(stock => ({
            ...stock,
            type: 'stock',
            userId: user.uid,
            currency: stock.currency || 'IDR',
            lastUpdate: stock.lastUpdate || formattedDate
          })),
          crypto: prev.crypto.map(crypto => ({
            ...crypto,
            type: 'crypto',
            userId: user.uid,
            currency: crypto.currency || 'USD',
            lastUpdate: crypto.lastUpdate || formattedDate
          }))
        };

        // Clean undefined values before saving
        const cleanedAssets = cleanUndefinedValues(currentAssets);

        // Save to Firestore
        updateDoc(userRef, {
          assets: cleanedAssets
        });

        return prev; // Return unchanged state since we're just saving
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
          exchangeRate: exchangeRate
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
      
      // Calculate total value based on purchase price
      const pricePerUnit = crypto.purchasePrice || cryptoPrice.price;
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
      
      // Update local state
      setTransactions(prev => [{
        id: transactionRef.id,
        ...transactionData,
        timestamp: now.toISOString()
      }, ...prev]);
      
      // Update assets with actual values
      const updatedCrypto = {
        symbol: crypto.symbol,
        amount: crypto.amount,
        currentPrice: cryptoPrice.price, // Use currentPrice for the asset
        avgPrice: pricePerUnit, // Use purchase price as average price
        purchasePrice: pricePerUnit,
        valueIDR: totalValueIDR,
        valueUSD: totalValueUSD,
        lastUpdate: formattedDate,
        currency: 'USD',
        type: 'crypto',
        userId: user.uid,
        ...(crypto.entry && { entry: crypto.entry })
      };
      
      // Update local state
      const normalizedNewSymbol = crypto.symbol.toUpperCase();
      setAssets(prev => {
        const existingCryptoIndex = prev.crypto.findIndex(c => c.symbol.toUpperCase() === normalizedNewSymbol);
        if (existingCryptoIndex >= 0) {
          const updatedCrypto = [...prev.crypto];
          const existingCrypto = updatedCrypto[existingCryptoIndex];
          
          // Calculate new average price based on weighted average
          const totalAmount = existingCrypto.amount + crypto.amount;
          const totalValue = (existingCrypto.avgPrice * existingCrypto.amount) + (pricePerUnit * crypto.amount);
          const newAvgPrice = totalValue / totalAmount;
          
          updatedCrypto[existingCryptoIndex] = {
            ...existingCrypto,
            amount: totalAmount,
            avgPrice: newAvgPrice, // Use calculated weighted average
            valueIDR: existingCrypto.valueIDR + totalValueIDR,
            valueUSD: existingCrypto.valueUSD + totalValueUSD,
            lastUpdate: formattedDate,
            currentPrice: cryptoPrice.price, // Use currentPrice for the asset
            symbol: normalizedNewSymbol // always store normalized
          };
          return {
            ...prev,
            crypto: updatedCrypto
          };
        }
        return {
          ...prev,
          crypto: [...prev.crypto, {
            ...updatedCrypto,
            symbol: normalizedNewSymbol,
            ...(crypto.entry && { entry: crypto.entry })
          }]
        };
      });

      // Save assets to Firestore using the updated state
      const userRef = doc(db, 'users', user.uid);
      setAssets(prev => {
        const currentAssets = {
          stocks: prev.stocks.map(stock => ({
            ...stock,
            type: 'stock',
            userId: user.uid,
            currency: stock.currency || 'IDR',
            lastUpdate: stock.lastUpdate || formattedDate
          })),
          crypto: prev.crypto.map(crypto => ({
            ...crypto,
            type: 'crypto',
            userId: user.uid,
            currency: crypto.currency || 'USD',
            lastUpdate: crypto.lastUpdate || formattedDate
          }))
        };

        // Clean undefined values before saving
        const cleanedAssets = cleanUndefinedValues(currentAssets);

        // Save to Firestore
        updateDoc(userRef, {
          assets: cleanedAssets
        });

        return prev; // Return unchanged state since we're just saving
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

  const updateStock = (index, updatedStock) => {
    console.log('updateStock called:', {
      index,
      updatedStock,
      currentStocks: assets.stocks
    });
    
    setAssets(prev => {
      const updatedStocks = [...prev.stocks];
      
      // Get the original stock to preserve all data
      const originalStock = prev.stocks[index];
      
      // Get the most current price from prices state
      const currentPrice = prices[`${updatedStock.ticker}.JK`]?.price || 0;
      const totalShares = updatedStock.lots * 100; // 1 lot = 100 shares for IDX
      const currentValue = currentPrice * totalShares;
      const totalCost = updatedStock.avgPrice * totalShares;
      const gain = currentValue - totalCost;
      
      const finalStock = {
        ...originalStock, // Preserve ALL original data first
        ...updatedStock, // Apply updates (mainly avgPrice)
        currentPrice: currentPrice, // Always use the most current price
        porto: currentValue,
        totalCost: totalCost,
        gain: gain,
        // Ensure all required fields are present and correct
        ticker: updatedStock.ticker || originalStock.ticker,
        lots: updatedStock.lots || originalStock.lots,
        avgPrice: updatedStock.avgPrice,
        currency: updatedStock.currency || originalStock.currency || 'IDR',
        type: 'stock'
      };
      
      updatedStocks[index] = finalStock;
      
      console.log('Stock updated:', {
        original: originalStock,
        updated: finalStock,
        ticker: finalStock.ticker,
        originalTicker: originalStock.ticker,
        updatedTicker: finalStock.ticker,
        tickerChanged: originalStock.ticker !== finalStock.ticker
      });
      
      return {
        ...prev,
        stocks: updatedStocks
      };
    });
    
    // Set manual update flag with longer protection
    setLastManualUpdate({
      timestamp: Date.now(),
      type: 'manual_update',
      operation: 'update_stock',
      ticker: updatedStock.ticker,
      protectionDuration: 60000 // 60 seconds protection
    });
  };
  
  const updateCrypto = (index, updatedCrypto) => {
    console.log('updateCrypto called:', {
      index,
      updatedCrypto,
      currentCrypto: assets.crypto
    });
    
    setAssets(prev => {
      const updatedCryptos = [...prev.crypto];
      
      // Get the original crypto to preserve all data
      const originalCrypto = prev.crypto[index];
      
      // Get the most current price from prices state
      const currentPrice = prices[updatedCrypto.symbol]?.price || 0;
      const currentValue = currentPrice * updatedCrypto.amount;
      const totalCost = updatedCrypto.avgPrice * updatedCrypto.amount;
      const gain = currentValue - totalCost;
      
      const finalCrypto = {
        ...originalCrypto, // Preserve ALL original data first
        ...updatedCrypto, // Apply updates (mainly avgPrice)
        currentPrice: currentPrice, // Always use the most current price
        porto: currentValue,
        totalCost: totalCost,
        gain: gain,
        // Ensure all required fields are present and correct
        symbol: updatedCrypto.symbol || originalCrypto.symbol,
        amount: updatedCrypto.amount || originalCrypto.amount,
        avgPrice: updatedCrypto.avgPrice,
        currency: updatedCrypto.currency || originalCrypto.currency || 'USD',
        type: 'crypto'
      };
      
      updatedCryptos[index] = finalCrypto;
      
      console.log('Crypto updated:', {
        original: originalCrypto,
        updated: finalCrypto,
        symbol: finalCrypto.symbol,
        originalSymbol: originalCrypto.symbol,
        updatedSymbol: finalCrypto.symbol,
        symbolChanged: originalCrypto.symbol !== finalCrypto.symbol
      });
      
      return {
        ...prev,
        crypto: updatedCryptos
      };
    });
    
    // Set manual update flag with longer protection
    setLastManualUpdate({
      timestamp: Date.now(),
      type: 'manual_update',
      operation: 'update_crypto',
      symbol: updatedCrypto.symbol,
      protectionDuration: 60000 // 60 seconds protection
    });
  };
  
  const deleteStock = async (index) => {
    try {
      setIsUpdatingPortfolio(true);
      const stockToDelete = assets.stocks[index];
      
      // Update local state first
      const newAssets = {
        ...assets,
        stocks: assets.stocks.filter((_, i) => i !== index)
      };
      
      setAssets(newAssets);
      setLastManualUpdate({
        timestamp: Date.now(),
        type: 'manual_update',
        assets: newAssets,
        operation: 'delete_stock',
        ticker: stockToDelete.ticker
      });

      // Record delete transaction
      if (user && stockToDelete) {
        const now = new Date();
        const formattedDate = now.toLocaleString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        // Get current price for calculation
        const priceData = prices[stockToDelete.ticker];
        const price = priceData ? priceData.price : stockToDelete.price || 0;
        const currency = priceData ? priceData.currency : stockToDelete.currency || 'IDR';
        
        // Calculate values
        const totalShares = currency === 'IDR' ? stockToDelete.lots * 100 : stockToDelete.lots;
        let valueIDR, valueUSD;
        if (currency === 'IDR') {
          valueIDR = price * totalShares;
          valueUSD = 1; // Hapus exchangeRate karena tidak diperlukan untuk saham IDX
        } else {
          valueUSD = price * totalShares;
          valueIDR = 1; // Hapus exchangeRate karena tidak diperlukan untuk saham IDX
        }

        const transactionData = {
          type: 'delete',
          assetType: 'stock',
          ticker: stockToDelete.ticker,
          amount: stockToDelete.lots,
          price: price,
          valueIDR: valueIDR,
          valueUSD: valueUSD,
          timestamp: now.toISOString(),
          date: formattedDate,
          currency: currency,
          shares: totalShares,
          userId: user.uid,
          status: 'completed'
        };

        // Save to Firestore
        await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      }
    } catch (error) {
      console.error('Error deleting stock:', error);
    } finally {
      // Keep the flag active longer to prevent rebuild interference
      setTimeout(() => {
        setIsUpdatingPortfolio(false);
        // Clear the last manual update after a longer delay
        setTimeout(() => {
          setLastManualUpdate(null);
        }, 5000);
      }, 5000);
    }
  };
  
  const deleteCrypto = async (index) => {
    try {
      setIsUpdatingPortfolio(true);
      const cryptoToDelete = assets.crypto[index];
      
      // Update local state first
      const newAssets = {
        ...assets,
        crypto: assets.crypto.filter((_, i) => i !== index)
      };
      
      setAssets(newAssets);
      setLastManualUpdate({
        timestamp: Date.now(),
        type: 'manual_update',
        assets: newAssets,
        operation: 'delete_crypto',
        symbol: cryptoToDelete.symbol
      });

      // Record delete transaction
      if (user && cryptoToDelete) {
        const now = new Date();
        const formattedDate = now.toLocaleString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        // Get current price for calculation
        const priceData = prices[cryptoToDelete.symbol];
        const price = priceData ? priceData.price : cryptoToDelete.price || 0;
        
        // Calculate values
        const valueUSD = price * cryptoToDelete.amount;
        const valueIDR = 1 * valueUSD; // Hapus exchangeRate karena tidak diperlukan untuk saham IDX

        const transactionData = {
          type: 'delete',
          assetType: 'crypto',
          symbol: cryptoToDelete.symbol,
          amount: cryptoToDelete.amount,
          price: price,
          valueIDR: valueIDR,
          valueUSD: valueUSD,
          timestamp: now.toISOString(),
          date: formattedDate,
          currency: 'USD',
          userId: user.uid,
          status: 'completed'
        };

        // Save to Firestore
        await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      }
    } catch (error) {
      console.error('Error deleting crypto:', error);
    } finally {
      // Keep the flag active longer to prevent rebuild interference
      setTimeout(() => {
        setIsUpdatingPortfolio(false);
        // Clear the last manual update after a longer delay
        setTimeout(() => {
          setLastManualUpdate(null);
        }, 10000); // Increased to 10 seconds
      }, 7000); // Increased to 7 seconds
    }
  };

  const handleSellStock = async (index, asset, amountToSell) => {
    try {
      setSellingLoading(true);
      setIsUpdatingPortfolio(true);
      
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
            body: JSON.stringify(requestData),
          });
          
          if (response.ok) {
            const data = await response.json();
            // Update prices state with fresh data
            setPrices(prev => ({ ...prev, ...data.prices }));
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

      // Calculate remaining amount and update portfolio
      const remainingAmount = asset.lots - amountToSell;
      let newAssets;

      if (remainingAmount <= 0) {
        // Remove the stock if selling all
        const updatedStocks = assets.stocks.filter((_, i) => i !== index);
        newAssets = {
          ...assets,
          stocks: updatedStocks
        };
      } else {
        // Update the remaining amount with proper calculations
        const updatedStocks = [...assets.stocks];
        const remainingShares = remainingAmount * 100;
        const remainingValueIDR = remainingShares * priceData.price;
        const remainingValueUSD = exchangeRate && exchangeRate > 0 ? remainingValueIDR / exchangeRate : 0;
        
        updatedStocks[index] = {
          ...asset,
          lots: remainingAmount,
          shares: remainingShares,
          currentPrice: priceData.price,
          porto: remainingValueIDR,
          valueIDR: remainingValueIDR,
          valueUSD: remainingValueUSD,
          // Recalculate gain/loss
          totalCost: asset.avgPrice * remainingShares,
          gain: remainingValueIDR - (asset.avgPrice * remainingShares)
        };
        
        newAssets = {
          ...assets,
          stocks: updatedStocks
        };
      }

      // Set manual update flag BEFORE updating assets
      setLastManualUpdate({
        timestamp: Date.now(),
        type: 'manual_update',
        operation: 'sell_stock',
        ticker: asset.ticker,
        amount: amountToSell,
        protectionDuration: 15000 // 15 seconds protection
      });

      // Update assets state
      setAssets(newAssets);

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
        amount: amountToSell,
        price: priceData.price,
        avgPrice: asset.avgPrice,
        valueIDR,
        valueUSD,
        timestamp: serverTimestamp(), // Use serverTimestamp for consistency
        assetType: 'stock',
        currency: priceData.currency,
        shares: shareCount,
        date: formattedDate,
        userId: user ? user.uid : null,
        status: 'completed'
      };

      // Save transaction to Firestore
      if (user) {
        await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
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
      // Keep protection active for longer
      setTimeout(() => {
        setIsUpdatingPortfolio(false);
      }, 10000); // 10 seconds
    }
  };

  const handleSellCrypto = async (index, asset, amountToSell) => {
    try {
      setSellingLoading(true);
      setIsUpdatingPortfolio(true);
      
      const crypto = assets.crypto[index];
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
            body: JSON.stringify(requestData),
          });
          
          if (response.ok) {
            const data = await response.json();
            // Update prices state with fresh data
            setPrices(prev => ({ ...prev, ...data.prices }));
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

      // Calculate remaining amount and update portfolio
      const remainingAmount = crypto.amount - amountToSell;
      let newAssets;
      
      if (remainingAmount <= 0) {
        // Remove crypto if selling all
        const updatedCrypto = assets.crypto.filter((_, i) => i !== index);
        newAssets = {
          ...assets,
          crypto: updatedCrypto
        };
      } else {
        // Update remaining amount with proper calculations
        const updatedCrypto = [...assets.crypto];
        const remainingValueUSD = remainingAmount * priceData.price;
        const remainingValueIDR = exchangeRate && exchangeRate > 0 ? remainingValueUSD * exchangeRate : 0;
        
        updatedCrypto[index] = {
          ...crypto,
          amount: remainingAmount,
          currentPrice: priceData.price,
          porto: remainingValueUSD,
          valueUSD: remainingValueUSD,
          valueIDR: remainingValueIDR,
          // Recalculate gain/loss
          totalCost: crypto.avgPrice * remainingAmount,
          gain: remainingValueUSD - (crypto.avgPrice * remainingAmount)
        };
        
        newAssets = {
          ...assets,
          crypto: updatedCrypto
        };
      }

      // Set manual update flag BEFORE updating assets
      setLastManualUpdate({
        timestamp: Date.now(),
        type: 'manual_update',
        operation: 'sell_crypto',
        symbol: crypto.symbol,
        amount: amountToSell,
        protectionDuration: 15000 // 15 seconds protection
      });

      // Update assets state
      setAssets(newAssets);

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
        await addDoc(collection(db, 'users', user.uid, 'transactions'), transaction);
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
      // Keep protection active for longer
      setTimeout(() => {
        setIsUpdatingPortfolio(false);
      }, 10000); // 10 seconds
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
                      <StockInput onAdd={addStock} onComplete={() => setActiveTab('portfolio')} />
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
                      <CryptoInput onAdd={addCrypto} onComplete={() => setActiveTab('portfolio')} exchangeRate={exchangeRate} />
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
                <Portfolio 
                  assets={assets} 
                  onUpdateStock={updateStock}
                  onUpdateCrypto={updateCrypto}
                  onAddAsset={() => setActiveTab('add')}
                  onSellStock={handleSellStock}
                  onSellCrypto={handleSellCrypto}
                  onDeleteStock={deleteStock}
                  onDeleteCrypto={deleteCrypto}
                  onRefreshPrices={updatePrices}
                  onRefreshExchangeRate={updateExchangeRate}
                  prices={prices}
                  exchangeRate={exchangeRate}
                  sellingLoading={sellingLoading}
                  pricesLoading={pricesLoading}
                />
              ) : activeTab === 'history' ? (
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