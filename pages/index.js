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
import { calculatePortfolioValue, validateTransaction, isPriceDataAvailable, getRealPriceData } from '../lib/utils';
import ErrorBoundary from '../components/ErrorBoundary';
import TransactionHistory from '../components/TransactionHistory';
import { fetchExchangeRate } from '../lib/fetchPrices';

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
  const [exchangeRate, setExchangeRate] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);

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

  // Fetch exchange rate on component mount
  useEffect(() => {
    const updateExchangeRate = async () => {
      try {
        const rate = await fetchExchangeRate();
        if (rate) {
          setExchangeRate(rate);
        } else {
          throw new Error('Invalid exchange rate data received');
        }
      } catch (error) {
        console.error('Error fetching exchange rate:', error);
        setExchangeRate(null);
      }
    };

    updateExchangeRate();
    const interval = setInterval(updateExchangeRate, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  // Debounce price fetching
  const debouncedFetchPrices = useCallback(
    debounce(async () => {
      const stockTickers = assets.stocks.map(stock => {
        // Use the same ticker format as other components
        if (stock.currency === 'USD') {
          return `${stock.ticker}.US`;
        } else if (stock.currency === 'IDR') {
          return `${stock.ticker}.JK`;
        } else {
          // Auto-detect: if ticker is 4 characters or less, assume IDX, otherwise US
          return stock.ticker.length <= 4 ? `${stock.ticker}.JK` : `${stock.ticker}.US`;
        }
      });
      const cryptoSymbols = assets.crypto.map(crypto => crypto.symbol);
      
      if (stockTickers.length === 0 && cryptoSymbols.length === 0) {
        return;
      }
      
      try {
        const response = await fetch('/api/prices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            stocks: stockTickers,
            crypto: cryptoSymbols,
            exchangeRate: exchangeRate
          }),
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        setPrices(data.prices);
      } catch (error) {
        console.error('Error fetching prices:', error);
      }
    }, 1000),
    [assets, exchangeRate]
  );

  // Fetch prices for assets
  useEffect(() => {
    if (assets.stocks.length > 0 || assets.crypto.length > 0) {
      debouncedFetchPrices();
      const interval = setInterval(debouncedFetchPrices, 300000);
      return () => clearInterval(interval);
    }
  }, [assets, exchangeRate, debouncedFetchPrices]);

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
      // For IDX stocks: 1 lot = 100 shares, for US stocks: fractional shares allowed
      const totalShares = stock.currency === 'IDR' ? stock.lots * 100 : stock.lots;
      let valueIDR, valueUSD;
      if (stock.currency === 'IDR') {
        valueIDR = stock.price * totalShares;
        valueUSD = exchangeRate ? valueIDR / exchangeRate : 0;
      } else {
        valueUSD = stock.price * totalShares;
        valueIDR = exchangeRate ? valueUSD * exchangeRate : 0;
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
        userId: user.uid
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
        userId: user.uid
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
            ticker: normalizedNewTicker
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
      const totalValueIDR = totalValueUSD * exchangeRate;
      
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
        userId: user.uid
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
        userId: user.uid
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
            symbol: normalizedNewSymbol
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
      updatedStocks[index] = updatedStock;
      return {
        ...prev,
        stocks: updatedStocks
      };
    });
  };
  
  const updateCrypto = (index, updatedCrypto) => {
    setAssets(prev => {
      const updatedCryptos = [...prev.crypto];
      updatedCryptos[index] = updatedCrypto;
      return {
        ...prev,
        crypto: updatedCryptos
      };
    });
  };
  
  const deleteStock = async (index) => {
    try {
      const stockToDelete = assets.stocks[index];
      
      // Update local state first
      setAssets(prev => ({
        ...prev,
        stocks: prev.stocks.filter((_, i) => i !== index)
      }));

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
          valueUSD = exchangeRate ? valueIDR / exchangeRate : 0;
        } else {
          valueUSD = price * totalShares;
          valueIDR = exchangeRate ? valueUSD * exchangeRate : 0;
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
    }
  };
  
  const deleteCrypto = async (index) => {
    try {
      const cryptoToDelete = assets.crypto[index];
      
      // Update local state first
      setAssets(prev => ({
        ...prev,
        crypto: prev.crypto.filter((_, i) => i !== index)
      }));

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
        const valueIDR = exchangeRate ? valueUSD * exchangeRate : 0;

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
    }
  };

  const handleSellStock = async (index, asset, amountToSell) => {
    try {
      // Get current price from prices state using correct ticker format
      let tickerKey;
      if (asset.currency === 'USD') {
        tickerKey = `${asset.ticker}.US`;
      } else if (asset.currency === 'IDR') {
        tickerKey = `${asset.ticker}.JK`;
      } else {
        // Auto-detect: if ticker is 4 characters or less, assume IDX, otherwise US
        tickerKey = asset.ticker.length <= 4 ? `${asset.ticker}.JK` : `${asset.ticker}.US`;
      }
      
      const priceData = prices[tickerKey];
      if (!priceData) {
        throw new Error('Price data not available');
      }

      const shareCount = priceData.currency === 'IDR' ? amountToSell * 100 : amountToSell;
      let valueIDR, valueUSD;

      if (priceData.currency === 'IDR') {
        valueIDR = priceData.price * shareCount;
        valueUSD = exchangeRate ? valueIDR / exchangeRate : 0;
      } else {
        valueUSD = priceData.price * shareCount;
        valueIDR = exchangeRate ? valueUSD * exchangeRate : 0;
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
          valueUSD: exchangeRate ? (remainingAmount * 100 * priceData.price) / exchangeRate : 0
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

      setAssets(prev => ({
        ...prev,
        stocks: updatedStocks
      }));

      // Save to Firestore if user is logged in
      if (user) {
        await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
      }

    } catch (error) {
      console.error('Error selling stock:', error);
      alert('Failed to sell stock: ' + error.message);
    }
  };

  const handleSellCrypto = async (index, asset, amountToSell) => {
    try {
      const crypto = assets.crypto[index];
      if (!crypto) return;

      // Get current price
      const priceData = prices[crypto.symbol];
      if (!priceData) {
        throw new Error('Price data not available');
      }

      // Calculate values
      const valueUSD = priceData.price * amountToSell;
      const valueIDR = exchangeRate ? valueUSD * exchangeRate : 0;

      // Update asset
      const updatedAmount = crypto.amount - amountToSell;
      if (updatedAmount <= 0) {
        // Remove crypto if selling all
        const updatedCrypto = [...assets.crypto];
        updatedCrypto.splice(index, 1);
        setAssets(prev => ({
          ...prev,
          crypto: updatedCrypto
        }));
      } else {
        // Update remaining amount
        const updatedCrypto = [...assets.crypto];
        updatedCrypto[index] = {
          ...crypto,
          amount: updatedAmount,
          valueUSD: updatedAmount * priceData.price,
          valueIDR: exchangeRate ? updatedAmount * priceData.price * exchangeRate : 0
        };
        setAssets(prev => ({
          ...prev,
          crypto: updatedCrypto
        }));
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

    } catch (error) {
      console.error('Error selling crypto:', error);
      alert(error.message);
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-white transition-colors">
        <Head>
          <title>VestTrack | Sync to Stay Ahead – Crypto & Stocks Together</title>
          <meta name="description" content="Sync to Stay Ahead – Crypto & Stocks Together" />
          <link rel="icon" href="/favicon.ico" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        </Head>
        
        <main className="container mx-auto px-4 py-8 font-['Inter']">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-600">
                VestTrack
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">Sync to Stay Ahead – Crypto & Stocks Together</p>
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
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
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
          <p>© {new Date().getFullYear()} VestTrack - Sync to Stay Ahead – Crypto & Stocks Together</p>
        </footer>
      </div>
    </ErrorBoundary>
  );
}