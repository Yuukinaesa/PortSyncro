import { useState, useEffect, useCallback, useMemo } from 'react';
import AssetTable from './AssetTable';
import Notification from './Notification';
import { FiRefreshCw, FiPlusCircle, FiTrendingUp, FiDollarSign, FiActivity, FiAlertCircle, FiInfo, FiDownload } from 'react-icons/fi';
import { fetchExchangeRate } from '../lib/fetchPrices';
import { formatNumber, formatIDR, formatUSD, formatNumberUSD } from '../lib/utils';
import { useLanguage } from '../lib/languageContext';
import { useTheme } from '../lib/themeContext';

export default function Portfolio({ 
  assets, 
  onUpdateStock, 
  onUpdateCrypto, 
  onAddAsset,
  onSellStock,
  onSellCrypto,
  onDeleteStock,
  onDeleteCrypto,
  onRefreshPrices,
  onRefreshExchangeRate,
  exchangeRate: propExchangeRate,
  lastExchangeRateUpdate: propLastExchangeRateUpdate,
  exchangeRateSource: propExchangeRateSource,
  exchangeRateError: propExchangeRateError,
  loadingExchangeRate: propLoadingExchangeRate,
  prices: propPrices,
  exchangeRate: parentExchangeRate,
  sellingLoading = false,
  pricesLoading = false,
  isUpdatingPortfolio = false
}) {
  // Debug logging - simplified and memoized to prevent excessive logging
  const assetCount = useMemo(() => ({
    stocks: assets?.stocks?.length || 0,
    crypto: assets?.crypto?.length || 0
  }), [assets?.stocks?.length, assets?.crypto?.length]);
  
  // Only log when asset count actually changes
  useEffect(() => {
    if (assetCount.stocks > 0 || assetCount.crypto > 0) {
      console.log('Portfolio component received assets:', assetCount);
    }
  }, [assetCount]);
  
  const [prices, setPrices] = useState(propPrices || {});
  
  // Sync prices from parent component - with memoization
  const memoizedPrices = useMemo(() => propPrices, [propPrices]);
  useEffect(() => {
    if (memoizedPrices) {
      setPrices(memoizedPrices);
    }
  }, [memoizedPrices]);
  
  const [loading, setLoading] = useState(false);
  const isPriceLoading = pricesLoading || loading || isUpdatingPortfolio;
  
  // ADDED: Prevent excessive loading state
  const [lastLoadingTime, setLastLoadingTime] = useState(0);
  const [debouncedLoading, setDebouncedLoading] = useState(false);
  
  // Debounce loading state to prevent flickering (1 second)
  useEffect(() => {
    if (isPriceLoading) {
      setLastLoadingTime(Date.now());
      setDebouncedLoading(true);
    } else {
      const timeSinceLoading = Date.now() - lastLoadingTime;
      if (timeSinceLoading > 1000) { // Only hide loading after 1 second
        setDebouncedLoading(false);
      } else {
        const timer = setTimeout(() => setDebouncedLoading(false), 1000 - timeSinceLoading);
        return () => clearTimeout(timer);
      }
    }
  }, [isPriceLoading, lastLoadingTime]);
  const [lastUpdate, setLastUpdate] = useState('');
  const [error, setError] = useState(null);
  const [loadingExchangeRate, setLoadingExchangeRate] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(parentExchangeRate || propExchangeRate);
  
  // Update exchange rate when parent changes
  useEffect(() => {
    const newRate = parentExchangeRate || propExchangeRate;
    if (newRate !== exchangeRate) {
      setExchangeRate(newRate);
    }
  }, [parentExchangeRate, propExchangeRate, exchangeRate]);
  const [exchangeRateError, setExchangeRateError] = useState(propExchangeRateError || null);
  const [exchangeRateSource, setExchangeRateSource] = useState(propExchangeRateSource || '');
  const [lastExchangeRateUpdate, setLastExchangeRateUpdate] = useState(propLastExchangeRateUpdate || '');
  
  // Update exchange rate related states when parent changes
  useEffect(() => {
    if (propExchangeRateError !== exchangeRateError) {
      setExchangeRateError(propExchangeRateError);
    }
    if (propExchangeRateSource !== exchangeRateSource) {
      setExchangeRateSource(propExchangeRateSource);
    }
    if (propLastExchangeRateUpdate !== lastExchangeRateUpdate) {
      setLastExchangeRateUpdate(propLastExchangeRateUpdate);
    }
  }, [propExchangeRateError, propExchangeRateSource, propLastExchangeRateUpdate, exchangeRateError, exchangeRateSource, lastExchangeRateUpdate]);
  const [activeAssetTab, setActiveAssetTab] = useState('all');
  const [confirmModal, setConfirmModal] = useState(null);
  const [notification, setNotification] = useState(null);
  const { t, language } = useLanguage();
  const { isDarkMode } = useTheme();

  const fetchRate = useCallback(async () => {
    try {
      setLoadingExchangeRate(true);
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      const idrRate = data.rates.IDR;
      setExchangeRate(idrRate);
      setLastExchangeRateUpdate(new Date().toISOString());
      setExchangeRateSource('exchangerate-api.com');
      setExchangeRateError(null);
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      setExchangeRateError('Failed to fetch exchange rate');
    } finally {
      setLoadingExchangeRate(false);
    }
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      // This will be handled by the parent component
      if (onRefreshPrices) {
        await onRefreshPrices();
      }
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
  }, [onRefreshPrices]);

  const handleRefresh = useCallback(async () => {
    try {
      // Refresh both prices and exchange rate
      if (onRefreshPrices) {
        await onRefreshPrices(true); // Pass immediate=true for manual refresh
      } else {
        await fetchPrices();
      }
      
      // Also refresh exchange rate on manual refresh
      if (onRefreshExchangeRate) {
        await onRefreshExchangeRate();
      } else {
        await fetchRate();
      }
    } catch (error) {
      console.error('Error during refresh:', error);
    }
  }, [onRefreshPrices, onRefreshExchangeRate, fetchPrices, fetchRate]);

  // Auto-refresh prices if missing data detected - DISABLED to prevent excessive refreshes
  // useEffect(() => {
  //   const hasAssets = assets?.stocks?.length + assets?.crypto?.length > 0;
  //   const hasPrices = Object.keys(prices).length > 0;
  //   const missingPrices = hasAssets && hasPrices && Object.keys(prices).length < (assets?.stocks?.length + assets?.crypto?.length);

  //   if (missingPrices && !debouncedLoading) {
  //     console.log('Auto-refreshing due to missing prices');
  //     const autoRefreshTimer = setTimeout(() => {
  //       // Call parent refresh functions directly to avoid dependency issues
  //       if (onRefreshPrices) {
  //         onRefreshPrices(true); // Pass immediate=true for auto-refresh
  //       }
  //     }, 3000); // Auto-refresh after 3 seconds

  //     return () => clearTimeout(autoRefreshTimer);
  //   }
  // }, [prices, assets?.stocks?.length, assets?.crypto?.length, debouncedLoading, onRefreshPrices]);
  
  // Handle sell functionality
  const handleSellStock = (index, asset, amountToSell) => {
    const tickerKey = `${asset.ticker}.JK`;
    
    if (!prices || !prices[tickerKey]) {
      setConfirmModal({
        isOpen: true,
        title: t('updatingPriceData'),
        message: t('priceUpdateInfo'),
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
        title: t('updatingCryptoPriceData'),
        message: t('cryptoPriceUpdateInfo'),
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
  
  // Fixed calculation totals function - use porto values from assets
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

    // Calculate stocks totals using porto values
    (assets?.stocks || []).forEach(stock => {
      // Use porto values if available, otherwise calculate from prices
      if (stock.portoIDR && stock.portoIDR > 0) {
        totalStocksIDR += stock.portoIDR;
        totalStocksUSD += stock.portoUSD || 0;
        totalStocksWithPrices++;
      } else {
        // Fallback to price calculation
        const tickerKey = `${stock.ticker}.JK`;
        if (prices[tickerKey]) {
          const price = prices[tickerKey];
          const shareCount = stock.lots * 100; // 1 lot = 100 shares for IDX stocks
          
          if (price.currency === 'IDR') {
            const stockValue = price.price * shareCount;
            totalStocksIDR += stockValue;
            
            // Convert to USD for total USD calculation
            if (exchangeRate && exchangeRate > 0) {
              totalStocksUSD += Math.round((stockValue / exchangeRate) * 100) / 100;
            }
          }
          
          // Calculate daily change and previous day value
          if (price.change !== undefined && !isNaN(price.change)) {
            avgDayChange += price.change;
            totalAssetsWithChange++;
            
            // Calculate previous day value
            const previousPrice = price.price / (1 + price.change / 100);
            const previousValueIDR = previousPrice * shareCount;
            const previousValueUSD = exchangeRate && exchangeRate > 0 ? Math.round((previousValueIDR / exchangeRate) * 100) / 100 : 0;
            
            totalPreviousDayIDR += previousValueIDR;
            totalPreviousDayUSD += previousValueUSD;
          }
          totalStocksWithPrices++;
        }
      }
    });

    // Calculate crypto totals using porto values
    (assets?.crypto || []).forEach(crypto => {
      // Use porto values if available, otherwise calculate from prices
      if (crypto.portoUSD && crypto.portoUSD > 0) {
        totalCryptoUSD += crypto.portoUSD;
        totalCryptoIDR += crypto.portoIDR || 0;
        totalCryptoWithPrices++;
      } else {
        // Fallback to price calculation
        if (prices[crypto.symbol]) {
          const price = prices[crypto.symbol];
          const cryptoValueUSD = price.price * crypto.amount;
          totalCryptoUSD += cryptoValueUSD;
          
          // Convert USD to IDR using exchange rate
          if (exchangeRate && exchangeRate > 0) {
            totalCryptoIDR += Math.round(cryptoValueUSD * exchangeRate);
          } else {
            error = t('exchangeRateUnavailable');
          }
          
          // Calculate daily change and previous day value for crypto
          if (price.change !== undefined && !isNaN(price.change)) {
            avgDayChange += price.change;
            totalAssetsWithChange++;
            
            const previousPrice = price.price / (1 + price.change / 100);
            const previousValueUSD = previousPrice * crypto.amount;
            const previousValueIDR = exchangeRate && exchangeRate > 0 ? Math.round(previousValueUSD * exchangeRate) : 0;
            
            totalPreviousDayIDR += previousValueIDR;
            totalPreviousDayUSD += previousValueUSD;
          }
          totalCryptoWithPrices++;
        }
      }
    });

    const totalIDR = Math.round(totalStocksIDR + totalCryptoIDR);
    const totalUSD = Math.round((totalStocksUSD + totalCryptoUSD) * 100) / 100;
    
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
      totalStocks: assets?.stocks?.length || 0,
      totalCrypto: assets?.crypto?.length || 0,
      totalAssetsWithChange,
      avgDayChange,
      error
    };
  };

  const totals = calculateTotals();
  
  useEffect(() => {
    setExchangeRateError(totals.error);
  }, [totals.error]);

  // Fixed gain calculations - use gain values from assets with proper currency conversion
  const calculateGains = () => {
    let stocksGainIDR = 0;
    let stocksGainUSD = 0;
    let cryptoGainUSD = 0;
    let cryptoGainIDR = 0;
    let totalCostIDR = 0;
    let totalCostUSD = 0;

    // Calculate stocks gain using gain values from assets
    (assets?.stocks || []).forEach(stock => {
      if (stock.gainIDR !== undefined) {
        stocksGainIDR += stock.gainIDR;
        stocksGainUSD += stock.gainUSD || 0;
        totalCostIDR += stock.totalCost || (stock.avgPrice * stock.lots * 100);
      } else {
        // Fallback calculation
        const tickerKey = `${stock.ticker}.JK`;
        const currentPrice = prices[tickerKey]?.price || stock.currentPrice || 0;
        const shareCount = stock.lots * 100; // 1 lot = 100 shares for IDX
        const currentValue = currentPrice * shareCount;
        const costBasis = stock.avgPrice * shareCount;
        
        const stockGainIDR = currentValue - costBasis;
        const stockGainUSD = exchangeRate && exchangeRate > 0 ? Math.round((stockGainIDR / exchangeRate) * 100) / 100 : 0;
        
        stocksGainIDR += stockGainIDR;
        stocksGainUSD += stockGainUSD;
        totalCostIDR += costBasis;
      }
    });

    // Calculate crypto gain using gain values from assets
    (assets?.crypto || []).forEach(crypto => {
      if (crypto.gainUSD !== undefined) {
        cryptoGainUSD += crypto.gainUSD;
        cryptoGainIDR += crypto.gainIDR || 0;
        totalCostUSD += crypto.totalCost || (crypto.avgPrice * crypto.amount);
      } else {
        // Fallback calculation
        const currentPrice = prices[crypto.symbol]?.price || crypto.currentPrice || 0;
        const currentValue = currentPrice * crypto.amount;
        const costBasis = crypto.avgPrice * crypto.amount;
        
        const cryptoGainUSD = currentValue - costBasis;
        const cryptoGainIDR = exchangeRate && exchangeRate > 0 ? Math.round(cryptoGainUSD * exchangeRate) : 0;
        
        cryptoGainUSD += cryptoGainUSD;
        cryptoGainIDR += cryptoGainIDR;
        totalCostUSD += costBasis;
      }
    });

    const totalGainIDR = Math.round(stocksGainIDR + cryptoGainIDR);
    const totalGainUSD = Math.round((stocksGainUSD + cryptoGainUSD) * 100) / 100;
    const totalCost = totalCostIDR + (exchangeRate && exchangeRate > 0 ? totalCostUSD * exchangeRate : totalCostUSD);
    const gainPercent = totalCost > 0 ? (totalGainIDR / totalCost) * 100 : 0;

    // Calculate individual percentages
    const stocksGainPercent = totalCostIDR > 0 ? (stocksGainIDR / totalCostIDR) * 100 : 0;
    const cryptoGainPercent = totalCostUSD > 0 ? (cryptoGainUSD / totalCostUSD) * 100 : 0;

    return {
      stocksGainIDR,
      stocksGainUSD,
      cryptoGainUSD,
      cryptoGainIDR,
      totalGainIDR,
      totalGainUSD,
      totalCost,
      gainPercent,
      stocksGainPercent,
      cryptoGainPercent
    };
  };

  const gains = calculateGains();

  // Export portfolio to CSV
    // Format number for CSV export (without currency symbol) - same as TransactionHistory
  const formatNumberForCSV = (value, currency) => {
    if (!value || isNaN(value)) return currency === 'USD' ? '0.00' : '0';
    
    // Convert to number and round to avoid floating point precision issues
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    if (currency === 'IDR') {
      // For IDR, format with dot as thousands separator
      const rounded = Math.round(num);
      return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    } else {
      // For USD, format with comma as thousands separator and 2 decimal places
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
  };

  const exportPortfolioToCSV = () => {
    const allAssets = [
      ...(assets?.stocks || []).map(asset => ({ ...asset, type: 'stock' })),
      ...(assets?.crypto || []).map(asset => ({ ...asset, type: 'crypto' }))
    ];

    if (allAssets.length === 0) {
      setConfirmModal({
        isOpen: true,
        title: 'Peringatan',
        message: 'Tidak ada aset untuk diekspor',
        type: 'warning',
        onConfirm: () => setConfirmModal(null)
      });
      return;
    }

    try {
      const BOM = '\uFEFF';
      
      // Language-aware headers with semicolon separation
      const headers = language === 'id' 
        ? ['Aset', 'Tipe', 'Jumlah', 'Harga Rata-rata', 'Harga Sekarang', 'Nilai IDR', 'Nilai USD', 'Gain/Loss IDR', 'Gain/Loss USD']
        : ['Asset', 'Type', 'Amount', 'Avg Price', 'Current Price', 'IDR Value', 'USD Value', 'Gain/Loss IDR', 'Gain/Loss USD'];
      
      let csvContent = BOM + headers.join(';') + '\n';
      
      // Add stocks
      (assets?.stocks || []).forEach(stock => {
        const tickerKey = `${stock.ticker}.JK`;
        const currentPrice = prices[tickerKey]?.price || stock.currentPrice || 0;
        const shareCount = stock.lots * 100;
        const currentValueIDR = currentPrice * shareCount;
        const currentValueUSD = exchangeRate && exchangeRate > 0 ? currentValueIDR / exchangeRate : 0;
        const costBasis = stock.avgPrice * shareCount;
        const gainIDR = currentValueIDR - costBasis;
        const gainUSD = exchangeRate && exchangeRate > 0 ? gainIDR / exchangeRate : 0;
        
        const row = [
          `"${stock.ticker}"`,
          `"${language === 'id' ? 'Saham' : 'Stock'}"`,
          `"${stock.lots}"`,
          formatNumberForCSV(stock.avgPrice, 'IDR'),
          formatNumberForCSV(currentPrice, 'IDR'),
          formatNumberForCSV(currentValueIDR, 'IDR'),
          formatNumberForCSV(currentValueUSD, 'USD'),
          formatNumberForCSV(gainIDR, 'IDR'),
          formatNumberForCSV(gainUSD, 'USD')
        ];
        csvContent += row.join(';') + '\n';
      });
      
      // Add crypto
      (assets?.crypto || []).forEach(crypto => {
        const currentPrice = prices[crypto.symbol]?.price || crypto.currentPrice || 0;
        const currentValueUSD = currentPrice * crypto.amount;
        const currentValueIDR = exchangeRate && exchangeRate > 0 ? currentValueUSD * exchangeRate : 0;
        const costBasis = crypto.totalCost || (crypto.avgPrice * crypto.amount);
        const gainUSD = currentValueUSD - costBasis;
        const gainIDR = exchangeRate && exchangeRate > 0 ? gainUSD * exchangeRate : 0;
        
        const row = [
          `"${crypto.symbol}"`,
          `"${language === 'id' ? 'Kripto' : 'Crypto'}"`,
          `"${crypto.amount}"`,
          formatNumberForCSV(crypto.avgPrice || 0, 'USD'),
          formatNumberForCSV(currentPrice, 'USD'),
          formatNumberForCSV(currentValueIDR, 'IDR'),
          formatNumberForCSV(currentValueUSD, 'USD'),
          formatNumberForCSV(gainIDR, 'IDR'),
          formatNumberForCSV(gainUSD, 'USD')
        ];
        csvContent += row.join(';') + '\n';
      });
      
      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      // Language-aware filename
      const currentDate = new Date().toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US');
      const filename = language === 'id' 
        ? `portfolio_${currentDate}.csv`
        : `portfolio_${currentDate}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
    } catch (error) {
      console.error('Error exporting portfolio:', error);
      setNotification({
        type: 'error',
        title: t('error'),
        message: t('portfolioExportFailed', { error: error.message }),
      });
    }
  };

  const getGainColor = (value) => {
    if (value >= 0) {
      return 'text-green-600 dark:text-green-400';
    } else {
      return 'text-red-600 dark:text-red-400';
    }
  };

  return (
    <div className="space-y-8">
      {/* Exchange Rate Display - Minimalist */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FiDollarSign className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('exchangeRate')}</span>
              {loadingExchangeRate ? (
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{t('loading')}</span>
                </div>
              ) : exchangeRateError ? (
                <span className="text-sm text-red-600 dark:text-red-400">{t('error')}: {exchangeRateError}</span>
              ) : exchangeRate ? (
                <span className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatIDR(exchangeRate)}
                </span>
              ) : (
                <span className="text-sm text-red-600 dark:text-red-400">Tidak tersedia</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {lastExchangeRateUpdate && (
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl">
                Update: {new Date(lastExchangeRateUpdate).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dashboard Cards - Minimalist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Portfolio Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
          <div className="flex justify-between items-center mb-3 sm:mb-4">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('totalPortfolio')}</h3>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FiDollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {formatIDR(totals.totalIDR)}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">{formatUSD(totals.totalUSD)}</div>
          {totals.totalAssetsWithChange > 0 && (
            <>
              <div className="border-t border-gray-100 dark:border-gray-800 pt-3 sm:pt-4">
                <div className="space-y-1 sm:space-y-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t('yesterday')}: {formatIDR(totals.totalPreviousDayIDR)} 
                    <span className={`ml-1 sm:ml-2 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${
                      totals.changeIDR >= 0 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>
                      ({totals.changeIDR >= 0 ? '+' : ''}{formatIDR(totals.changeIDR)})
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t('yesterday')}: {formatUSD(totals.totalPreviousDayUSD)} 
                    <span className={`ml-1 sm:ml-2 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${
                      totals.changeUSD >= 0 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>
                      ({totals.changeUSD >= 0 ? '+' : ''}{formatUSD(totals.changeUSD)})
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        
        {/* Stocks Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
          <div className="flex justify-between items-center mb-3 sm:mb-4">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('stocks')}</h3>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <FiTrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {formatIDR(totals.totalStocksIDR)}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">{formatUSD(totals.totalStocksUSD)}</div>
          
          {/* Stocks Gain/Loss */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 sm:pt-4 mb-3 sm:mb-4">
            <div className="space-y-1 sm:space-y-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('gainLoss')}: <span className={`font-medium ${getGainColor(gains.stocksGainIDR)}`}>
                  {formatIDR(gains.stocksGainIDR)} ({formatUSD(gains.stocksGainUSD)})
                </span>
              </div>
              {gains.stocksGainPercent !== 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <span className={`font-medium ${getGainColor(gains.stocksGainPercent)}`}>
                    {gains.stocksGainPercent >= 0 ? '+' : ''}{gains.stocksGainPercent.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2 sm:mb-3">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-500" 
              style={{ width: `${totals.stocksPercent}%` }}
            ></div>
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{totals.stocksPercent.toFixed(1)}% {t('fromPortfolio')}</div>
        </div>
        
        {/* Crypto Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
          <div className="flex justify-between items-center mb-3 sm:mb-4">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('crypto')}</h3>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <FiActivity className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {formatIDR(totals.totalCryptoIDR)}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">{formatUSD(totals.totalCryptoUSD)}</div>
          
          {/* Crypto Gain/Loss */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 sm:pt-4 mb-3 sm:mb-4">
            <div className="space-y-1 sm:space-y-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('gainLoss')}: <span className={`font-medium ${getGainColor(gains.cryptoGainUSD)}`}>
                  {formatIDR(gains.cryptoGainIDR)} ({formatUSD(gains.cryptoGainUSD)})
                </span>
              </div>
              {gains.cryptoGainPercent !== 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <span className={`font-medium ${getGainColor(gains.cryptoGainPercent)}`}>
                    {gains.cryptoGainPercent >= 0 ? '+' : ''}{gains.cryptoGainPercent.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2 sm:mb-3">
            <div 
              className="bg-purple-500 h-2 rounded-full transition-all duration-500" 
              style={{ width: `${totals.cryptoPercent}%` }}
            ></div>
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{totals.cryptoPercent.toFixed(1)}% {t('fromPortfolio')}</div>
        </div>
        
                  {/* Total Gain/Loss Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
          <div className="flex justify-between items-center mb-3 sm:mb-4">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('totalGainLoss')}</h3>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <FiTrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          
          {/* Main Gain/Loss Value */}
          <div className={`text-xl sm:text-2xl font-bold mb-2 ${getGainColor(gains.totalGainIDR)}`}>
            {formatIDR(gains.totalGainIDR)}
          </div>
          <div className={`text-xs sm:text-sm mb-3 sm:mb-4 ${getGainColor(gains.totalGainUSD)}`}>{formatUSD(gains.totalGainUSD)}</div>
          
          {/* Percentage and Progress Bar */}
          {gains.totalCost > 0 && (
            <div className="mb-3 sm:mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {gains.gainPercent >= 0 ? '+' : ''}{gains.gainPercent.toFixed(2)}%
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {t('ofTotalCost')}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-500 ${
                    gains.gainPercent >= 0 ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  style={{ 
                    width: `${Math.min(Math.abs(gains.gainPercent), 100)}%`,
                    maxWidth: '100%'
                  }}
                ></div>
              </div>
            </div>
          )}
          
          {/* Performance Indicator */}
          {gains.totalCost > 0 && (
            <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('performance')}</span>
                <div className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${
                  gains.gainPercent >= 0 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                }`}>
                  {gains.gainPercent >= 0 ? (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12 13a1 1 0 100 2h5a1 1 0 001-1v-5a1 1 0 10-2 0v2.586l-4.293-4.293a1 1 0 00-1.414 0L8 9.586l-4.293-4.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L11 9.414 14.586 13H12z" clipRule="evenodd" />
                    </svg>
                  )}
                  {gains.gainPercent >= 0 ? t('profitable') : t('loss')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar - Minimalist */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6">
        <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center">
          <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:space-x-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('portfolio')}</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveAssetTab('all')}
                className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
                  activeAssetTab === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {t('all')} ({assets?.stocks?.length + assets?.crypto?.length})
              </button>
              <button
                onClick={() => setActiveAssetTab('stocks')}
                className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
                  activeAssetTab === 'stocks'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {t('stocks')} ({assets?.stocks?.length})
              </button>
              <button
                onClick={() => setActiveAssetTab('crypto')}
                className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
                  activeAssetTab === 'crypto'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {t('crypto')} ({assets?.crypto?.length})
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={handleRefresh}
              disabled={loading || loadingExchangeRate}
              className="px-3 sm:px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl transition-all duration-200 flex items-center gap-2 text-sm disabled:opacity-50"
              title="Refresh semua data (harga saham, kripto, dan kurs USD/IDR)"
            >
              {(loading || loadingExchangeRate) ? (
                <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <FiRefreshCw className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Refresh Semua</span>
              <span className="sm:hidden">Refresh</span>
            </button>
            
            <button
              onClick={exportPortfolioToCSV}
              disabled={assets?.stocks?.length === 0 && assets?.crypto?.length === 0}
              className="px-3 sm:px-4 py-2 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-xl transition-all duration-200 flex items-center gap-2 text-sm disabled:opacity-50"
              title={t('exportPortfolio')}
            >
              <FiDownload className="w-4 h-4" />
              <span className="hidden sm:inline">Ekspor Portofolio</span>
              <span className="sm:hidden">Ekspor</span>
            </button>
            
            <button
              onClick={onAddAsset}
              className="px-3 sm:px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all duration-200 flex items-center gap-2 text-sm"
              title={t('addAsset')}
            >
              <FiPlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">{t('add')}</span>
              <span className="sm:hidden">Tambah</span>
            </button>
          </div>
        </div>
      </div>
        
      {/* Error Display - Minimalist */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <FiAlertCircle className="w-5 h-5 text-red-500" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">{t('failedToUpdateData')}</p>
              <p className="text-sm mt-1 text-red-600 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}
        
      {/* Loading State - Minimalist */}
      {debouncedLoading && (assets?.stocks?.length + assets?.crypto?.length) > 0 ? (
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('updatingPrices')}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Info Panel - Minimalist - Only show if significantly missing data */}
          {!debouncedLoading && Object.keys(prices).length > 0 && Object.keys(prices).length < (assets?.stocks?.length + assets?.crypto?.length) * 0.8 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <FiInfo className="w-5 h-5 text-blue-500" />
                <div className="flex-1">
                  <p className="font-medium text-blue-800 dark:text-blue-200">{t('updatingPriceData')}</p>
                  <p className="text-sm mt-1 text-blue-600 dark:text-blue-300">Auto-refresh dalam beberapa detik...</p>
                </div>
                <button 
                  onClick={handleRefresh}
                  disabled={loading || loadingExchangeRate}
                  className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
                >
                  {(loading || loadingExchangeRate) ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    'Refresh Sekarang'
                  )}
                </button>
              </div>
            </div>
          )}
            
          {/* Stocks Section */}
          {(activeAssetTab === 'all' || activeAssetTab === 'stocks') && (
            <div className={activeAssetTab === 'all' ? 'mb-8' : ''}>
              {assets?.stocks?.length > 0 ? (
                <AssetTable 
                  assets={assets.stocks} 
                  prices={prices} 
                  exchangeRate={exchangeRate}
                  type="stock"
                  onUpdate={onUpdateStock}
                  onSell={handleSellStock}
                  onDelete={onDeleteStock}
                  loading={debouncedLoading || sellingLoading}
                />
              ) : activeAssetTab === 'stocks' ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-12 text-center">
                  <p className="text-gray-500 dark:text-gray-400 mb-4">{t('noStocksAdded')}</p>
                  <button 
                    onClick={onAddAsset}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl transition-all duration-200 text-sm"
                  >
                    <FiPlusCircle className="mr-2 inline" /> {t('addAsset')}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        
          {/* Crypto Section */}
          {(activeAssetTab === 'all' || activeAssetTab === 'crypto') && (
            <div>
              {assets?.crypto?.length > 0 ? (
                <AssetTable 
                  assets={assets.crypto} 
                  prices={prices} 
                  exchangeRate={exchangeRate}
                  type="crypto"
                  onUpdate={onUpdateCrypto}
                  onSell={handleSellCrypto}
                  onDelete={onDeleteCrypto}
                  loading={debouncedLoading || sellingLoading}
                />
              ) : activeAssetTab === 'crypto' ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-12 text-center">
                  <p className="text-gray-500 dark:text-gray-400 mb-4">{t('noCryptoAdded')}</p>
                  <button 
                    onClick={onAddAsset}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl transition-all duration-200 text-sm"
                  >
                    <FiPlusCircle className="mr-2 inline" /> {t('addAsset')}
                  </button>
                </div>
              ) : null}
            </div>
          )}
            
          {/* Empty State - Minimalist */}
          {assets?.stocks?.length === 0 && assets?.crypto?.length === 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-16 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-6">
                <FiDollarSign className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{t('emptyPortfolio')}</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                {t('emptyPortfolioDesc')}
              </p>
              <button 
                onClick={onAddAsset}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-all duration-200 inline-flex items-center shadow-sm hover:shadow-md"
              >
                <FiPlusCircle className="mr-2" /> {t('addFirstAsset')}
              </button>
            </div>
          )}
        </>
      )}
        
      {/* Footer - Minimalist */}
      {lastUpdate && (assets?.stocks?.length + assets?.crypto?.length) > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-4 text-gray-500 dark:text-gray-400 text-sm flex flex-col sm:flex-row sm:justify-between gap-2">
          <span>{t('lastUpdated')}: {lastUpdate}</span>
          {!loadingExchangeRate && (
            <button 
              onClick={handleRefresh}
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 self-start sm:self-auto"
            >
              {t('refreshNow')}
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
  );
}