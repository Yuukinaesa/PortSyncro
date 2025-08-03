// AssetTable.js
import { useState, useMemo, useCallback } from 'react';
// import { FiArrowDown, FiArrowUp, FiTrendingUp, FiDollarSign, FiPercent, FiEdit2, FiCheck, FiX, FiTrash2, FiSortAsc, FiSortDesc } from 'react-icons/fi';
import Modal from './Modal';
import ErrorBoundary from './ErrorBoundary';
import { formatNumber, formatIDR, formatUSD, formatNumberUSD, normalizeNumberInput } from '../lib/utils';
import { useLanguage } from '../lib/languageContext';
import { secureLogger } from './../lib/security';

export default function AssetTable({ assets, prices, exchangeRate, type, onUpdate, onSell = () => {}, onDelete = () => {}, loading = false }) {
  const [sellingIndex, setSellingIndex] = useState(null);
  const [sellAmount, setSellAmount] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);
  const [editingAvgPrice, setEditingAvgPrice] = useState(null);
  const [newAvgPrice, setNewAvgPrice] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);

  const { t } = useLanguage();
  
  // Memoize assets to prevent unnecessary re-renders
  const memoizedAssets = useMemo(() => assets || [], [assets]);
  const memoizedPrices = useMemo(() => prices || {}, [prices]);
  const memoizedExchangeRate = useMemo(() => exchangeRate, [exchangeRate]);
  
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
    const priceData = memoizedPrices[symbol];
    
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
    
    if (isStock) {
      // For stocks: prices are in IDR, convert to USD
      valueIDR = Math.round(currentPrice * amount);
      valueUSD = memoizedExchangeRate && memoizedExchangeRate > 0 ? Math.round((valueIDR / memoizedExchangeRate) * 100) / 100 : 0;
    } else {
      // For crypto: prices are in USD, convert to IDR
      valueUSD = Math.round((currentPrice * amount) * 100) / 100;
      valueIDR = memoizedExchangeRate && memoizedExchangeRate > 0 ? Math.round(valueUSD * memoizedExchangeRate) : 0;
    }

    return {
      valueIDR,
      valueUSD,
      price: currentPrice,
      error: null
    };
  }, [memoizedPrices, type, t, memoizedExchangeRate]);

  // Sort assets with optimized memoization
  const sortedAssets = useMemo(() => {
    if (!memoizedAssets || !Array.isArray(memoizedAssets) || memoizedAssets.length === 0) {
      return [];
    }
    
    // Create a copy and sort in place for better performance
    const sorted = [...memoizedAssets];
    
    // Pre-calculate values to avoid repeated calculations
    const assetValues = sorted.map(asset => {
      const assetValue = calculateAssetValue(asset, asset.currency, memoizedExchangeRate);
      const amount = type === 'stock' ? asset.lots * 100 : asset.amount;
      const costBasis = asset.avgPrice * amount;
      const gainLoss = assetValue.price ? Math.round((assetValue.price * amount) - costBasis) : 0;
      
      return {
        asset,
        assetValue,
        gainLoss,
        name: (type === 'stock' ? asset.ticker : asset.symbol).toLowerCase(),
        amount: type === 'stock' ? asset.lots : asset.amount,
        currentPrice: assetValue.price,
        avgPrice: asset.avgPrice || 0
      };
    });
    
    // Apply sorting with pre-calculated values
    assetValues.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'amount':
          aValue = a.amount;
          bValue = b.amount;
          break;
        case 'currentPrice':
          aValue = a.currentPrice;
          bValue = b.currentPrice;
          break;
        case 'idrValue':
          aValue = a.assetValue.valueIDR;
          bValue = b.assetValue.valueIDR;
          break;
        case 'usdValue':
          aValue = a.assetValue.valueUSD;
          bValue = b.assetValue.valueUSD;
          break;
        case 'avgPrice':
          aValue = a.avgPrice;
          bValue = b.avgPrice;
          break;
        case 'gainLoss':
          aValue = a.gainLoss;
          bValue = b.gainLoss;
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
    
    // Return only the assets in sorted order
    return assetValues.map(item => item.asset);
  }, [memoizedAssets, sortField, sortDirection, memoizedExchangeRate, type, calculateAssetValue]);

  const handleSellClick = (index, asset) => {
    setSellingIndex(index);
    // Default to half of current amount
    const currentAmount = type === 'stock' ? asset.lots : asset.amount;
    const defaultAmount = type === 'stock' ? Math.floor(currentAmount / 2) : (currentAmount / 2);
    setSellAmount(defaultAmount.toString());
  };

  const handleSaveSell = (index, asset) => {
    const normalizedAmount = normalizeNumberInput(sellAmount);
    const amountToSell = parseFloat(normalizedAmount);
    const currentAmount = type === 'stock' ? asset.lots : asset.amount;
    
    // Use the same ticker format as calculateAssetValue
    let price;
    if (type === 'stock') {
      const tickerKey = `${asset.ticker}.JK`;
      price = memoizedPrices[tickerKey];
    } else {
      price = memoizedPrices[asset.symbol];
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
        const valueIDR = memoizedExchangeRate ? valueUSD * memoizedExchangeRate : 0;
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
        // Use asset identifier instead of index to avoid sorting issues
        const assetId = type === 'stock' ? asset.ticker : asset.symbol;
        onSell(assetId, asset, amountToSell);
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
    // Show the raw price value for editing (not formatted)
    const avgPrice = asset.avgPrice || 0;
    
    // Debug logging
    secureLogger.log('Editing average price for asset:', {
      ticker: asset.ticker,
      symbol: asset.symbol,
      avgPrice: avgPrice,
      currency: asset.currency,
      type: type
    });
    
    // Don't format with toFixed - show raw value for editing
    setNewAvgPrice(avgPrice.toString());
  };

  const handleSaveAvgPrice = async (index, asset) => {
    setIsUpdatingPrice(true);
    
    try {
      const normalizedPrice = normalizeNumberInput(newAvgPrice);
      const price = parseFloat(normalizedPrice);
      
      if (isNaN(price) || price <= 0) {
        setConfirmModal({
          isOpen: true,
          title: 'Peringatan',
          message: 'Masukkan harga yang valid (lebih dari 0)',
          type: 'error',
          onConfirm: () => setConfirmModal(null)
        });
        return;
      }

      // Validate that we have the correct asset data
      if (!asset || (type === 'stock' && !asset.ticker) || (type === 'crypto' && !asset.symbol)) {
        setConfirmModal({
          isOpen: true,
          title: 'Error',
          message: 'Data aset tidak valid',
          type: 'error',
          onConfirm: () => setConfirmModal(null)
        });
        return;
      }

      // Additional validation for price sanity
      if (price > 1000000000) { // 1 billion limit
        setConfirmModal({
          isOpen: true,
          title: 'Peringatan',
          message: 'Harga terlalu tinggi. Pastikan format input benar.',
          type: 'error',
          onConfirm: () => setConfirmModal(null)
        });
        return;
      }

      // Update the asset with new average price
      const updatedAsset = {
        ...asset,
        avgPrice: price,
        lastUpdate: new Date().toISOString()
      };

      // Debug logging
      secureLogger.log('Editing asset:', {
        index,
        originalAsset: asset,
        updatedAsset: updatedAsset,
        assetType: type,
        ticker: asset.ticker,
        symbol: asset.symbol,
        oldPrice: asset.avgPrice,
        newPrice: price
      });

      if (onUpdate) {
        secureLogger.log('Calling onUpdate function...');
        // For both stocks and crypto, pass symbol/ticker and updated asset
        if (type === 'stock') {
          onUpdate(asset.ticker, updatedAsset);
        } else {
          onUpdate(asset.symbol, updatedAsset);
        }
        secureLogger.log('onUpdate function called successfully');
        
        // Show success feedback
        setConfirmModal({
          isOpen: true,
          title: 'Berhasil',
          message: `Harga rata-rata ${type === 'stock' ? asset.ticker : asset.symbol} berhasil diperbarui dari ${formatPrice(asset.avgPrice || 0, type === 'crypto' ? 'USD' : (asset.currency || 'IDR'), type === 'crypto' ? false : true)} menjadi ${formatPrice(price, type === 'crypto' ? 'USD' : (asset.currency || 'IDR'), type === 'crypto' ? false : true)}`,
          type: 'success',
          onConfirm: () => {
            setConfirmModal(null);
            // Force a re-render after modal closes
            setTimeout(() => {
              window.dispatchEvent(new Event('resize'));
            }, 100);
          }
        });
      }
    } catch (error) {
      secureLogger.error('Error updating average price:', error);
      setConfirmModal({
        isOpen: true,
        title: 'Error',
        message: 'Gagal memperbarui harga rata-rata. Silakan coba lagi.',
        type: 'error',
        onConfirm: () => setConfirmModal(null)
      });
    } finally {
      setIsUpdatingPrice(false);
      setEditingAvgPrice(null);
      setNewAvgPrice('');
    }
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
        // Use asset identifier instead of index to avoid sorting issues
        const assetId = type === 'stock' ? asset.ticker : asset.symbol;
        onDelete(assetId);
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
          gainLossIDR = Math.round(currentValueIDR - costBasisIDR);
          gainLossUSD = exchangeRate && exchangeRate > 0 ? Math.round((gainLossIDR / exchangeRate) * 100) / 100 : 0;
        } else {
          // For crypto: calculate gain/loss in USD first, then convert to IDR
          const currentValueUSD = assetValue.price * amount;
          const costBasisUSD = asset.totalCost || (asset.avgPrice * amount);
          gainLossUSD = Math.round((currentValueUSD - costBasisUSD) * 100) / 100;
          gainLossIDR = exchangeRate && exchangeRate > 0 ? Math.round(gainLossUSD * exchangeRate) : 0;
        }
        
        const row = [
          `"${type === 'stock' ? asset.ticker : asset.symbol}"`,
          `"${type === 'stock' ? asset.lots : amount}"`,
          formatNumberForCSV(assetValue.price, asset.currency || (type === 'crypto' ? 'USD' : 'IDR')),
          formatNumberForCSV(assetValue.valueIDR, 'IDR'),
          formatNumberForCSV(assetValue.valueUSD, 'USD'),
          formatNumberForCSV(asset.avgPrice || 0, type === 'crypto' ? 'USD' : (asset.currency || 'IDR')),
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
      secureLogger.error('Error exporting CSV:', error);
      // You can add a notification here if you have a notification system
    }
  };

  // Helper function for CSV number formatting
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

  // Function to calculate gain/loss with proper currency conversion
  const calculateGainLoss = useCallback((asset, assetValue, type) => {
    if (!asset || !assetValue || !assetValue.price) {
      return {
        gainIDR: 0,
        gainUSD: 0,
        gainPercentage: 0,
        error: t('priceNotAvailable')
      };
    }

    const amount = type === 'stock' ? asset.lots * 100 : asset.amount;
    const currentPrice = assetValue.price;
    const avgPrice = asset.avgPrice || 0;
    
    if (type === 'stock') {
      // For stocks: calculate in IDR first, then convert to USD
      const currentValueIDR = currentPrice * amount;
      const costBasisIDR = avgPrice * amount;
      const gainIDR = Math.round(currentValueIDR - costBasisIDR);
      const gainUSD = exchangeRate && exchangeRate > 0 ? Math.round((gainIDR / exchangeRate) * 100) / 100 : 0;
      const gainPercentage = costBasisIDR > 0 ? (gainIDR / costBasisIDR) * 100 : 0;
      
      return {
        gainIDR,
        gainUSD,
        gainPercentage,
        error: null
      };
    } else {
      // For crypto: calculate in USD first, then convert to IDR
      const currentValueUSD = currentPrice * amount;
      const costBasisUSD = asset.totalCost || (avgPrice * amount);
      const gainUSD = Math.round((currentValueUSD - costBasisUSD) * 100) / 100;
      const gainIDR = exchangeRate && exchangeRate > 0 ? Math.round(gainUSD * exchangeRate) : 0;
      const gainPercentage = costBasisUSD > 0 ? (gainUSD / costBasisUSD) * 100 : 0;
      
      return {
        gainIDR,
        gainUSD,
        gainPercentage,
        error: null
      };
    }
  }, [exchangeRate, t]);

  return (
    <ErrorBoundary>
      {/* Empty state */}
      {memoizedAssets.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500 dark:text-gray-400">
            <p className="text-lg font-medium mb-2">{t('noAssets')}</p>
            <p className="text-sm">{t('addAssetsToGetStarted')}</p>
          </div>
        </div>
      )}

      {/* Header Section - Minimalist */}
      <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center" aria-hidden="true">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {type === 'stock' ? t('stockAssetTable') : t('cryptoAssetTable')}
          </h2>
        </div>
        <div className="flex justify-center sm:justify-end">
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl flex items-center gap-2 transition-all duration-200 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-sm font-medium"
            aria-label={type === 'crypto' ? 'Ekspor Kripto' : 'Ekspor Saham'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {type === 'crypto' ? 'Ekspor Kripto' : 'Ekspor Saham'}
          </button>
        </div>
      </div>

      {/* Minimalist Table Container */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto scrollbar-table">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th 
                  className="px-4 sm:px-6 py-3 sm:py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center space-x-1 sm:space-x-2">
                    <span>{type === 'stock' ? t('stock') : t('crypto')}</span>
                    {getSortIcon('name') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('name')}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 sm:px-6 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('amount')}
                >
                  <div className="flex items-center justify-end space-x-1 sm:space-x-2">
                    <span>{t('amount')}</span>
                    {getSortIcon('amount') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('amount')}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 sm:px-6 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('currentPrice')}
                >
                  <div className="flex items-center justify-end space-x-1 sm:space-x-2">
                    <span>{t('currentPrice')}</span>
                    {getSortIcon('currentPrice') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('currentPrice')}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 sm:px-6 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('idrValue')}
                >
                  <div className="flex items-center justify-end space-x-1 sm:space-x-2">
                    <span>{t('idrValue')}</span>
                    {getSortIcon('idrValue') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('idrValue')}</span>
                    )}
                  </div>
                </th>
                <th className="hidden lg:table-cell px-4 sm:px-6 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('usdValue')}
                >
                  <div className="flex items-center justify-end space-x-1 sm:space-x-2">
                    <span>{t('usdValue')}</span>
                    {getSortIcon('usdValue') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('usdValue')}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('action')}
                </th>
                <th 
                  className="px-4 sm:px-6 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('avgPrice')}
                >
                  <div className="flex items-center justify-end space-x-1 sm:space-x-2">
                    <span>{t('avgPrice')}</span>
                    {getSortIcon('avgPrice') && (
                      <span className="text-blue-500 font-medium">{getSortIcon('avgPrice')}</span>
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 sm:px-6 py-3 sm:py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200"
                  onClick={() => handleSort('gainLoss')}
                >
                  <div className="flex items-center justify-end space-x-1 sm:space-x-2">
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
                
                // Calculate real-time gain/loss based on current price and average price
                if (assetValue.price && assetValue.price > 0) {
                  if (type === 'stock') {
                    // For stocks: calculate based on shares (1 lot = 100 shares)
                    const totalShares = asset.lots * 100;
                    const currentValue = assetValue.price * totalShares;
                    const costBasis = asset.avgPrice * totalShares;
                    
                    realTimeGain = currentValue - costBasis;
                    realTimeGainUSD = exchangeRate && exchangeRate > 0 ? Math.round((realTimeGain / exchangeRate) * 100) / 100 : 0;
                    realTimeGainPercentage = costBasis > 0 ? (realTimeGain / costBasis) * 100 : 0;
                  } else {
                    // For crypto: calculate based on amount
                    const currentValue = assetValue.price * asset.amount;
                    const costBasis = asset.avgPrice * asset.amount;
                    
                    realTimeGainUSD = currentValue - costBasis;
                    realTimeGain = exchangeRate && exchangeRate > 0 ? Math.round(realTimeGainUSD * exchangeRate) : realTimeGainUSD;
                    realTimeGainPercentage = costBasis > 0 ? (realTimeGainUSD / costBasis) * 100 : 0;
                  }
                } else {
                  // If no price data available, use stored gain/loss values
                  realTimeGain = asset.gain || 0;
                  realTimeGainUSD = asset.gainUSD || 0;
                  realTimeGainPercentage = asset.gainPercentage || 0;
                }
                
                return (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-200">
                    <td className="px-4 sm:px-6 py-4 sm:py-5">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm ${
                          type === 'stock' 
                            ? 'bg-gradient-to-br from-blue-500 to-blue-600' 
                            : 'bg-gradient-to-br from-purple-500 to-purple-600'
                        }`}>
                          <span>
                            {(type === 'stock' ? asset.ticker : asset.symbol).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-3 sm:ml-4 min-w-0 flex-1">
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
                    
                    <td className="px-4 sm:px-6 py-4 sm:py-5 text-right">
                      {sellingIndex === index ? (
                        <div className="flex flex-col items-end space-y-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={sellAmount}
                            placeholder={type === 'stock' ? Math.floor(asset.lots / 2).toString() : (asset.amount / 2).toString()}
                            onChange={(e) => {
                              // Allow numbers, commas, and dots
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setSellAmount(value);
                            }}
                            className="w-16 sm:w-20 px-2 sm:px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                            min="0"
                          />
                          <button
                            onClick={() => setSellAmount((type === 'stock' ? asset.lots : asset.amount).toString())}
                            className="text-xs text-blue-500 hover:text-blue-600 underline"
                            title="Jual semua"
                          >
                            Jual Semua
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {type === 'stock' ? asset.lots : asset.amount}
                        </span>
                      )}
                    </td>
                    
                    <td className="px-4 sm:px-6 py-4 sm:py-5 text-right">
                      <div className="flex flex-col items-end space-y-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {assetValue.price && assetValue.price > 0 ? formatPrice(assetValue.price, type === 'crypto' ? 'USD' : (asset.currency || 'IDR')) : t('notAvailable')}
                        </span>
                        {/* Show IDR price for crypto */}
                        {type === 'crypto' && assetValue.price && assetValue.price > 0 && exchangeRate && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatIDR(assetValue.price * exchangeRate)}
                          </span>
                        )}
                        {/* Always show change percentage if price data is available */}
                        {price && price.price && price.price > 0 && (
                          <div className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${
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
                    
                    <td className="px-4 sm:px-6 py-4 sm:py-5 text-right">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {(() => {
                          if (asset.portoIDR && asset.portoIDR > 0) {
                            return formatIDR(asset.portoIDR);
                          } else if (assetValue.valueIDR && assetValue.valueIDR > 0) {
                            return formatIDR(assetValue.valueIDR);
                          } else if (type === 'crypto' && (!exchangeRate || exchangeRate <= 0)) {
                            return 'Tidak tersedia';
                          } else {
                            return formatIDR(0);
                          }
                        })()}
                      </span>
                    </td>
                    
                    <td className="hidden lg:table-cell px-4 sm:px-6 py-4 sm:py-5 text-right">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {(() => {
                          if (asset.portoUSD && asset.portoUSD > 0) {
                            return formatUSD(asset.portoUSD);
                          } else if (assetValue.valueUSD && assetValue.valueUSD > 0) {
                            return formatUSD(assetValue.valueUSD);
                          } else if (type === 'stock' && (!exchangeRate || exchangeRate <= 0)) {
                            return 'Tidak tersedia';
                          } else {
                            return formatUSD(0);
                          }
                        })()}
                      </span>
                    </td>
                    
                    <td className="px-4 sm:px-6 py-4 sm:py-5 text-center">
                      <div className="flex space-x-1 sm:space-x-2 justify-center">
                        {sellingIndex === index ? (
                          <>
                            <button
                              onClick={() => handleSaveSell(index, asset)}
                              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors duration-200"
                              title="Konfirmasi Jual"
                            >
                              ✓
                            </button>
                            <button
                              onClick={handleCancelSell}
                              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                              title="Batal"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSellClick(index, asset)}
                              className="px-2 sm:px-3 py-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors duration-200"
                              title="Jual aset"
                            >
                              Jual
                            </button>
                            <button
                              onClick={() => handleDeleteClick(index, asset)}
                              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                              title="Hapus aset dari portofolio (semua transaksi akan dihapus)"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-4 sm:px-6 py-4 sm:py-5 text-right">
                      {editingAvgPrice === index ? (
                        <div className="flex items-center space-x-1 sm:space-x-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={newAvgPrice}
                            onChange={(e) => {
                              // Allow numbers, commas, and dots
                              const value = e.target.value.replace(/[^0-9.,]/g, '');
                              setNewAvgPrice(value);
                            }}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveAvgPrice(index, asset);
                              } else if (e.key === 'Escape') {
                                handleCancelEditAvgPrice();
                              }
                            }}
                            onBlur={() => {
                              // Auto-save when user clicks outside
                              if (newAvgPrice && newAvgPrice !== (asset.avgPrice || 0).toString()) {
                                handleSaveAvgPrice(index, asset);
                              }
                            }}
                            className="w-20 sm:w-24 px-2 sm:px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                            min="0"
                            placeholder="0"
                            autoFocus
                            disabled={isUpdatingPrice}
                          />
                          <button
                            onClick={() => handleSaveAvgPrice(index, asset)}
                            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors duration-200"
                            title="Simpan"
                            aria-label={`Simpan harga rata-rata untuk ${type === 'stock' ? asset.ticker : asset.symbol}`}
                            disabled={isUpdatingPrice}
                          >
                            {isUpdatingPrice ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              '✓'
                            )}
                          </button>
                          <button
                            onClick={handleCancelEditAvgPrice}
                            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                            title="Batal"
                            aria-label="Batal edit harga rata-rata"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end space-x-1 sm:space-x-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {asset.avgPrice ? formatPrice(asset.avgPrice, type === 'crypto' ? 'USD' : (asset.currency || 'IDR'), type === 'crypto' ? false : true) : '-'}
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
                    
                    <td className="px-4 sm:px-6 py-4 sm:py-5 text-right">
                      <div className="flex flex-col items-end space-y-1">
                        {/* IDR Gain/Loss */}
                        <span className={`text-sm font-semibold ${getGainColor(asset.gainIDR || realTimeGain)}`}>
                          {(() => {
                            const gainLoss = calculateGainLoss(asset, assetValue, type);
                            if (gainLoss.error) return t('notAvailable');
                            
                            // For crypto, only show IDR if exchange rate is available
                            if (type === 'crypto' && (!exchangeRate || exchangeRate <= 0)) {
                              return null; // Don't show IDR for crypto without exchange rate
                            }
                            
                            const gainIDR = asset.gainIDR !== undefined ? asset.gainIDR : gainLoss.gainIDR;
                            return gainIDR === 0 ? 'Rp 0' : formatIDR(gainIDR);
                          })()}
                        </span>
                        {/* USD Gain/Loss */}
                        <span className={`text-xs ${getGainColor(asset.gainUSD || realTimeGainUSD)}`}>
                          {(() => {
                            const gainLoss = calculateGainLoss(asset, assetValue, type);
                            if (gainLoss.error) return t('notAvailable');
                            
                            // For stocks, only show USD if exchange rate is available
                            if (type === 'stock' && (!exchangeRate || exchangeRate <= 0)) {
                              return null; // Don't show USD for stocks without exchange rate
                            }
                            
                            const gainUSD = asset.gainUSD !== undefined ? asset.gainUSD : gainLoss.gainUSD;
                            return gainUSD === 0 ? formatUSD(0) : formatUSD(gainUSD);
                          })()}
                        </span>
                        {/* Percentage */}
                        {(() => {
                          const gainLoss = calculateGainLoss(asset, assetValue, type);
                          if (gainLoss.error) return null;
                          
                          const percentage = asset.gainPercentage !== undefined ? asset.gainPercentage : gainLoss.gainPercentage;
                          if (percentage === 0) return null;
                          
                          return (
                            <span className={`text-xs font-medium ${getGainColor(percentage)}`}>
                              ({percentage > 0 ? '+' : ''}{percentage.toFixed(2)}%)
                            </span>
                          );
                        })()}
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