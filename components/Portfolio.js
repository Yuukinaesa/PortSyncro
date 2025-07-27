import { useState, useEffect } from 'react';
import AssetTable from './AssetTable';
import Notification from './Notification';
import { FiRefreshCw, FiPlusCircle, FiTrendingUp, FiDollarSign, FiActivity, FiAlertCircle, FiInfo } from 'react-icons/fi';
import { fetchExchangeRate } from '../lib/fetchPrices';
import { formatNumber, formatIDR, formatUSD } from '../lib/utils';

export default function Portfolio({ 
  assets, 
  onUpdateStock, 
  onUpdateCrypto, 
  onAddAsset,
  onSellStock,
  onSellCrypto,
  onRefreshPrices,
  onRefreshExchangeRate,
  exchangeRate: propExchangeRate,
  lastExchangeRateUpdate: propLastExchangeRateUpdate,
  exchangeRateSource: propExchangeRateSource,
  exchangeRateError: propExchangeRateError,
  loadingExchangeRate: propLoadingExchangeRate,
  prices: propPrices,
  exchangeRate: parentExchangeRate,
  sellingLoading = false
}) {
  const [prices, setPrices] = useState(propPrices || {});
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');
  const [error, setError] = useState(null);
  const [loadingExchangeRate, setLoadingExchangeRate] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(parentExchangeRate || propExchangeRate);
  const [exchangeRateError, setExchangeRateError] = useState(propExchangeRateError || null);
  const [exchangeRateSource, setExchangeRateSource] = useState(propExchangeRateSource || '');
  const [lastExchangeRateUpdate, setLastExchangeRateUpdate] = useState(propLastExchangeRateUpdate || '');
  const [activeAssetTab, setActiveAssetTab] = useState('all');
  const [confirmModal, setConfirmModal] = useState(null);
  const [notification, setNotification] = useState(null);
  
  const fetchRate = async () => {
    setLoadingExchangeRate(true);
    setExchangeRateError(null);
    try {
      const rateData = await fetchExchangeRate();
      setExchangeRate(rateData.rate);
      setLastExchangeRateUpdate(new Date().toLocaleString());
      setExchangeRateSource('Exchange Rates API');
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      setExchangeRateError(error.message);
    } finally {
      setLoadingExchangeRate(false);
    }
  };

  const fetchPrices = async () => {
    const stockTickers = assets.stocks.map(stock => `${stock.ticker}.JK`);
    const cryptoSymbols = assets.crypto.map(crypto => crypto.symbol);
    
    if (stockTickers.length === 0 && cryptoSymbols.length === 0) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stocks: stockTickers,
          crypto: cryptoSymbols,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      setPrices(data.prices);
      setLastUpdate(new Date().toLocaleString());
      
      // Show success notification for manual refresh
      if (loading) {
        setNotification({
          isOpen: true,
          title: 'Berhasil',
          message: 'Data harga berhasil diperbarui!',
          type: 'success'
        });
        
        setTimeout(() => {
          setNotification(null);
        }, 2000);
      }
    } catch (error) {
      console.error('Error fetching prices:', error);
      setError(`Gagal memperbarui data harga: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update the useEffect for exchange rate
  useEffect(() => {
    if (!parentExchangeRate) {
      fetchRate();
    }
  }, [parentExchangeRate]);

  // Immediate refresh when component mounts
  useEffect(() => {
    if (assets.stocks.length > 0 || assets.crypto.length > 0) {
      handleRefresh();
    }
  }, [assets.stocks.length, assets.crypto.length]);

  // Update prices and exchangeRate when props change
  useEffect(() => {
    if (propPrices) {
      setPrices(propPrices);
    }
  }, [propPrices]);

  useEffect(() => {
    if (parentExchangeRate) {
      setExchangeRate(parentExchangeRate);
    }
  }, [parentExchangeRate]);

  // Separate useEffect for prices
  useEffect(() => {
    if (!propPrices) {
      fetchPrices();
    } else {
      setLoading(false);
    }
  }, [assets, propPrices]);

  const handleRefresh = () => {
    fetchPrices();
    fetchRate();
  };
  
  // Handle sell functionality
  const handleSellStock = (index, asset, amountToSell) => {
    const tickerKey = `${asset.ticker}.JK`;
    
    if (!prices || !prices[tickerKey]) {
      setConfirmModal({
        isOpen: true,
        title: 'Memperbarui Data Harga',
        message: 'Data harga sedang diperbarui. Silakan tunggu sebentar...',
        type: 'info',
        onConfirm: () => {
          setConfirmModal(null);
          if (onSellStock) {
            onSellStock(index, asset, amountToSell);
          }
        }
      });
      return;
    }
    
    if (onSellStock) {
      onSellStock(index, asset, amountToSell);
    }
  };

  const handleSellCrypto = (index, asset, amountToSell) => {
    if (!prices || !prices[asset.symbol]) {
      setConfirmModal({
        isOpen: true,
        title: 'Memperbarui Data Harga Kripto',
        message: 'Data harga kripto sedang diperbarui. Silakan tunggu sebentar...',
        type: 'info',
        onConfirm: () => {
          setConfirmModal(null);
          if (onSellCrypto) {
            onSellCrypto(index, asset, amountToSell);
          }
        }
      });
      return;
    }
    
    if (onSellCrypto) {
      onSellCrypto(index, asset, amountToSell);
    }
  };
  
  // Fixed calculation totals function
  const calculateTotals = () => {
    let totalStocksIDR = 0;
    let totalStocksUSD = 0;
    let totalCryptoUSD = 0;
    let totalCryptoIDR = 0;
    let totalStocksWithPrices = 0;
    let totalCryptoWithPrices = 0;
    let avgDayChange = 0;
    let totalAssetsWithChange = 0;
    let totalPreviousDayIDR = 0;
    let totalPreviousDayUSD = 0;
    let error = null;

    // Calculate stocks totals
    assets.stocks.forEach(stock => {
      const tickerKey = `${stock.ticker}.JK`;
      if (prices[tickerKey]) {
        const price = prices[tickerKey];
        const shareCount = stock.lots * 100; // 1 lot = 100 shares for IDX stocks
        
        if (price.currency === 'IDR') {
          const stockValue = price.price * shareCount;
          totalStocksIDR += stockValue;
          
          // Convert to USD for total USD calculation
          if (exchangeRate && exchangeRate > 0) {
            totalStocksUSD += stockValue / exchangeRate;
          }
        }
        
        // Calculate daily change and previous day value
        if (price.change !== undefined && !isNaN(price.change)) {
          avgDayChange += price.change;
          totalAssetsWithChange++;
          
          // Calculate previous day value
          const previousPrice = price.price / (1 + price.change / 100);
          const previousValueIDR = previousPrice * shareCount;
          const previousValueUSD = exchangeRate && exchangeRate > 0 ? previousValueIDR / exchangeRate : 0;
          
          totalPreviousDayIDR += previousValueIDR;
          totalPreviousDayUSD += previousValueUSD;
        }
        totalStocksWithPrices++;
      }
    });

    // Calculate crypto totals
    assets.crypto.forEach(crypto => {
      if (prices[crypto.symbol]) {
        const price = prices[crypto.symbol];
        const cryptoValueUSD = price.price * crypto.amount;
        totalCryptoUSD += cryptoValueUSD;
        
        // Convert USD to IDR using exchange rate
        if (exchangeRate && exchangeRate > 0) {
          totalCryptoIDR += cryptoValueUSD * exchangeRate;
        } else {
          error = 'Kurs tidak tersedia untuk konversi ke IDR';
        }
        
        // Calculate daily change and previous day value for crypto
        if (price.change !== undefined && !isNaN(price.change)) {
          avgDayChange += price.change;
          totalAssetsWithChange++;
          
          const previousPrice = price.price / (1 + price.change / 100);
          const previousValueUSD = previousPrice * crypto.amount;
          const previousValueIDR = exchangeRate && exchangeRate > 0 ? previousValueUSD * exchangeRate : 0;
          
          totalPreviousDayIDR += previousValueIDR;
          totalPreviousDayUSD += previousValueUSD;
        }
        totalCryptoWithPrices++;
      }
    });

    const totalIDR = totalStocksIDR + totalCryptoIDR;
    const totalUSD = totalStocksUSD + totalCryptoUSD;
    
    // Calculate average daily change
    avgDayChange = totalAssetsWithChange > 0 ? avgDayChange / totalAssetsWithChange : 0;
    
    // Calculate percentages
    const stocksPercent = totalIDR > 0 ? (totalStocksIDR / totalIDR) * 100 : 0;
    const cryptoPercent = totalIDR > 0 ? (totalCryptoIDR / totalIDR) * 100 : 0;
    
    // Calculate absolute changes
    const changeIDR = totalIDR - totalPreviousDayIDR;
    const changeUSD = totalUSD - totalPreviousDayUSD;
    
    return {
      totalIDR,
      totalUSD,
      totalPreviousDayIDR,
      totalPreviousDayUSD,
      changeIDR,
      changeUSD,
      totalStocksIDR,
      totalStocksUSD,
      totalCryptoIDR,
      totalCryptoUSD,
      stocksPercent,
      cryptoPercent,
      totalStocksWithPrices,
      totalCryptoWithPrices,
      totalStocks: assets.stocks.length,
      totalCrypto: assets.crypto.length,
      totalAssetsWithChange,
      avgDayChange,
      error
    };
  };

  const totals = calculateTotals();
  
  useEffect(() => {
    setExchangeRateError(totals.error);
  }, [totals.error]);

  // Fixed gain calculations
  const calculateGains = () => {
    let stocksGain = 0;
    let cryptoGainUSD = 0;
    let totalCostIDR = 0;
    let totalCostUSD = 0;

    // Calculate stocks gain
    assets.stocks.forEach(stock => {
      const tickerKey = `${stock.ticker}.JK`;
      const currentPrice = prices[tickerKey]?.price || 0;
      const shareCount = stock.lots * 100;
      const currentValue = currentPrice * shareCount;
      const costBasis = stock.avgPrice * shareCount;
      
      stocksGain += currentValue - costBasis;
      totalCostIDR += costBasis;
    });

    // Calculate crypto gain
    assets.crypto.forEach(crypto => {
      const currentPrice = prices[crypto.symbol]?.price || 0;
      const currentValue = currentPrice * crypto.amount;
      const costBasis = crypto.totalCost || 0;
      
      cryptoGainUSD += currentValue - costBasis;
      totalCostUSD += costBasis;
    });

    const cryptoGainIDR = exchangeRate ? cryptoGainUSD * exchangeRate : 0;
    const totalGain = stocksGain + cryptoGainIDR;
    const totalGainUSD = (stocksGain / (exchangeRate || 1)) + cryptoGainUSD;
    const totalCost = totalCostIDR + (exchangeRate ? totalCostUSD * exchangeRate : totalCostUSD);
    const gainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    return {
      stocksGain,
      cryptoGainUSD,
      cryptoGainIDR,
      totalGain,
      totalGainUSD,
      totalCost,
      gainPercent
    };
  };

  const gains = calculateGains();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Exchange Rate Display - Mobile Optimized */}
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <FiDollarSign className="text-green-600 dark:text-green-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Kurs USD/IDR:</span>
            {loadingExchangeRate ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
              </div>
            ) : exchangeRateError ? (
              <span className="text-sm text-red-600 dark:text-red-400">Error: {exchangeRateError}</span>
            ) : exchangeRate ? (
              <span className="text-sm font-bold text-gray-800 dark:text-white">
                {formatIDR(exchangeRate)}
              </span>
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">Tidak tersedia</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {lastExchangeRateUpdate && (
              <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                Update: {new Date(lastExchangeRateUpdate).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchRate}
              disabled={loadingExchangeRate}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              title="Refresh kurs"
            >
              <FiRefreshCw className={`w-4 h-4 ${loadingExchangeRate ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard Cards - Mobile Optimized */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Portfolio Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Portfolio</h3>
            <div className="bg-blue-100 dark:bg-blue-500/20 p-2 rounded-lg">
              <FiDollarSign className="text-blue-500 dark:text-blue-400 w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white mb-1 break-words">
            {formatIDR(totals.totalIDR)}
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
            {formatUSD(totals.totalUSD)}
          </p>
          {totals.totalAssetsWithChange > 0 && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Kemarin: {formatIDR(totals.totalPreviousDayIDR)} 
                  <span className={`ml-1 ${totals.changeIDR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    ({totals.changeIDR >= 0 ? '+' : ''}{formatIDR(totals.changeIDR)})
                  </span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Kemarin: {formatUSD(totals.totalPreviousDayUSD)} 
                  <span className={`ml-1 ${totals.changeUSD >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    ({totals.changeUSD >= 0 ? '+' : ''}{formatUSD(totals.changeUSD)})
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
        
        {/* Stocks Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Saham</h3>
            <div className="bg-green-100 dark:bg-green-500/20 p-2 rounded-lg">
              <FiTrendingUp className="text-green-500 dark:text-green-400 w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white mb-1">
            {formatIDR(totals.totalStocksIDR)}
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
            {formatUSD(totals.totalStocksUSD)}
          </p>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
            <div 
              className="bg-gradient-to-r from-green-400 to-blue-500 h-2 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${Math.min(totals.stocksPercent, 100)}%` }}
            ></div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {totals.stocksPercent.toFixed(1)}% dari portfolio
          </p>
        </div>

        {/* Crypto Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Kripto</h3>
            <div className="bg-purple-100 dark:bg-purple-500/20 p-2 rounded-lg">
              <FiActivity className="text-purple-500 dark:text-purple-400 w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white mb-1">
            {formatIDR(totals.totalCryptoIDR)}
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
            {formatUSD(totals.totalCryptoUSD)}
          </p>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
            <div 
              className="bg-gradient-to-r from-purple-400 to-pink-500 h-2 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${Math.min(totals.cryptoPercent, 100)}%` }}
            ></div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {totals.cryptoPercent.toFixed(1)}% dari portfolio
          </p>
        </div>
        
        {/* Total Gain Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Gain</h3>
            <div className="bg-yellow-100 dark:bg-yellow-500/20 p-2 rounded-lg">
              <FiTrendingUp className="text-yellow-500 dark:text-yellow-400 w-4 h-4" />
            </div>
          </div>
          <p className={`text-xl sm:text-2xl font-bold mb-1 ${gains.totalGain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatIDR(gains.totalGain)}
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
            {gains.totalGainUSD >= 0 ? '+' : ''}{formatUSD(gains.totalGainUSD)}
          </p>
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Saham: {formatIDR(gains.stocksGain)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Kripto: {formatIDR(gains.cryptoGainIDR)}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Asset List Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header - Mobile Optimized */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-white">Daftar Aset</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {assets.stocks.length + assets.crypto.length} aset dalam portfolio Anda
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {/* Tab Buttons - Mobile Optimized */}
              <div className="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-1 w-full sm:w-auto">
                <button
                  onClick={() => setActiveAssetTab('all')}
                  className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeAssetTab === 'all' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setActiveAssetTab('stocks')}
                  className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeAssetTab === 'stocks' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  Saham
                </button>
                <button
                  onClick={() => setActiveAssetTab('crypto')}
                  className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeAssetTab === 'crypto' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  Kripto
                </button>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="flex-1 sm:flex-none p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300 transition flex items-center justify-center gap-2"
                  title="Refresh data"
                >
                  <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="sm:hidden">Refresh</span>
                </button>
                
                <button
                  onClick={onAddAsset}
                  className="flex-1 sm:flex-none p-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white transition flex items-center justify-center gap-2"
                  title="Tambah aset"
                >
                  <FiPlusCircle className="w-4 h-4" />
                  <span className="sm:hidden">Tambah</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="mx-4 sm:mx-6 mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-200 px-3 py-2 rounded-lg text-sm flex items-start">
            <FiAlertCircle className="mt-0.5 mr-2 flex-shrink-0" />
            <div>
              <p className="font-medium">Gagal memperbarui data</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
        )}
        
        {/* Loading State */}
        {loading && assets.stocks.length + assets.crypto.length > 0 ? (
          <div className="flex justify-center items-center py-8">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Memperbarui data harga...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Info Panel */}
            {!loading && Object.keys(prices).length < (assets.stocks.length + assets.crypto.length) && (
              <div className="mx-4 sm:mx-6 mt-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-200 px-3 py-2 rounded-lg text-sm flex items-start">
                <FiInfo className="mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <p className="font-medium">Data harga sedang diperbarui</p>
                  <p className="text-xs mt-1">Beberapa data harga mungkin belum tersedia. Klik tombol refresh untuk memperbarui data real-time.</p>
                </div>
              </div>
            )}
            
            {/* Stocks Section */}
            {(activeAssetTab === 'all' || activeAssetTab === 'stocks') && (
              <div className={`${activeAssetTab === 'all' ? 'border-b border-gray-200 dark:border-gray-700' : ''}`}>
                {assets.stocks.length > 0 ? (
                  <AssetTable 
                    assets={assets.stocks} 
                    prices={prices} 
                    exchangeRate={exchangeRate}
                    type="stock"
                    onUpdate={onUpdateStock}
                    onSell={handleSellStock}
                    loading={loading || sellingLoading}
                  />
                ) : activeAssetTab === 'stocks' ? (
                  <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                    <p>Belum ada saham yang ditambahkan</p>
                    <button 
                      onClick={onAddAsset}
                      className="mt-2 inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <FiPlusCircle className="mr-1" /> Tambah Aset
                    </button>
                  </div>
                ) : null}
              </div>
            )}
            
            {/* Crypto Section */}
            {(activeAssetTab === 'all' || activeAssetTab === 'crypto') && (
              <div>
                {assets.crypto.length > 0 ? (
                  <AssetTable 
                    assets={assets.crypto} 
                    prices={prices} 
                    exchangeRate={exchangeRate}
                    type="crypto"
                    onUpdate={onUpdateCrypto}
                    onSell={handleSellCrypto}
                    loading={loading || sellingLoading}
                  />
                ) : activeAssetTab === 'crypto' ? (
                  <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                    <p>Belum ada kripto yang ditambahkan</p>
                    <button 
                      onClick={onAddAsset}
                      className="mt-2 inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <FiPlusCircle className="mr-1" /> Tambah Aset
                    </button>
                  </div>
                ) : null}
              </div>
            )}
            
            {/* Empty State */}
            {assets.stocks.length === 0 && assets.crypto.length === 0 && (
              <div className="py-12 sm:py-16 text-center px-4">
                <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 mb-4 sm:mb-6">
                  <FiDollarSign className="text-2xl sm:text-3xl text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-white mb-2 sm:mb-3">Portfolio Kosong</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
                  Mulai membangun portfolio Anda dengan menambahkan aset saham atau kripto untuk melacak investasi Anda
                </p>
                <button 
                  onClick={onAddAsset}
                  className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-lg text-white font-medium transition-all duration-200 inline-flex items-center shadow-lg hover:shadow-xl transform hover:scale-105 text-sm sm:text-base"
                >
                  <FiPlusCircle className="mr-2" /> Tambah Aset Pertama
                </button>
              </div>
            )}
          </>
        )}
        
        {/* Footer */}
        {lastUpdate && assets.stocks.length + assets.crypto.length > 0 && (
          <div className="px-4 sm:px-6 py-3 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 text-xs flex flex-col sm:flex-row sm:justify-between gap-2">
            <span>Terakhir diperbarui: {lastUpdate}</span>
            {!loading && (
              <button 
                onClick={handleRefresh}
                className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 self-start sm:self-auto"
              >
                Refresh sekarang
              </button>
            )}
          </div>
        )}
        
        {/* Notification */}
        <Notification 
          notification={notification} 
          onClose={() => setNotification(null)} 
        />
      </div>
    </div>
  );
}