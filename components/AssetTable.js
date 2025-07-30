// AssetTable.js
import { useState, useMemo, useCallback } from 'react';
// import { FiArrowDown, FiArrowUp, FiTrendingUp, FiDollarSign, FiPercent, FiEdit2, FiCheck, FiX, FiTrash2, FiSortAsc, FiSortDesc } from 'react-icons/fi';
import Modal from './Modal';
import ErrorBoundary from './ErrorBoundary';
import { formatNumber, formatIDR, formatUSD, formatNumberUSD, normalizeNumberInput } from '../lib/utils';
import { useLanguage } from '../lib/languageContext';

export default function AssetTable({ assets, prices, exchangeRate, type, onUpdate, onSell = () => {}, onDelete = () => {}, loading = false }) {
  const [sellingIndex, setSellingIndex] = useState(null);
  const [sellAmount, setSellAmount] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);
  const [editingAvgPrice, setEditingAvgPrice] = useState(null);
  const [newAvgPrice, setNewAvgPrice] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  const { t } = useLanguage();
  
  const calculateAssetValue = useCallback((asset, currency, exchangeRate) => {
    if (!asset) {
      return {
        valueIDR: 0,
        valueUSD: 0,
        price: 0,
        error: t('unknownAssetType')
      };
    }

    const isStock = type === 'stock';
    const symbol = isStock ? `${asset.ticker}.JK` : asset.symbol;
    const priceData = prices[symbol];
    
    if (!priceData || !priceData.price) {
      return {
        valueIDR: 0,
        valueUSD: 0,
        price: 0,
        error: t('priceNotAvailable')
      };
    }

    const currentPrice = priceData.price;
    const amount = isStock ? asset.lots * 100 : asset.amount;
    
    let valueIDR, valueUSD;
    
    if (currency === 'IDR') {
      valueIDR = currentPrice * amount;
      valueUSD = exchangeRate && exchangeRate > 0 ? valueIDR / exchangeRate : 0;
    } else {
      valueUSD = currentPrice * amount;
      valueIDR = exchangeRate && exchangeRate > 0 ? valueUSD * exchangeRate : 0;
    }

    return {
      valueIDR,
      valueUSD,
      price: currentPrice,
      error: null
    };
  }, [prices, type, t]);

  // Sort assets
  const sortedAssets = useMemo(() => {
    if (!assets || !Array.isArray(assets)) {
      return [];
    }
    
    let sorted = [...assets];
    
    // Apply sorting
    sorted.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'name':
          aValue = (type === 'stock' ? a.ticker : a.symbol).toLowerCase();
          bValue = (type === 'stock' ? b.ticker : b.symbol).toLowerCase();
          break;
        case 'amount':
          aValue = type === 'stock' ? a.lots : a.amount;
          bValue = type === 'stock' ? b.lots : b.amount;
          break;
        case 'currentPrice':
          const aPrice = prices[type === 'stock' ? `${a.ticker}.JK` : a.symbol];
          const bPrice = prices[type === 'stock' ? `${b.ticker}.JK` : b.symbol];
          aValue = aPrice ? aPrice.price : 0;
          bValue = bPrice ? bPrice.price : 0;
          break;
        case 'idrValue':
          const aValueData = calculateAssetValue(a, a.currency, exchangeRate);
          const bValueData = calculateAssetValue(b, b.currency, exchangeRate);
          aValue = aValueData.valueIDR;
          bValue = bValueData.valueIDR;
          break;
        case 'usdValue':
          const aUSDData = calculateAssetValue(a, a.currency, exchangeRate);
          const bUSDData = calculateAssetValue(b, b.currency, exchangeRate);
          aValue = aUSDData.valueUSD;
          bValue = bUSDData.valueUSD;
          break;
        case 'avgPrice':
          aValue = a.avgPrice || 0;
          bValue = b.avgPrice || 0;
          break;
        case 'gainLoss':
          const aGainData = calculateAssetValue(a, a.currency, exchangeRate);
          const bGainData = calculateAssetValue(b, b.currency, exchangeRate);
          const aGain = aGainData.price ? (aGainData.price * (type === 'stock' ? a.lots * 100 : a.amount)) - (a.avgPrice * (type === 'stock' ? a.lots * 100 : a.amount)) : 0;
          const bGain = bGainData.price ? (bGainData.price * (type === 'stock' ? b.lots * 100 : b.amount)) - (b.avgPrice * (type === 'stock' ? b.lots * 100 : b.amount)) : 0;
          aValue = aGain;
          bValue = bGain;
          break;
        default:
          return 0;
      }
      
      // Handle string comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (sortDirection === 'asc') {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      }
      
      // Handle numeric comparison
      if (sortDirection === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
    
    return sorted;
  }, [assets, sortField, sortDirection, prices, exchangeRate, type, calculateAssetValue]);

  // Early return after all hooks
  if (assets.length === 0) {
    return null;
  }
  
  const handleSellClick = (index, asset) => {
    setSellingIndex(index);
    // Default to half of current amount
    const currentAmount = type === 'stock' ? asset.lots : asset.amount;
    let defaultValue;
    if (type === 'stock') {
      defaultValue = Math.floor(currentAmount / 2); // Hanya bilangan bulat
    } else {
      defaultValue = (currentAmount / 2).toString();
    }
    setSellAmount(defaultValue.toString());
  };

  const handleSaveSell = (index, asset) => {
    const normalizedAmount = normalizeNumberInput(sellAmount);
    const amountToSell = parseFloat(normalizedAmount);
    const currentAmount = type === 'stock' ? asset.lots : asset.amount;
    
    // Use the same ticker format as calculateAssetValue
    let price;
    if (type === 'stock') {
      const tickerKey = `${asset.ticker}.JK`;
      price = prices[tickerKey];
    } else {
      price = prices[asset.symbol];
    }
    
    const isIDX = type === 'stock' && price && price.currency === 'IDR';
    
    if (isNaN(amountToSell) || amountToSell <= 0) {
      setConfirmModal({
        isOpen: true,
        title: t('warning'),
        message: t('invalidValue'),
        type: 'error'
      });
      return;
    }
    // Only allow integer lots for IDX stock
    if (isIDX && (!Number.isInteger(amountToSell) || String(sellAmount).includes(','))) {
      setConfirmModal({
        isOpen: true,
        title: t('warning'),
        message: t('invalidLotAmount'),
        type: 'error'
      });
      return;
    }
    if (amountToSell > currentAmount) {
      setConfirmModal({
        isOpen: true,
        title: t('warning'),
        message: t('amountExceeds', { amount: currentAmount }),
        type: 'error'
      });
      return;
    }
    
    // Tampilkan konfirmasi penjualan
    const ticker = type === 'stock' ? asset.ticker : asset.symbol;
    let valueFormatted = '';
    
    if (price) {
      if (type === 'stock') {
        // For IDX stocks: 1 lot = 100 shares
        if (price.currency === 'IDR') {
          const valueIDR = amountToSell * 100 * price.price;
          valueFormatted = formatIDR(valueIDR);
        } else {
          // Hapus logika konversi USD ke IDR untuk saham (karena tidak ada saham US)
          valueFormatted = t('valueNotAvailable');
        }
      } else {
        // For crypto: always show in IDR
        const valueUSD = amountToSell * price.price;
        const valueIDR = exchangeRate ? valueUSD * exchangeRate : 0;
        valueFormatted = formatIDR(valueIDR);
      }
    }
    
    const message = price 
      ? t('saleConfirmation', { 
          amount: amountToSell, 
          unit: type === 'stock' ? 'lot' : '', 
          symbol: ticker, 
          value: valueFormatted ? `with value around ${valueFormatted}` : '' 
        })
      : t('saleConfirmationNoPrice', { 
          amount: amountToSell, 
          unit: type === 'stock' ? 'lot' : '', 
          symbol: ticker 
        });
    
    setConfirmModal({
      isOpen: true,
      title: t('confirmSale'),
      message: message,
      type: 'warning',
      onConfirm: () => {
        onSell(index, asset, amountToSell);
        setSellingIndex(null);
        setConfirmModal(null);
      }
    });
  };
  
  const handleCancelSell = () => {
    setSellingIndex(null);
  };

  const handleEditAvgPrice = (index, asset) => {
    setEditingAvgPrice(index);
    setNewAvgPrice(asset.avgPrice ? asset.avgPrice.toString() : '');
  };

  const handleSaveAvgPrice = (index, asset) => {
    const normalizedPrice = normalizeNumberInput(newAvgPrice);
    const price = parseFloat(normalizedPrice);
    if (isNaN(price) || price < 0) {
      setConfirmModal({
        isOpen: true,
        title: 'Peringatan',
        message: 'Masukkan harga yang valid (lebih dari 0)',
        type: 'error'
      });
      return;
    }

    // Update the asset with new average price
    const updatedAsset = {
      ...asset,
      avgPrice: price,
      currency: asset.currency || (type === 'crypto' ? 'USD' : 'IDR'),
      // Don't recalculate totalCost and gain here - let the parent component handle it
      // This prevents the average price from being overridden by current market price
    };

    if (onUpdate) {
      onUpdate(index, updatedAsset);
    }
    
    setEditingAvgPrice(null);
    setNewAvgPrice('');
  };

  const handleCancelEditAvgPrice = () => {
    setEditingAvgPrice(null);
    setNewAvgPrice('');
  };

  const handleDeleteClick = (index, asset) => {
    const assetName = type === 'stock' ? asset.ticker : asset.symbol;
    setConfirmModal({
      isOpen: true,
      title: t('confirmDelete'),
      message: t('confirmDeleteAsset', { asset: assetName }),
      type: 'warning',
      onConfirm: () => {
        onDelete(index);
        setConfirmModal(null);
      },
      onCancel: () => setConfirmModal(null)
    });
  };
  
  // Function to format price based on currency and exchange rate
  const formatPrice = (price, currency, inIDR = false) => {
    if (!price && price !== 0) return t('notAvailable');
    
    if (currency === 'IDR' || inIDR) {
      return formatIDR(price);
    } else {
      return formatUSD(price, currency === 'USD' ? 2 : 8);
    }
  };

  // Function to calculate gain/loss percentage
  const calculateGainPercentage = (gain, totalCost) => {
    if (!totalCost || totalCost === 0) return 0;
    return (gain / totalCost) * 100;
  };

  // Function to get gain/loss color
  const getGainColor = (gain) => {
    if (!gain && gain !== 0) return 'text-gray-500 dark:text-gray-400';
    if (gain === 0) return 'text-blue-600 dark:text-blue-400'; // Break even - warna biru
    return gain > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  // Sorting and filtering functions
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  // Export to CSV function for assets
  const exportToCSV = () => {
    try {
      // Add UTF-8 BOM to prevent Excel from showing warning
      const BOM = '\uFEFF';
      
      // Language-aware CSV headers
      const headers = [
        type === 'stock' ? t('stock') : t('crypto'),
        t('amount'),
        t('currentPrice'),
        t('idrValue'),
        t('usdValue'),
        t('avgPrice'),
        t('gainLossIDR'),
        t('gainLossUSD')
      ];
      
      let csvContent = BOM + headers.join(';') + '\n';
      
      sortedAssets.forEach(asset => {
        const assetValue = calculateAssetValue(asset, asset.currency, exchangeRate);
        const amount = type === 'stock' ? asset.lots * 100 : asset.amount;
        const costBasis = asset.avgPrice * amount;
        
        // Calculate gain/loss in both currencies
        let gainLossIDR, gainLossUSD;
        
        if (type === 'stock') {
          // For stocks: calculate gain/loss in IDR first, then convert to USD
          const currentValueIDR = assetValue.price * amount;
          const costBasisIDR = asset.avgPrice * amount;
          gainLossIDR = currentValueIDR - costBasisIDR;
          gainLossUSD = exchangeRate && exchangeRate > 0 ? gainLossIDR / exchangeRate : 0;
        } else {
          // For crypto: calculate gain/loss in USD first, then convert to IDR
          const currentValueUSD = assetValue.price * amount;
          const costBasisUSD = asset.avgPrice * amount;
          gainLossUSD = currentValueUSD - costBasisUSD;
          gainLossIDR = exchangeRate && exchangeRate > 0 ? gainLossUSD * exchangeRate : 0;
        }
        
        const row = [
          `"${type === 'stock' ? asset.ticker : asset.symbol}"`,
          `"${amount}"`,
          formatNumberForCSV(assetValue.price, asset.currency || (type === 'crypto' ? 'USD' : 'IDR')),
          formatNumberForCSV(assetValue.valueIDR, 'IDR'),
          formatNumberForCSV(assetValue.valueUSD, 'USD'),
          formatNumberForCSV(asset.avgPrice || 0, asset.currency || (type === 'crypto' ? 'USD' : 'IDR')),
          formatNumberForCSV(gainLossIDR, 'IDR'),
          formatNumberForCSV(gainLossUSD, 'USD')
        ];
        csvContent += row.join(';') + '\n';
      });
      
      // Create blob with proper MIME type
      const blob = new Blob([csvContent], { 
        type: 'text/csv;charset=utf-8;'
      });
      
      // Create download link
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      // Language-aware filename
      const currentDate = new Date().toLocaleDateString();
      const filename = `${type === 'stock' ? 'stocks' : 'crypto'}_${currentDate}.csv`;
      
      // Set download attributes
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      
      // Append to body and trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

    } catch (error) {
      console.error('Error exporting CSV:', error);
      // You can add a notification here if you have a notification system
    }
  };

  // Helper function for CSV number formatting
  const formatNumberForCSV = (value, currency) => {
    if (!value || isNaN(value)) return currency === 'USD' ? '0.00' : '0';
    
    if (currency === 'IDR') {
      // Use Indonesian format for IDR (dots for thousands, comma for decimal)
      return formatNumber(value, 0);
    } else {
      // Use US format for USD (comma for thousands, period for decimal) without dollar sign
      return formatNumberUSD(value, 2); // Always use 2 decimal places for USD
    }
  };

  return (
    <ErrorBoundary>
      {/* Header Section - Minimalist */}
      <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center" aria-hidden="true">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('assetTable')}</h2>
        </div>
        <div className="flex justify-center sm:justify-end">
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl flex items-center gap-2 transition-all duration-200 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-sm font-medium"
            aria-label={type === 'crypto' ? t('exportCrypto') : t('exportCSV')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {type === 'crypto' ? t('exportCrypto') : t('exportCSV')}
          </button>
        </div>
      </div>

      {/* Minimalist Table Container */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th 
                  className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center space-x-2">
                    <span>{type === 'stock' ? t('stock') : t('crypto')}</span>
                    {getSortIcon('name') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('name')}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('amount')}
                >
                  <div className="flex items-center justify-end space-x-2">
                    <span>{t('amount')}</span>
                    {getSortIcon('amount') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('amount')}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('currentPrice')}
                >
                  <div className="flex items-center justify-end space-x-2">
                    <span>{t('currentPrice')}</span>
                    {getSortIcon('currentPrice') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('currentPrice')}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('idrValue')}
                >
                  <div className="flex items-center justify-end space-x-2">
                    <span>{t('idrValue')}</span>
                    {getSortIcon('idrValue') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('idrValue')}</span>
                    )}
                  </div>
                </th>
                <th className="hidden lg:table-cell px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('usdValue')}
                >
                  <div className="flex items-center justify-end space-x-2">
                    <span>{t('usdValue')}</span>
                    {getSortIcon('usdValue') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('usdValue')}</span>
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('action')}
                </th>
                <th 
                  className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('avgPrice')}
                >
                  <div className="flex items-center justify-end space-x-2">
                    <span>{t('avgPrice')}</span>
                    {getSortIcon('avgPrice') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('avgPrice')}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('gainLoss')}
                >
                  <div className="flex items-center justify-end space-x-2">
                    <span>{t('gainLoss')}</span>
                    {getSortIcon('gainLoss') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('gainLoss')}</span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {sortedAssets.map((asset, index) => {
                const assetValue = calculateAssetValue(asset, asset.currency, exchangeRate);
                const price = prices[type === 'stock' ? `${asset.ticker}.JK` : asset.symbol];
                const change = price ? price.change : 0;
                const changeTime = price ? price.changeTime : '24h';
                
                // Recalculate gain/loss using real-time price and current portfolio value
                let realTimeGain = 0;
                let realTimeGainUSD = 0;
                let realTimeGainPercentage = 0;
                
                if (assetValue.price) {
                  // Calculate current portfolio value using real-time price
                  const currentPortfolioValue = assetValue.price * (type === 'stock' ? asset.lots * 100 : asset.amount);
                  
                  if (type === 'stock') {
                    // For stocks: gain/loss in IDR
                    // Use avgPrice * total shares for correct total cost calculation
                    const totalShares = asset.lots * 100; // 1 lot = 100 shares
                    const correctTotalCost = asset.avgPrice * totalShares;
                    realTimeGain = currentPortfolioValue - correctTotalCost;
                    realTimeGainUSD = exchangeRate && exchangeRate > 0 ? realTimeGain / exchangeRate : 0;
                    realTimeGainPercentage = correctTotalCost > 0 ? (realTimeGain / correctTotalCost) * 100 : 0;
                  } else {
                    // For crypto: gain/loss in USD, convert to IDR for display
                    const costBasis = asset.totalCost || (asset.avgPrice * asset.amount);
                    realTimeGainUSD = currentPortfolioValue - costBasis;
                    realTimeGain = exchangeRate && exchangeRate > 0 ? realTimeGainUSD * exchangeRate : realTimeGainUSD;
                    // For percentage calculation, use USD values
                    realTimeGainPercentage = costBasis > 0 ? (realTimeGainUSD / costBasis) * 100 : 0;
                  }
                }
                
                return (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-200">
                    <td className="px-6 py-5">
                      <div className="flex items-center">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm ${
                          type === 'stock' 
                            ? 'bg-gradient-to-br from-blue-500 to-blue-600' 
                            : 'bg-gradient-to-br from-purple-500 to-purple-600'
                        }`}>
                          <span>
                            {(type === 'stock' ? asset.ticker : asset.symbol).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-4 min-w-0 flex-1">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white block truncate">
                            {type === 'stock' ? asset.ticker : asset.symbol}
                          </span>
                          {assetValue.error && (
                            <span className="text-xs text-red-500 dark:text-red-400 block">
                              {assetValue.error}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-5 text-right">
                      {sellingIndex === index ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={sellAmount}
                          onChange={(e) => {
                            // Allow numbers, commas, and dots
                            const value = e.target.value.replace(/[^0-9.,]/g, '');
                            setSellAmount(value);
                          }}
                          className="w-20 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                          min="0"
                        />
                      ) : (
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {type === 'stock' ? asset.lots : asset.amount}
                        </span>
                      )}
                    </td>
                    
                    <td className="px-6 py-5 text-right">
                      <div className="flex flex-col items-end space-y-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {assetValue.price ? formatPrice(assetValue.price, asset.currency || (type === 'crypto' ? 'USD' : 'IDR')) : t('notAvailable')}
                        </span>
                        {/* Show IDR price for crypto */}
                        {type === 'crypto' && assetValue.price && exchangeRate && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatIDR(assetValue.price * exchangeRate)}
                          </span>
                        )}
                        {/* Always show change percentage if price data is available */}
                        {price && (
                          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            change > 0 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                              : change < 0 
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' 
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}>
                            {change > 0 ? '↑' : change < 0 ? '↓' : null}
                            {change > 0 ? '+' : ''}{change.toFixed(2)}% ({changeTime})
                          </div>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-5 text-right">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {assetValue.valueIDR ? formatPrice(assetValue.valueIDR, 'IDR', true) : t('notAvailable')}
                      </span>
                    </td>
                    
                    <td className="hidden lg:table-cell px-6 py-5 text-right">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {assetValue.valueUSD ? formatPrice(assetValue.valueUSD, 'USD') : t('notAvailable')}
                      </span>
                    </td>
                    
                    <td className="px-6 py-5 text-center">
                      <div className="flex space-x-2 justify-center">
                        {sellingIndex === index ? (
                          <>
                            <button
                              onClick={() => handleSaveSell(index, asset)}
                              className="w-8 h-8 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors duration-200"
                              title="Konfirmasi Jual"
                            >
                              ✓
                            </button>
                            <button
                              onClick={handleCancelSell}
                              className="w-8 h-8 flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                              title="Batal"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSellClick(index, asset)}
                              className="px-3 py-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors duration-200"
                              title="Jual aset"
                            >
                              Jual
                            </button>
                            <button
                              onClick={() => handleDeleteClick(index, asset)}
                              className="w-8 h-8 flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                              title="Hapus aset"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-5 text-right">
                      {editingAvgPrice === index ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={newAvgPrice}
                            onChange={(e) => {
                              // Allow numbers, commas, and dots
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setNewAvgPrice(value);
                            }}
                            className="w-24 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                            min="0"
                          />
                          <button
                            onClick={() => handleSaveAvgPrice(index, asset)}
                            className="w-8 h-8 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors duration-200"
                            title="Simpan"
                          >
                            ✓
                          </button>
                          <button
                            onClick={handleCancelEditAvgPrice}
                            className="w-8 h-8 flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                            title="Batal"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end space-x-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {asset.avgPrice ? formatPrice(asset.avgPrice, asset.currency || (type === 'crypto' ? 'USD' : 'IDR')) : '-'}
                          </span>
                          <button
                            onClick={() => handleEditAvgPrice(index, asset)}
                            className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-sm transition-colors duration-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                            title="Edit Average Price"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                    </td>
                    
                    <td className="px-6 py-5 text-right">
                      <div className="flex flex-col items-end space-y-1">
                        {/* IDR Gain/Loss */}
                        <span className={`text-sm font-semibold ${getGainColor(realTimeGain)}`}>
                          {realTimeGain !== undefined && realTimeGain !== null ? (realTimeGain === 0 ? 'Rp 0' : formatPrice(realTimeGain, 'IDR', true)) : '-'}
                        </span>
                        {/* USD Gain/Loss */}
                        <span className={`text-xs ${getGainColor(realTimeGain)}`}>
                          {realTimeGain !== undefined && realTimeGain !== null ? (realTimeGain === 0 ? '$ 0' : formatPrice(realTimeGainUSD, 'USD')) : '-'}
                        </span>
                        {/* Percentage */}
                        {realTimeGain !== undefined && realTimeGain !== null && realTimeGainPercentage !== 0 && (
                          <span className={`text-xs font-medium ${getGainColor(realTimeGainPercentage)}`}>
                            ({realTimeGainPercentage > 0 ? '+' : ''}{realTimeGainPercentage.toFixed(2)}%)
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enhanced Confirmation Modal */}
      {confirmModal && (
        <Modal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(null)}
          title={confirmModal.title}
          type={confirmModal.type}
        >
          <div className="mb-6">
            <p className="text-gray-700 dark:text-gray-200">{confirmModal.message}</p>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            {confirmModal.onCancel && (
              <button
                onClick={confirmModal.onCancel}
                className="px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200"
              >
                {confirmModal.cancelText || 'Batal'}
              </button>
            )}
            {confirmModal.onConfirm && (
              <button
                onClick={confirmModal.onConfirm}
                className={`px-6 py-3 text-sm font-medium text-white rounded-xl transition-colors duration-200 ${
                  confirmModal.type === 'error' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {confirmModal.confirmText || 'Konfirmasi'}
              </button>
            )}
          </div>
        </Modal>
      )}
    </ErrorBoundary>
  );
}