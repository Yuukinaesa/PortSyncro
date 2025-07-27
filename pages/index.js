// pages/index.js
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Portfolio from '../components/Portfolio';
import StockInput from '../components/StockInput';
import CryptoInput from '../components/CryptoInput';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../lib/authContext';
import { useRouter } from 'next/router';
import { collection, addDoc, query, orderBy, getDocs, doc, serverTimestamp, updateDoc, where, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FiLogOut, FiUser } from 'react-icons/fi';
import { debounce } from 'lodash';
import { useRef } from 'react';
import { calculatePortfolioValue, validateTransaction, isPriceDataAvailable, getRealPriceData, calculatePositionFromTransactions } from '../lib/utils';
import ErrorBoundary from '../components/ErrorBoundary';
import TransactionHistory from '../components/TransactionHistory';
import { fetchExchangeRate } from '../lib/fetchPrices';
import Modal from '../components/Modal';

// Tambahkan fungsi untuk membangun ulang aset dari transaksi
function buildAssetsFromTransactions(transactions, prices) {
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
    const pos = calculatePositionFromTransactions(txs, currentPrice);
    
    // Check if there's a delete transaction (if yes, skip this asset)
    const hasDeleteTransaction = txs.some(tx => tx.type === 'delete');
    if (hasDeleteTransaction) {
      console.log(`Skipping ${ticker} - has delete transaction`);
      return null; // Skip this asset
    }
    
    // Check if the asset is fully sold (amount <= 0)
    if (pos.amount <= 0) {
      console.log(`Skipping ${ticker} - fully sold (amount: ${pos.amount})`);
      return null; // Skip this asset
    }
    
    return {
      ticker,
      lots: pos.amount, // untuk saham, 1 lot = 100 saham (IDX)
      avgPrice: pos.avgPrice,
      totalCost: pos.totalCost,
      gain: pos.gain,
      porto: pos.porto,
      price: currentPrice,
      currency: priceObj ? priceObj.currency : 'IDR',
      type: 'stock',
      transactions: txs,
      ...(pos.entryPrice && { entry: pos.entryPrice })
    };
  }).filter(Boolean); // Remove null entries

  const crypto = Object.entries(cryptoMap).map(([symbol, txs]) => {
    const priceObj = prices[symbol];
    const currentPrice = priceObj ? priceObj.price : 0;
    const pos = calculatePositionFromTransactions(txs, currentPrice);
    
    // Check if there's a delete transaction (if yes, skip this asset)
    const hasDeleteTransaction = txs.some(tx => tx.type === 'delete');
    if (hasDeleteTransaction) {
      console.log(`Skipping ${symbol} - has delete transaction`);
      return null; // Skip this asset
    }
    
    // Check if the asset is fully sold (amount <= 0)
    if (pos.amount <= 0) {
      console.log(`Skipping ${symbol} - fully sold (amount: ${pos.amount})`);
      return null; // Skip this asset
    }
    
    return {
      symbol,
      amount: pos.amount,
      avgPrice: pos.avgPrice,
      totalCost: pos.totalCost,
      gain: pos.gain,
      porto: pos.porto,
      price: currentPrice,
      currency: 'USD',
      type: 'crypto',
      transactions: txs,
      ...(pos.entryPrice && { entry: pos.entryPrice })
    };
  }).filter(Boolean); // Remove null entries

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
  const router = useRouter();
  const [prices, setPrices] = useState({});
  const [exchangeRate, setExchangeRate] = useState(null); // Aktifkan kembali untuk konversi crypto
  const [transactions, setTransactions] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);
  const [sellingLoading, setSellingLoading] = useState(false);
  const [isUpdatingPortfolio, setIsUpdatingPortfolio] = useState(false);
  const [lastManualUpdate, setLastManualUpdate] = useState(null);
  const rebuildTimeoutRef = useRef(null);

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
        return currency === 'IDR' ? 'Rp 0' : '$ 0';
      }
      
      if (currency === 'IDR') {
        return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          minimumFractionDigits: 2
        }).format(value);
      } else {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 8
        }).format(value);
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

  // Debounce price fetching
  const debouncedFetchPrices = useCallback(
    debounce(async () => {
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
      
      try {
        const response = await fetch('/api/prices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
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
      } catch (error) {
        console.error('Error fetching prices:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          stockTickers,
          cryptoSymbols
        });
      }
    }, 300000), // 5 minutes debounce
    [assets]
  );

  // Fetch exchange rate and prices on component mount with 5-minute intervals
  useEffect(() => {
    const updateExchangeRate = async () => {
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
    };

    const updatePrices = async () => {
      if (assets.stocks.length > 0 || assets.crypto.length > 0) {
        debouncedFetchPrices();
      }
    };

    // Immediate refresh on page load
    // console.log('🔄 Auto-refresh triggered on page load');
    updateExchangeRate();
    updatePrices();

    // Set up 5-minute intervals
    const exchangeInterval = setInterval(updateExchangeRate, 300000); // 5 minutes
    const priceInterval = setInterval(updatePrices, 300000); // 5 minutes

    return () => {
      clearInterval(exchangeInterval);
      clearInterval(priceInterval);
    };
  }, [assets.stocks.length, assets.crypto.length]);

  // Fetch prices for assets
  useEffect(() => {
    if (assets.stocks.length > 0 || assets.crypto.length > 0) {
      debouncedFetchPrices();
    }
  }, [assets.stocks.length, assets.crypto.length]);

  // Save portfolio to Firebase whenever it changes
  useEffect(() => {
    const savePortfolio = async () => {
      if (user && !loading && !authLoading) {
        await saveUserPortfolio(assets);
      }
    };

    savePortfolio();
  }, [assets, user, loading, authLoading, saveUserPortfolio]);

  // Update portfolio value calculation
  useEffect(() => {
    if (prices && exchangeRate) {
      const { totalValueIDR, totalValueUSD } = calculatePortfolioValue(assets, prices, exchangeRate);
      // Update any state or UI that depends on portfolio value
    }
  }, [assets, prices, exchangeRate]);

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
      setTransactions(newTransactions);
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
  }, [user]);

  // Pada bagian useEffect yang update assets berdasarkan transaksi dan harga
  useEffect(() => {
    // Clear any existing timeout
    if (rebuildTimeoutRef.current) {
      clearTimeout(rebuildTimeoutRef.current);
    }
    
    // Skip rebuilding if we're currently updating portfolio manually
    if (isUpdatingPortfolio) {
      console.log('Skipping portfolio rebuild - manual update in progress');
      return;
    }
    
    // If we have a recent manual update (within last 15 seconds), skip rebuild entirely
    if (lastManualUpdate && (Date.now() - lastManualUpdate.timestamp) < 15000) {
      console.log('Skipping rebuild - recent manual update detected');
      return;
    }
    
      // Debounce the rebuild to prevent rapid changes
  rebuildTimeoutRef.current = setTimeout(() => {
    if (transactions && prices && Object.keys(prices).length > 0) {
      try {
        console.log('Building assets from transactions and prices');
        const newAssets = buildAssetsFromTransactions(transactions, prices);
        console.log('New assets built:', newAssets);
        
        // Filter out assets with zero amount (fully sold)
        const filteredStocks = newAssets.stocks.filter(stock => {
          const isValid = stock.lots > 0;
          if (!isValid) {
            console.log(`Filtering out stock ${stock.ticker} - lots: ${stock.lots}`);
          }
          return isValid;
        });
        const filteredCrypto = newAssets.crypto.filter(crypto => {
          const isValid = crypto.amount > 0;
          if (!isValid) {
            console.log(`Filtering out crypto ${crypto.symbol} - amount: ${crypto.amount}`);
          }
          return isValid;
        });
        
        const filteredAssets = {
          stocks: filteredStocks,
          crypto: filteredCrypto
        };
        
        console.log('Filtered assets (removed zero amounts):', filteredAssets);
        
        // Only update if the new assets are different from current assets
        setAssets(prevAssets => {
          const stocksChanged = JSON.stringify(prevAssets.stocks) !== JSON.stringify(filteredAssets.stocks);
          const cryptoChanged = JSON.stringify(prevAssets.crypto) !== JSON.stringify(filteredAssets.crypto);
          
          if (stocksChanged || cryptoChanged) {
            console.log('Assets changed, updating portfolio');
            console.log('Previous stocks:', prevAssets.stocks.map(s => `${s.ticker}: ${s.lots}`));
            console.log('New stocks:', filteredAssets.stocks.map(s => `${s.ticker}: ${s.lots}`));
            console.log('Previous crypto:', prevAssets.crypto.map(c => `${c.symbol}: ${c.amount}`));
            console.log('New crypto:', filteredAssets.crypto.map(c => `${c.symbol}: ${c.amount}`));
            return filteredAssets;
          } else {
            console.log('No changes detected, keeping current assets');
            return prevAssets;
          }
        });
      } catch (error) {
        console.error('Error building assets from transactions:', error);
        // Don't use fallback to prevent overriding manual updates
      }
    }
  }, 3000); // 3 second debounce to give more time for manual updates
    
    // Cleanup timeout on unmount
    return () => {
      if (rebuildTimeoutRef.current) {
        clearTimeout(rebuildTimeoutRef.current);
      }
    };
  }, [transactions, prices, isUpdatingPortfolio, lastManualUpdate]);

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
        price: stock.price,
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
          updatedStocks[existingStockIndex] = {
            ...updatedStocks[existingStockIndex],
            lots: updatedStocks[existingStockIndex].lots + stock.lots,
            shares: updatedStocks[existingStockIndex].shares + stock.shares,
            valueIDR: updatedStocks[existingStockIndex].valueIDR + valueIDR,
            valueUSD: updatedStocks[existingStockIndex].valueUSD + valueUSD,
            lastUpdate: formattedDate,
            price: stock.price,
            purchasePrice: stock.price,
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

      // Save assets to Firestore
      const userRef = doc(db, 'users', user.uid);
      const currentAssets = {
        stocks: assets.stocks.map(stock => ({
          ...stock,
          type: 'stock',
          userId: user.uid,
          currency: stock.currency || 'IDR',
          lastUpdate: stock.lastUpdate || formattedDate
        })),
        crypto: assets.crypto.map(crypto => ({
          ...crypto,
          type: 'crypto',
          userId: user.uid,
          currency: crypto.currency || 'USD',
          lastUpdate: crypto.lastUpdate || formattedDate
        }))
      };

      await updateDoc(userRef, {
        assets: currentAssets
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
          // exchangeRate: exchangeRate // Hapus exchangeRate karena tidak diperlukan untuk saham IDX
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
        price: cryptoPrice.price,
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
          updatedCrypto[existingCryptoIndex] = {
            ...updatedCrypto[existingCryptoIndex],
            amount: updatedCrypto[existingCryptoIndex].amount + crypto.amount,
            valueIDR: updatedCrypto[existingCryptoIndex].valueIDR + totalValueIDR,
            valueUSD: updatedCrypto[existingCryptoIndex].valueUSD + totalValueUSD,
            lastUpdate: formattedDate,
            price: cryptoPrice.price,
            purchasePrice: pricePerUnit,
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

      // Save assets to Firestore
      const userRef = doc(db, 'users', user.uid);
      const currentAssets = {
        stocks: assets.stocks.map(stock => ({
          ...stock,
          type: 'stock',
          userId: user.uid,
          currency: stock.currency || 'IDR',
          lastUpdate: stock.lastUpdate || formattedDate
        })),
        crypto: assets.crypto.map(crypto => ({
          ...crypto,
          type: 'crypto',
          userId: user.uid,
          currency: crypto.currency || 'USD',
          lastUpdate: crypto.lastUpdate || formattedDate
        }))
      };

      await updateDoc(userRef, {
        assets: currentAssets
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
    setAssets(prev => {
      const updatedStocks = [...prev.stocks];
      
      // Recalculate gain/loss based on new average price
      const currentPrice = prices[`${updatedStock.ticker}.JK`]?.price || updatedStock.price || 0;
      const totalShares = updatedStock.lots * 100; // 1 lot = 100 shares for IDX
      const currentValue = currentPrice * totalShares;
      const totalCost = updatedStock.avgPrice * totalShares;
      const gain = currentValue - totalCost;
      
      updatedStocks[index] = {
        ...updatedStock,
        price: currentPrice,
        porto: currentValue,
        totalCost: totalCost,
        gain: gain
      };
      
      return {
        ...prev,
        stocks: updatedStocks
      };
    });
  };
  
  const updateCrypto = (index, updatedCrypto) => {
    setAssets(prev => {
      const updatedCryptos = [...prev.crypto];
      
      // Recalculate gain/loss based on new average price
      const currentPrice = prices[updatedCrypto.symbol]?.price || updatedCrypto.price || 0;
      const currentValue = currentPrice * updatedCrypto.amount;
      const totalCost = updatedCrypto.avgPrice * updatedCrypto.amount;
      const gain = currentValue - totalCost;
      
      updatedCryptos[index] = {
        ...updatedCrypto,
        price: currentPrice,
        porto: currentValue,
        totalCost: totalCost,
        gain: gain
      };
      
      return {
        ...prev,
        crypto: updatedCryptos
      };
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
          crypto: []
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

      // Update the stock amount
      const updatedStocks = [...assets.stocks];
      const remainingAmount = updatedStocks[index].lots - amountToSell;

      if (remainingAmount <= 0) {
        // Remove the stock if selling all
        updatedStocks.splice(index, 1);
      } else {
        // Update the remaining amount
        updatedStocks[index] = {
          ...updatedStocks[index],
          lots: remainingAmount,
          shares: remainingAmount * 100,
          valueIDR: remainingAmount * 100 * priceData.price,
          valueUSD: exchangeRate && exchangeRate > 0 ? (remainingAmount * 100 * priceData.price) / exchangeRate : 0
        };
      }

      // Add transaction (SELL) - always use addDoc to Firestore
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
        valueIDR,
        valueUSD,
        timestamp: now.toISOString(),
        assetType: 'stock',
        currency: priceData.currency,
        shares: shareCount,
        date: formattedDate,
        userId: user ? user.uid : null,
        status: 'completed'
      };

      const newAssets = {
        ...assets,
        stocks: updatedStocks
      };
      
      setAssets(newAssets);
      setLastManualUpdate({
        timestamp: Date.now(),
        assets: newAssets,
        operation: 'sell_stock',
        ticker: asset.ticker,
        amount: amountToSell
      });

      // Save to Firestore if user is logged in
      if (user) {
        await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      }

      // Remove success notification - just close the modal silently
      setConfirmModal(null);

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
          crypto: cryptoSymbols
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

      // Update asset
      const updatedAmount = crypto.amount - amountToSell;
      let newAssets;
      
      if (updatedAmount <= 0) {
        // Remove crypto if selling all
        const updatedCrypto = [...assets.crypto];
        updatedCrypto.splice(index, 1);
        newAssets = {
          ...assets,
          crypto: updatedCrypto
        };
      } else {
        // Update remaining amount
        const updatedCrypto = [...assets.crypto];
        updatedCrypto[index] = {
          ...crypto,
          amount: updatedAmount,
          valueUSD: updatedAmount * priceData.price,
          valueIDR: exchangeRate && exchangeRate > 0 ? (updatedAmount * priceData.price) * exchangeRate : 0
        };
        newAssets = {
          ...assets,
          crypto: updatedCrypto
        };
      }
      
      setAssets(newAssets);
      setLastManualUpdate({
        timestamp: Date.now(),
        assets: newAssets,
        operation: 'sell_crypto',
        symbol: crypto.symbol,
        amount: amountToSell
      });

      // Add transaction (SELL) - always use addDoc to Firestore
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
        valueIDR,
        valueUSD,
        timestamp: now.toISOString(),
        date: formattedDate,
        currency: 'USD',
        userId: user ? user.uid : null,
        status: 'completed'
      };

      // Save to Firestore if user is logged in
      if (user) {
        await addDoc(collection(db, 'users', user.uid, 'transactions'), transaction);
      }

      // Remove success notification - just close the modal silently
      setConfirmModal(null);

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

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-white transition-colors">
        <Head>
          <title>PortSyncro | Effortless Portfolio Sync for Crypto and Stocks</title>
          <meta name="description" content="Effortless Portfolio Sync for Crypto and Stocks" />
          <link rel="icon" href="/favicon.ico" />

        </Head>
        
        <main className="container mx-auto px-4 py-4 sm:py-8 font-['Inter']">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 sm:mb-8 gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-600">
                PortSyncro
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">Effortless Portfolio Sync for Crypto and Stocks</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto">
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-full sm:w-auto">
                <button 
                  onClick={() => setActiveTab('portfolio')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-lg ${
                    activeTab === 'portfolio' 
                      ? 'bg-indigo-600 text-white' 
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  Portfolio
                </button>
                <button 
                  onClick={() => setActiveTab('add')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-lg ${
                    activeTab === 'add' 
                      ? 'bg-indigo-600 text-white' 
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  Add Asset
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-lg ${
                    activeTab === 'history'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  History
                </button>
              </div>
              
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <ThemeToggle />
                
                <div className="flex items-center flex-1 sm:flex-none px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-sm">
                  <FiUser className="text-gray-500 dark:text-gray-400 mr-2 flex-shrink-0" />
                  <span className="truncate max-w-[120px] sm:max-w-[150px] text-gray-700 dark:text-gray-300">{user?.email}</span>
                </div>
                
                <button 
                  onClick={logout}
                  className="bg-gray-100 dark:bg-gray-800 p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0"
                  title="Logout"
                >
                  <FiLogOut />
                </button>
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                <p>Loading portfolio...</p>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'add' ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <StockInput onAdd={addStock} onComplete={() => setActiveTab('portfolio')} />
                  <CryptoInput onAdd={addCrypto} onComplete={() => setActiveTab('portfolio')} />
                </div>
              ) : activeTab === 'portfolio' ? (
                <Portfolio 
                  assets={assets} 
                  onUpdateStock={updateStock}
                  onUpdateCrypto={updateCrypto}
                  onAddAsset={() => setActiveTab('add')}
                  onSellStock={handleSellStock}
                  onSellCrypto={handleSellCrypto}
                  prices={prices}
                  exchangeRate={exchangeRate}
                  sellingLoading={sellingLoading}
                />
              ) : activeTab === 'history' ? (
                <TransactionHistory 
                  transactions={transactions}
                  user={user}
                  onTransactionsUpdate={setTransactions}
                  exchangeRate={exchangeRate}
                />
              ) : null}
            </>
          )}
        </main>
        
        <footer className="container mx-auto px-4 py-6 text-center text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800">
          <p>© {new Date().getFullYear()} PortSyncro - Effortless Portfolio Sync for Crypto and Stocks</p>
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
      </div>
    </ErrorBoundary>
  );
}