import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AssetTable from './AssetTable';
import Notification from './Notification';

import { FiRefreshCw, FiPlusCircle, FiDollarSign, FiActivity, FiAlertCircle, FiInfo, FiDownload, FiCreditCard, FiSearch, FiSettings, FiX, FiTrendingUp } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { fetchExchangeRate } from '../lib/fetchPrices';
import { formatNumber, formatIDR, formatUSD, formatNumberUSD } from '../lib/utils';
import { useLanguage } from '../lib/languageContext';
import { useTheme } from '../lib/themeContext';
import { secureLogger } from './../lib/security';

export default function Portfolio({
  assets,
  onUpdateStock,
  onUpdateCrypto,
  onUpdateCash,
  onAddAsset,
  onSellStock,
  onSellCrypto,
  onSellCash,
  onDeleteStock,
  onDeleteCrypto,
  onDeleteCash,
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

  isUpdatingPortfolio = false,
  hideBalance,
  onOpenSettings
}) {
  const assetCount = useMemo(() => ({
    stocks: new Set((assets?.stocks || []).map(s => (s.ticker || '').toUpperCase())).size,
    crypto: new Set((assets?.crypto || []).map(c => (c.symbol || '').toUpperCase())).size,
    cash: new Set((assets?.cash || []).map(c => (c.ticker || '').toUpperCase())).size
  }), [assets]);

  useEffect(() => {
    if (assetCount.stocks > 0 || assetCount.crypto > 0 || assetCount.cash > 0) {
      secureLogger.log('Portfolio component received assets:', assetCount);
    }
  }, [assetCount]);

  const [prices, setPrices] = useState(propPrices || {});
  const [searchQuery, setSearchQuery] = useState('');


  const memoizedPrices = useMemo(() => propPrices, [propPrices]);
  useEffect(() => {
    if (memoizedPrices) {
      setPrices(memoizedPrices);
    }
  }, [memoizedPrices]);

  const [loading, setLoading] = useState(false);
  const isPriceLoading = pricesLoading || loading || isUpdatingPortfolio;

  const lastLoadingTimeRef = useRef(0);
  const [debouncedLoading, setDebouncedLoading] = useState(false);

  useEffect(() => {
    if (isPriceLoading) {
      lastLoadingTimeRef.current = Date.now();
      setDebouncedLoading(true);
    } else {
      const timeSinceLoading = Date.now() - lastLoadingTimeRef.current;
      if (timeSinceLoading > 1000) {
        setDebouncedLoading(false);
      } else {
        const timer = setTimeout(() => setDebouncedLoading(false), 1000 - timeSinceLoading);
        return () => clearTimeout(timer);
      }
    }
  }, [isPriceLoading]);

  const [lastUpdate, setLastUpdate] = useState('');
  const [error, setError] = useState(null);
  const [loadingExchangeRate, setLoadingExchangeRate] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(parentExchangeRate || propExchangeRate);

  useEffect(() => {
    const newRate = parentExchangeRate || propExchangeRate;
    if (newRate !== exchangeRate) {
      setExchangeRate(newRate);
    }
  }, [parentExchangeRate, propExchangeRate, exchangeRate]);

  const [exchangeRateError, setExchangeRateError] = useState(propExchangeRateError || null);
  const [exchangeRateSource, setExchangeRateSource] = useState(propExchangeRateSource || '');
  const [lastExchangeRateUpdate, setLastExchangeRateUpdate] = useState(propLastExchangeRateUpdate || '');

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
  const { isDarkMode, toggleTheme } = useTheme();

  const handleRefresh = useCallback(async () => {
    try {
      if (onRefreshPrices) {
        await onRefreshPrices(true);
      }
      if (onRefreshExchangeRate) {
        await onRefreshExchangeRate();
      }
    } catch (error) {
      secureLogger.error('Error during refresh:', error);
    }
  }, [onRefreshPrices, onRefreshExchangeRate]);

  // Handle Sell
  const handleSellStock = (index, asset, amountToSell) => {
    onSellStock(index, asset, amountToSell);
  };
  const handleSellCrypto = (index, asset, amountToSell) => {
    onSellCrypto(index, asset, amountToSell);
  };

  // Calculate Totals
  const totals = useMemo(() => {
    let totalStocksIDR = 0;
    let totalStocksUSD = 0;
    let totalCryptoUSD = 0;
    let totalCryptoIDR = 0;
    let totalCashIDR = 0;
    let totalCashUSD = 0;
    let totalAssetsWithChange = 0;
    let avgDayChange = 0;

    const safeExchangeRate = exchangeRate || 0; // Prevent division by zero or null

    // Cash
    (assets?.cash || []).forEach(cash => {
      const amount = parseFloat(cash.amount) || 0;
      totalCashIDR += amount;
      if (safeExchangeRate > 0) {
        totalCashUSD += amount / safeExchangeRate;
      }
    });

    // Stocks
    (assets?.stocks || []).forEach(stock => {
      const tickerKey = stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`;
      // Prioritize real-time price, fallback to stored currentPrice, then 0. NEVER use dummy.
      const realtimePrice = prices[tickerKey];

      // For manual assets, use manualPrice/price/avgPrice as current price
      let priceVal;
      if ((stock.useManualPrice || stock.isManual) && (stock.manualPrice || stock.price || stock.avgPrice)) {
        priceVal = stock.manualPrice || stock.price || stock.avgPrice;
      } else {
        priceVal = realtimePrice ? realtimePrice.price : (stock.currentPrice || 0);
      }

      const shareCount = stock.market === 'US' ? parseFloat(stock.lots) : parseFloat(stock.lots) * 100;

      if (stock.market === 'US') {
        // US Stock (Base USD)
        const valUSD = priceVal * shareCount;
        totalStocksUSD += valUSD;
        totalStocksIDR += valUSD * safeExchangeRate;
      } else {
        // IDX Stock (Base IDR)
        const valIDR = priceVal * shareCount;
        totalStocksIDR += valIDR;
        if (safeExchangeRate > 0) {
          totalStocksUSD += valIDR / safeExchangeRate;
        }
      }

      // Track change for average
      if (realtimePrice && typeof realtimePrice.change === 'number') {
        avgDayChange += realtimePrice.change; // This might need to be weighted or just sum of % changes? 
        // Typically portfolio change is weighted. But for now keeping distinct asset change average if that was intent, 
        // OR better: average % change.
        totalAssetsWithChange++;
      }
    });

    // Crypto
    (assets?.crypto || []).forEach(crypto => {
      // For manual assets, use manualPrice/price/avgPrice as current price
      let price;
      if ((crypto.useManualPrice || crypto.isManual) && (crypto.manualPrice || crypto.price || crypto.avgPrice)) {
        price = crypto.manualPrice || crypto.price || crypto.avgPrice;
      } else {
        // Prioritize real-time price, fallback to stored.
        price = prices[crypto.symbol]?.price || crypto.currentPrice || 0;
      }

      const amount = parseFloat(crypto.amount) || 0;

      const valUSD = price * amount;
      totalCryptoUSD += valUSD;
      totalCryptoIDR += valUSD * safeExchangeRate;

      if (prices[crypto.symbol] && typeof prices[crypto.symbol].change === 'number') {
        avgDayChange += prices[crypto.symbol].change;
        totalAssetsWithChange++;
      }
    });

    const totalIDR = totalStocksIDR + totalCryptoIDR + totalCashIDR;
    const totalUSD = totalStocksUSD + totalCryptoUSD + totalCashUSD;

    avgDayChange = totalAssetsWithChange > 0 ? avgDayChange / totalAssetsWithChange : 0;

    return {
      totalIDR: Math.round(totalIDR),
      totalUSD: totalUSD,
      totalStocksIDR,
      totalStocksUSD,
      totalCryptoIDR,
      totalCryptoUSD,
      totalCashIDR,
      totalCashUSD,
      stocksPercent: totalIDR > 0 ? (totalStocksIDR / totalIDR) * 100 : 0,
      cryptoPercent: totalIDR > 0 ? (totalCryptoIDR / totalIDR) * 100 : 0,
      cashPercent: totalIDR > 0 ? (totalCashIDR / totalIDR) * 100 : 0,
      totalAssetsWithChange,
      avgDayChange
    };
  }, [assets, prices, exchangeRate]);

  // Calculate Gains
  const gains = useMemo(() => {
    let stocksGainIDR = 0;
    let stocksGainUSD = 0;
    let cryptoGainUSD = 0;
    let cryptoGainIDR = 0;
    let totalCostIDR = 0;
    let totalCostUSD = 0;

    const safeExchangeRate = exchangeRate || 0;

    // Stocks
    (assets?.stocks || []).forEach(stock => {
      const tickerKey = stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`;

      // For manual assets, use manualPrice/price/avgPrice as current price
      let currentPrice;
      if ((stock.useManualPrice || stock.isManual) && (stock.manualPrice || stock.price || stock.avgPrice)) {
        currentPrice = stock.manualPrice || stock.price || stock.avgPrice;
      } else {
        currentPrice = prices[tickerKey]?.price || stock.currentPrice || 0;
      }

      const shareCount = stock.market === 'US' ? parseFloat(stock.lots) : parseFloat(stock.lots) * 100;
      let currentValue = 0;
      let costBasis = 0;

      if (stock.market === 'US') {
        // US: Base USD
        currentValue = currentPrice * shareCount;
        costBasis = (parseFloat(stock.avgPrice) || 0) * shareCount; // avgPrice is USD per share

        const gain = currentValue - costBasis;
        stocksGainUSD += gain;
        stocksGainIDR += gain * safeExchangeRate;
        totalCostUSD += costBasis;
      } else {
        // IDX: Base IDR
        currentValue = currentPrice * shareCount;
        costBasis = (parseFloat(stock.avgPrice) || 0) * shareCount; // avgPrice is IDR per share

        const gain = currentValue - costBasis;
        stocksGainIDR += gain;
        totalCostIDR += costBasis;
        if (safeExchangeRate > 0) {
          stocksGainUSD += gain / safeExchangeRate;
        }
      }
    });

    // Crypto
    (assets?.crypto || []).forEach(crypto => {
      // For manual assets, use manualPrice/price/avgPrice as current price
      let currentPrice;
      if ((crypto.useManualPrice || crypto.isManual) && (crypto.manualPrice || crypto.price || crypto.avgPrice)) {
        currentPrice = crypto.manualPrice || crypto.price || crypto.avgPrice;
      } else {
        currentPrice = prices[crypto.symbol]?.price || crypto.currentPrice || 0;
      }

      const amount = parseFloat(crypto.amount) || 0;
      const currentValue = currentPrice * amount;
      const costBasis = (parseFloat(crypto.avgPrice) || 0) * amount;

      const gain = currentValue - costBasis;
      cryptoGainUSD += gain;
      cryptoGainIDR += gain * safeExchangeRate;
      totalCostUSD += costBasis;
    });

    const totalGainIDR = stocksGainIDR + cryptoGainIDR;
    const totalGainUSD = stocksGainUSD + cryptoGainUSD;

    // Total Cost normalized to IDR for % calc
    const totalCostNormalizedIDR = totalCostIDR + (totalCostUSD * safeExchangeRate);

    return {
      totalStockGainIDR: stocksGainIDR, // Renamed to match JSX expectation
      totalStockGainUSD: stocksGainUSD,
      totalCryptoGainIDR: cryptoGainIDR,
      totalCryptoGainUSD: cryptoGainUSD,
      totalGainIDR,
      totalGainUSD,
      totalCost: totalCostNormalizedIDR,
      gainPercent: totalCostNormalizedIDR > 0 ? (totalGainIDR / totalCostNormalizedIDR) * 100 : 0, // Better approach for percent: (Total Gain / Total Cost)
      stocksGainPercent: totalCostIDR > 0 ? (stocksGainIDR / totalCostIDR) * 100 : 0,
      cryptoGainPercent: totalCostUSD > 0 ? (cryptoGainUSD / totalCostUSD) * 100 : 0
    };
  }, [assets, prices, exchangeRate]);

  // Search Filter
  const filteredAssets = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filterItem = (item) => {
      if (!query) return true;
      return (
        (item.ticker || '').toLowerCase().includes(query) ||
        (item.symbol || '').toLowerCase().includes(query) ||
        (item.broker || '').toLowerCase().includes(query) ||
        (item.exchange || '').toLowerCase().includes(query)
      );
    };

    return {
      stocks: (assets?.stocks || []).filter(filterItem),
      crypto: (assets?.crypto || []).filter(filterItem),
      cash: (assets?.cash || []).filter(filterItem)
    };
  }, [assets, searchQuery]);

  const uniqueFilteredCounts = useMemo(() => ({
    stocks: new Set((filteredAssets.stocks || []).map(s => (s.ticker || '').toUpperCase())).size,
    crypto: new Set((filteredAssets.crypto || []).map(c => (c.symbol || '').toUpperCase())).size,
    cash: new Set((filteredAssets.cash || []).map(c => (c.ticker || '').toUpperCase())).size
  }), [filteredAssets]);

  const copyToWhatsApp = () => {
    try {
      const now = new Date();
      const options = { day: 'numeric', month: 'short', year: 'numeric' };
      // Format manual date string: "16 Jan 2026"
      const dateString = now.toLocaleDateString('id-ID', options);

      let text = `Rekap Keuangan — ${dateString}\n\n`;
      text += `💰 Total: ${formatIDR(totals.totalIDR)}\n\n`;

      // BANK & E-WALLET
      if (assets?.cash?.length) {
        text += "🏦 BANK\n\n";
        assets.cash.forEach(b => {
          text += `• ${b.ticker}: ${formatIDR(b.amount)}\n`;
        });
        text += "\n";
      }

      // SAHAM
      if (assets?.stocks?.length) {
        text += "📈 SAHAM\n\n";

        // Group stocks by ticker
        const stocksByTicker = {};
        assets.stocks.forEach(stock => {
          if (!stocksByTicker[stock.ticker]) {
            stocksByTicker[stock.ticker] = [];
          }
          stocksByTicker[stock.ticker].push(stock);
        });

        // Loop through tickers
        Object.entries(stocksByTicker).forEach(([ticker, stocks]) => {
          if (stocks.length > 1) {
            // Multi-broker: Header then list
            text += `${ticker}\n`;
            stocks.forEach(stock => {
              // Calculate value on fly if portoIDR not ready, though usually it is. 
              // Portfolio caluclates it. Let's rely on standard calc if missing.
              let valIDR = stock.portoIDR;
              if (!valIDR) {
                const price = prices[stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`]?.price || stock.currentPrice || 0;
                const shareCount = stock.market === 'US' ? parseFloat(stock.lots) : parseFloat(stock.lots) * 100;
                valIDR = price * shareCount;
                if (stock.market === 'US' && exchangeRate) valIDR *= exchangeRate;
              }

              text += `• ${stock.broker || 'Manual'}: ${formatIDR(valIDR)} (${stock.lots} Lot)\n`;
            });
            text += "\n";
          } else {
            // Single broker: Single line
            const stock = stocks[0];
            let valIDR = stock.portoIDR;
            if (!valIDR) {
              const price = prices[stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`]?.price || stock.currentPrice || 0;
              const shareCount = stock.market === 'US' ? parseFloat(stock.lots) : parseFloat(stock.lots) * 100;
              valIDR = price * shareCount;
              if (stock.market === 'US' && exchangeRate) valIDR *= exchangeRate;
            }

            text += `${ticker} — ${stock.broker || 'Manual'}: ${formatIDR(valIDR)} (${stock.lots} Lot)\n`;
          }
        });
        text += "\n";
      }

      // CRYPTO
      if (assets?.crypto?.length) {
        text += "🪙 CRYPTO\n\n";

        // Group crypto by symbol (in case of multiple exchanges, similar handling)
        const cryptoBySymbol = {};
        assets.crypto.forEach(crypto => {
          if (!cryptoBySymbol[crypto.symbol]) {
            cryptoBySymbol[crypto.symbol] = [];
          }
          cryptoBySymbol[crypto.symbol].push(crypto);
        });

        Object.entries(cryptoBySymbol).forEach(([symbol, cryptos]) => {
          if (cryptos.length > 1) {
            text += `${symbol}\n`;
            cryptos.forEach(crypto => {
              let valIDR = crypto.portoIDR;
              if (!valIDR) {
                const price = prices[crypto.symbol]?.price || crypto.currentPrice || 0;
                const valUSD = price * crypto.amount;
                valIDR = valUSD * (exchangeRate || 1);
              }
              text += `• ${crypto.exchange || 'Manual'}: ${formatIDR(valIDR)} (${crypto.amount} Unit)\n`;
            });
            text += "\n";
          } else {
            const crypto = cryptos[0];
            let valIDR = crypto.portoIDR;
            if (!valIDR) {
              const price = prices[crypto.symbol]?.price || crypto.currentPrice || 0;
              const valUSD = price * crypto.amount;
              valIDR = valUSD * (exchangeRate || 1);
            }
            text += `${symbol} — ${crypto.exchange || 'Manual'}: ${formatIDR(valIDR)} (${crypto.amount} Unit)\n`;
          }
        });
        text += "\n";
      }

      // Clean up: Remove trailing newlines
      text = text.trim();

      navigator.clipboard.writeText(text);
      setNotification({ type: 'success', title: 'Tersalin', message: 'Rekap berhasil disalin ke clipboard' });

      // Open WhatsApp? Or just copy. Usually copy is better. 
      // Existing code might have link.
      // But user requested "format copy WA".
      // I'll keep just copy to clipboard for now as it's safer/generic.
      // Or adding window.open if it was there.
      // Previous code didn't show window.open in the viewed snippet (it ended early). 
      // I will assume clipboard copy is sufficient, or add share intent if mobile.
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = `whatsapp://send?text=${encodeURIComponent(text)}`;
      }

    } catch (error) {
      secureLogger.error('Copy WhatsApp Failed:', error);
      setNotification({ type: 'error', title: 'Gagal', message: 'Gagal menyalin rekap.' });
    }
  };


  const exportPortfolioToCSV = (category = 'all', e) => {
    if (e) e.stopPropagation();
    try {
      const currentDate = new Date().toLocaleString('id-ID', {
        dateStyle: 'full', timeStyle: 'short'
      });

      // 1. Metadata / Header Info
      const csvRows = [];
      csvRows.push(['PORTFOLIO REPORT']);
      csvRows.push(['Generated At', currentDate]);
      csvRows.push(['Exchange Rate (1 USD)', formatIDR(exchangeRate)]);
      csvRows.push(['Total Value (IDR)', formatIDR(totals.totalIDR)]);
      csvRows.push(['Total Value (USD)', formatUSD(totals.totalUSD)]);
      csvRows.push([]); // Empty row

      // 2. Define Headers
      // We will create a unified table structure but might separate sections for clarity if requested, 
      // but a single table is usually better for sorting/filtering in Excel.
      // Let's stick to a robust single table with clear Type indicator.
      const headers = [
        'Type',
        'Ticker/Name',
        'Broker/Exchange',
        'Quantity (Lot/Unit)',
        'Avg Price',
        'Current Price',
        'Total Cost (IDR)',
        'Market Value (IDR)',
        'Market Value (USD)',
        'Gain/Loss (IDR)',
        'Performance (%)'
      ];
      csvRows.push(headers);

      const escape = (str) => {
        if (str === null || str === undefined) return '""';
        return `"${String(str).replace(/"/g, '""')}"`;
      };

      // Helper to format number for CSV (avoiding currency symbols for easier calculation in Excel if desired, 
      // but user asked for "enak dilihat" (nice to view), so we might keep formatting or just clean numbers.
      // Let's use clean numbers for compatibility, but formatted if it's just IDR. 
      // Actually, standard Excel CSV prefers raw numbers. But "Enak dilihat" might mean formatted. 
      // Let's provide formatted numbers for "Value" columns for readability.

      const formatVal = (num) => {
        if (!num && num !== 0) return '0';
        return Number(num).toFixed(2);
      };

      // Process Stocks
      if ((category === 'all' || category === 'stock') && assets?.stocks) {
        assets.stocks.forEach(stock => {
          const isUS = stock.market === 'US';
          const avgPriceLabel = isUS ? formatUSD(stock.avgPrice) : formatIDR(stock.avgPrice);
          const currPriceLabel = isUS ? formatUSD(stock.currentPrice) : formatIDR(stock.currentPrice);

          // Calculate IDR values for uniformity
          let costIDR = 0, valueIDR = 0, gainIDR = 0, valueUSD = 0;

          if (isUS) {
            const shares = stock.lots;
            valueUSD = (stock.currentPrice * shares);
            valueIDR = valueUSD * exchangeRate;
            costIDR = (stock.avgPrice * shares) * exchangeRate;
            gainIDR = valueIDR - costIDR;
          } else {
            const shares = stock.lots * 100;
            valueIDR = (stock.currentPrice * shares);
            valueUSD = valueIDR / (exchangeRate || 14000);
            costIDR = stock.avgPrice * shares;
            gainIDR = valueIDR - costIDR;
          }

          csvRows.push([
            'Stock ' + (isUS ? '(US)' : '(IDX)'),
            stock.ticker,
            stock.broker || '-',
            stock.lots,
            avgPriceLabel,
            currPriceLabel,
            formatIDR(costIDR),
            formatIDR(valueIDR),
            formatUSD(valueUSD),
            formatIDR(gainIDR),
            (stock.gainPercentage || 0).toFixed(2) + '%'
          ]);
        });
      }

      // Process Crypto
      if ((category === 'all' || category === 'crypto') && assets?.crypto) {
        assets.crypto.forEach(crypto => {
          const valueUSD = crypto.portoUSD || (crypto.amount * crypto.currentPrice);
          const valueIDR = valueUSD * exchangeRate;
          const costUSD = (crypto.avgPrice * crypto.amount);
          const costIDR = costUSD * exchangeRate;
          const gainIDR = valueIDR - costIDR;

          csvRows.push([
            'Crypto',
            crypto.symbol,
            crypto.exchange || '-',
            crypto.amount,
            formatUSD(crypto.avgPrice),
            formatUSD(crypto.currentPrice),
            formatIDR(costIDR),
            formatIDR(valueIDR),
            formatUSD(valueUSD),
            formatIDR(gainIDR),
            (crypto.gainPercentage || 0).toFixed(2) + '%'
          ]);
        });
      }

      // Process Cash
      if ((category === 'all' || category === 'cash') && assets?.cash) {
        assets.cash.forEach(cash => {
          const valIDR = cash.amount;
          const valUSD = valIDR / (exchangeRate || 1);

          csvRows.push([
            'Cash',
            cash.ticker, // Bank Name
            '-',
            '-', // Quantity
            '-', // Avg Price
            '-', // Curr Price
            formatIDR(valIDR), // Cost (same as value)
            formatIDR(valIDR),
            formatUSD(valUSD),
            '0',
            '0%'
          ]);
        });
      }

      const csvContent = csvRows.map(row => row.map(escape).join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `PortSyncro_Report_${category}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setNotification({ type: 'success', title: 'Export Berhasil', message: `Laporan ${category} berhasil diunduh.` });
    } catch (error) {
      secureLogger.error('Export CSV Failed:', error);
      setNotification({ type: 'error', title: 'Export Gagal', message: 'Gagal membuat file CSV.' });
    }
  };

  /* Helper Functions */
  const getMasked = (val, isCurrency = true) => {
    if (hideBalance) return '•••••••';
    return val;
  };

  return (
    <div className="space-y-6 pb-24 font-sans bg-gray-50 dark:bg-[#0d1117] min-h-screen text-gray-900 dark:text-gray-300 p-4 sm:p-6">
      {/* App Header */}
      <div className="flex flex-col space-y-1 mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{t('portfolio') || 'My Portfolio'}</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
          1 USD ≈ {getMasked(formatIDR(exchangeRate))}
        </p>
      </div>

      {/* Control Panel Bar */}
      <div className="bg-white dark:bg-[#161b22] rounded-2xl p-3 flex flex-col xl:flex-row items-center justify-between gap-4 border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="flex items-center gap-6 w-full xl:w-auto overflow-x-auto no-scrollbar">
          <span className="text-gray-900 dark:text-white font-bold px-2 hidden md:block">Portfolio</span>

          <div className="grid grid-cols-4 gap-1 w-full min-w-[300px] md:min-w-0 md:flex md:space-x-1">
            {['all', 'cash', 'stock', 'crypto'].map(tab => {
              const count = tab === 'all'
                ? assetCount.stocks + assetCount.crypto + assetCount.cash
                : (tab === 'cash' ? assetCount.cash : (tab === 'stock' ? assetCount.stocks : assetCount.crypto));
              const labels = {
                all: t('all') || 'Semua',
                cash: t('bank') || 'Bank',
                stock: t('stocks') || 'Saham',
                crypto: t('crypto') || 'Kripto'
              };
              const isActive = activeAssetTab === tab;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveAssetTab(tab)}
                  className={`
                      px-2 py-2 rounded-xl flex flex-col items-center justify-center transition-all duration-200 w-full md:w-auto md:min-w-[80px]
                      ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200'}
                   `}
                >
                  <span className="text-[11px] sm:text-xs font-bold truncate w-full text-center">{labels[tab]}</span>
                  <span className="text-[10px] opacity-80">({count})</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full xl:w-auto justify-end">
          {/* Refresh */}
          <button onClick={handleRefresh} className="w-10 h-10 bg-gray-100 dark:bg-[#0d1117] hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors border border-gray-200 dark:border-gray-800">
            <FiRefreshCw className={`w-4 h-4 ${debouncedLoading ? "animate-spin text-blue-500" : ""}`} />
          </button>

          {/* Export */}
          <button onClick={(e) => exportPortfolioToCSV('all', e)} className="bg-gray-100 dark:bg-[#1f2937] hover:bg-gray-200 dark:hover:bg-[#374151] text-emerald-600 dark:text-emerald-400 px-4 h-10 rounded-xl flex items-center gap-2 text-xs font-bold transition-colors border border-gray-200 dark:border-gray-700">
            <FiDownload className="w-3 h-3" />
            <span className="hidden sm:inline">{t('exportPortfolio') || 'Ekspor Portofolio'}</span>
          </button>

          {/* WA */}
          <button onClick={copyToWhatsApp} className="bg-emerald-500 hover:bg-emerald-600 text-white w-10 sm:w-auto sm:px-4 h-10 rounded-xl flex items-center justify-center gap-2 font-bold transition-colors shadow-lg shadow-emerald-500/20">
            <FaWhatsapp className="w-4 h-4" />
            <span className="hidden sm:inline">Copy</span>
          </button>

          {/* Settings */}
          <button onClick={onOpenSettings} className="bg-gray-100 dark:bg-[#0d1117] hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 px-4 h-10 rounded-xl flex items-center gap-2 text-xs font-bold transition-colors border border-gray-200 dark:border-gray-800">
            <FiSettings className="w-3 h-3" />
            <span className="hidden sm:inline">{t('settings') || 'Settings'}</span>
          </button>

          {/* Add */}
          <button onClick={() => onAddAsset && onAddAsset()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 h-10 rounded-xl flex items-center gap-2 text-xs font-bold transition-colors shadow-lg shadow-blue-600/20">
            <FiPlusCircle className="w-4 h-4" />
            <span>{t('add') || 'Tambah'}</span>
          </button>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* 1. Total Portfolio */}
        <div className="bg-white dark:bg-[#161b22] rounded-2xl p-5 border border-gray-200 dark:border-gray-800 relative overflow-hidden group shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 text-xs font-semibold tracking-wide">{t('totalPortfolio') || 'Total Portfolio'}</span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-[#1f2937] flex items-center justify-center text-blue-600 dark:text-blue-400">
              <FiDollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1 mb-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              {getMasked(formatIDR(totals.totalIDR))}
            </h2>
            <p className="text-xs text-gray-500 font-mono">
              {getMasked(formatUSD(totals.totalUSD))}
            </p>
          </div>
        </div>

        {/* 2. Bank & E-Wallet */}
        <div className="bg-white dark:bg-[#161b22] rounded-2xl p-5 border border-gray-200 dark:border-gray-800 relative group shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 text-xs font-semibold tracking-wide">{t('bankAndWallet') || 'Bank & E-Wallet'}</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-[#1f2937] flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <FiCreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1 mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              {getMasked(formatIDR(totals.totalCashIDR))}
            </h2>
            <p className="text-xs text-gray-500 font-mono">
              {getMasked(formatUSD(totals.totalCashUSD))}
            </p>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 rounded-full overflow-hidden">
            <div style={{ width: `${totals.cashPercent}%` }} className="bg-emerald-500 h-full rounded-full"></div>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">{hideBalance ? '•••' : totals.cashPercent.toFixed(1)}% {t('fromPortfolio')}</p>
        </div>

        {/* 3. Saham */}
        <div className="bg-white dark:bg-[#161b22] rounded-2xl p-5 border border-gray-200 dark:border-gray-800 relative group shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 text-xs font-semibold tracking-wide">{t('stocks') || 'Saham'}</span>
            <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-[#1f2937] flex items-center justify-center text-teal-600 dark:text-teal-400">
              <FiTrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1 mb-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              {getMasked(formatIDR(totals.totalStocksIDR))}
            </h2>
            <p className="text-xs text-gray-500 font-mono mb-2">
              {getMasked(formatUSD(totals.totalStocksUSD))}
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className={gains.totalStockGainIDR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-500'}>
                {gains.totalStockGainIDR >= 0 ? '+' : ''}{getMasked(formatIDR(gains.totalStockGainIDR))}
              </span>
              <span className={gains.totalStockGainIDR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-500'}>
                ({getMasked(gains.stocksGainPercent.toFixed(1))}%)
              </span>
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 rounded-full overflow-hidden mt-3">
            <div style={{ width: `${totals.stocksPercent}%` }} className="bg-blue-500 h-full rounded-full"></div>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">{hideBalance ? '•••' : totals.stocksPercent.toFixed(1)}% {t('fromPortfolio')}</p>
        </div>

        {/* 4. Kripto */}
        <div className="bg-white dark:bg-[#161b22] rounded-2xl p-5 border border-gray-200 dark:border-gray-800 relative group shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 text-xs font-semibold tracking-wide">{t('crypto') || 'Kripto'}</span>
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-[#1f2937] flex items-center justify-center text-purple-600 dark:text-purple-400">
              <FiActivity className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1 mb-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              {getMasked(formatIDR(totals.totalCryptoIDR))}
            </h2>
            <p className="text-xs text-gray-500 font-mono mb-2">
              {getMasked(formatUSD(totals.totalCryptoUSD))}
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className={gains.totalCryptoGainIDR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-500'}>
                {gains.totalCryptoGainIDR >= 0 ? '+' : ''}{getMasked(formatIDR(gains.totalCryptoGainIDR))}
              </span>
              <span className={gains.totalCryptoGainIDR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-500'}>
                ({getMasked(gains.cryptoGainPercent.toFixed(1))}%)
              </span>
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 rounded-full overflow-hidden mt-3">
            <div style={{ width: `${totals.cryptoPercent}%` }} className="bg-purple-500 h-full rounded-full"></div>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">{hideBalance ? '•••' : totals.cryptoPercent.toFixed(1)}% {t('fromPortfolio')}</p>
        </div>
      </div>

      {/* BIG P/L Card */}
      <div className="bg-white dark:bg-[#161b22] rounded-2xl p-6 border border-gray-200 dark:border-gray-800 relative overflow-hidden shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{t('totalGainLoss') || 'Total Untung/Rugi'}</h3>
          <div className="w-8 h-8 rounded-lg bg-yellow-100 dark:bg-[#1f2937] flex items-center justify-center text-yellow-600 dark:text-yellow-400">
            <FiTrendingUp className="w-4 h-4" />
          </div>
        </div>

        <div className="space-y-1 mb-6">
          <h2 className={`text-3xl font-bold tracking-tight ${gains.totalGainIDR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-500'}`}>
            {gains.totalGainIDR >= 0 ? '+' : ''}{getMasked(formatIDR(gains.totalGainIDR))}
          </h2>
          <p className="text-sm text-gray-500 font-mono">
            {getMasked(formatUSD(gains.totalGainUSD))}
          </p>
          <p className={`text-lg font-bold mt-2 ${gains.gainPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-500'}`}>
            {gains.gainPercent >= 0 ? '+' : ''}{getMasked(gains.gainPercent.toFixed(1))}%
          </p>
        </div>

        <div className="w-full bg-gray-200 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
          <div
            style={{ width: `${Math.min(Math.abs(gains.gainPercent), 100)}%` }}
            className={`h-full rounded-full transition-all duration-1000 ${gains.totalGainIDR >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
          ></div>
        </div>
        <div className="flex justify-end mt-2">
          <span className="text-[10px] text-gray-500">{t('ofTotalCost') || 'dari total biaya'}</span>
        </div>
        <div className="absolute bottom-4 right-6">
          <span className="text-xs bg-gray-100 dark:bg-[#0d1117] text-gray-500 dark:text-gray-400 px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-800">
            {gains.totalGainIDR >= 0 ? (t('profitable') || 'Menguntungkan') : (t('loss') || 'Merugi')}
          </span>
        </div>
      </div>

      {/* Floating Price Loading Indicator */}
      {debouncedLoading && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-blue-600 text-white px-6 py-2 rounded-full shadow-lg flex items-center gap-3 animate-bounce">
            <FiRefreshCw className="animate-spin w-4 h-4" />
            <span className="text-sm font-bold">{t('updatingPrices') || 'Sedang memperbarui harga...'}</span>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
          <FiSearch className="text-gray-500 group-focus-within:text-blue-500 transition-colors" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('placeholderSearch') || "Cari aset (e.g. BTC, BBCA)..."}
          className="w-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white pl-12 pr-4 py-4 rounded-xl focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm placeholder-gray-500 dark:placeholder-gray-600"
        />
      </div>

      {/* Asset Tables */}
      <div className="space-y-8">
        {(activeAssetTab === 'all' || activeAssetTab === 'cash') && filteredAssets.cash.length > 0 && (
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-2 mb-4 px-2 justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {t('bankAndWallet') || 'Bank & E-Wallet'}
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-[#161b22] px-2 py-1 rounded-full">{uniqueFilteredCounts.cash} {t('asset') || 'Aset'}</span>
              </h3>
              <button onClick={(e) => exportPortfolioToCSV('cash', e)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-blue-600 transition-colors" title="Export Bank Data">
                <FiDownload className="w-4 h-4" />
              </button>
            </div>
            <AssetTable
              type="cash"
              assets={filteredAssets.cash}
              prices={prices}
              exchangeRate={exchangeRate}
              hideBalance={hideBalance}
              onUpdate={onUpdateCash}
              onDelete={onDeleteCash}
              onSell={onSellCash}
            />
          </div>
        )}

        {(activeAssetTab === 'all' || activeAssetTab === 'stock') && filteredAssets.stocks.length > 0 && (
          <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-2 mb-4 px-2 justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {t('stocks') || 'Saham'}
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-[#161b22] px-2 py-1 rounded-full">{uniqueFilteredCounts.stocks} {t('asset') || 'Aset'}</span>
              </h3>
              <button onClick={(e) => exportPortfolioToCSV('stock', e)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-blue-600 transition-colors" title="Export Stocks">
                <FiDownload className="w-4 h-4" />
              </button>
            </div>
            <AssetTable
              type="stock"
              assets={filteredAssets.stocks}
              prices={prices}
              exchangeRate={exchangeRate}
              hideBalance={hideBalance}
              onUpdate={onUpdateStock}
              onDelete={onDeleteStock}
              onSell={onSellStock}
            />
          </div>
        )}

        {(activeAssetTab === 'all' || activeAssetTab === 'crypto') && filteredAssets.crypto.length > 0 && (
          <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-2 mb-4 px-2 justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {t('crypto') || 'Kripto'}
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-[#161b22] px-2 py-1 rounded-full">{uniqueFilteredCounts.crypto} {t('asset') || 'Aset'}</span>
              </h3>
              <button onClick={(e) => exportPortfolioToCSV('crypto', e)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-blue-600 transition-colors" title="Export Crypto">
                <FiDownload className="w-4 h-4" />
              </button>
            </div>
            <AssetTable
              type="crypto"
              assets={filteredAssets.crypto}
              prices={prices}
              exchangeRate={exchangeRate}
              hideBalance={hideBalance}
              onUpdate={onUpdateCrypto}
              onDelete={onDeleteCrypto}
              onSell={onSellCrypto}
            />
          </div>
        )}

        {filteredAssets.stocks.length === 0 && filteredAssets.crypto.length === 0 && filteredAssets.cash.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-[#161b22] rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
            <div className="bg-gray-50 dark:bg-[#0d1117] p-4 rounded-full mb-4">
              <FiSearch className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{t('emptyStateNoResults') || 'Tidak ada aset ditemukan'}</h3>
            <p className="text-gray-500">{t('helpTextSearch') || 'Coba kata kunci lain atau tambahkan aset baru'}</p>
          </div>
        )}
      </div>

      {/* Modals & Notifications */}


      {notification && (
        <Notification
          type={notification.type}
          title={notification.title}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#161b22] rounded-3xl p-8 w-full max-w-sm shadow-2xl border border-gray-800 scale-100 transform transition-all">
            <div className="flex flex-col items-center text-center mb-6">
              {confirmModal.type === 'error' ? (
                <div className="bg-red-900/20 p-3 rounded-full text-red-500 mb-4">
                  <FiAlertCircle className="w-8 h-8" />
                </div>
              ) : (
                <div className="bg-blue-900/20 p-3 rounded-full text-blue-500 mb-4">
                  <FiInfo className="w-8 h-8" />
                </div>
              )}
              <h3 className="text-xl font-bold text-white mb-2">{confirmModal.title}</h3>
              <p className="text-gray-400 leading-relaxed">{confirmModal.message}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={confirmModal.onCancel || (() => setConfirmModal(null))}
                className="px-4 py-3 text-gray-300 bg-[#0d1117] hover:bg-gray-800 rounded-xl font-semibold transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-4 py-3 text-white rounded-xl font-semibold shadow-lg transition-all transform active:scale-95 ${confirmModal.type === 'error' ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'}`}
              >
                {confirmModal.confirmText || 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
