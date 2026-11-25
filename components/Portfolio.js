import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AssetTable from './AssetTable';
import Notification from './Notification';
import MetricsGuideModal from './MetricsGuideModal';

import { FiRefreshCw, FiPlusCircle, FiDollarSign, FiActivity, FiAlertCircle, FiInfo, FiHelpCircle, FiDownload, FiCreditCard, FiSearch, FiSettings, FiX, FiTrendingUp, FiDisc, FiCamera, FiChevronUp, FiChevronDown, FiEye, FiEyeOff } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { fetchExchangeRate } from '../lib/fetchPrices';
import { formatNumber, formatIDR, formatUSD, formatNumberUSD, formatQuantity } from '../lib/utils';
import { useLanguage } from '../lib/languageContext';
import { useTheme } from '../lib/themeContext';
import { secureLogger } from './../lib/security';
import { portoRecap } from '../lib/telegramFormatter';

export default function Portfolio({
  assets,
  onUpdateStock,
  onUpdateCrypto,
  onUpdateCash,
  onUpdateGold,
  onAddAsset,
  onSellStock,
  onSellCrypto,
  onSellGold,
  onSellCash,
  onDeleteStock,
  onDeleteCrypto,
  onDeleteGold,
  onDeleteCash,
  onRefreshPrices,
  onRefreshExchangeRate,
  exchangeRate: parentExchangeRate,
  lastExchangeRateUpdate: propLastExchangeRateUpdate,
  exchangeRateSource: propExchangeRateSource,
  exchangeRateError: propExchangeRateError,
  loadingExchangeRate: propLoadingExchangeRate,
  prices: propPrices,
  sellingLoading = false,
  pricesLoading = false,

  isUpdatingPortfolio = false,
  hideBalance,
  onOpenSettings,
  onSnap,
  priceCheckWrapper,
  isHeaderCollapsed: propIsHeaderCollapsed,
  onToggleHeaderCollapse,
  searchQuery: propSearchQuery,
  onSearchChange: propOnSearchChange
}) {
  const assetCount = useMemo(() => ({
    stocks: new Set((assets?.stocks || []).map(s => (s.ticker || '').toUpperCase())).size,
    crypto: new Set((assets?.crypto || []).map(c => (c.symbol || '').toUpperCase())).size,
    gold: new Set((assets?.gold || []).map(g => (g.ticker || '').toUpperCase())).size,
    cash: new Set((assets?.cash || []).map(c => (c.ticker || '').toUpperCase())).size
  }), [assets]);

  useEffect(() => {
    if (assetCount.stocks > 0 || assetCount.crypto > 0 || assetCount.cash > 0) {
      secureLogger.log('Portfolio component received assets:', assetCount);
    }
  }, [assetCount]);

  const [prices, setPrices] = useState(propPrices || {});
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : internalSearchQuery;
  const setSearchQuery = propOnSearchChange || setInternalSearchQuery;


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
  const [exchangeRate, setExchangeRate] = useState(parentExchangeRate);

  useEffect(() => {
    const newRate = parentExchangeRate;
    if (newRate !== exchangeRate) {
      setExchangeRate(newRate);
    }
  }, [parentExchangeRate, exchangeRate]);

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
  const [cryptoTableFilter, setCryptoTableFilter] = useState('all'); // 'all', 'combined', 'usdt', 'usdc'
  const [isMetricsGuideOpen, setIsMetricsGuideOpen] = useState(false);
  const [investedMode, setInvestedMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('portsyncro_invested_mode') || 'all';
    }
    return 'all';
  });

  const handleSetInvestedMode = useCallback((mode) => {
    setInvestedMode(mode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('portsyncro_invested_mode', mode);
      } catch {}
    }
  }, []);
  const [internalHeaderCollapsed, setInternalHeaderCollapsed] = useState(false);
  const isHeaderCollapsed = propIsHeaderCollapsed !== undefined ? propIsHeaderCollapsed : internalHeaderCollapsed;
  const setIsHeaderCollapsed = useCallback((val) => {
    setInternalHeaderCollapsed(val);
    if (onToggleHeaderCollapse) {
      onToggleHeaderCollapse(val);
    }
  }, [onToggleHeaderCollapse]);


  const [notification, setNotification] = useState(null);
  const { t, language } = useLanguage();
  const { isDarkMode, toggleTheme } = useTheme();

  const activeTabLabel = useMemo(() => {
    const labels = {
      all: t('all') || 'Semua',
      cash: t('bank') || 'Bank',
      stock: t('stocks') || 'Saham',
      crypto: t('crypto') || 'Kripto',
      gold: t('gold') || 'Emas'
    };
    return labels[activeAssetTab] || 'Semua';
  }, [activeAssetTab, t]);

  const activeCount = useMemo(() => {
    if (activeAssetTab === 'all') {
      return assetCount.stocks + assetCount.crypto + assetCount.gold + assetCount.cash;
    }
    if (activeAssetTab === 'cash') return assetCount.cash;
    if (activeAssetTab === 'stock') return assetCount.stocks;
    if (activeAssetTab === 'gold') return assetCount.gold;
    return assetCount.crypto;
  }, [activeAssetTab, assetCount]);

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
    let totalGoldIDR = 0;
    let totalGoldUSD = 0;
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
      const normalizedTicker = (stock.ticker || '').toUpperCase();
      const tickerKey = stock.market === 'US' ? normalizedTicker : `${normalizedTicker}.JK`;
      // Prioritize real-time price, fallback to stored currentPrice, then 0. NEVER use dummy.
      const realtimePrice = prices ? prices[tickerKey] : null;

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
      const symbolKey = (crypto.symbol || '').toUpperCase();
      // For manual assets, use manualPrice/price/avgPrice as current price
      let price;
      if ((crypto.useManualPrice || crypto.isManual) && (crypto.manualPrice || crypto.price || crypto.avgPrice)) {
        price = crypto.manualPrice || crypto.price || crypto.avgPrice;
      } else {
        // Prioritize real-time price, fallback to stored.
        price = (prices ? prices[symbolKey]?.price : null) || crypto.currentPrice || 0;
      }

      const amount = parseFloat(crypto.amount) || 0;

      const valUSD = price * amount;
      totalCryptoUSD += valUSD;
      totalCryptoIDR += valUSD * safeExchangeRate;

      if (prices && prices[symbolKey] && typeof prices[symbolKey].change === 'number') {
        avgDayChange += prices[symbolKey].change;
        totalAssetsWithChange++;
      }
    });

    // Gold
    (assets?.gold || []).forEach(gold => {
      // Gold Price (usually IDR per gram from our fetcher)
      let price = gold.currentPrice || 0;

      // [FIX] Use gold.amount — field set by portfolioStateManager. gold.weight is undefined.
      const amount = parseFloat(gold.amount) || 0;
      const valIDR = price * amount;

      totalGoldIDR += valIDR;
      if (safeExchangeRate > 0) {
        totalGoldUSD += valIDR / safeExchangeRate;
      }

      // [FIX] Use simple % change (same as stocks/crypto) for avgDayChange consistency.
      // Previous code used weighted-by-value which mixed units with stocks % simple sum.
      if (gold.change !== null && gold.change !== undefined) {
        avgDayChange += gold.change;
        totalAssetsWithChange++;
      }
    });

    const totalIDR = totalStocksIDR + totalCryptoIDR + totalGoldIDR + totalCashIDR;
    const totalUSD = totalStocksUSD + totalCryptoUSD + totalGoldUSD + totalCashUSD;

    avgDayChange = totalAssetsWithChange > 0 ? avgDayChange / totalAssetsWithChange : 0;

    return {
      totalIDR: Math.round(totalIDR),
      totalUSD: totalUSD,
      totalStocksIDR,
      totalStocksUSD,
      totalCryptoIDR,
      totalCryptoUSD,
      totalGoldIDR,
      totalGoldUSD,
      totalCashIDR,
      totalCashUSD,
      stocksPercent: totalIDR > 0 ? (totalStocksIDR / totalIDR) * 100 : 0,
      cryptoPercent: totalIDR > 0 ? (totalCryptoIDR / totalIDR) * 100 : 0,
      goldPercent: totalIDR > 0 ? (totalGoldIDR / totalIDR) * 100 : 0,
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
    let goldGainIDR = 0;
    let goldGainUSD = 0;
    let totalCostIDR = 0;
    let totalCostUSD = 0;

    const safeExchangeRate = exchangeRate || 0;

    // Stocks
    (assets?.stocks || []).forEach(stock => {
      const normalizedTicker = (stock.ticker || '').toUpperCase();
      const tickerKey = stock.market === 'US' ? normalizedTicker : `${normalizedTicker}.JK`;

      // For manual assets, use manualPrice/price/avgPrice as current price
      let currentPrice;
      if ((stock.useManualPrice || stock.isManual) && (stock.manualPrice || stock.price || stock.avgPrice)) {
        currentPrice = stock.manualPrice || stock.price || stock.avgPrice;
      } else {
        currentPrice = (prices ? prices[tickerKey]?.price : null) || stock.currentPrice || 0;
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
      const symbolKey = (crypto.symbol || '').toUpperCase();
      // For manual assets, use manualPrice/price/avgPrice as current price
      let currentPrice;
      if ((crypto.useManualPrice || crypto.isManual) && (crypto.manualPrice || crypto.price || crypto.avgPrice)) {
        currentPrice = crypto.manualPrice || crypto.price || crypto.avgPrice;
      } else {
        currentPrice = (prices ? prices[symbolKey]?.price : null) || crypto.currentPrice || 0;
      }

      const amount = parseFloat(crypto.amount) || 0;
      const currentValue = currentPrice * amount;
      const costBasis = (parseFloat(crypto.avgPrice) || 0) * amount;

      const gain = currentValue - costBasis;
      cryptoGainUSD += gain;
      cryptoGainIDR += gain * safeExchangeRate;
      totalCostUSD += costBasis;
    });

    // Gold
    (assets?.gold || []).forEach(gold => {
      const price = gold.currentPrice || 0;
      // [FIX] Use gold.amount (consistent with portfolioStateManager), not gold.weight
      const amount = parseFloat(gold.amount) || 0;

      const currentValue = price * amount;
      const costBasis = (parseFloat(gold.avgPrice) || 0) * amount;

      const gain = currentValue - costBasis;
      goldGainIDR += gain;
      totalCostIDR += costBasis;

      if (safeExchangeRate > 0) {
        goldGainUSD += gain / safeExchangeRate;
      }
    });

    const totalGainIDR = stocksGainIDR + cryptoGainIDR + goldGainIDR;
    const totalGainUSD = stocksGainUSD + cryptoGainUSD + goldGainUSD;

    // Total Cost normalized to IDR for % calc
    const totalCostNormalizedIDR = totalCostIDR + (totalCostUSD * safeExchangeRate);
    // Total Cost normalized to USD for display
    const totalCostNormalizedUSD = totalCostUSD + (safeExchangeRate > 0 ? totalCostIDR / safeExchangeRate : 0);

    return {
      totalStockGainIDR: stocksGainIDR,
      totalStockGainUSD: stocksGainUSD,
      totalCryptoGainIDR: cryptoGainIDR,
      totalCryptoGainUSD: cryptoGainUSD,
      goldGainIDR: goldGainIDR,
      goldGainUSD: goldGainUSD,
      totalGainIDR,
      totalGainUSD,
      totalCost: totalCostNormalizedIDR,
      totalCostUSD: totalCostNormalizedUSD,
      gainPercent: totalCostNormalizedIDR > 0 ? (totalGainIDR / totalCostNormalizedIDR) * 100 : 0,
      stocksGainPercent: totalCostIDR > 0 ? (stocksGainIDR / totalCostIDR) * 100 : 0,
      cryptoGainPercent: totalCostUSD > 0 ? (cryptoGainUSD / totalCostUSD) * 100 : 0,
      goldGainPercent: totalCostIDR > 0 ? (goldGainIDR / totalCostIDR) * 100 : 0
    };
  }, [assets, prices, exchangeRate]);

  // Stablecoin (USDT & USDC) Analytics & Breakdown
  const stablecoinData = useMemo(() => {
    let usdtAmount = 0;
    let usdtValUSD = 0;
    let usdtValIDR = 0;
    let usdtCostUSD = 0;
    let usdtCostIDR = 0;
    let usdtCount = 0;

    let usdcAmount = 0;
    let usdcValUSD = 0;
    let usdcValIDR = 0;
    let usdcCostUSD = 0;
    let usdcCostIDR = 0;
    let usdcCount = 0;

    const safeExchangeRate = exchangeRate || 0;

    (assets?.crypto || []).forEach(crypto => {
      const sym = (crypto.symbol || '').toUpperCase().trim();
      if (sym !== 'USDT' && sym !== 'USDC') return;

      const amount = parseFloat(crypto.amount) || 0;
      if (amount <= 0 && !crypto.isManual) return;

      let price;
      if ((crypto.useManualPrice || crypto.isManual) && (crypto.manualPrice || crypto.price || crypto.avgPrice)) {
        price = parseFloat(crypto.manualPrice || crypto.price || crypto.avgPrice) || 0;
      } else {
        price = (prices ? prices[sym]?.price : null) || crypto.currentPrice || 1.0;
      }

      const valUSD = price * amount;
      const valIDR = valUSD * safeExchangeRate;
      const costBasisUSD = (parseFloat(crypto.avgPrice) || 1.0) * amount;
      const costBasisIDR = costBasisUSD * safeExchangeRate;

      if (sym === 'USDT') {
        usdtAmount += amount;
        usdtValUSD += valUSD;
        usdtValIDR += valIDR;
        usdtCostUSD += costBasisUSD;
        usdtCostIDR += costBasisIDR;
        usdtCount++;
      } else if (sym === 'USDC') {
        usdcAmount += amount;
        usdcValUSD += valUSD;
        usdcValIDR += valIDR;
        usdcCostUSD += costBasisUSD;
        usdcCostIDR += costBasisIDR;
        usdcCount++;
      }
    });

    const combinedAmount = usdtAmount + usdcAmount;
    const combinedValUSD = usdtValUSD + usdcValUSD;
    const combinedValIDR = usdtValIDR + usdcValIDR;
    const combinedCostUSD = usdtCostUSD + usdcCostUSD;
    const combinedCostIDR = usdtCostIDR + usdcCostIDR;
    const combinedCount = usdtCount + usdcCount;

    // Gains & Profits
    const usdtGainUSD = usdtValUSD - usdtCostUSD;
    const usdtGainIDR = usdtValIDR - usdtCostIDR;
    const usdtGainPercent = usdtCostUSD > 0 ? (usdtGainUSD / usdtCostUSD) * 100 : 0;

    const usdcGainUSD = usdcValUSD - usdcCostUSD;
    const usdcGainIDR = usdcValIDR - usdcCostIDR;
    const usdcGainPercent = usdcCostUSD > 0 ? (usdcGainUSD / usdcCostUSD) * 100 : 0;

    const combinedGainUSD = combinedValUSD - combinedCostUSD;
    const combinedGainIDR = combinedValIDR - combinedCostIDR;
    const combinedGainPercent = combinedCostUSD > 0 ? (combinedGainUSD / combinedCostUSD) * 100 : 0;

    // Relative to Total Crypto
    const totalCryptoUSD = totals.totalCryptoUSD || 0;
    const combinedPercentOfCrypto = totalCryptoUSD > 0 ? (combinedValUSD / totalCryptoUSD) * 100 : 0;
    const usdtPercentOfCrypto = totalCryptoUSD > 0 ? (usdtValUSD / totalCryptoUSD) * 100 : 0;
    const usdcPercentOfCrypto = totalCryptoUSD > 0 ? (usdcValUSD / totalCryptoUSD) * 100 : 0;

    return {
      usdt: {
        amount: usdtAmount,
        valUSD: usdtValUSD,
        valIDR: usdtValIDR,
        gainUSD: usdtGainUSD,
        gainIDR: usdtGainIDR,
        gainPercent: usdtGainPercent,
        count: usdtCount,
        percentOfCrypto: usdtPercentOfCrypto
      },
      usdc: {
        amount: usdcAmount,
        valUSD: usdcValUSD,
        valIDR: usdcValIDR,
        gainUSD: usdcGainUSD,
        gainIDR: usdcGainIDR,
        gainPercent: usdcGainPercent,
        count: usdcCount,
        percentOfCrypto: usdcPercentOfCrypto
      },
      combined: {
        amount: combinedAmount,
        valUSD: combinedValUSD,
        valIDR: combinedValIDR,
        costUSD: combinedCostUSD,
        costIDR: combinedCostIDR,
        gainUSD: combinedGainUSD,
        gainIDR: combinedGainIDR,
        gainPercent: combinedGainPercent,
        count: combinedCount,
        percentOfCrypto: combinedPercentOfCrypto
      },
      hasStablecoins: combinedCount > 0
    };
  }, [assets, prices, exchangeRate, totals.totalCryptoUSD]);

  // Invested Capital Breakdown (Active Volatile vs Standby Stablecoin)
  const investedBreakdown = useMemo(() => {
    const totalCost = gains.totalCost || 0;
    const totalCostUSD = gains.totalCostUSD || 0;
    const safeExchangeRate = exchangeRate || 0;

    const stablecoinCostUSD = stablecoinData.combined.costUSD > 0
      ? stablecoinData.combined.costUSD
      : stablecoinData.combined.valUSD;

    const stablecoinCostIDR = (stablecoinData.combined.costIDR > 0)
      ? stablecoinData.combined.costIDR
      : (stablecoinCostUSD * safeExchangeRate);

    // Modal Invested tanpa USDT dan USDC
    const activeCostIDR = Math.max(0, totalCost - stablecoinCostIDR);
    const activeCostUSD = Math.max(0, totalCostUSD - stablecoinCostUSD);

    // Nilai Aset Invested tanpa USDT dan USDC
    const activeValIDR = Math.max(0, activeCostIDR + (gains.totalGainIDR || 0));
    const activeValUSD = Math.max(0, activeCostUSD + (gains.totalGainUSD || 0));

    // Return Modal Aktif (%)
    const activeReturnPercent = activeCostIDR > 0 ? ((gains.totalGainIDR || 0) / activeCostIDR) * 100 : 0;

    const activePercent = totalCost > 0 ? (activeCostIDR / totalCost) * 100 : 0;
    const stablecoinPercent = totalCost > 0 ? (stablecoinCostIDR / totalCost) * 100 : 0;

    return {
      activeCostIDR,
      activeCostUSD,
      activeValIDR,
      activeValUSD,
      activeReturnPercent,
      activePercent,
      stablecoinCostIDR,
      stablecoinCostUSD,
      stablecoinPercent,
      hasStablecoins: stablecoinData.hasStablecoins,
      usdtUSD: stablecoinData.usdt.valUSD,
      usdcUSD: stablecoinData.usdc.valUSD
    };
  }, [gains.totalCost, gains.totalCostUSD, gains.totalGainIDR, gains.totalGainUSD, exchangeRate, stablecoinData]);

  // Selected Invested Metrics based on investedMode ('all' vs 'active')
  const isInvestedActiveMode = investedMode === 'active' && stablecoinData.hasStablecoins;
  const displayedCostIDR = isInvestedActiveMode ? investedBreakdown.activeCostIDR : (gains.totalCost || 0);
  const displayedCostUSD = isInvestedActiveMode ? investedBreakdown.activeCostUSD : (gains.totalCostUSD || 0);

  // Nilai pasar khusus aset invested (saham, kripto, emas - tanpa saldo kas bank) setelah kena profit/loss
  const currentInvestedValIDR = Math.max(0, (gains.totalCost || 0) + (gains.totalGainIDR || 0));
  const currentInvestedValUSD = Math.max(0, (gains.totalCostUSD || 0) + (gains.totalGainUSD || 0));
  const displayedInvestedValIDR = isInvestedActiveMode ? investedBreakdown.activeValIDR : currentInvestedValIDR;
  const displayedInvestedValUSD = isInvestedActiveMode ? investedBreakdown.activeValUSD : currentInvestedValUSD;

  // Total Portofolio Waktu Utuh sebelum kena profit/loss (Modal Invested + Saldo Kas Bank)
  const initialPortoIDR = (gains.totalCost || 0) + (totals.totalCashIDR || 0);
  const initialPortoUSD = (gains.totalCostUSD || 0) + (totals.totalCashUSD || 0);

  const displayedValIDR = displayedInvestedValIDR;
  const displayedValUSD = displayedInvestedValUSD;
  const displayedReturnPercent = isInvestedActiveMode ? investedBreakdown.activeReturnPercent : (gains.gainPercent || 0);

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
      gold: (assets?.gold || []).filter(filterItem),
      cash: (assets?.cash || []).filter(filterItem)
    };
  }, [assets, searchQuery]);

  const displayedCryptoAssets = useMemo(() => {
    const list = filteredAssets.crypto || [];
    if (cryptoTableFilter === 'combined') {
      return list.filter(c => {
        const s = (c.symbol || '').toUpperCase().trim();
        return s === 'USDT' || s === 'USDC';
      });
    }
    if (cryptoTableFilter === 'usdt') {
      return list.filter(c => (c.symbol || '').toUpperCase().trim() === 'USDT');
    }
    if (cryptoTableFilter === 'usdc') {
      return list.filter(c => (c.symbol || '').toUpperCase().trim() === 'USDC');
    }
    return list;
  }, [filteredAssets.crypto, cryptoTableFilter]);

  const uniqueFilteredCounts = useMemo(() => ({
    stocks: new Set((filteredAssets.stocks || []).map(s => (s.ticker || '').toUpperCase())).size,
    crypto: new Set((filteredAssets.crypto || []).map(c => (c.symbol || '').toUpperCase())).size,
    gold: new Set((filteredAssets.gold || []).map(g => (g.ticker || '').toUpperCase())).size,
    cash: new Set((filteredAssets.cash || []).map(c => (c.ticker || '').toUpperCase())).size
  }), [filteredAssets]);

  const baseCopyToWhatsApp = () => {
    try {
      const text = portoRecap(assets, exchangeRate, prices).trim();

      navigator.clipboard.writeText(text);
      setNotification({ type: 'success', title: t('copied') || 'Tersalin', message: 'Rekap berhasil disalin ke clipboard' });

      // Check for Mobile
      const isMobile = window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        window.location.assign(`whatsapp://send?text=${encodeURIComponent(text)}`);
      }

    } catch (error) {
      secureLogger.error('Copy WhatsApp Failed:', error);
      setNotification({ type: 'error', title: t('failed') || 'Gagal', message: 'Gagal menyalin rekap.' });
    }
  };

  const copyToWhatsApp = priceCheckWrapper ? priceCheckWrapper(baseCopyToWhatsApp, 'Copy WhatsApp') : baseCopyToWhatsApp;


  const baseExportPortfolioToCSV = (category = 'all', e) => {
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
      csvRows.push(['Total Portfolio Value (IDR)', formatIDR(totals.totalIDR)]);
      csvRows.push(['Total Portfolio Value (USD)', formatUSD(totals.totalUSD)]);
      csvRows.push(['Modal Awal + Kas Sebelum P/L (Porto Utuh)', `${formatIDR(initialPortoIDR)} (${formatUSD(initialPortoUSD)})`]);
      csvRows.push(['Modal Beli Investasi (Termasuk Stablecoin)', `${formatIDR(gains.totalCost)} (${formatUSD(gains.totalCostUSD)})`]);
      csvRows.push(['   - Return Modal Total', `${(gains.gainPercent || 0).toFixed(2)}%`]);
      csvRows.push(['Modal Beli Aktif (Tanpa Stablecoin)', `${formatIDR(investedBreakdown.activeCostIDR)} (${formatUSD(investedBreakdown.activeCostUSD)})`]);
      csvRows.push(['   - Return Modal Aktif', `${(investedBreakdown.activeReturnPercent || 0).toFixed(2)}%`]);
      csvRows.push(['Standby Stablecoin (Kas USD)', `${formatUSD(investedBreakdown.stablecoinCostUSD)} (~${formatIDR(investedBreakdown.stablecoinCostIDR)})`]);
      csvRows.push(['Total Untung/Rugi (P&L)', `${formatIDR(gains.totalGainIDR)} (${formatUSD(gains.totalGainUSD)})`]);
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
        'Total Cost (USD)',
        'Market Value (IDR)',
        'Market Value (USD)',
        'Gain/Loss (IDR)',
        'Gain/Loss (USD)',
        'Performance (%)'
      ];
      csvRows.push(headers);

      const escape = (str) => {
        if (str === null || str === undefined) return '""';
        let s = String(str);
        if (s.startsWith('=')) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
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

          // Calculate IDR and USD values for uniformity
          let costIDR = 0, costUSD = 0, valueIDR = 0, valueUSD = 0, gainIDR = 0, gainUSD = 0;

          if (isUS) {
            const shares = stock.lots;
            valueUSD = (stock.currentPrice * shares);
            valueIDR = valueUSD * exchangeRate;
            costUSD = (stock.avgPrice * shares);
            costIDR = costUSD * exchangeRate;
            gainUSD = valueUSD - costUSD;
            gainIDR = valueIDR - costIDR;
          } else {
            const shares = stock.lots * 100;
            valueIDR = (stock.currentPrice * shares);
            valueUSD = valueIDR / (exchangeRate || 14000);
            costIDR = stock.avgPrice * shares;
            costUSD = costIDR / (exchangeRate || 14000);
            gainIDR = valueIDR - costIDR;
            gainUSD = valueUSD - costUSD;
          }

          csvRows.push([
            'Stock ' + (isUS ? '(US)' : '(IDX)'),
            stock.ticker,
            stock.broker || '-',
            stock.lots,
            avgPriceLabel,
            currPriceLabel,
            formatIDR(costIDR),
            formatUSD(costUSD),
            formatIDR(valueIDR),
            formatUSD(valueUSD),
            formatIDR(gainIDR),
            formatUSD(gainUSD),
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
          const gainUSD = valueUSD - costUSD;
          const gainIDR = valueIDR - costIDR;

          const sym = (crypto.symbol || '').toUpperCase().trim();
          const isStablecoin = sym === 'USDT' || sym === 'USDC';

          csvRows.push([
            isStablecoin ? 'Crypto (Stablecoin)' : 'Crypto',
            crypto.symbol,
            crypto.exchange || '-',
            crypto.amount,
            formatUSD(crypto.avgPrice),
            formatUSD(crypto.currentPrice),
            formatIDR(costIDR),
            formatUSD(costUSD),
            formatIDR(valueIDR),
            formatUSD(valueUSD),
            formatIDR(gainIDR),
            formatUSD(gainUSD),
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
            formatUSD(valUSD),
            formatIDR(valIDR),
            formatUSD(valUSD),
            formatIDR(0),
            formatUSD(0),
            '0%'
          ]);
        });
      }

      // Process Gold
      if ((category === 'all' || category === 'gold') && assets?.gold) {
        assets.gold.forEach(gold => {
          const valueIDR = gold.portoIDR || (gold.currentPrice * gold.amount);
          const valueUSD = valueIDR / (exchangeRate || 1);
          const costIDR = gold.totalCostIDR || (gold.avgPrice * gold.amount);
          const costUSD = costIDR / (exchangeRate || 1);
          const gainIDR = valueIDR - costIDR;
          const gainUSD = valueUSD - costUSD;

          // Refined label logic for CSV
          const label = gold.subtype === 'digital' ? (gold.broker || 'Digital') : (gold.brand || 'Physical');

          csvRows.push([
            `Gold (${label})`,
            gold.ticker || 'GOLD', // Name/Ticker
            gold.broker || '-',
            `${gold.amount} gram`, // Quantity
            formatIDR(gold.avgPrice), // Avg Price
            formatIDR(gold.currentPrice), // Curr Price
            formatIDR(costIDR), // Cost IDR
            formatUSD(costUSD), // Cost USD
            formatIDR(valueIDR),
            formatUSD(valueUSD),
            formatIDR(gainIDR),
            formatUSD(gainUSD),
            (gold.gainPercentage || 0).toFixed(2) + '%'
          ]);
        });
      }

      // Summary section with both Version 1 (Total Invested) and Version 2 (Modal Aktif tanpa Stablecoin)
      if (category === 'all') {
        csvRows.push([]);
        csvRows.push(['=== RINGKASAN PORTOFOLIO / PORTFOLIO SUMMARY ===']);
        csvRows.push(['Total Portofolio (Market Value)', formatIDR(totals.totalIDR), formatUSD(totals.totalUSD)]);
        csvRows.push(['Total Portofolio Utuh Sebelum P/L (Modal + Kas)', formatIDR(initialPortoIDR), formatUSD(initialPortoUSD)]);
        csvRows.push(['Versi 1: Total Modal Invested (Termasuk USDT & USDC)', formatIDR(gains.totalCost), formatUSD(gains.totalCostUSD), `Return: ${(gains.gainPercent || 0).toFixed(2)}%`]);
        csvRows.push(['Versi 2: Modal Invested Aktif (Tanpa USDT & USDC)', formatIDR(investedBreakdown.activeCostIDR), formatUSD(investedBreakdown.activeCostUSD), `Return Aktif: ${(investedBreakdown.activeReturnPercent || 0).toFixed(2)}%`]);
        csvRows.push(['Standby Stablecoin (USDT + USDC)', formatIDR(investedBreakdown.stablecoinCostIDR), formatUSD(investedBreakdown.stablecoinCostUSD)]);
        csvRows.push(['Saldo Kas / Bank & E-Wallet', formatIDR(totals.totalCashIDR), formatUSD(totals.totalCashUSD)]);
        csvRows.push(['Total Untung / Rugi (P&L)', formatIDR(gains.totalGainIDR), formatUSD(gains.totalGainUSD)]);
      }

      const BOM = '\uFEFF';
      const csvContent = BOM + csvRows.map(row => row.map(escape).join(",")).join("\n");
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

  const exportPortfolioToCSV = priceCheckWrapper ? priceCheckWrapper(baseExportPortfolioToCSV, 'Export Portfolio') : baseExportPortfolioToCSV;

  /* Helper Functions */
  const getMasked = (val, isCurrency = true) => {
    if (hideBalance) return '•••••••';
    return val;
  };

  return (
    <div className="space-y-6 pb-24 font-sans bg-gray-50 dark:bg-[#0d1117] min-h-screen text-gray-900 dark:text-gray-300 p-4 sm:p-6">
      {/* App Header & Live Currency Indicator (Visible on Mobile/Tablet, hidden on Desktop where it is in the navbar) */}
      <div className={`flex lg:hidden flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 transition-all duration-300 ${isHeaderCollapsed ? 'hidden' : 'flex'}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#161b22] rounded-xl text-xs font-mono text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-semibold">1 USD ≈ {getMasked(formatIDR(exchangeRate))}</span>
          </div>
        </div>
      </div>

      {/* Control Panel Bar (Sticky - sticks directly below top navbar, following smoothly on scroll) */}
      {!isHeaderCollapsed && (
        <div className="sticky top-14 sm:top-16 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-gray-50/95 dark:bg-[#0d1117]/95 backdrop-blur-md transition-all">
          <div className="bg-white dark:bg-[#161b22] rounded-2xl p-2.5 sm:p-3 flex flex-col xl:flex-row items-center justify-between gap-2.5 sm:gap-4 border border-gray-200 dark:border-gray-800 shadow-sm">
            {/* Row 1: Category Tabs */}
            <div className="flex items-center gap-2 sm:gap-4 w-full xl:w-auto">
              <div className="flex items-center gap-1.5 w-full xl:w-auto overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="grid grid-cols-5 gap-1 w-full min-w-[320px] md:min-w-0 md:flex md:space-x-1">
                  {['all', 'cash', 'stock', 'crypto', 'gold'].map(tab => {
                    const count = tab === 'all'
                      ? assetCount.stocks + assetCount.crypto + assetCount.gold + assetCount.cash
                      : (tab === 'cash' ? assetCount.cash : (tab === 'stock' ? assetCount.stocks : (tab === 'gold' ? assetCount.gold : assetCount.crypto)));
                    const labels = {
                      all: t('all') || 'Semua',
                      cash: t('bank') || 'Bank',
                      stock: t('stocks') || 'Saham',
                      crypto: t('crypto') || 'Kripto',
                      gold: t('gold') || 'Emas'
                    };
                    const isActive = activeAssetTab === tab;

                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveAssetTab(tab)}
                        className={`
                            px-1.5 py-1.5 sm:px-3 sm:py-2 rounded-xl flex flex-col items-center justify-center transition-all duration-200 w-full md:w-auto md:min-w-[80px]
                            ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200'}
                         `}
                      >
                        <span className="text-[11px] sm:text-xs font-bold truncate w-full text-center">{labels[tab]}</span>
                        <span className="text-[10px] opacity-80">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Row 2: Action Buttons */}
            <div className="flex items-center gap-2 w-full xl:w-auto overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] py-0.5 justify-start xl:justify-end shrink-0">
              {/* Refresh */}
              <button onClick={handleRefresh} className="h-9 w-9 sm:h-10 sm:w-10 bg-gray-100 dark:bg-[#0d1117] hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl flex items-center justify-center text-gray-500 dark:text-gray-400 transition-all border border-gray-200 dark:border-gray-800 hover:scale-105 active:scale-95 flex-shrink-0" title="Refresh">
                <FiRefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${debouncedLoading ? "animate-spin text-blue-500" : ""}`} />
              </button>

              {/* Action buttons group */}
              {/* Export */}
              <button onClick={(e) => exportPortfolioToCSV('all', e)} className="h-9 sm:h-10 bg-gray-100 dark:bg-[#1f2937] hover:bg-gray-200 dark:hover:bg-[#374151] text-emerald-600 dark:text-emerald-400 px-2.5 sm:px-3 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all border border-gray-200 dark:border-gray-700 hover:scale-105 active:scale-95 flex-shrink-0">
                <FiDownload className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">{t('exportPortfolio') || 'Ekspor'}</span>
              </button>

              {/* WA */}
              <button onClick={copyToWhatsApp} className="h-9 sm:h-10 bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 flex-shrink-0">
                <FaWhatsapp className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('copy') || (language === 'en' ? 'Copy' : 'Salin')}</span>
              </button>

              {/* Snap */}
              <button onClick={() => onSnap && onSnap()} className="h-9 sm:h-10 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 px-2.5 sm:px-3 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all border border-indigo-200 dark:border-indigo-800/30 hover:scale-105 active:scale-95 flex-shrink-0" title={t('snap') || 'Snap'}>
                <FiCamera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('snap') || 'Snap'}</span>
              </button>

              {/* Settings */}
              <button onClick={onOpenSettings} className="h-9 sm:h-10 bg-gray-100 dark:bg-[#0d1117] hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all border border-gray-200 dark:border-gray-800 hover:scale-105 active:scale-95 flex-shrink-0">
                <FiSettings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('settings') || 'Settings'}</span>
              </button>

              {/* Add */}
              <button onClick={() => onAddAsset && onAddAsset()} className="h-9 sm:h-10 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95 flex-shrink-0">
                <FiPlusCircle className="w-3.5 h-3.5" />
                <span>{t('add') || 'Tambah'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards Grid & Profit/Loss Banner (Collapsible via isHeaderCollapsed) */}
      {!isHeaderCollapsed && (
        <div className="space-y-6 transition-all duration-300">
          {/* Summary Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">

        {/* 1. Total Portfolio */}
        <div className="bg-white dark:bg-[#161b22] rounded-2xl p-5 border border-gray-200 dark:border-gray-800 relative group shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-gray-500 text-xs font-semibold tracking-wide">{t('totalPortfolio') || 'Total Portfolio'}</span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-[#1f2937] flex items-center justify-center text-blue-600 dark:text-blue-400">
                <FiDollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-1 mb-3">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                {getMasked(formatIDR(totals.totalIDR))}
              </h2>
              <p className="text-xs text-gray-500 font-mono">
                {getMasked(formatUSD(totals.totalUSD))}
              </p>
            </div>
            {/* Modal Awal + Kas (Sebelum P/L) */}
            <div
              className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800/80"
              title={t('initialPortoDesc') || (language === 'en' ? 'Total net worth before gains/losses (Invested Capital + Cash Balance)' : 'Total seluruh kekayaan waktu uang masih utuh sebelum kena profit/loss (Modal Investasi + Saldo Kas Bank)')}
            >
              <span className="font-medium text-gray-600 dark:text-gray-300">{t('initialPorto') || (language === 'en' ? 'Initial Capital + Cash' : 'Modal Awal + Kas')}:</span>
              <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                {getMasked(formatIDR(initialPortoIDR))}
              </span>
              <button
                type="button"
                onClick={() => setIsMetricsGuideOpen(true)}
                className="text-gray-400 hover:text-blue-500 transition-colors p-0.5"
                title={t('metricsGuideTitle') || (language === 'en' ? 'Metrics & Calculation Guide' : 'Panduan Hitungan Metrik')}
                aria-label="Metrics Guide"
              >
                <FiInfo className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 rounded-full overflow-hidden mt-3">
              <div style={{ width: '100%' }} className="bg-blue-500 h-full rounded-full"></div>
            </div>
            <p className="text-[10px] text-gray-500 mt-2">100% {t('fromPortfolio') || 'dari portfolio'}</p>
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
              {(() => {
                const roundedStockGain = Math.round(gains.totalStockGainIDR);
                return (
                  <>
                    <span className={roundedStockGain > 0 ? 'text-emerald-600 dark:text-emerald-400' : roundedStockGain < 0 ? 'text-rose-600 dark:text-rose-500' : 'text-gray-500 dark:text-gray-400'}>
                      {roundedStockGain > 0 ? '+' : ''}{getMasked(formatIDR(gains.totalStockGainIDR))}
                    </span>
                    <span className={roundedStockGain > 0 ? 'text-emerald-600 dark:text-emerald-400' : roundedStockGain < 0 ? 'text-rose-600 dark:text-rose-500' : 'text-gray-500 dark:text-gray-400'}>
                      ({getMasked(gains.stocksGainPercent.toFixed(1))}%)
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 rounded-full overflow-hidden mt-3">
            <div style={{ width: `${totals.stocksPercent}%` }} className="bg-blue-500 h-full rounded-full"></div>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">{hideBalance ? '•••' : totals.stocksPercent.toFixed(1)}% {t('fromPortfolio')}</p>
        </div>

        {/* 4. Kripto */}
        <div className="bg-white dark:bg-[#161b22] rounded-2xl p-5 border border-gray-200 dark:border-gray-800 relative group shadow-sm flex flex-col justify-between">
          <div>
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
                {(() => {
                  const roundedCryptoGain = Math.round(gains.totalCryptoGainIDR);
                  return (
                    <>
                      <span className={roundedCryptoGain > 0 ? 'text-emerald-600 dark:text-emerald-400' : roundedCryptoGain < 0 ? 'text-rose-600 dark:text-rose-500' : 'text-gray-500 dark:text-gray-400'}>
                        {roundedCryptoGain > 0 ? '+' : ''}{getMasked(formatIDR(gains.totalCryptoGainIDR))}
                      </span>
                      <span className={roundedCryptoGain > 0 ? 'text-emerald-600 dark:text-emerald-400' : roundedCryptoGain < 0 ? 'text-rose-600 dark:text-rose-500' : 'text-gray-500 dark:text-gray-400'}>
                        ({getMasked(gains.cryptoGainPercent.toFixed(1))}%)
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 rounded-full overflow-hidden mt-3">
              <div style={{ width: `${totals.cryptoPercent}%` }} className="bg-purple-500 h-full rounded-full"></div>
            </div>
            <p className="text-[10px] text-gray-500 mt-2">{hideBalance ? '•••' : totals.cryptoPercent.toFixed(1)}% {t('fromPortfolio')}</p>
          </div>

          {/* Clean, Non-Intrusive Stablecoin Summary Row */}
          {stablecoinData.hasStablecoins && (
            <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-800/80 flex items-center justify-between text-[11px]">
              <span className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                Stablecoin:
              </span>
              <div
                className="text-right font-mono"
                title={`USDT: ${formatUSD(stablecoinData.usdt.valUSD)} (~${formatIDR(stablecoinData.usdt.valIDR)}) | USDC: ${formatUSD(stablecoinData.usdc.valUSD)} (~${formatIDR(stablecoinData.usdc.valIDR)})`}
              >
                <div className="font-semibold text-gray-800 dark:text-gray-200 text-[11px] leading-tight">
                  {getMasked(formatIDR(stablecoinData.combined.valIDR))}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                  {getMasked(formatUSD(stablecoinData.combined.valUSD))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 5. Emas */}
        <div className="bg-white dark:bg-[#161b22] rounded-2xl p-5 border border-gray-200 dark:border-gray-800 relative group shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 text-xs font-semibold tracking-wide">{t('gold') || 'Emas'}</span>
            <div className="w-8 h-8 rounded-lg bg-yellow-100 dark:bg-[#1f2937] flex items-center justify-center text-yellow-600 dark:text-yellow-400">
              <FiDisc className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1 mb-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              {getMasked(formatIDR(totals.totalGoldIDR))}
            </h2>
            <p className="text-xs text-gray-500 font-mono mb-2">
              {getMasked(formatUSD(totals.totalGoldUSD))}
            </p>
            <div className="flex items-center gap-2 text-xs">
              {(() => {
                const roundedGoldGain = Math.round(gains.goldGainIDR);
                return (
                  <span className={roundedGoldGain > 0 ? 'text-emerald-600 dark:text-emerald-400' : roundedGoldGain < 0 ? 'text-rose-600 dark:text-rose-500' : 'text-gray-500 dark:text-gray-400'}>
                    {roundedGoldGain > 0 ? '+' : ''}{getMasked(formatIDR(gains.goldGainIDR))}
                  </span>
                );
              })()}
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-800 h-1 rounded-full overflow-hidden mt-3">
            <div style={{ width: `${totals.goldPercent}%` }} className="bg-yellow-500 h-full rounded-full"></div>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">{hideBalance ? '•••' : totals.goldPercent.toFixed(1)}% {t('fromPortfolio')}</p>
        </div>
      </div>

      {/* BIG P/L Card (Executive Multi-Column Layout) */}
      <div className="bg-white dark:bg-[#161b22] rounded-2xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 relative group shadow-sm mt-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          {/* Column 1: Total Gain/Loss Values + Return Modal Meter */}
          <div className="space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-gray-500 text-xs font-semibold tracking-wide uppercase">{t('totalGainLoss') || 'Total Untung / Rugi'}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  gains.totalGainIDR > 0
                    ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                    : gains.totalGainIDR < 0
                      ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                }`}>
                  {gains.totalGainIDR > 0 ? (t('profitable') || 'Untung') : gains.totalGainIDR < 0 ? (t('loss') || 'Rugi') : (t('flat') || 'Flat')}
                </span>
              </div>
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h2 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                  gains.totalGainIDR > 0 ? 'text-emerald-600 dark:text-emerald-400' : gains.totalGainIDR < 0 ? 'text-rose-600 dark:text-rose-500' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {gains.totalGainIDR > 0 ? '+' : ''}{getMasked(formatIDR(gains.totalGainIDR))}
                </h2>
                <span className="text-xs sm:text-sm font-mono text-gray-500">
                  {getMasked(formatUSD(gains.totalGainUSD))}
                </span>
                <span className={`text-xs sm:text-sm font-bold ${
                  displayedReturnPercent > 0 ? 'text-emerald-600 dark:text-emerald-400' : displayedReturnPercent < 0 ? 'text-rose-600 dark:text-rose-500' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  ({displayedReturnPercent > 0 ? '+' : ''}{getMasked(displayedReturnPercent.toFixed(1))}%)
                </span>
              </div>
            </div>

            {/* Return Modal Progress Bar */}
            <div className="pt-1">
              <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 font-medium mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-600 dark:text-gray-300 font-semibold text-[11px] sm:text-xs">{t('capitalReturn') || (language === 'en' ? 'Capital Return' : 'Return Modal')}</span>
                  <button
                    type="button"
                    onClick={() => setIsMetricsGuideOpen(true)}
                    className="text-gray-400 hover:text-blue-500 transition-colors p-0.5"
                    title={t('metricsGuideTitle') || (language === 'en' ? 'Metrics & Calculation Guide' : 'Panduan Hitungan Metrik')}
                    aria-label="Metrics Guide"
                  >
                    <FiInfo className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="font-mono font-bold text-gray-900 dark:text-white text-xs">
                  {hideBalance ? '•••' : `${Math.abs(displayedReturnPercent).toFixed(1)}%`}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                <div
                  style={{ width: `${Math.min(Math.abs(displayedReturnPercent), 100)}%` }}
                  className={`h-full rounded-full transition-all duration-1000 ${gains.totalGainIDR >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                ></div>
              </div>
            </div>
          </div>

          {/* Column 2: Modal Investasi (Sub-Card with Total / Tanpa Stable Mode & Breakdown) */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gray-50/90 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {isInvestedActiveMode ? (t('activeCapital') || (language === 'en' ? 'Active Capital' : 'Modal Aktif')) : (t('totalInvested') || (language === 'en' ? 'Total Invested' : 'Modal Investasi'))}
                </p>
                {stablecoinData.hasStablecoins && (
                  <button
                    type="button"
                    onClick={() => setIsMetricsGuideOpen(true)}
                    className="text-gray-400 hover:text-blue-500 transition-colors"
                    title={t('guideStableTitle') || (language === 'en' ? 'Why exclude stablecoins?' : 'Kenapa Ada Pilihan Tanpa Stable?')}
                    aria-label="Stablecoin Mode Guide"
                  >
                    <FiHelpCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {stablecoinData.hasStablecoins && (
                <div className="inline-flex p-0.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium shadow-xs">
                  <button
                    type="button"
                    onClick={() => handleSetInvestedMode('all')}
                    className={`px-2.5 py-1 rounded-md transition-all text-xs ${
                      !isInvestedActiveMode
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                    title={language === 'en' ? 'Total: All capital including USDT & USDC' : 'Total: Total modal seluruh aset termasuk USDT & USDC'}
                  >
                    {t('total') || 'Total'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetInvestedMode('active')}
                    className={`px-2.5 py-1 rounded-md transition-all text-xs ${
                      isInvestedActiveMode
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                    title={language === 'en' ? 'Excl. Stable: Active capital taking market risk (excluding standby USDT & USDC)' : 'Tanpa Stable: Modal aktif berisiko pasar (tanpa kas standby USDT & USDC)'}
                  >
                    {t('exclStableShort') || (language === 'en' ? 'Excl. Stable' : 'Tanpa Stable')}
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex items-baseline justify-between">
              <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-white font-mono tracking-tight">
                {getMasked(formatIDR(displayedCostIDR))}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {getMasked(formatUSD(displayedCostUSD))}
              </span>
            </div>

            {stablecoinData.hasStablecoins && (
              <div className="pt-2 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between text-xs font-mono">
                <span className="text-gray-600 dark:text-gray-300 font-medium" title={isInvestedActiveMode ? (language === 'en' ? 'Total capital of all assets' : 'Total Modal seluruh aset') : (language === 'en' ? 'Active capital without USDT/USDC' : 'Modal Aktif tanpa USDT/USDC')}>
                  {isInvestedActiveMode
                    ? `${t('total') || 'Total'}: ${getMasked(formatIDR(gains.totalCost))}`
                    : `${t('active') || (language === 'en' ? 'Active' : 'Aktif')}: ${getMasked(formatIDR(investedBreakdown.activeCostIDR))}`}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium" title={language === 'en' ? 'Standby USDT & USDC (USD Digital Cash)' : 'Kas Dolar Siap Pakai (USDT & USDC)'}>
                  {t('stablecoinCash') || (language === 'en' ? 'USD Cash' : 'Kas Dolar')}: {getMasked(formatUSD(investedBreakdown.stablecoinCostUSD))}
                </span>
              </div>
            )}
          </div>

          {/* Column 3: High-Legibility Comparison Box */}
          <div className="w-full flex flex-col justify-center">
            <div className="p-3.5 sm:p-4 rounded-2xl bg-gray-50/90 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-2.5">
              {/* Row 1: Modal Beli vs Nilai Investasi Sekarang */}
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex flex-col">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-sans">
                    {t('investedCost') || (language === 'en' ? 'Invested Cost' : 'Modal Beli')}
                  </span>
                  <span className="font-bold text-gray-900 dark:text-gray-100 text-xs">
                    {getMasked(formatIDR(displayedCostIDR))}
                  </span>
                </div>
                <span className="text-gray-400 dark:text-gray-500 text-sm font-sans px-1">➔</span>
                <div className="flex flex-col text-right">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-sans">
                    {t('currentValue') || (language === 'en' ? 'Current Value' : 'Nilai Sekarang')}
                  </span>
                  <span className="font-bold text-gray-900 dark:text-gray-100 text-xs">
                    {getMasked(formatIDR(displayedInvestedValIDR))}
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200/60 dark:border-gray-700/60"></div>

              {/* Row 2: Total Portofolio Sebelum vs Sesudah */}
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex flex-col">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-sans flex items-center gap-1">
                    <span>🌱</span>
                    <span>{t('initialPorto') || (language === 'en' ? 'Initial + Cash' : 'Modal Awal + Kas')}</span>
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                    {getMasked(formatIDR(initialPortoIDR))}
                  </span>
                </div>
                <span className="text-gray-400 dark:text-gray-500 text-sm font-sans px-1">➔</span>
                <div className="flex flex-col text-right">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-sans">
                    {t('currentPorto') || (language === 'en' ? 'Current Portfolio' : 'Porto Sekarang')}
                  </span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 text-xs">
                    {getMasked(formatIDR(totals.totalIDR))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )}



      {/* Floating Price Loading Indicator (Docked to Bottom-Right, Non-Intrusive) */}
      {debouncedLoading && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-50 animate-fade-in">
          <div className="bg-blue-600/95 backdrop-blur-md text-white px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 border border-blue-400/30 text-xs font-semibold">
            <FiRefreshCw className="animate-spin w-3.5 h-3.5 text-blue-200" />
            <span>{t('updatingPrices') || 'Sedang memperbarui harga...'}</span>
          </div>
        </div>
      )}

      {/* Active Search Filter Banner */}
      {searchQuery && (
        <div className="flex items-center justify-between p-3 sm:p-3.5 bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-2xl text-xs sm:text-sm text-blue-900 dark:text-blue-200 shadow-sm animate-fade-in-up">
          <div className="flex items-center gap-2 truncate">
            <FiSearch className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">
              {t('searchingFor') || 'Menampilkan hasil untuk'}: <strong className="font-semibold text-blue-600 dark:text-blue-400">&ldquo;{searchQuery}&rdquo;</strong>
            </span>
          </div>
          <button
            onClick={() => setSearchQuery('')}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 bg-white dark:bg-[#161b22] border border-blue-200 dark:border-blue-800 rounded-lg transition-all shrink-0 hover:scale-105 active:scale-95 shadow-sm"
            title={t('clear') || 'Hapus'}
          >
            <FiX className="w-3.5 h-3.5" />
            <span>{t('clear') || 'Hapus'}</span>
          </button>
        </div>
      )}

      {/* Asset Tables */}
      <div className="space-y-8">
        {(activeAssetTab === 'all' || activeAssetTab === 'cash') && filteredAssets.cash.length > 0 && (
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-2 mb-4 px-2 justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {t('bankAndWallet') || 'Bank & E-Wallet'}
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-[#161b22] px-2 py-1 rounded-full">
                  {uniqueFilteredCounts.cash} {uniqueFilteredCounts.cash === 1 ? (t('asset') || 'Asset') : (t('assets') || (language === 'en' ? 'Assets' : 'Aset'))}
                </span>
              </h3>
              <button onClick={(e) => exportPortfolioToCSV('cash', e)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-blue-600 transition-colors" title={t('exportBankData') || (language === 'en' ? 'Export Bank Data' : 'Ekspor Data Bank')}>
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
              onPriceRefreshNeeded={onRefreshPrices}
            />
          </div>
        )}

        {(activeAssetTab === 'all' || activeAssetTab === 'stock') && filteredAssets.stocks.length > 0 && (
          <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-2 mb-4 px-2 justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {t('stocks') || 'Saham'}
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-[#161b22] px-2 py-1 rounded-full">
                  {uniqueFilteredCounts.stocks} {uniqueFilteredCounts.stocks === 1 ? (t('asset') || 'Asset') : (t('assets') || (language === 'en' ? 'Assets' : 'Aset'))}
                </span>
              </h3>
              <button onClick={(e) => exportPortfolioToCSV('stock', e)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-blue-600 transition-colors" title={t('exportStocks') || (language === 'en' ? 'Export Stocks' : 'Ekspor Saham')}>
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
              onPriceRefreshNeeded={onRefreshPrices}
            />
          </div>
        )}

        {(activeAssetTab === 'all' || activeAssetTab === 'crypto') && filteredAssets.crypto.length > 0 && (
          <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            {/* Stablecoin Executive Breakdown Hub (Full width, interactive 3-card stats) */}
            {stablecoinData.hasStablecoins && (
              <div className="mb-4 bg-white dark:bg-[#161b22] rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2.5 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                      {t('stablecoinSummary') || (language === 'en' ? 'Stablecoin Summary (USDT & USDC)' : 'Ringkasan Stablecoin (USDT & USDC)')}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-[#0d1117] rounded-xl border border-gray-200/60 dark:border-gray-800/80 text-xs">
                    {[
                      { id: 'all', label: t('allCrypto') || (language === 'en' ? 'All Crypto' : 'Semua Kripto') },
                      { id: 'combined', label: 'USDT+USDC' },
                      { id: 'usdt', label: 'USDT' },
                      { id: 'usdc', label: 'USDC' },
                    ].map(st => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setCryptoTableFilter(st.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                          cryptoTableFilter === st.id
                            ? (st.id === 'all'
                                ? 'bg-purple-600 text-white shadow-sm'
                                : st.id === 'combined'
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : st.id === 'usdt'
                                    ? 'bg-teal-600 text-white shadow-sm'
                                    : 'bg-blue-600 text-white shadow-sm')
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-white dark:hover:bg-gray-800'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Card 1: Gabungan */}
                  <div
                    onClick={() => setCryptoTableFilter(cryptoTableFilter === 'combined' ? 'all' : 'combined')}
                    className={`cursor-pointer p-3 rounded-xl border transition-all ${
                      cryptoTableFilter === 'combined'
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500 shadow-sm'
                        : 'bg-gray-50 dark:bg-[#0d1117] border-gray-200/70 dark:border-gray-800 hover:border-emerald-300 dark:hover:border-emerald-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-gray-500 dark:text-gray-400">Total USDT + USDC</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                        {stablecoinData.combined.percentOfCrypto.toFixed(0)}% {t('crypto') || (language === 'en' ? 'Crypto' : 'Kripto')}
                      </span>
                    </div>
                    <div className="text-base font-bold text-gray-900 dark:text-white">
                      {getMasked(formatUSD(stablecoinData.combined.valUSD))}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      {getMasked(formatIDR(stablecoinData.combined.valIDR))}
                    </div>
                  </div>

                  {/* Card 2: Tether USDT */}
                  <div
                    onClick={() => setCryptoTableFilter(cryptoTableFilter === 'usdt' ? 'all' : 'usdt')}
                    className={`cursor-pointer p-3 rounded-xl border transition-all ${
                      cryptoTableFilter === 'usdt'
                        ? 'bg-teal-50/70 dark:bg-teal-950/30 border-teal-500 shadow-sm'
                        : 'bg-gray-50 dark:bg-[#0d1117] border-gray-200/70 dark:border-gray-800 hover:border-teal-300 dark:hover:border-teal-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-gray-500 dark:text-gray-400">Tether (USDT)</span>
                      <span className="text-[10px] text-gray-400">{stablecoinData.usdt.count} {t('accounts') || (language === 'en' ? 'Accounts' : 'Akun')}</span>
                    </div>
                    <div className="text-base font-bold text-teal-600 dark:text-teal-400">
                      {getMasked(formatUSD(stablecoinData.usdt.valUSD))}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      {getMasked(formatIDR(stablecoinData.usdt.valIDR))}
                    </div>
                  </div>

                  {/* Card 3: USD Coin USDC */}
                  <div
                    onClick={() => setCryptoTableFilter(cryptoTableFilter === 'usdc' ? 'all' : 'usdc')}
                    className={`cursor-pointer p-3 rounded-xl border transition-all ${
                      cryptoTableFilter === 'usdc'
                        ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-500 shadow-sm'
                        : 'bg-gray-50 dark:bg-[#0d1117] border-gray-200/70 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-gray-500 dark:text-gray-400">USD Coin (USDC)</span>
                      <span className="text-[10px] text-gray-400">{stablecoinData.usdc.count} {t('accounts') || (language === 'en' ? 'Accounts' : 'Akun')}</span>
                    </div>
                    <div className="text-base font-bold text-blue-600 dark:text-blue-400">
                      {getMasked(formatUSD(stablecoinData.usdc.valUSD))}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      {getMasked(formatIDR(stablecoinData.usdc.valIDR))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4 px-2 justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {t('crypto') || 'Kripto'}
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-[#161b22] px-2 py-1 rounded-full">
                    {displayedCryptoAssets.length} {displayedCryptoAssets.length === 1 ? (t('asset') || 'Asset') : (t('assets') || (language === 'en' ? 'Assets' : 'Aset'))}
                  </span>
                </h3>
              </div>

              <button onClick={(e) => exportPortfolioToCSV('crypto', e)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-blue-600 transition-colors self-end sm:self-auto" title={t('exportCrypto') || (language === 'en' ? 'Export Crypto' : 'Ekspor Kripto')}>
                <FiDownload className="w-4 h-4" />
              </button>
            </div>

            {displayedCryptoAssets.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#161b22] rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-500">Tidak ada aset {cryptoTableFilter.toUpperCase()} ditemukan</p>
                <button
                  type="button"
                  onClick={() => {
                    setCryptoTableFilter('all');
                    setCryptoCardView('all');
                  }}
                  className="mt-2 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline"
                >
                  Tampilkan Semua Kripto
                </button>
              </div>
            ) : (
              <AssetTable
                type="crypto"
                assets={displayedCryptoAssets}
                prices={prices}
                exchangeRate={exchangeRate}
                hideBalance={hideBalance}
                onUpdate={onUpdateCrypto}
                onDelete={onDeleteCrypto}
                onSell={onSellCrypto}
                onPriceRefreshNeeded={onRefreshPrices}
              />
            )}
          </div>
        )}

        {(activeAssetTab === 'all' || activeAssetTab === 'gold') && filteredAssets.gold.length > 0 && (
          <div className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center gap-2 mb-4 px-2 justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {t('gold') || 'Emas'}
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-[#161b22] px-2 py-1 rounded-full">
                  {uniqueFilteredCounts.gold} {uniqueFilteredCounts.gold === 1 ? (t('asset') || 'Asset') : (t('assets') || (language === 'en' ? 'Assets' : 'Aset'))}
                </span>
              </h3>
              <button onClick={(e) => exportPortfolioToCSV('gold', e)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-blue-600 transition-colors" title={t('exportGold') || (language === 'en' ? 'Export Gold' : 'Ekspor Emas')}>
                <FiDownload className="w-4 h-4" />
              </button>
            </div>
            <AssetTable
              type="gold"
              assets={filteredAssets.gold}
              prices={prices}
              exchangeRate={exchangeRate}
              hideBalance={hideBalance}
              onUpdate={onUpdateGold}
              onDelete={onDeleteGold}
              onSell={onSellGold}
              onPriceRefreshNeeded={onRefreshPrices}
            />
          </div>
        )}



        {filteredAssets.stocks.length === 0 && filteredAssets.crypto.length === 0 && filteredAssets.cash.length === 0 && filteredAssets.gold.length === 0 && (
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
      <MetricsGuideModal
        isOpen={isMetricsGuideOpen}
        onClose={() => setIsMetricsGuideOpen(false)}
      />

      {notification && (
        <Notification
          type={notification.type}
          title={notification.title}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  );
}
